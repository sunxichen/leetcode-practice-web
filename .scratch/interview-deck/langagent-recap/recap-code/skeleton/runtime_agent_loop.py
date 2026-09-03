"""
runtime_agent_loop.py - 核心运行时与 Agent Loop 白板骨架代码 (Skeleton)

定位说明:
- 本文件为 15 分钟白板默写骨架，仅保留真实类名/函数名、核心控制流与关键机制注释。
- 完整机制与防御性细节参照: recap-code/core/runtime_agent_loop.py。

【白板手写与记忆分级】:
1. 必须能默写: DynamicAgentFactory.build() 动态图装配与 route(state) 条件路由;
               AgentRegistry.get_or_build() LRU 编译缓存; MainAgentState 与 add_messages;
               AgentService.generate_events() 事件生成与异常兜底流。
2. 需要能解释: 10 级中间件流水线解耦; 延迟回滚 _pending_rollbacks 规避 SQLite 异步死锁;
               ReasoningCallbackHandler 思考流双格式提取与闭合检测。
3. 追问时展开: route() 仅检查首个工具的边界缺陷 (agent_factory.py#L653);
               Starlette 0.52+ with_disconnect_watcher 独立轮询机制。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections import OrderedDict
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated, Any, Dict, List, Optional, TypedDict


# --- 1. 基础消息契约与 Reducer (来自 langchain_core / langgraph) ---
class BaseMessage:
    def __init__(self, content: str = "", id: Optional[str] = None, **kwargs: Any):
        self.content = content
        self.id = id or f"msg-{hash(content)}"

class SystemMessage(BaseMessage): pass
class HumanMessage(BaseMessage): pass
class AIMessage(BaseMessage):
    def __init__(self, content: str = "", tool_calls: Optional[List[Dict[str, Any]]] = None, **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_calls = tool_calls or []

class ToolMessage(BaseMessage):
    def __init__(self, content: str, tool_call_id: str, **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_call_id = tool_call_id

class RemoveMessage:
    def __init__(self, id: str): self.id = id

def add_messages(existing: List[BaseMessage], updates: List[BaseMessage | RemoveMessage]) -> List[BaseMessage]:
    """LangGraph 原生 Reducer: 按 ID 覆盖/追加，RemoveMessage 剔除 (替代覆写型 lambda x,y: x+y)"""
    msg_map = OrderedDict((m.id, m) for m in existing)
    for u in updates:
        if isinstance(u, RemoveMessage):
            msg_map.pop(u.id, None)
        elif isinstance(u, BaseMessage):
            msg_map[u.id] = u
    return list(msg_map.values())


# --- 2. 状态定义与请求配置 (src/agent/core/state.py, schemas/agent_config.py) ---
class MainAgentState(TypedDict, total=False):
    messages: Annotated[List[BaseMessage], add_messages]  # 核心消息流，通过 Reducer 保证幂等
    user_input: str
    thread_id: str
    run_id: str

class AgentConfig:
    def __init__(self, model_name: str = "qwen-plus", persona: str = "", mcp_tools: Optional[List[Dict[str, Any]]] = None,
                 enable_visualization: bool = True, enable_report: bool = True, **kwargs: Any):
        self.model_name = model_name
        self.persona = persona
        self.mcp_tools = mcp_tools or []
        self.enable_visualization = enable_visualization
        self.enable_report = enable_report
        self.extra = kwargs

    def model_dump_json(self) -> str:
        return json.dumps(self.__dict__, sort_keys=True, default=str)


# --- 3. 动态图编译器与 LRU 编译缓存 (src/agent/factory/) ---
START = "__start__"
END = "__end__"

class DynamicAgentFactory:
    """运行时按需动态装配节点与边，产出专属 CompiledStateGraph"""
    @staticmethod
    def build(agent_config: AgentConfig, checkpointer: Any = None) -> Any:
        direct_execution_tools: List[str] = ["file_download", "manage_envelope"]
        builtin_routes: Dict[str, str] = {}
        conditional_map: Dict[str, str] = {END: END}

        # 1. 动态收集 MCP 工具与子图路由
        for mcp in agent_config.mcp_tools:
            direct_execution_tools.append(mcp.get("name", "mcp_tool"))
        if agent_config.enable_visualization:
            builtin_routes["visualize"] = "visualization_subgraph"
            conditional_map["visualization_subgraph"] = "visualization_subgraph"
        if agent_config.enable_report:
            builtin_routes["manage_report"] = "report_subgraph"
            conditional_map["report_subgraph"] = "report_subgraph"
        if direct_execution_tools:
            conditional_map["tool_executor"] = "tool_executor"

        # 2. 条件路由函数: 检查末条 AIMessage 的 tool_calls 并决定下一跳
        def route(state: MainAgentState) -> str:
            messages = state.get("messages", [])
            if not messages or not isinstance(messages[-1], AIMessage) or not messages[-1].tool_calls:
                return END
            # [缺陷点]: 仅取首个 tool_name; 混调子图与普通工具时次要工具可能被丢弃
            first_tool = messages[-1].tool_calls[0]["name"]
            if first_tool in builtin_routes:
                return builtin_routes[first_tool]
            if first_tool in direct_execution_tools:
                return "tool_executor"
            return END

        # 3. 拓扑装配: agent -> route -> (subgraphs | tool_executor) -> agent -> END
        # builder = StateGraph(MainAgentState)
        # builder.add_node("agent", agent_node); builder.add_node("tool_executor", ToolNode(direct_execution_tools))
        # builder.add_edge("tool_executor", "agent"); builder.add_conditional_edges("agent", route, conditional_map)
        # return builder.compile(checkpointer=checkpointer)
        return {"graph": "DynamicReActGraph", "config": agent_config, "route": route}


class AgentRegistry:
    """进程内 LRU 128 编译缓存 (基于 Config MD5)"""
    _cache: OrderedDict[str, Any] = OrderedDict()

    @classmethod
    def get_or_build(cls, agent_id: str, config: AgentConfig, checkpointer: Any = None) -> Any:
        cache_key = f"{agent_id}:{hashlib.md5(config.model_dump_json().encode()).hexdigest()}"
        if cache_key in cls._cache:
            cls._cache.move_to_end(cache_key)
            return cls._cache[cache_key]
        graph = DynamicAgentFactory.build(config, checkpointer)
        cls._cache[cache_key] = graph
        if len(cls._cache) > 128:
            cls._cache.popitem(last=False)
        return graph


# --- 4. 思考流处理与断连延迟回滚 (src/agent/factory/reasoning_handler.py, services/agent_service.py) ---
class ReasoningCallbackHandler:
    """思考流双格式提取 (additional_kwargs.reasoning_content vs <think> 标签) 与首个正文 Token 闭合检测"""
    def __init__(self):
        self.reasoning_id: Optional[str] = None
        self._has_started = False

    async def on_llm_new_token(self, token: str, chunk: Any = None) -> None:
        delta = getattr(chunk, "additional_kwargs", {}).get("reasoning_content") if chunk else None
        if not delta and chunk and "<think>" in getattr(chunk, "content", ""):
            delta = chunk.content.replace("<think>", "").replace("</think>", "")
        if self._has_started and not delta and getattr(chunk, "content", ""):
            self._has_started = False  # 首个正文 Token 到达，闭合思考框
        if delta and not self._has_started:
            self._has_started = True  # 发射 reasoning_start


_pending_rollbacks: Dict[str, Any] = {}  # 延迟回滚字典: 客户端断连时记录，下次请求前执行，规避 SQLite 异步死锁


# --- 5. AG-UI 事件流服务 (src/server/services/agent_service.py) ---
@dataclass
class AGUIEvent:
    type: str
    data: Dict[str, Any]

class AgentService:
    @staticmethod
    async def generate_events(config: AgentConfig, thread_id: str, run_id: str) -> AsyncGenerator[AGUIEvent, None]:
        """AG-UI 事件生成主流程: 10 级中间件流水线 + 确定性异常闭合 + 断连延迟回滚"""
        current_step: Optional[str] = None
        run_completed = False
        graph = AgentRegistry.get_or_build(thread_id, config)

        try:
            yield AGUIEvent("RUN_STARTED", {"thread_id": thread_id, "run_id": run_id})
            current_step = "agent"
            yield AGUIEvent("STEP_STARTED", {"step_name": current_step})

            # ... 真实执行: astream_events 经过 10 级中间件处理 (ToolNameTranslator -> ToolStatisticsCollector)
            current_step = None
            yield AGUIEvent("STEP_FINISHED", {"step_name": "agent"})
            yield AGUIEvent("RUN_FINISHED", {"thread_id": thread_id, "run_id": run_id})
            run_completed = True
        except Exception as exc:
            # 异常兜底流: 确保前端 SSE 连接确定性闭合，绝不悬挂
            if current_step:
                yield AGUIEvent("STEP_FINISHED", {"step_name": current_step})
            yield AGUIEvent("RUN_ERROR", {"message": str(exc)})
            yield AGUIEvent("RUN_FINISHED", {"thread_id": thread_id, "run_id": run_id})
        finally:
            if not run_completed and thread_id:
                _pending_rollbacks[thread_id] = {"run_id": run_id}  # 注册延迟回滚
