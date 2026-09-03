"""
========================================================================================
langAgent 核心运行时与 Agent Loop 白板复现代码 (Runtime & Agent Loop Recap Code)
========================================================================================

文件位置: .scratch/interview-deck/langagent-recap/recap-code/core/runtime_agent_loop.py
成熟度标定: Fully Implemented (基于 develop 源码与测试基线，锁定依赖: langgraph 1.2.8, ag-ui-protocol 0.1.19)

【白板手写与面试记忆分级】:
1. 必须能默写 (Must-Memorize):
   - DynamicAgentFactory.build() 动态图装配与条件路由 route(state)
   - AgentRegistry.get_or_build() 基于配置 MD5 的 LRU 缓存模式
   - MainAgentState 与 add_messages Reducer 语义
   - AgentService.generate_events() 核心事件生成与异常兜底流 (补发 StepFinished/RunError/RunFinished)
2. 需要能解释 (Need-to-Explain):
   - 10 级中间件流水线架构及与 AG-UI 前端协议的解耦方式
   - 延迟回滚 _rollback_checkpoint_on_cancel 的两阶段设计与 SQLite 异步死锁规避
   - ReasoningCallbackHandler 思考流双格式提取与闭合时机检测
   - ToolManager 中 _JsonCoercingBaseModel 参数容错与动态 Schema 构建
3. 追问时展开 (Expand-on-Followup):
   - 多 ToolCall 场景下 route() 仅检查首个工具的已知边界缺陷 (Verified Boundary Defect)
   - MCPClientManager 中 timeout 参数未通过 asyncio.wait_for 包装的技术债
   - Streaming 与 Blocking 双模同源消费 (BlockingEventAggregator 聚合逻辑)
   - Starlette 0.52+ 底层断连失效与 with_disconnect_watcher 独立轮询机制
========================================================================================
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Dict, List, Optional, Sequence, TypedDict

# --------------------------------------------------------------------------------------
# 框架与核心协议类型契约 (来自 langchain_core, langgraph 1.2.8, ag_ui_protocol 0.1.19)
# --------------------------------------------------------------------------------------
class BaseMessage:
    def __init__(self, content: str = "", id: Optional[str] = None, **kwargs: Any):
        self.content = content
        self.id = id or f"msg-{hash(content)}"
        self.additional_kwargs = kwargs

class SystemMessage(BaseMessage): pass
class HumanMessage(BaseMessage): pass
class AIMessage(BaseMessage):
    def __init__(self, content: str = "", tool_calls: Optional[List[Dict[str, Any]]] = None, **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_calls = tool_calls or []

class AIMessageChunk(AIMessage):
    def __add__(self, other: AIMessageChunk) -> AIMessageChunk:
        merged_content = self.content + other.content
        merged_calls = (self.tool_calls or []) + (other.tool_calls or [])
        return AIMessageChunk(content=merged_content, tool_calls=merged_calls)

class ToolMessage(BaseMessage):
    def __init__(self, content: str, tool_call_id: str, artifact: Any = None, **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_call_id = tool_call_id
        self.artifact = artifact

class RemoveMessage:
    def __init__(self, id: str):
        self.id = id

class Command:
    def __init__(self, update: Optional[Dict[str, Any]] = None, resume: Any = None):
        self.update = update or {}
        self.resume = resume

def add_messages(existing: List[BaseMessage], updates: List[BaseMessage | RemoveMessage]) -> List[BaseMessage]:
    """LangGraph 原生 add_messages Reducer 语义:
    按 message.id 合并更新；新 ID 追加；RemoveMessage 根据 ID 剔除。
    (项目历史演进: 修复了早期覆盖型 lambda x, y: x + y 导致的丢消息与重复问题)
    """
    msg_map = OrderedDict((m.id, m) for m in existing)
    for u in updates:
        if isinstance(u, RemoveMessage):
            msg_map.pop(u.id, None)
        elif isinstance(u, BaseMessage):
            msg_map[u.id] = u
    return list(msg_map.values())

# --------------------------------------------------------------------------------------
# 1. 状态定义 (State Definitions)
# --------------------------------------------------------------------------------------

class MainAgentState(TypedDict, total=False):
    """主 ReAct Agent 图状态定义 (src/agent/core/state.py).
    
    设计关键点:
    - messages: 必填核心字段，使用 add_messages Reducer 保证跨节点与子图写入的幂等性。
    - 领域状态隔离: 报告草稿 (report_draft) 或信封明细不在主图累加，防止主模型上下文膨胀。
    """
    messages: Annotated[List[BaseMessage], add_messages]
    user_input: str
    final_response: str
    user_hint: str
    visualization_result: Optional[Dict[str, Any]]
    chatbi_config: Dict[str, Any]
    llm_config: Dict[str, Any]
    quote_enable: bool
    thread_id: str
    run_id: str
    text_edit_request: Dict[str, Any]


class AgentConfig:
    """强类型请求级配置对象 (src/agent/schemas/agent_config.py)."""
    def __init__(
        self,
        model_name: str = "qwen-plus",
        persona: str = "You are a helpful assistant.",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        provider_url: Optional[str] = None,
        mcp_tools: Optional[List[Dict[str, Any]]] = None,
        dataset_configs: Optional[Any] = None,
        chatbi_config: Optional[Any] = None,
        enable_visualization: bool = True,
        enable_report: bool = True,
        enable_ask_user: bool = True,
        enable_reasoning: bool = False,
        file_context: Optional[str] = None,
        mcp_tools_context: Optional[Dict[str, Any]] = None,
    ):
        self.model_name = model_name
        self.persona = persona
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.provider_url = provider_url
        self.mcp_tools = mcp_tools or []
        self.dataset_configs = dataset_configs
        self.chatbi_config = chatbi_config
        self.enable_visualization = enable_visualization
        self.enable_report = enable_report
        self.enable_ask_user = enable_ask_user
        self.enable_reasoning = enable_reasoning
        self.file_context = file_context
        self.mcp_tools_context = mcp_tools_context or {}

    def model_dump_json(self) -> str:
        return json.dumps(self.__dict__, sort_keys=True, default=str)


# --------------------------------------------------------------------------------------
# 2. 动态 MCP 工具与参数容错解析 (Tool Manager & Robust Schema Parser)
# --------------------------------------------------------------------------------------

class ToolManager:
    """动态 MCP 工具管理器与参数容错解析器 (src/agent/core/tool_manager.py)."""

    @staticmethod
    def mask_args_for_log(args: Dict[str, Any]) -> Dict[str, str]:
        """安全脱敏: 对字符串参数执行前 2 后 2 掩码 ('ab***yz')，防止日志泄露 Token 或凭证。"""
        masked: Dict[str, str] = {}
        for k, v in args.items():
            if v is None:
                masked[k] = "<none>"
            elif isinstance(v, str):
                masked[k] = "***" if len(v) <= 6 else f"{v[:2]}***{v[-2:]}"
            else:
                masked[k] = f"<{type(v).__name__}>"
        return masked

    @classmethod
    def coerce_json_args(cls, raw_args: Dict[str, Any]) -> Dict[str, Any]:
        """参数反序列化容错 (对应 _JsonCoercingBaseModel 行为):
        
        问题背景: Qwen 等大模型生成工具调用时，常将复杂对象/数组序列化为 JSON 字符串。
        Pydantic v2 默认不会自动将 str 强转为 dict/list，会导致 Schema 校验直接报 422。
        此处在验证前自动探测首字符并 json.loads() 反序列化。
        """
        coerced = dict(raw_args)
        for k, v in coerced.items():
            if isinstance(v, str) and v.strip() and v.strip()[0] in ('[', '{'):
                try:
                    coerced[k] = json.loads(v)
                except Exception:
                    pass
        return coerced


class MCPClientManager:
    """动态 MCP 远程客户端管理器 (src/agent/core/mcp_client.py).
    
    【已知架构技术债说明】:
    1. 每次 execute_tool 独立创建 StreamableHttpTransport 和 Client 上下文，未启用连接池复用。
    2. execute_tool 虽接收 timeout 参数并声明捕获 asyncio.TimeoutError，但底层未用 asyncio.wait_for 包裹，
       导致超时参数未在客户端层面真正 enforce (依赖底层 HTTP 连接自身的默认超时)。
    """
    async def execute_tool(
        self,
        url: str,
        tool_name: str,
        args: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        if not url:
            return {"error": "MCP 服务器 URL 不能为空", "tool_name": tool_name}
        
        try:
            # 伪代码表达 fastmcp Client 远程调用
            # 真实实现技术债: 未使用 asyncio.wait_for(..., timeout=timeout)
            # async with Client(StreamableHttpTransport(url=url, headers=headers or {})) as client:
            #     result = await client.call_tool(tool_name, args)
            #     return self._process_result(result)
            return {"status": "success", "result": f"Executed {tool_name} on {url}"}
        except asyncio.TimeoutError:
            return {"error": f"MCP 工具调用超时 ({timeout}s)", "tool_name": tool_name}
        except Exception as e:
            return {"error": f"MCP 工具调用失败: {str(e)}", "tool_name": tool_name}


# --------------------------------------------------------------------------------------
# 3. 动态图编译器与 LRU 编译缓存 (Dynamic Graph Compilation & LRU Cache)
# --------------------------------------------------------------------------------------

START = "__start__"
END = "__end__"

class DynamicAgentFactory:
    """运行时动态 Agent 编译器 (src/agent/factory/agent_factory.py).
    
    根据请求级 AgentConfig 动态挂载节点、工具与条件边，编译出专属 CompiledStateGraph。
    """
    @staticmethod
    def build(agent_config: AgentConfig, checkpointer: Any = None) -> Any:
        # 1. 工具分类收集 (4 层分类学)
        direct_execution_tools: List[Any] = []
        builtin_routes: Dict[str, str] = {}
        conditional_map: Dict[str, str] = {END: END}

        # 层级 1: 本地内置工具 (file_download, manage_envelope, render_inline_html)
        direct_execution_tools.append("file_download")
        direct_execution_tools.append("manage_envelope")

        # 层级 2: 动态 MCP 工具
        for mcp in agent_config.mcp_tools:
            direct_execution_tools.append(mcp.get("name", "mcp_tool"))

        # 层级 3: 知识与交互工具 (RAG, Ask User)
        if agent_config.dataset_configs:
            direct_execution_tools.append("search_knowledge_base")
        if agent_config.enable_ask_user:
            direct_execution_tools.append("ask_user")

        # 层级 4: 业务子图入口 Schema (暴露决策契约，由主图条件边路由分流至独立子图)
        if agent_config.enable_visualization:
            builtin_routes["visualize"] = "visualization_subgraph"
            conditional_map["visualization_subgraph"] = "visualization_subgraph"

        if agent_config.chatbi_config:
            builtin_routes["chatbi_text2sql"] = "chatbi_subgraph"
            conditional_map["chatbi_subgraph"] = "chatbi_subgraph"

        if agent_config.enable_report:
            builtin_routes["manage_report"] = "report_subgraph"
            conditional_map["report_subgraph"] = "report_subgraph"

        if direct_execution_tools:
            conditional_map["tool_executor"] = "tool_executor"

        # 2. 主 Agent 节点闭包 (捕获 System Prompt 模板与动态文件注入)
        async def agent_node(state: MainAgentState, config: Dict[str, Any]) -> Dict[str, Any]:
            # 组装 Prompt 序列: SystemMessage -> 临时文件 HumanMessage (不存 Checkpointer) -> 历史 messages
            llm_messages: List[BaseMessage] = [SystemMessage(content=agent_config.persona)]
            
            if agent_config.file_context:
                # 动态注入临时文件上下文，避免持久化数据库体积膨胀
                llm_messages.append(HumanMessage(content=f"[文件上下文]\n{agent_config.file_context}"))
            
            llm_messages.extend(state.get("messages", []))

            # 模拟流式 LLM 调用与 AIMessage 累加 (结合 ReasoningCallbackHandler)
            # async for chunk in llm_with_tools.astream(llm_messages, config=config): ...
            mock_aimessage = AIMessage(content="处理完成", tool_calls=[])
            return {"messages": [mock_aimessage]}

        # 3. 核心条件路由函数 (Decision Boundary & Defect Spot)
        def route(state: MainAgentState) -> str:
            """主图条件路由: 检查最后一条消息并决定下一节点.
            
            【⚠️ 架构缺陷与边界路径 (Verified Defect in agent_factory.py#L653)】:
            当前实现使用: tool_name = last_msg.tool_calls[0]["name"] (仅取首个工具)
            - 纯普通工具场景 (Happy Path): 若返回 [search_kb, search_weather]，首个命中 tool_executor，
              底层 ToolNode 会通过 asyncio.gather 并发执行全部工具。
            - 混合调用场景 (Defect Path): 若返回 [visualize, search_weather]，route 仅识别 visualize
              并路由至 visualization_subgraph；子图处理完回边主 Agent，search_weather 被静默丢弃！
            """
            messages = state.get("messages", [])
            if not messages:
                return END
            last_msg = messages[-1]
            if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
                return END

            first_tool_name = last_msg.tool_calls[0]["name"]

            # 优先分流到业务子图
            if first_tool_name in builtin_routes:
                return builtin_routes[first_tool_name]

            # 普通工具 / MCP / RAG 走统一 ToolNode
            if first_tool_name in direct_execution_tools:
                return "tool_executor"

            return END

        # 4. 图节点注册与回边闭环 (StateGraph 拓扑装配)
        # builder = StateGraph(MainAgentState)
        # builder.add_node("agent", agent_node)
        # if direct_execution_tools:
        #     builder.add_node("tool_executor", ToolNode(direct_execution_tools))
        #     builder.add_edge("tool_executor", "agent")
        # for node_name in builtin_routes.values():
        #     builder.add_node(node_name, get_subgraph(node_name))
        #     builder.add_edge(node_name, "agent")  # 子图执行完毕回边形成 ReAct 闭环
        # builder.add_edge(START, "agent")
        # builder.add_conditional_edges("agent", route, conditional_map)
        # return builder.compile(checkpointer=checkpointer)
        return {"graph_name": "Dynamic ReAct Agent", "config": agent_config, "checkpointer": checkpointer}


class AgentRegistry:
    """进程内图编译缓存管理器 (src/agent/factory/agent_registry.py).
    
    - 基于 MD5(AgentConfig) 的 OrderedDict 实现 LRU 128 编译缓存。
    - 消除重复编译开销；配置变更自然生成新 Key，旧实例按容量自动淘汰。
    - 架构说明: 进程内本地缓存，生产多 Pod 部署时各实例独立缓存 (无跨实例广播)。
    """
    _cache: OrderedDict[str, Any] = OrderedDict()
    _max_size: int = 128

    @classmethod
    def get_or_build(cls, agent_id: str, config: AgentConfig, checkpointer: Any = None) -> Any:
        config_hash = hashlib.md5(config.model_dump_json().encode()).hexdigest()
        cache_key = f"{agent_id}:{config_hash}"

        if cache_key in cls._cache:
            cls._cache.move_to_end(cache_key)
            return cls._cache[cache_key]

        compiled_graph = DynamicAgentFactory.build(config, checkpointer)
        cls._cache[cache_key] = compiled_graph

        while len(cls._cache) > cls._max_size:
            evicted_key, _ = cls._cache.popitem(last=False)
        return compiled_graph


# --------------------------------------------------------------------------------------
# 4. 思考流双格式提取与闭合检测 (Reasoning Stream Callback Handler)
# --------------------------------------------------------------------------------------

class ReasoningCallbackHandler:
    """Reasoning 流式提取处理器 (src/agent/factory/reasoning_handler.py).
    
    支持双重格式自适应提取，并在正文首个有效 Token 到达时自动发送闭合事件。
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.reasoning_id: Optional[str] = None
        self._has_started = False

    async def on_llm_new_token(self, token: str, chunk: Any = None) -> None:
        reasoning_delta = None
        has_actual_content = False

        if chunk is not None:
            # Format A: 从 additional_kwargs 提取 (如 DeepSeek / GLM-5)
            kwargs = getattr(chunk, "additional_kwargs", {}) or {}
            reasoning_delta = kwargs.get("reasoning_content") or kwargs.get("thinking")

            # Format B: 从正文 <think>...</think> 正则提取 (降级路径)
            content = getattr(chunk, "content", "") or ""
            has_actual_content = bool(content)
            if not reasoning_delta and "<think>" in content:
                reasoning_delta = content.replace("<think>", "").replace("</think>", "")

        # 思考框闭合检测: 当之前已在输出思考，当前 chunk 无 reasoning 但出现了正文 content
        if self._has_started and not reasoning_delta and has_actual_content:
            # 发射 copilotkit_reasoning_message_end / copilotkit_reasoning_end 闭合前端卡片
            self._has_started = False

        if reasoning_delta:
            if not self._has_started:
                self.reasoning_id = f"reasoning-{int(time.time()*1000)}"
                # 发射 copilotkit_reasoning_start 事件
                self._has_started = True
            # 发射 copilotkit_reasoning_content 事件 (delta=reasoning_delta)


# --------------------------------------------------------------------------------------
# 5. 断连感知与两阶段 Checkpoint 延迟回滚 (Disconnect Watcher & Delayed Rollback)
# --------------------------------------------------------------------------------------

_pending_rollbacks: Dict[str, Dict[str, Any]] = {}

async def rollback_checkpoint_on_cancel(graph: Any, thread_id: str, pre_run_config: Optional[Dict[str, Any]]) -> None:
    """状态回滚核心逻辑 (src/server/services/agent_service.py).
    
    针对用户取消或网络中断的会话，将 Checkpoint 恢复到本次 run 启动前的精确状态:
    1. 已有 Checkpoint (有 checkpoint_id):
       调用 aupdate_state(pre_run_config, values=None, as_node=END)
       从该历史检查点创建新分支成为最新状态，并清空所有悬挂的待执行任务。
    2. 新线程 (无 checkpoint_id):
       获取当前 state，通过发送 [RemoveMessage(id=m.id)] 物理清理所有残余消息。
    """
    if not thread_id:
        return
    checkpoint_id = (pre_run_config or {}).get("configurable", {}).get("checkpoint_id")
    if checkpoint_id:
        # graph.aupdate_state(pre_run_config, values=None, as_node=END)
        pass
    else:
        # graph.aupdate_state({"configurable": {"thread_id": thread_id}}, {"messages": [RemoveMessage(id=...)]})
        pass


async def with_disconnect_watcher(
    request: Any,
    inner_gen: AsyncGenerator[Any, None],
    poll_interval: float = 0.5
) -> AsyncGenerator[Any, None]:
    """客户端断连检测包装器 (src/server/utils/streaming_disconnect.py).
    
    背景: Starlette 0.52+ 在 ASGI spec >= 2.4 时移除了底层断连任务，长推理期间由于无 yield，
    无法感知客户端断开。本包装器启动独立协程轮询 request.is_disconnected()，
    一旦断开即向主生成器注入 CancelledError，触发 cleanup。
    """
    is_disconnected = False

    async def _poller():
        nonlocal is_disconnected
        while not is_disconnected:
            if hasattr(request, "is_disconnected") and await request.is_disconnected():
                is_disconnected = True
                break
            await asyncio.sleep(poll_interval)

    poll_task = asyncio.create_task(_poller())
    try:
        async for chunk in inner_gen:
            if is_disconnected:
                raise asyncio.CancelledError("Client disconnected")
            yield chunk
    finally:
        poll_task.cancel()


# --------------------------------------------------------------------------------------
# 6. AG-UI 协议与 10 级中间件流水线 (Event Generation & Middleware Pipeline)
# --------------------------------------------------------------------------------------

@dataclass
class AGUIEvent:
    type: str
    data: Dict[str, Any]

class ToolStatisticsCollector:
    """旁路度量收集器 (src/agent/middleware/tool_statistics_collector.py).
    
    替代已废弃的 ToolIDRewriter: 不修改任何原生 tool_call_id，在 RUN_FINISHED 前发射
    tool_usage CustomEvent，既保留了 LangGraph 的原生 ID 配对，又满足了前端统计诉求。
    """
    def __init__(self):
        self.records: List[Dict[str, Any]] = []

    def process(self, event: AGUIEvent) -> List[AGUIEvent]:
        if event.type == "TOOL_CALL_START":
            self.records.append(event.data)
        elif event.type == "RUN_FINISHED":
            stat_event = AGUIEvent(type="CUSTOM", data={"name": "tool_usage", "records": self.records})
            return [stat_event, event]
        return [event]


class AgentService:
    """Agent 运行时与事件流服务 (src/server/services/agent_service.py)."""

    @staticmethod
    async def generate_events(
        agent_config: AgentConfig,
        thread_id: str,
        run_id: str,
        user_messages: List[BaseMessage],
    ) -> AsyncGenerator[AGUIEvent, None]:
        """生成经过 10 级中间件处理后的标准 AG-UI 事件流.
        
        10 级中间件流水线按序处理:
        1. ToolNameTranslator: 工具英文名转前端展示中文名
        2. MessageSnapshotSanitizer: 修复 MESSAGES_SNAPSHOT 中 ToolMessage id 异常
        3. ActivityEventTranslator: 将 copilotkit_emit_activity 转为 ACTIVITY_SNAPSHOT
        4. AskUserToolArgsMasker: ask_user 敏感入参脱敏与事件拆分
        5. AskUserInterruptTranslator: 拦截并转译 LangGraph Interrupt 挂起事件
        6. FileDownloadActivityInjector: 注入文件下载活动卡片
        7. RenderHtmlActivityInjector: 注入 HTML 内联渲染卡片
        8. SubgraphToolResultBridge: 子图 ToolMessage 补发 TOOL_CALL_RESULT 事件
        9. RAGSourceCollector: 汇聚 RAG 知识检索来源并在收尾时广播 rag_sources 事件
        10. ToolStatisticsCollector: 统计工具耗时与调用量 (tool_usage)
        """
        current_active_step: Optional[str] = None
        run_completed = False
        pre_run_checkpoint_config: Optional[Dict[str, Any]] = None

        # 阶段 1: 延迟回滚检查 (若该 thread 上次异常中断，在此处安全回滚)
        if thread_id in _pending_rollbacks:
            rollback_info = _pending_rollbacks.pop(thread_id)
            # await rollback_checkpoint_on_cancel(graph, thread_id, rollback_info["checkpoint_config"])

        # 阶段 2: 编译/获取图并创建运行实例
        graph = AgentRegistry.get_or_build(agent_id=thread_id, config=agent_config)
        stat_collector = ToolStatisticsCollector()

        try:
            yield AGUIEvent(type="RUN_STARTED", data={"thread_id": thread_id, "run_id": run_id})
            current_active_step = "agent"
            yield AGUIEvent(type="STEP_STARTED", data={"step_name": "agent"})

            # 模拟执行与事件产出 (实际由 LangGraphAGUIAgent 消费 astream_events)
            # async for raw_event in agent.run(...):
            #     for ev in pipeline.process(raw_event): yield ev
            
            # 正常完成标记
            current_active_step = None
            yield AGUIEvent(type="STEP_FINISHED", data={"step_name": "agent"})
            
            # 中间件旁路事件注入与收尾
            finish_event = AGUIEvent(type="RUN_FINISHED", data={"thread_id": thread_id, "run_id": run_id})
            for out_ev in stat_collector.process(finish_event):
                yield out_ev
            run_completed = True

        except Exception as exc:
            # 阶段 3: AG-UI 异常保活流 (保证前端 SSE 连接确定性闭合，防止悬挂)
            if current_active_step:
                yield AGUIEvent(type="STEP_FINISHED", data={"step_name": current_active_step})
            yield AGUIEvent(type="RUN_ERROR", data={"message": f"Agent系统异常: {str(exc)}"})
            yield AGUIEvent(type="RUN_FINISHED", data={"thread_id": thread_id, "run_id": run_id})

        finally:
            # 阶段 4: 若流未正常结束 (如客户端断开连接 / CancelledError)，注册延迟回滚字典
            # 避免在 finally 块中直接 await 导致 SQLite 异步死锁
            if not run_completed and thread_id:
                _pending_rollbacks[thread_id] = {"checkpoint_config": pre_run_checkpoint_config}


# --------------------------------------------------------------------------------------
# 7. Blocking 聚合器 (Blocking Aggregator for Synchronous Callers)
# --------------------------------------------------------------------------------------

class BlockingEventAggregator:
    """内存事件聚合器 (src/server/services/agent_blocking_aggregator.py).
    
    与 Streaming 共享完全同源的 generate_events() 输出流，将其聚合为一次性 JSON 响应。
    """
    def __init__(self, thread_id: str, run_id: str):
        self.thread_id = thread_id
        self.run_id = run_id
        self.content_parts: List[str] = []
        self.status = "running"
        self.error_message: Optional[str] = None

    def consume(self, event: AGUIEvent) -> None:
        if event.type == "TEXT_MESSAGE_CONTENT":
            self.content_parts.append(event.data.get("delta", ""))
        elif event.type == "RUN_ERROR":
            self.status = "failed"
            self.error_message = event.data.get("message")
        elif event.type == "RUN_FINISHED":
            if self.status != "failed":
                self.status = "completed"

    def build_response(self) -> Dict[str, Any]:
        return {
            "code": 500 if self.status == "failed" else 0,
            "data": {
                "thread_id": self.thread_id,
                "run_id": self.run_id,
                "status": self.status,
                "output": "".join(self.content_parts),
                "error": self.error_message,
            }
        }
