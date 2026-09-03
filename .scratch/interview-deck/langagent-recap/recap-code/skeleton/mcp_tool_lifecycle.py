"""
mcp_tool_lifecycle.py - MCP 工具全链路生命周期白板骨架代码 (Skeleton)

定位说明:
- 本文件为 follow-up #4 重点交付的 MCP 全链路记忆骨架，覆盖从配置接收、动态注册、
  模型决策调用、FastMCP Client 远程执行到 ToolMessage 回传主循环的 5 跳完整闭环。
- 完整机制与开发源码参照:
  * src/agent/schemas/agent_config.py (MCPToolConfig)
  * src/agent/core/tool_manager.py (ToolManager, _JsonCoercingBaseModel)
  * src/agent/core/mcp_client.py (MCPClientManager, StreamableHttpTransport)
  * src/agent/factory/agent_factory.py (create_mcp_tool, DynamicAgentFactory.build)
  * recap-code/core/runtime_agent_loop.py (Runtime 完整机制参照)

【白板手写与记忆分级】:
1. 必须能默写: MCPToolConfig -> tool_manager.load_dynamic_mcp_tool_config() -> to_langchain_tools() 动态注册(批量返回列表, 取 [0]);
               LLM 生成 AIMessage(tool_calls) -> route() 分流至 ToolNode -> 触发 executor 协程;
               mcp_client_manager.execute_tool() StreamableHttpTransport 连接与 call_tool 调用;
               执行结果封装为 ToolMessage(content=..., tool_call_id=...) 并通过 add_messages 回传主图。
2. 需要能解释: _JsonCoercingBaseModel 在 Pydantic 验证前将 JSON 字符串自动反序列化为 dict/list (解决 Qwen 序列化问题);
               mcp_tools_context 参数注入机制: 在 input_schema 增强描述并设置 required，并在执行层对"已声明但未传"的参数兜底注入(仅未传, 不做 None 覆盖; None 值随后统一过滤);
               None 值过滤 (args = {k: v for k, v in args.items() if v is not None}) 防止服务端反序列化报错。
3. 追问时展开: MCPClientManager 每次调用独立创建 StreamableHttpTransport 与 Client (无连接池复用技术债);
               execute_tool 声明了 timeout 但未用 asyncio.wait_for 包裹的客户端超时缺陷;
               _mask_args_for_log 前 2 后 2 安全脱敏。
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass, is_dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, create_model, model_validator


# --- Hop 1: 配置接收与 Schema 增强 (src/agent/schemas/agent_config.py) ---
# 数据形态: HTTP JSON Request -> MCPToolConfig (name, url, headers, timeout, input_schema)
@dataclass
class MCPToolConfig:
    name: str                                 # 工具名，如 "query_weather"
    description: str                          # 工具功能描述
    url: str                                  # MCP Server 端点，如 "http://mcp-server:8000/sse"
    headers: Optional[Dict[str, str]] = None  # 鉴权头，如 {"Authorization": "Bearer token"}
    timeout: int = 30                         # 超时时间 (秒)
    input_schema: Optional[Dict[str, Any]] = None  # JSON Schema 格式参数定义

    def model_dump(self) -> Dict[str, Any]: return asdict(self)


# --- Hop 2: 动态注册与 Pydantic 容错解析 (src/agent/core/tool_manager.py & agent_factory.py) ---
# 数据形态: MCPToolConfig -> _JsonCoercingBaseModel Pydantic Dynamic Model -> LangChain StructuredTool
class _JsonCoercingBaseModel(BaseModel):
    """参数容错基类: Qwen 大模型常将嵌套结构序列化为 JSON 字符串，在此探测 '[' 或 '{' 并 loads 还原"""
    @model_validator(mode='before')
    @classmethod
    def _coerce_json_strings(cls, data: Any) -> Any:
        if not isinstance(data, dict): return data
        for k, v in data.items():
            if isinstance(v, str) and v.strip() and v.strip()[0] in ('[', '{'):
                try: data[k] = json.loads(v)
                except Exception: pass
        return data


class ToolManager:
    """动态 MCP 工具管理器 (负责 Schema 注入、参数校验与执行中转)"""
    def _create_args_schema(self, input_schema: Dict[str, Any]) -> type[BaseModel]:
        properties = input_schema.get("properties", {})
        required = input_schema.get("required", [])
        type_map = {"integer": int, "number": float, "boolean": bool, "array": list, "object": dict}
        fields: Dict[str, Any] = {}
        for name, info in properties.items():
            py_type = type_map.get(info.get("type", "string"), str)
            desc = info.get("description", "")
            fields[name] = (py_type, Field(..., description=desc)) if name in required else (Optional[py_type], Field(None, description=desc))
        return create_model("ToolArgs", __base__=_JsonCoercingBaseModel, **fields)

    def load_dynamic_mcp_tool_config(self, tool_config: Dict[str, Any], mcp_tools_context: Optional[Dict[str, Dict[str, Any]]] = None) -> Tuple[Callable, Dict[str, Any]]:
        name = tool_config["name"]
        schema = tool_config.get("input_schema") or {"type": "object", "properties": {}}
        # 上下文注入: 将固定系统参数 (如 app_id) 注入 input_schema 提示词并标记必填
        if mcp_tools_context and name in mcp_tools_context:
            props = schema.setdefault("properties", {})
            reqs = schema.setdefault("required", [])
            for k, val in mcp_tools_context[name].items():
                if k in props:
                    props[k]["description"] = f"系统上下文参数，固定值：{val}，请直接使用该值无需询问用户"
                    if k not in reqs: reqs.append(k)

        async def dynamic_mcp_executor(**kwargs: Any) -> Dict[str, Any]:
            return await self._execute_dynamic_mcp_tool(tool_config, kwargs, mcp_tools_context)

        return dynamic_mcp_executor, {"name": name, "description": tool_config.get("description", ""), "input_schema": schema}

    async def _execute_dynamic_mcp_tool(self, tool_config: Dict[str, Any], args: Dict[str, Any], mcp_tools_context: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
        name = tool_config["name"]
        if mcp_tools_context and name in mcp_tools_context:
            for k, val in mcp_tools_context[name].items():
                if k not in args or args[k] is None: args[k] = val
        clean_args = {k: v for k, v in args.items() if v is not None}  # 过滤 None 值防服务端报错
        return await mcp_client_manager.execute_tool(url=tool_config["url"], tool_name=name, args=clean_args,
                                                     headers=tool_config.get("headers"), timeout=tool_config.get("timeout", 30))

    def to_langchain_tools(self, tools: Dict[str, tuple]) -> List[Any]:
        """真实签名 (tool_manager.py:240): 批量把 {name: (executor, schema)} 转为 StructuredTool 列表"""
        return [type("StructuredTool", (), {"name": name, "description": schema.get("description", ""),
                                            "coroutine": executor,
                                            "args_schema": self._create_args_schema(schema.get("input_schema", {})),
                                            "ainvoke": lambda self, args, _e=executor: _e(**args)})()
                for name, (executor, schema) in tools.items()]

tool_manager = ToolManager()

def create_mcp_tool(config: MCPToolConfig, mcp_tools_context: Optional[Dict[str, Any]] = None) -> Any:
    executor, schema = tool_manager.load_dynamic_mcp_tool_config(config.model_dump(), mcp_tools_context)
    return tool_manager.to_langchain_tools({config.name: (executor, schema)})[0]  # 真实: agent_factory.py:253-258 批量转换后取 [0]


# --- Hop 3 & 4: 模型决策、条件路由与 FastMCP Client 远程调用 (src/agent/core/mcp_client.py) ---
# 数据形态: AIMessage.tool_calls -> StreamableHttpTransport HTTP POST -> FastMCP Result
class MCPClientManager:
    """MCP 远程传输客户端 (基于 fastmcp StreamableHttpTransport)"""
    async def execute_tool(self, url: str, tool_name: str, args: Dict[str, Any],
                           headers: Optional[Dict[str, str]] = None, timeout: int = 30) -> Dict[str, Any]:
        if not url: return {"error": "MCP 服务器 URL 不能为空", "tool_name": tool_name}
        try:
            # async with Client(StreamableHttpTransport(url=url, headers=headers or {})) as client:
            #     await client.ping(); raw_result = await client.call_tool(tool_name, args)  # [技术债]: 源码未用 asyncio.wait_for
            #     return self._process_result(raw_result)
            ...  # 骨架不展开: 真实调用链见上方注释与 mcp_client.py:77-105
        except asyncio.TimeoutError:
            return {"error": f"MCP 工具调用超时 ({timeout}s)", "tool_name": tool_name}
        except Exception as e:
            return {"error": f"MCP 工具调用失败: {str(e)}", "tool_name": tool_name}

    def _process_result(self, result: Any) -> Dict[str, Any]:
        data = asdict(result) if (is_dataclass(result) and not isinstance(result, type)) else (vars(result) if hasattr(result, "__dict__") else result)
        if isinstance(data, dict) and "content" in data and isinstance(data["content"], list):
            texts = [str(vars(item).get("text", "")) for item in data["content"] if hasattr(item, "text") or isinstance(item, dict)]
            if texts: return {"content": "\n".join(texts)}
        return {"content": str(data) if data is not None else ""}

mcp_client_manager = MCPClientManager()


# --- Hop 5: 结果封装为 ToolMessage 并回传 Agent Loop (src/agent/core/state.py) ---
# 数据形态: MCP Result -> ToolMessage(content, tool_call_id) -> add_messages Reducer -> Next LLM Step
@dataclass
class ToolMessage:
    content: str; tool_call_id: str; name: str = ""

async def mcp_tool_full_lifecycle_trace():
    """
    【白板复现全链路时序追踪】:
    1. [Config]     接收前端动态配置 MCPToolConfig(name="query_db", url="http://mcp:8000/sse", ...)
    2. [Register]   create_mcp_tool() 动态生成 Pydantic 容错 Schema 并装配 StructuredTool
    3. [Decision]   LLM 决策生成 AIMessage(tool_calls=[{"id": "call_01", "name": "query_db", "args": {"sql": "..."}}])
    4. [Route]      route(state) 识别首个工具命中 direct_execution_tools，路由至 tool_executor
    5. [Execution]  ToolNode 调用 dynamic_mcp_executor -> 过滤 None -> StreamableHttpTransport 远程调用
    6. [Feedback]   结果封装为 ToolMessage(content="...", tool_call_id="call_01") 回写 MainAgentState
    7. [Next Cycle] StateGraph 回边至 agent_node，LLM 消费 ToolMessage 完成最终文本回答
    """
    mcp_config = MCPToolConfig(name="query_db", description="查询业务数据库", url="http://mcp-service/sse", timeout=15)
    tool_instance = create_mcp_tool(mcp_config, mcp_tools_context={"query_db": {"env": "prod"}})
    exec_result = await tool_instance.ainvoke({"sql": "SELECT count(*) FROM users", "limit": None})
    return ToolMessage(content=exec_result.get("content", ""), tool_call_id="call_01", name="query_db")
