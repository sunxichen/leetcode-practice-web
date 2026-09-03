"""
context_hitl_business.py - 上下文治理、过程性知识、HITL 与代表业务链路白板核心控制流

定位说明：
- 面试白板核心骨架代码，采用真实项目 API 命名与继承关系，重点展现：
  1. 长期记忆 (build_memory_context 降级、JavaMemoryBackend 虚拟文件白名单与 401/403 vs 404/5xx/HTTPError 分水岭)
  2. 上下文自动压缩 (ObservedDeepAgentsSummarizationMiddleware 继承原生 SummarizationMiddleware、只读观测 Command 与 usage 事件隔离)
  3. 技能导入与激活 (SkillImportService 签名/安全校验、SkillActivationMiddleware read_file 去重与事件隔离)
  4. Human-in-the-loop (create_ask_user_tool 强类型契约、_runtime_identifier 严格解析、keyword-only stable_request_id)
  5. ChatBI Agent Loop (三段式自主循环、4 闭包工具、条件路由边、底层直接调用与 20 行信封分流 GAP-27)
  6. Visualization / A2UI / Report / RAG (双通道分发、A2UI 原型 process_batches 节点装配与全貌入口)
- 仅做 AST 语法与结构静态核验，不提供可执行测试或自包含 demo runner。
"""

from __future__ import annotations

import asyncio
import hashlib
import posixpath
import time
import uuid
from collections.abc import Awaitable, Callable, Iterable, Mapping
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
    ExtendedModelResponse,
    ModelRequest,
    ModelResponse,
)
from langchain_core.callbacks import adispatch_custom_event
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, tool
from langgraph.config import get_config
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolRuntime
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command, interrupt
from loguru import logger

# 项目真实类型与全貌入口引入
from src.agent.ask_user.contracts import (
    AskUserQuestion,
    AskUserResolution,
    AskUserResolutionAnswer,
    AskUserResumeEnvelope,
    stable_request_id,
    validate_resolution,
)
from src.agent.core.state import A2UISubgraphState, VisualizationState
from src.agent.graph.subgraphs.chatbi.chatbi_agent_graph import (
    agent_reasoning_node,
    finalize_node,
    prepare_context_node,
    tool_execution_node,
)
from src.agent.graph.subgraphs.chatbi.chatbi_agent_state import ChatBIAgentState
from src.agent.graph.subgraphs.chatbi.graph import build_chatbi_graph
from src.agent.graph.subgraphs.report_graph import create_report_subgraph, manage_report
from src.agent.graph.subgraphs.visualization_graph import create_visualization_subgraph
from src.agent.core.event_utils import dispatch_agui_custom_event
from src.agent.long_task.event_bridge import LongTaskEventBridge
from src.agent.long_task.memory_backend import (
    BackendAPIError,
    JavaUserAgentMemoryBackend,
    JavaUserGlobalMemoryBackend,
    MemoryFileRef,
    MemoryFileUpdateRequest,
    MemoryFileVO,
)
from src.agent.long_task.memory_context import (
    DEFAULT_LONG_TASK_AGENT_ID,
    MemoryContext,
)
from src.agent.nodes.a2ui_nodes import (
    emit_create_surface,
    plan_batches,
    process_all_batches,
)
from src.agent.nodes.visualization_nodes.nodes import (
    _activity_dataset_fields_from_envelope,
    _find_tool_call,
    validate_spec,
)
from src.agent.schemas.data_envelope import ColumnMeta, DataEnvelope
from src.agent.tools.rag_tool import create_rag_tool
from src.server.clients import backend_api_client
from src.server.services.skill_import_service import (
    ImportedSkillPackage,
    LongTaskSkillConfig,
    SkillImportResult,
)


# ===========================================================================
# 1. 长期记忆体系 (Long-term Memory Architecture)
# ===========================================================================
# [MUST_MEMORIZE] 身份归一化与防御降级、虚拟文件白名单、401/403 vs 404/5xx/HTTPError 分水岭、409单次重试

_MAX_APP_ID = 9_223_372_036_854_775_807  # Java Long.MAX_VALUE 边界
_MAX_EDIT_RETRIES = 1


def build_memory_context(
    user_id: Optional[str],
    agent_id: Optional[str],
) -> MemoryContext:
    """归一化用户与 Agent 身份 (防御性降级避免长任务中断)。"""
    normalized_user_id = user_id.strip() if user_id else ""
    if not normalized_user_id:
        return MemoryContext(user_id=None, app_id=None, enabled_global=False, enabled_agent=False)

    normalized_agent_id = agent_id.strip() if agent_id else ""
    if not normalized_agent_id or normalized_agent_id == DEFAULT_LONG_TASK_AGENT_ID:
        return MemoryContext(user_id=normalized_user_id, app_id=None, enabled_global=True, enabled_agent=False)

    if not normalized_agent_id.isdecimal():
        logger.warning("Long Task 长期记忆降级: agent_id 格式非法，已关闭应用级记忆")
        return MemoryContext(user_id=normalized_user_id, app_id=None, enabled_global=True, enabled_agent=False)

    app_id = int(normalized_agent_id)
    if app_id <= 0 or app_id > _MAX_APP_ID:
        logger.warning("Long Task 长期记忆降级: agent_id 超出范围，已关闭应用级记忆")
        return MemoryContext(user_id=normalized_user_id, app_id=None, enabled_global=True, enabled_agent=False)

    return MemoryContext(user_id=normalized_user_id, app_id=app_id, enabled_global=True, enabled_agent=True)


class JavaMemoryBackend:
    """Java 长期记忆虚拟文件后端核心控制流。"""

    MEMORY_KEY = "preferences.md"

    def __init__(
        self,
        *,
        user_id: str,
        scope_type: str,
        app_id: int,
        source_thread_id: Optional[str] = None,
        source_run_id: Optional[str] = None,
    ) -> None:
        self._user_id = user_id
        self._file_ref = MemoryFileRef(scope_type=scope_type, app_id=app_id)
        self._source_thread_id = source_thread_id
        self._source_run_id = source_run_id

    def _normalize_path(self, file_path: str) -> str:
        """严格白名单：只允许 CompositeBackend 剥离路由前缀后的 preferences.md。"""
        normalized = file_path.replace("\\", "/").lstrip("/")
        if normalized != self.MEMORY_KEY:
            raise ValueError("长期记忆只允许访问 preferences.md")
        return "/" + self.MEMORY_KEY

    def _format_cat_n(self, content: str, offset: int = 0, limit: int = 2000) -> str:
        """POSIX cat -n 格式化：右对齐 6 位行号 + Tab。"""
        lines = content.splitlines(keepends=True)
        return "".join(f"{idx:>6}\t{line}" for idx, line in enumerate(lines[offset : offset + limit], offset + 1))

    async def _aget_file(self) -> MemoryFileVO:
        """读取记忆：401/403 鉴权失败上抛；404/5xx/httpx.HTTPError 记录警告并降级为空对象。"""
        try:
            files = await backend_api_client.batch_get_memory_files(
                self._user_id,
                [self._file_ref],
            )
            return files[0] if files else MemoryFileVO(**self._file_ref.model_dump())
        except BackendAPIError as exc:
            if exc.status_code not in (404,) and exc.status_code < 500 and exc.code < 500:
                raise
            logger.warning("长期记忆读取降级: status={}, code={}", exc.status_code, exc.code)
            return MemoryFileVO(**self._file_ref.model_dump())
        except httpx.HTTPError as exc:
            logger.warning("长期记忆网络读取降级: error_type={}", type(exc).__name__)
            return MemoryFileVO(**self._file_ref.model_dump())

    async def _aupdate_file(self, content: str, expected_version: int) -> MemoryFileVO:
        """更新记忆：传递 file_ref 与 MemoryFileUpdateRequest。"""
        return await backend_api_client.update_memory_file(
            self._file_ref,
            MemoryFileUpdateRequest(
                user_id=self._user_id,
                content=content,
                expected_version=expected_version,
                source_thread_id=self._source_thread_id,
                source_run_id=self._source_run_id,
            ),
        )

    async def _areplace(self, old_string: str, new_string: str, replace_all: bool) -> Tuple[int, Optional[str]]:
        """应用字符串替换，支持 HTTP 409 Conflict 乐观锁冲突重试 1 次。"""
        for attempt in range(_MAX_EDIT_RETRIES + 1):
            memory_file = await self._aget_file()
            occurrences = memory_file.content.count(old_string)
            if occurrences == 0:
                return 0, "old_string 未在长期记忆中找到"
            if not replace_all and occurrences != 1:
                return 0, "old_string 在长期记忆中出现多次"

            new_content = memory_file.content.replace(old_string, new_string, -1 if replace_all else 1)
            try:
                await self._aupdate_file(new_content, memory_file.version)
                return occurrences if replace_all else 1, None
            except BackendAPIError as exc:
                if exc.status_code != 409 or attempt >= _MAX_EDIT_RETRIES:
                    return 0, str(exc)
                logger.warning("长期记忆 409 版本冲突，重试: attempt={}", attempt + 1)
            except Exception as exc:
                return 0, str(exc)
        return 0, "长期记忆更新失败"


# ===========================================================================
# 2. 上下文自动压缩 (Context Compaction & Observability)
# ===========================================================================
# [MUST_MEMORIZE] 继承原生 SummarizationMiddleware、只读观测 Command、动态投影与 usage 事件隔离


class ObservedDeepAgentsSummarizationMiddleware(SummarizationMiddleware):
    """在原生压缩位置观测真实压缩结果并派发前端事件。"""

    def __init__(self, *args: Any, compaction_enabled: bool, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._compaction_enabled = compaction_enabled

    @staticmethod
    def _get_context_ids_and_scope() -> Tuple[str, str, bool]:
        """从 langgraph.config.get_config() 安全提取 thread_id/run_id 与 namespace。"""
        try:
            config = get_config()
        except RuntimeError:
            return "", "", False

        configurable = config.get("configurable", {})
        thread_id = str(configurable.get("thread_id", ""))
        run_id = str(configurable.get("run_id", ""))
        checkpoint_ns = str(configurable.get("checkpoint_ns", ""))
        return thread_id, run_id, "|" not in checkpoint_ns

    @staticmethod
    def _get_compaction_event(response: Union[ModelResponse, ExtendedModelResponse]) -> Optional[Dict[str, Any]]:
        """从 ExtendedModelResponse.command.update 读取只读压缩事件。"""
        if not isinstance(response, ExtendedModelResponse) or response.command is None:
            return None
        update = getattr(response.command, "update", None)
        if not isinstance(update, dict):
            return None
        event = update.get("_summarization_event")
        return event if isinstance(event, dict) else None

    async def awrap_model_call(
        self,
        request: ModelRequest[AgentState[Any]],
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> Union[ModelResponse, ExtendedModelResponse]:
        """拦截模型调用：compaction_enabled=True 时委托 super() 原生压缩，否则直接调用 handler。"""
        if self._compaction_enabled:
            response = await super().awrap_model_call(request, handler)
        else:
            # 禁用新建压缩时，已存在的历史摘要仍通过父类 _get_effective_messages 保持生效
            effective_messages = self._get_effective_messages(request)
            response = await handler(request.override(messages=effective_messages))

        # 只读观测框架压缩产物
        compaction_event = self._get_compaction_event(response)

        # 隔离事件派发异常，确保观测失败绝不影响已成功的模型调用
        thread_id, run_id, is_main_agent = self._get_context_ids_and_scope()
        if is_main_agent and thread_id:
            try:
                await adispatch_custom_event(
                    "context.usage_updated",
                    {
                        "thread_id": thread_id,
                        "run_id": run_id,
                        "compacted": compaction_event is not None,
                        "approximate": True,
                    },
                )
            except Exception as exc:
                logger.warning("上下文 usage 事件发送失败，不阻断主流程: error={}", exc)

        return response


# ===========================================================================
# 3. 技能系统 (Skill Ingestion, Manifest & Activation)
# ===========================================================================
# [EXPLAINABLE] URL 清洗签名、50MB/Zip Slip 安全校验、Manifest 缓存比对与 read_file 去重激活

_TRANSIENT_QUERY_KEYS = {
    "accesskeyid", "expires", "ossaccesskeyid",
    "response-content-disposition", "response-content-type", "signature",
}


def _canonical_resource_identity(url: str) -> str:
    """去除对象存储临时鉴权参数，保留稳定资源身份。"""
    parsed = urlsplit(url)
    stable_query: List[Tuple[str, str]] = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        lower_key = key.lower()
        if lower_key in _TRANSIENT_QUERY_KEYS or lower_key.startswith("x-amz-") or lower_key.startswith("x-oss-"):
            continue
        stable_query.append((key, value))
    stable_query.sort()
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, urlencode(stable_query, doseq=True), ""))


def compute_skill_signature(
    skill_oss_urls: Optional[List[str]] = None,
    skill_configs: Optional[List[LongTaskSkillConfig]] = None,
) -> Optional[str]:
    """计算技能集合 SHA-256 签名 (源码真实参数顺序：skill_oss_urls, skill_configs)。"""
    if skill_configs:
        identities = sorted(f"{s.id}|{_canonical_resource_identity(s.url)}" for s in skill_configs)
        payload = "\n".join(["layout-v3", "configs", *identities])
        return hashlib.sha256(payload.encode()).hexdigest()
    if skill_oss_urls:
        identities = sorted(_canonical_resource_identity(u) for u in skill_oss_urls)
        payload = "\n".join(["layout-v3", "legacy", *identities])
        return hashlib.sha256(payload.encode()).hexdigest()
    return None


class SkillImportService:
    """技能导入服务核心缓存与分发控制流。"""

    @staticmethod
    async def import_skills(
        backend: Any,
        import_state: Any,
        workspace_id: str,
        skill_configs: Optional[List[LongTaskSkillConfig]] = None,
        skill_oss_urls: Optional[List[str]] = None,
    ) -> SkillImportResult:
        effective_configs = skill_configs or []
        effective_legacy_urls = [] if effective_configs else (skill_oss_urls or [])
        signature = compute_skill_signature(
            skill_oss_urls=effective_legacy_urls,
            skill_configs=effective_configs,
        )

        if not effective_configs and not effective_legacy_urls:
            return SkillImportResult(skills_paths=[], signature=None, packages={})

        workspace_changed = workspace_id != getattr(import_state, "last_imported_workspace_id", None)
        signature_changed = signature != getattr(import_state, "last_imported_skill_signature", None)

        # 缓存命中校验：workspace 未变且 signature 未变时尝试从沙箱 manifest 加载
        if not workspace_changed and not signature_changed:
            cached = await SkillImportService._load_cached_result(
                backend=backend,
                skill_configs=effective_configs,
                expected_signature=signature,
            )
            if cached is not None:
                return cached

        # 未命中缓存：按协议分发并执行 staging 解压、单 SKILL.md 约束、Zip Slip 防御与原子切换
        if effective_configs:
            return await SkillImportService._import_config_packages(backend=backend, skill_configs=effective_configs, signature=signature)
        return await SkillImportService._import_legacy_urls(backend=backend, skill_oss_urls=effective_legacy_urls, signature=signature)

    @staticmethod
    async def _load_cached_result(backend: Any, skill_configs: list[LongTaskSkillConfig], expected_signature: Optional[str]) -> Optional[SkillImportResult]:
        ...

    @staticmethod
    async def _import_config_packages(backend: Any, skill_configs: list[LongTaskSkillConfig], signature: Optional[str]) -> SkillImportResult:
        ...

    @staticmethod
    async def _import_legacy_urls(backend: Any, skill_oss_urls: list[str], signature: Optional[str]) -> SkillImportResult:
        ...


class SkillActivationMiddleware(AgentMiddleware):
    """技能激活观测中间件核心拦截流与事件隔离。"""

    def __init__(
        self,
        *,
        run_id: str,
        packages: Mapping[str, ImportedSkillPackage],
        initially_activated_ids: Optional[Iterable[str]] = None,
        activated_skill_ids: Optional[set[str]] = None,
    ) -> None:
        super().__init__()
        self._run_id = run_id
        self._package_by_skill_md_path = {posixpath.normpath(pkg.skill_md_path): pkg for pkg in packages.values()}
        self._activated_skill_ids = activated_skill_ids if activated_skill_ids is not None else set()
        self._activated_skill_ids.update(initially_activated_ids or ())

    def _resolve_package(self, request: ToolCallRequest) -> Optional[ImportedSkillPackage]:
        """按 read_file 的绝对路径精确匹配当前 run 的 SKILL.md."""
        tool_call = request.tool_call
        if tool_call.get("name") != "read_file":
            return None
        args = tool_call.get("args")
        if not isinstance(args, dict):
            return None
        file_path = args.get("file_path")
        if not isinstance(file_path, str) or not file_path.startswith("/"):
            return None
        normalized = posixpath.normpath(file_path)
        return self._package_by_skill_md_path.get(normalized)

    @staticmethod
    def _is_successful_tool_message(result: Union[ToolMessage, Command[Any]]) -> bool:
        """只把明确成功返回的 read_file ToolMessage 视为激活."""
        return isinstance(result, ToolMessage) and result.status != "error"

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[Union[ToolMessage, Command[Any]]]],
    ) -> Union[ToolMessage, Command[Any]]:
        package = self._resolve_package(request)
        result = await handler(request)

        if package is None or not self._is_successful_tool_message(result):
            return result
        if package.id in self._activated_skill_ids:
            return result

        # 先写集合再 await，避免并行工具调用重复上报
        self._activated_skill_ids.add(package.id)
        activity_value = LongTaskEventBridge.skill_activation_activity_value(
            run_id=self._run_id,
            skill_id=package.id,
            skill_name=package.business_name,
            activation_source="automatic_discovery",
        )
        # 异常隔离：事件发送异常捕获记录 Warning，绝不改变成功的 ToolMessage 结果
        try:
            await dispatch_agui_custom_event(
                "copilotkit_emit_activity",
                activity_value,
                config=request.runtime.config,
            )
        except Exception as exc:
            logger.warning("技能激活事件发送失败，不影响工具结果: skill_id={}, error={}", package.id, exc)

        return result


# ===========================================================================
# 4. Human-in-the-loop (Ask User Contracts & Interruption)
# ===========================================================================
# [MUST_MEMORIZE] _runtime_identifier 严格解析、keyword-only stable_request_id、interrupt/validate_resolution


def _runtime_identifier(runtime: ToolRuntime, key: str) -> str:
    """从 ToolRuntime state/config/metadata 中依次取得受控标识，缺失严厉抛错。"""
    value = runtime.state.get(key)
    if value is None:
        value = runtime.config.get("configurable", {}).get(key)
    if value is None:
        value = runtime.config.get("metadata", {}).get(key)
    if value is None:
        raise ValueError(f"Ask User 缺少运行时 {key}")
    return str(value)


def create_ask_user_tool() -> BaseTool:
    """创建可被 ToolNode 直接执行的 Ask User 工具 (仅绑定顶层 Agent)。"""

    @tool
    async def ask_user(questions: List[AskUserQuestion], runtime: ToolRuntime) -> Dict[str, Any]:
        """向用户一次性提出 1 至 4 道必要的澄清问题并中断等待。"""
        if not (1 <= len(questions) <= 4):
            raise ValueError("Ask User 每次必须包含 1 至 4 道问题")
        q_texts = [q.question for q in questions]
        if len(set(q_texts)) != len(q_texts):
            raise ValueError("同一 Ask User 题组内 question 必须唯一")

        # 严格获取标识，杜绝空字符串兜底
        thread_id = _runtime_identifier(runtime, "thread_id")
        run_id = _runtime_identifier(runtime, "run_id")
        tool_call_id = str(runtime.tool_call_id or "").strip()
        if not tool_call_id:
            raise ValueError("Ask User 缺少 toolCallId")

        # keyword-only 方式调用 stable_request_id
        request_id = stable_request_id(
            thread_id=thread_id,
            run_id=run_id,
            tool_call_id=tool_call_id,
        )
        pending_payload = {
            "type": "ask_user",
            "requestId": request_id,
            "threadId": thread_id,
            "runId": run_id,
            "toolCallId": tool_call_id,
            "status": "pending",
            "questions": [q.model_dump() for q in questions],
        }

        # 1. 触发 LangGraph 中断挂起
        resume_envelope = interrupt(pending_payload)

        # 2. 恢复后强类型校验 (Request ID 恒定时间比较与题目一一对齐)
        resolution = validate_resolution(
            envelope=resume_envelope,
            expected_request_id=request_id,
            questions=questions,
        )

        # 3. 发射 ask_user.resolved 自定义事件
        resolved_card = {
            "type": "ask_user",
            "requestId": request_id,
            "threadId": thread_id,
            "runId": run_id,
            "toolCallId": tool_call_id,
            "status": resolution.status,
            "answers": [a.model_dump() for a in resolution.answers] if resolution.answers else None,
        }
        await adispatch_custom_event("ask_user.resolved", resolved_card, config=runtime.config)

        result: Dict[str, Any] = {"requestId": request_id, "status": resolution.status}
        if resolution.status == "submitted" and resolution.answers:
            result["answers"] = [a.model_dump() for a in resolution.answers]
        return result

    return ask_user


# ===========================================================================
# 5. ChatBI 智能体化升级与 DataEnvelope 协议
# ===========================================================================
# [MUST_MEMORIZE] 三段式 Agent Loop、4 闭包工具、真实条件路由与 20 行信封分流 (GAP-27 已确认)

PREVIEW_THRESHOLD = 20        # ToolMessage 对话预览截断阈值 (超过 20 行仅展示前 5 行)
MAX_RETURN_ROWS = 20          # 信封行数截断阈值 (超过 20 行置 data_complete=False)
DETAIL_QUERY_THRESHOLD = 200  # exit_node.py 顶部声明的早期设计常量，未在 _build_data_envelope 中接入使用；20 行阈值经确认为有意收敛的现行实现 (GAP-27 CONFIRMED)


def _build_data_envelope_from_sql_response(sql: str, payload: Dict[str, Any]) -> Optional[DataEnvelope]:
    """从 SQL 执行响应构建 DataEnvelope (按当前运行代码的 20 行边界生效)。"""
    raw_rows = payload.get("data", {}).get("rows", [])
    total_count = payload.get("data", {}).get("total", len(raw_rows))
    if total_count <= 0:
        return None

    # 当前主线与分支实现均按 MAX_RETURN_ROWS = 20 判定 is_detail
    is_detail = total_count > MAX_RETURN_ROWS
    limited_rows = raw_rows[:MAX_RETURN_ROWS]
    columns = [
        ColumnMeta(field=k, type="varchar", alias=k, sample_values=[r.get(k) for r in limited_rows[:3]])
        for k in (limited_rows[0].keys() if limited_rows else [])
    ]

    return DataEnvelope(
        row_count=total_count,
        column_metadata=columns,
        sample_rows=limited_rows[:5],
        full_data=limited_rows,
        query_sql=sql,
        page_size=MAX_RETURN_ROWS if is_detail else None,
        data_complete=not is_detail,
    )


def route_after_prepare(state: ChatBIAgentState) -> str:
    """prepare_context 后的条件路由决策."""
    errors = state.get("errors", {})
    if errors.get("prepare_context"):
        return "finalize"
    return "agent_reasoning"


def route_after_agent(state: ChatBIAgentState) -> str:
    """agent_reasoning 后的条件路由决策."""
    if state.get("final_sql") or state.get("clarification"):
        return "finalize"
    iteration = state.get("iteration_count", 0)
    max_iter = state.get("max_iterations", 6)
    if iteration >= max_iter:
        return "finalize"

    agent_msgs = state.get("agent_messages", [])
    if not agent_msgs:
        return "finalize"
    last = agent_msgs[-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return "finalize"

    tool_names = [tc["name"] for tc in last.tool_calls]
    if "submit_final_sql" in tool_names or "submit_clarification" in tool_names:
        return "finalize"
    return "tool_execution"


def build_chatbi_agent_graph() -> CompiledStateGraph:
    """构建三段式 ChatBI Agent Loop 图实例 (使用真实 ChatBIAgentState 与条件边)."""
    builder = StateGraph(ChatBIAgentState)
    builder.add_node("prepare_context", prepare_context_node)
    builder.add_node("agent_reasoning", agent_reasoning_node)
    builder.add_node("tool_execution", tool_execution_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "prepare_context")
    builder.add_conditional_edges(
        "prepare_context",
        route_after_prepare,
        {"agent_reasoning": "agent_reasoning", "finalize": "finalize"},
    )
    builder.add_conditional_edges(
        "agent_reasoning",
        route_after_agent,
        {"tool_execution": "tool_execution", "finalize": "finalize"},
    )
    builder.add_edge("tool_execution", "agent_reasoning")
    builder.add_edge("finalize", END)
    return builder.compile()


# ===========================================================================
# 6. Visualization 与 A2UI / Report / RAG 业务子图
# ===========================================================================
# [EXPLAINABLE] 双通道分发、Basic Catalog 分批生成、Report 动作路由与多模态 RAG


async def build_output(state: VisualizationState) -> Dict[str, Any]:
    """Visualization 子图带外通道分发：从 envelope.data_complete 组装 Activity 并发送。"""
    envelope: Optional[DataEnvelope] = state.get("_envelope")
    chart_spec = state.get("chart_spec")
    dataset_fields = _activity_dataset_fields_from_envelope(envelope)

    result = {
        "component": "AntVChart",
        "spec": chart_spec.get("spec") if chart_spec else None,
        "data": envelope.full_data if envelope else None,
        **dataset_fields,
    }
    await adispatch_custom_event(
        "copilotkit_emit_activity",
        {
            "activity_type": "antv_chart",
            "content": result,
        },
    )
    return {"visualization_result": result}


def emit_visualization_tool_message(state: VisualizationState) -> Dict[str, Any]:
    """Visualization 子图带内通道：提取 tool_call_id 回传简短确认，避免大 JSON 污染上下文。"""
    messages = state.get("messages", [])
    tool_call_id = "unknown"
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for tool_name in ["visualize", "visualize_tool"]:
                tool_call = _find_tool_call(msg, tool_name)
                if tool_call:
                    tool_call_id = tool_call["id"]
                    break
            if tool_call_id != "unknown":
                break
    return {"messages": [ToolMessage(content="已成功生成 AntV 可视化图表。", tool_call_id=tool_call_id)]}


def create_a2ui_subgraph(
    *,
    generator: Any = None,
    planner: Any = None,
    surface_id_factory: Optional[Callable[[], str]] = None,
) -> CompiledStateGraph:
    """A2UI 原型子图装配：emit_create_surface ──► plan_batches ──► process_batches。"""
    from src.agent.graph.subgraphs.a2ui_graph import QwenA2UIGenerator

    batch_generator = generator or QwenA2UIGenerator()
    make_surface_id = surface_id_factory or (lambda: f"surface-{uuid.uuid4().hex}")

    builder = StateGraph(A2UISubgraphState)
    builder.add_node("emit_create_surface", emit_create_surface(make_surface_id))
    builder.add_node("plan_batches", plan_batches(planner))
    builder.add_node("process_batches", process_all_batches(batch_generator))

    builder.add_edge(START, "emit_create_surface")
    builder.add_edge("emit_create_surface", "plan_batches")
    builder.add_edge("plan_batches", "process_batches")
    builder.add_edge("process_batches", END)
    return builder.compile()


@tool
async def render_a2ui(data: dict[str, Any], intent: str) -> str:
    """A2UI 渲染入口工具：带外发射 Activity 事件，仅向主 Agent 返回简短确认文本。"""
    graph = create_a2ui_subgraph()
    await graph.ainvoke(
        {
            "data": data,
            "intent": intent,
            "a2ui_messages": [],
            "generated_component_ids": [],
            "retry_count": 0,
        }
    )
    return "UI 已渲染完成。"


# ===========================================================================
# 7. 注释化跨文件调用链 (Annotated Cross-File Call Chain)
# ===========================================================================
# [MUST_MEMORIZE] 真实长任务请求中各核心组件的交互时序与失败边界

"""
典型长任务生命周期调用链跟踪 (Execution Flow Trace)：

1. 请求接入与记忆初始化 (factory.py -> memory_context.py):
   - build_memory_context 校验 user_id 与 agent_id (缺失/非法格式降级为全局记忆或完全关闭)
   - CompositeBackend 挂载 /shared/preferences.md 与 /memories/preferences.md
   - JavaMemoryBackend._aget_file() 读取用户长期偏好并注入 System Prompt (<agent_memory>)
   - [失败边界]: 401/403 上抛中断；404/5xx/httpx.HTTPError 降级为空记忆 VO 保持任务运行；409 乐观锁冲突重试 1 次。

2. 技能包签名与增量导入 (skill_import_service.py):
   - _canonical_resource_identity 剔除 URL 临时鉴权参数后计算 SHA-256 签名 (有序传参)
   - 比对沙箱 .langagent_manifest.json 缓存命中时跳过下载
   - 未命中时校验 50MB 上限与 Zip Slip，解压至 __staging__ 并重命名原子切换 (失败回滚 __backup__)
   - 初始化 SkillActivationMiddleware，显式选技 (selected_skill_id) 预填 initially_activated_ids

3. 上下文预算检测与自动压缩 (observed_summarization_middleware.py):
   - 继承原生 SummarizationMiddleware，compaction_enabled=True 时委托 super().awrap_model_call 执行压缩
   - 观测 ExtendedModelResponse.command 中的 _summarization_event，后续轮次由父类 _get_effective_messages 动态投影
   - 发射 context.usage_updated CUSTOM 事件 (异常隔离，不阻断主推理流)

4. ChatBI 子图智能体化执行 (chatbi_agent_graph.py):
   - prepare_context_node 全量内联 M-Schema (否定动态选表工具)
   - agent_reasoning_node 决策工具调用 (注入 metadata 抑制子图内部事件冒泡)
   - tool_execution_node 直接调用底层函数 (绕过 ainvoke 防 AG-UI 适配器 'str' object 崩溃)
   - route_after_agent 条件边驱动循环；finalize_node 复用缓存构建 DataEnvelope (超过 20 行置 data_complete=False，GAP-27)
   - 持久化信封至 DB 并返回带 20 行预览的 ToolMessage

5. 可视化双通道分发 (nodes.py -> visualization_graph.py):
   - validate_spec(state: VisualizationState) 校验 scale 覆盖 encode 列 (失败重试最多 2 次)
   - build_output 读取 envelope.data_complete 派发 copilotkit_emit_activity (inline_complete vs client_fetch)
   - emit_visualization_tool_message 提取 tool_call_id 回传简短确认 ToolMessage，避免大 JSON 污染上下文

6. Human-in-the-loop 澄清与恢复 (tool.py -> contracts.py):
   - 顶层 ask_user 工具校验敏感词与题目数 (1-4 题，2-4 选项，1-500 字符单行答案)
   - _runtime_identifier 严格从 state/config/metadata 获取 thread_id/run_id/tool_call_id (缺失抛错)
   - keyword-only 调用 stable_request_id(thread_id=..., run_id=..., tool_call_id=...) 并调用 interrupt(pending_payload) 挂起
   - AskUserToolArgsMasker 掩码流式参数；AskUserInterruptTranslator 转译为 ask_user.pending
   - 前端作答后通过 Command(resume=...) 唤醒，validate_resolution 严格校验后发射 ask_user.resolved
   - [非 Happy Path]: 用户取消时系统提示词指导模型使用安全默认值推进；非法恢复抛出 ValidationError。
"""
