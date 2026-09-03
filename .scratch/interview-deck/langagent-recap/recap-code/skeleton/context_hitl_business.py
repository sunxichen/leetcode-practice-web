"""
context_hitl_business.py - 上下文治理、HITL、技能与业务子图白板骨架代码 (Skeleton)

定位说明:
- 本文件为 15 分钟白板默写骨架，仅保留真实类名/函数名、核心控制流与关键机制注释。
- 完整机制与防御性细节参照: recap-code/core/context_hitl_business.py。

【白板手写与记忆分级】:
1. 必须能默写: build_memory_context() 降级与 JavaMemoryBackend 401/403 vs 404/5xx 分水岭;
               ObservedDeepAgentsSummarizationMiddleware 原生继承与 usage 事件隔离;
               create_ask_user_tool() 强类型契约、_runtime_identifier 解析与 interrupt 挂起/恢复;
               ChatBI Agent Loop 三段式循环与 20 行 DataEnvelope 截断分流 (GAP-27)。
2. 需要能解释: SkillActivationMiddleware 拦截 read_file 激活与去重上报;
               Visualization 子图带内简短 ToolMessage 与带外 copilotkit_emit_activity 双通道分发。
3. 追问时展开: JavaMemoryBackend 409 乐观锁冲突 1 次重试;
               A2UI 原型 process_all_batches 分批渲染。
"""

from __future__ import annotations

import asyncio
import hashlib
import posixpath
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple


# --- 1. 长期记忆体系 (src/agent/long_task/memory_backend.py) ---
def build_memory_context(user_id: Optional[str], agent_id: Optional[str]) -> Any:
    """归一化身份: user_id 缺失关闭全局记忆; agent_id 非法/超出范围降级为仅全局记忆"""
    uid = (user_id or "").strip()
    aid = (agent_id or "").strip()
    if not uid: return type("MemoryContext", (), {"enabled_global": False, "enabled_agent": False})()
    if not aid or not aid.isdecimal(): return type("MemoryContext", (), {"enabled_global": True, "enabled_agent": False})()
    return type("MemoryContext", (), {"enabled_global": True, "enabled_agent": True})()

class JavaMemoryBackend:
    """长期记忆虚拟文件系统: 严格 preferences.md 白名单 + 401/403 抛出 vs 404/5xx 降级 + 409 重试"""
    MEMORY_KEY = "preferences.md"

    def _normalize_path(self, path: str) -> str:
        if path.replace("\\", "/").lstrip("/") != self.MEMORY_KEY:
            raise ValueError("长期记忆只允许访问 preferences.md")
        return "/" + self.MEMORY_KEY

    async def _aget_file(self) -> Any:
        try:
            # files = await backend_api_client.batch_get_memory_files(...)
            return type("MemoryFileVO", (), {"content": "", "version": 1})()
        except Exception as exc:
            # 401/403 鉴权失败显式抛出; 404/5xx/网络异常降级为空对象，不阻断任务
            if getattr(exc, "status_code", 500) in (401, 403): raise
            return type("MemoryFileVO", (), {"content": "", "version": 1})()

    async def _areplace(self, old_s: str, new_s: str) -> Tuple[int, Optional[str]]:
        """应用字符串替换，支持 HTTP 409 乐观锁版本冲突重试 1 次"""
        for attempt in range(2):
            f = await self._aget_file()
            if old_s not in f.content: return 0, "old_string 未找到"
            new_content = f.content.replace(old_s, new_s, 1)
            try:
                # await backend_api_client.update_memory_file(..., expected_version=f.version)
                return 1, None
            except Exception as e:
                if getattr(e, "status_code", 0) == 409 and attempt == 0: continue  # 409 重试
                return 0, str(e)
        return 0, "更新失败"


# --- 2. 上下文压缩观测与技能激活 (src/agent/long_task/) ---
class ObservedDeepAgentsSummarizationMiddleware:
    """继承原生 SummarizationMiddleware，只读观测 _summarization_event 并隔离派发 usage 事件"""
    async def awrap_model_call(self, request: Any, handler: Callable) -> Any:
        response = await handler(request)  # 生产中 super().awrap_model_call
        # 提取压缩事件并派发 context.usage_updated (异常完全隔离，绝不影响主推理)
        try:
            pass  # await adispatch_custom_event("context.usage_updated", {"compacted": True})
        except Exception: pass
        return response

class SkillActivationMiddleware:
    """拦截 read_file 至 /workspace/agent_skills/*/SKILL.md，内存 Set 去重并上报激活事件"""
    def __init__(self, packages: Dict[str, Any]):
        self._packages = packages
        self._activated: set[str] = set()

    async def awrap_tool_call(self, request: Any, handler: Callable) -> Any:
        result = await handler(request)
        call = getattr(request, "tool_call", {})
        if call.get("name") == "read_file":
            path = posixpath.normpath(call.get("args", {}).get("file_path", ""))
            pkg = self._packages.get(path)
            if pkg and pkg.id not in self._activated:
                self._activated.add(pkg.id)  # 先写集合防并发重复
                try: pass  # await dispatch_agui_custom_event("copilotkit_emit_activity", ...)
                except Exception: pass
        return result


# --- 3. Human-in-the-loop (src/agent/ask_user/contracts.py & tool.py) ---
def create_ask_user_tool() -> Any:
    """创建 Ask User 工具: 1-4 题校验 + 严格运行时 ID 解析 + interrupt 挂起与恢复校验"""
    async def ask_user(questions: List[Any], runtime: Any) -> Dict[str, Any]:
        if not (1 <= len(questions) <= 4): raise ValueError("每次必须提出 1 至 4 道问题")
        thread_id = runtime.config.get("configurable", {}).get("thread_id") or ""
        run_id = runtime.config.get("configurable", {}).get("run_id") or ""
        tool_call_id = runtime.tool_call_id or ""
        if not (thread_id and run_id and tool_call_id): raise ValueError("Ask User 缺少运行时标识")

        req_id = hashlib.sha256(f"{thread_id}:{run_id}:{tool_call_id}".encode()).hexdigest()[:16]
        # 1. 触发 LangGraph 中断挂起
        # resume_envelope = interrupt({"requestId": req_id, "questions": questions})
        # 2. 恢复后强校验与事件派发
        # resolution = validate_resolution(resume_envelope, expected_request_id=req_id)
        # await adispatch_custom_event("ask_user.resolved", resolution)
        return {"requestId": req_id, "status": "submitted"}
    return ask_user


# --- 4. ChatBI Agent Loop 与 DataEnvelope ---
# [事实源分层]: Agent Loop 机制 = chatbi-agent-loop 参考分支 chatbi_agent_graph.py / chatbi_agent_tools.py (prototype_verified, 未合入 develop);
#              DataEnvelope 构建 = develop 基线 chatbi/nodes/exit_node.py (FACT-BI-002, GAP-27 已确认 20 行为有意收敛)
MAX_RETURN_ROWS = 20  # 现行确认为有意收敛的 20 行边界 (GAP-27)

def _build_data_envelope_from_sql_response(sql: str, payload: Dict[str, Any]) -> Any:
    rows = payload.get("data", {}).get("rows", [])
    total = payload.get("data", {}).get("total", len(rows))
    is_detail = total > MAX_RETURN_ROWS
    limited = rows[:MAX_RETURN_ROWS]
    return {
        "row_count": total, "query_sql": sql, "sample_rows": limited[:5],
        "full_data": limited, "data_complete": not is_detail  # 超过 20 行置 False
    }

def route_after_agent(state: Dict[str, Any]) -> str:
    """ChatBI 三段式循环路由: 出口 (final_sql/clarification/超轮) -> finalize; 否则 -> tool_execution
    [事实源]: chatbi-agent-loop 参考分支 chatbi_agent_graph.py:879 (prototype_verified, 未合入 develop 主线;
    develop 主线为 entry→query_rewrite→sql_generation→sql_self_check→error_correction→exit 固定 DAG)"""
    if state.get("final_sql") or state.get("clarification") or state.get("iteration_count", 0) >= 6:
        return "finalize"
    calls = getattr(state.get("agent_messages", [None])[-1], "tool_calls", [])
    if any(c.get("name") in ("submit_final_sql", "submit_clarification") for c in calls):
        return "finalize"
    return "tool_execution"

def build_chatbi_agent_graph() -> Any:
    """装配: START -> prepare_context -> agent_reasoning <-> tool_execution -> finalize -> END"""
    # builder = StateGraph(ChatBIAgentState)
    # builder.add_node("prepare_context", prepare_context_node)
    # builder.add_node("agent_reasoning", agent_reasoning_node)
    # builder.add_node("tool_execution", tool_execution_node)  # 直接调用底层函数防 'str' 崩溃
    # builder.add_node("finalize", finalize_node)
    # builder.add_conditional_edges("agent_reasoning", route_after_agent)
    # builder.add_edge("tool_execution", "agent_reasoning")
    return {"graph": "ChatBIAgentGraph", "route": route_after_agent}


# --- 5. Visualization 双通道分发 (src/agent/nodes/visualization_nodes/) ---
async def build_output(state: Dict[str, Any]) -> Dict[str, Any]:
    """带外通道: 发射 copilotkit_emit_activity 携带 AntV 图表 Spec 与信封数据"""
    envelope = state.get("_envelope", {})
    # await adispatch_custom_event("copilotkit_emit_activity", {"activity_type": "antv_chart", "data": envelope.get("full_data")})
    return {"visualization_result": {"status": "success"}}

def emit_visualization_tool_message(state: Dict[str, Any]) -> Dict[str, Any]:
    """带内通道: 回传简短确认 ToolMessage，避免大体积 Spec/JSON 污染后续上下文"""
    return {"messages": [type("ToolMessage", (), {"content": "已成功生成 AntV 可视化图表。", "tool_call_id": "call_123"})()]}
