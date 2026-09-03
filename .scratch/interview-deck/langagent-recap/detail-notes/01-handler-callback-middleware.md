# 专题一：LangGraph/deepagents Handler、Callback 与 Middleware 机制详解

---

## 1. 架构总览与概念分界

在现代 Agent 框架（以 LangChain 1.3+、LangGraph 1.2+ 及 deepagents 0.6.12 为代表）中，开发者常需要对大模型的输入输出、工具调用过程、中间状态流转与网络事件推送进行拦截、增强与可观测度量。然而，在实际工程实现中，**Handler（Callback）**、**Middleware（中间件）** 与 **Protocol Pipeline（协议管道）** 处于完全不同的抽象层级，具备截然不同的控制流语义与副作用能力。

如果混淆这些机制的边界，将导致状态污染、事件丢失、连接挂死或破坏消息血缘一致性。

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Agent 三维拦截与事件流转全景架构                                      │
│                                                                                                        │
│  [ 客户端 Web / 管理端 ] ◄──── SSE / JSON HTTP (AG-UI 协议标准事件流: /react-agent/stream)              │
│                                              ▲                                                         │
│                                              │ 编码推送 (EventEncoder)                                  │
│  ┌───────────────────────────────────────────┴──────────────────────────────────────────────────────┐  │
│  │ 1. 接入与协议中间件层 (Gateway & Protocol Stream Pipeline)                                         │  │
│  │    • 位置: Agent 外部服务端框架 (src/server/services/agent_service.py)                              │  │
│  │    • 机制: 纯流式事件转换器 (Stream Transformer, 消费与生成 AG-UI Event)                             │  │
│  │    • 职责: 工具名中文化、ID 快照修复、活动卡片注入、旁路度量收集 (10 级中间件流水线)                  │  │
│  └───────────────────────────────────────────▲──────────────────────────────────────────────────────┘  │
│                                              │ astream_events(version="v2") 异步事件流                 │
│  ┌───────────────────────────────────────────┴──────────────────────────────────────────────────────┐  │
│  │ 2. 运行时中间件层 (Agent Middleware Onion Layer)                                                 │  │
│  │    • 位置: Agent 编排核心内部 (langchain.agents.middleware.types.AgentMiddleware)                   │  │
│  │    • 机制: 图节点环绕拦截 + 函数包装器 (Graph Topology Edges & Call Wrappers)                       │  │
│  │    • 钩子: abefore/aafter_agent, abefore/aafter_model, awrap_model_call, awrap_tool_call         │  │
│  │    • 特权: 可短路执行、重试、篡改请求/响应、动态扩展私有 State、注入 Command 状态更新                │  │
│  └───────────────────────────────────────────▲──────────────────────────────────────────────────────┘  │
│                                              │ 模型调用 / 工具执行 / adispatch_custom_event             │
│  ┌───────────────────────────────────────────┴──────────────────────────────────────────────────────┐  │
│  │ 3. 可观测回调层 (LangChain CallbackHandler System)                                               │  │
│  │    • 位置: 基础组件执行内核 (langchain_core.callbacks.BaseCallbackHandler)                         │  │
│  │    • 机制: 观察者模式 (Observer Pattern) 事件分发广播                                              │  │
│  │    • 钩子: on_chat_model_start, on_llm_new_token, on_tool_start, on_custom_event, on_chain_end    │  │
│  │    • 约束: 只读监听与度量，不可改变控制流或篡改返回值；作为 astream_events 底层事件源泵出数据       │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 核心机制对比矩阵

| 比较维度 | LangChain / LangGraph CallbackHandler | deepagents / LangChain AgentMiddleware | 服务端协议层 10 级 Pipeline |
|---|---|---|---|
| **核心抽象类** | `langchain_core.callbacks.base.BaseCallbackHandler` / `AsyncCallbackHandler` | `langchain.agents.middleware.types.AgentMiddleware` | 服务端自定义类（如 `ToolStatisticsCollector`） |
| **所属层次** | LLM、Tool、Chain 底层执行内核 | StateGraph 编译与节点/工具执行层 | API Gateway / Web 服务层（`agent_service.py`） |
| **设计模式** | 观察者模式（Observer / Pub-Sub） | 洋葱模型 / 装饰器模式（Decorator / Interceptor） | 管道与过滤器模式（Pipes and Filters） |
| **控制流干预能力** | **只读（No side-effect）**：无法阻止执行、无法篡改返回值、无法重试 | **完全控制（Full Control）**：可短路（Short-circuit）、重试（Retry）、重写请求/响应、注入 `Command` | **事件级转换（Event Mapping）**：可丢弃、拆分、延迟注入事件，但不干预正在运行的图 |
| **状态感知与修改** | 无状态感知（仅能通过 metadata/tags 读取少量上下文） | **强状态感知（State-aware）**：可读取并修改 `State`，支持 `state_schema` 扩展 | 弱状态感知（仅能在事件流经时提取状态快照） |
| **主要应用场景** | 分布式追踪（Opik/LangSmith）、Token 流式打字机、流式思考提取 | 沙箱异常捕获兜底、子图调用拦截、技能动态激活、上下文压缩治理 | 工具名称翻译、脱敏掩码、前端活动卡片生成、旁路度量收集 |

---

## 2. LangChain / LangGraph CallbackHandler 体系

### 2.1 怎么用：CallbackHandler 接口契约与使用方式

`BaseCallbackHandler` 与 `AsyncCallbackHandler` 定义于 `langchain_core/callbacks/base.py`，是 LangChain 整个可观测性与流式机制的底层基石。

#### 1. 核心钩子家族（Hook Family）
`BaseCallbackHandler` 采用 Mixin 架构组合了 6 大管理器能力：
- `CallbackManagerMixin`：`on_llm_start`（base.py L283）、`on_tool_start`（L405）、`on_chat_model_start`, `on_chain_start`, `on_retriever_start` 等通用 start 钩子；
- `LLMManagerMixin`：`on_llm_new_token`, `on_llm_end`, `on_llm_error`, `on_stream_event`；
- `ToolManagerMixin`：`on_tool_end`, `on_tool_error`；
- `ChainManagerMixin`：`on_chain_end`, `on_chain_error`, `on_agent_action`, `on_agent_finish`；
- `RetrieverManagerMixin`：`on_retriever_end`, `on_retriever_error`；
- `RunManagerMixin`：`on_text`, `on_retry`, `on_custom_event`。

#### 2. 标准异步 Handler 最小实现示例
```python
from uuid import UUID
from typing import Any
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

class DiagnosticTracer(AsyncCallbackHandler):
    """诊断与可观测回调处理器（只读监听）"""

    async def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[BaseMessage]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        print(f"[LLM Start] run_id={run_id}, parent={parent_run_id}, model={serialized.get('name')}")

    async def on_llm_new_token(
        self,
        token: str,
        *,
        chunk: Any = None,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        print(f"[Token Stream] token={token!r}")

    async def on_custom_event(
        self,
        name: str,
        data: Any,
        *,
        run_id: UUID,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        print(f"[Custom Event] name={name}, data={data}")
```

#### 3. 注入运行时
通过 `RunnableConfig` 将 Handler 注入调用链：
```python
config = {
    "callbacks": [DiagnosticTracer()],
    "metadata": {"thread_id": "conv-1024", "user_id": "u-8848"},
    "tags": ["production", "chart-agent"]
}
# 无论 ainvoke 还是 astream_events，callbacks 均会自动沿 Run 树向下传播
result = await agent_graph.ainvoke({"messages": [HumanMessage(content="分析财报")]}, config=config)
```

---

### 2.2 底层怎么跑：CallbackManager 分发与调用树追踪

源码位置：`langchain_core/callbacks/manager.py`

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AsyncCallbackManager 事件分发与 Run 树流转                       │
│                                                                                        │
│  Runnable.ainvoke(input, config)                                                       │
│         │                                                                              │
│         ▼                                                                              │
│  get_async_callback_manager_for_config(config) ──► 实例化 AsyncCallbackManager         │
│         │                                                                              │
│         ▼ on_chain_start(name="agent_graph", run_id=UUID-1, parent_run_id=None)        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ AsyncCallbackManagerForChainRun (绑定 run_id=UUID-1, 代表根节点 Run)               │  │
│  │   • 获取子节点 config: child_config = run_manager.get_child()                      │  │
│  │   • child_config 自动注入: {"callbacks": manager, "parent_run_id": UUID-1}       │  │
│  └──────────────────────────────────────────┬───────────────────────────────────────┘  │
│                                             │                                          │
│                    ┌────────────────────────┴────────────────────────┐                 │
│                    ▼                                                 ▼                 │
│  ┌──────────────────────────────────────────┐   ┌───────────────────────────────────┐  │
│  │ ChatModel.ainvoke(..., child_config)     │   │ Tool.ainvoke(..., child_config)   │  │
│  │   • on_chat_model_start(run_id=UUID-2,   │   │   • on_tool_start(run_id=UUID-3,  │  │
│  │                         parent=UUID-1)   │   │                       parent=UUID-1)││
│  │   • 逐 Token 广播: on_llm_new_token      │   │   • on_tool_end(run_id=UUID-3,    │  │
│  │   • on_llm_end(run_id=UUID-2)            │   │                     parent=UUID-1)│  │
│  └──────────────────────────────────────────┘   └───────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **树状血缘传播（Run Tree Hierarchy）**：
   - 当根 Runnable 启动时，分配根 `run_id`（UUIDv7 或 UUIDv4）。
   - 在执行子 Runnable（如 ChatModel、Tool、Lambda）前，调用 `run_manager.get_child()`（同步版 `manager.py#L602`，异步版 `AsyncParentRunManager.get_child` 在 `L686-L701`），构造新的子 `AsyncCallbackManager`，将当前节点的 `run_id` 作为子节点的 `parent_run_id` 注入。
   - 这使得诸如 Opik、LangSmith 等分布式追踪系统能够精准重建父子调用树拓扑。

2. **异步广播与并发隔离**：
   - `AsyncCallbackManager` 内部维护 `handlers: list[BaseCallbackHandler]`。
   - 当触发事件（例如 `on_llm_new_token`）时，通过 `asyncio.gather` 或列表推导并发/顺序调用各 Handler 对应的异步方法（`manager.py#L1900-L1980`）。
   - 单个 Handler 抛出异常时，默认被捕获并记录日志（受 `handler.raise_error` 标志控制），确保可观测性故障不会中断核心业务推理。

---

### 2.3 astream_events 底层泵出机制：Callback 如何驱动 v2 事件流

开发者调用 LangGraph / LangChain 的 `agent.astream_events(version="v2")` 时，很多工程师误以为这是图执行器内部写死的专用 yield 逻辑。**事实上，`astream_events` 是完全建立在 CallbackHandler 体系之上的“流式事件泵”（Event Pump）**。

源码依据：
- `langchain_core/tracers/event_stream.py#L1008-L1106` (`_astream_events_implementation_v2`)
- `langchain_core/tracers/event_stream.py#L101-L1006` (`_AstreamEventsCallbackHandler`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      astream_events(version="v2") 内部事件泵流转链路                    │
│                                                                                        │
│  1. 用户调用: runnable.astream_events(value, config, version="v2")                     │
│        │                                                                               │
│        ▼                                                                               │
│  2. 构造内部拦截器: event_streamer = _AstreamEventsCallbackHandler(...)                │
│        │                                                                               │
│        ▼                                                                               │
│  3. 动态注入 Callbacks: config["callbacks"] = [*config.get("callbacks"), event_streamer│
│        │                                                                               │
│        ▼                                                                               │
│  4. 启动后台消费 Task: task = asyncio.create_task(consume_astream())                  │
│        │                                                                               │
│        ├─► [后台协程] 运行 runnable.astream(...)                                       │
│        │      │                                                                        │
│        │      ├─► LLM/Tool 执行触发 Callback:                                          │
│        │      │     event_streamer.on_chat_model_start(...)                            │
│        │      │     event_streamer.on_llm_new_token(...)                               │
│        │      │     event_streamer.on_custom_event(...)                                │
│        │      │     event_streamer.on_tool_start(...)                                  │
│        │      │                                                                        │
│        │      └─► Handler 内部: self._send(StandardStreamEvent, ...)                   │
│        │             │                                                                 │
│        │             ▼ 写入内部内存流 (_MemoryStream)                                  │
│        │                                                                               │
│        └─► [主生成器协程] async for event in event_streamer:                           │
│               │                                                                        │
│               ▼ 从 receive_stream 读取标准化 StandardStreamEvent                         │
│             yield event (输出为 on_chat_model_stream, on_custom_event, on_tool_end 等) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 关键源码机制剖析：
1. **注入专属 Handler（`event_stream.py#L1022-L1047`）**：
   `_astream_events_implementation_v2` 会实例化一个 `_AstreamEventsCallbackHandler`，并将其动态强行追加到 `config["callbacks"]` 列表中。
2. **内存流解耦（`event_stream.py#L143-L147`）**：
   `_AstreamEventsCallbackHandler` 内部创建了一个自研异步内存流（`_MemoryStream[StreamEvent](loop)`，定义于 `langchain_core/tracers/memory_stream.py#L106-L127`，底层为无界 `asyncio.Queue(maxsize=0)`，并非 anyio 通道）。所有 Callback 钩子（`on_chat_model_start`, `on_llm_new_token`, `on_custom_event` 等）被触发时，将标准化的 `StandardStreamEvent` 字典直接 `send()` 进该流。
3. **主协程迭代泵出（`event_stream.py#L1073-L1096`）**：
   主协程直接作为 `AsyncIterator` 消费 `event_streamer` 接收端，将底层模型、工具及自定义事件转化为统一格式吐出给外层调用方。

---

### 2.4 langAgent 中的 Callback 实践

在 `langAgent` 项目中，CallbackHandler 主要承担**只读可观测**与**流式思考内容解析**两大职责：

#### 1. `ReasoningCallbackHandler`：双格式推理思考提取
- **源码文件**：[`src/agent/factory/reasoning_handler.py#L21-L186`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/factory/reasoning_handler.py#L21-L186)
- **机制**：继承 `AsyncCallbackHandler`，重写 `on_chat_model_start` 与 `on_llm_new_token`。
- **业务诉求**：适配不同模型供应商的思考流（DeepSeek R1 / Qwen / GLM-5）。
  - **Format A（结构化字段）**：从 Chunk 的 `message.additional_kwargs` 提取 `reasoning_content` / `thinking_content`。
  - **Format B（标签流式剥离）**：通过正则匹配 `content` 中的 `<think>...</think>` 标签并动态剥离。
- **闭合时机检测**：当收到无 reasoning delta 但具有正文 `content` 的 chunk 时，立即通过 `adispatch_custom_event` 发射 `copilotkit_reasoning_message_end` 自定义事件，驱动前端思考折叠卡片闭合。

#### 2. `OpikTracer`：分布式追踪与上下文隔离
- **源码文件**：[`src/agent/core/opik_integration.py#L57-L142`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/core/opik_integration.py#L57-L142)
- **机制**：在 `create_tracer(project_name, thread_id)` 中实例化 `OpikTracer`，注入 `RunnableConfig["callbacks"]`。
- **并发陷阱与治理**：Opik SDK 底层使用全局单例上下文 `_context_storage`，高并发请求下极易产生跨请求 Trace 串扰。`langAgent` 在每个请求创建新 Tracer 实例前显式调用 `opik_context.clear_all()`，并在请求结束的 `finally` 块中执行 `flush_tracer(tracer)`，确保分布式追踪数据完整落盘。

---

## 3. deepagents / LangChain Middleware 机制

与只读的 Callback 不同，**Middleware 拥有完全的控制流拦截与状态重写特权**。

### 3.1 怎么用：`AgentMiddleware` 抽象与完整钩子定义

源码位置：`langchain/agents/middleware/types.py#L383-L812`

`AgentMiddleware` 是 LangChain 1.3+ 与 deepagents 0.6.12 引入的全新抽象。所有自定义拦截逻辑均通过继承此类实现。

#### 核心钩子真实签名与职责清单

```python
class AgentMiddleware(Generic[StateT, ContextT, ResponseT]):
    state_schema: type[StateT] = _DefaultAgentState
    tools: Sequence[BaseTool]  # 无默认值裸注解（types.py L398）；transformers 中才有 = ()

    # 1. Agent 级别全生命周期钩子（整个图执行开始前 / 结束后，各执行一次）
    async def abefore_agent(
        self, state: StateT, runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None: ...

    async def aafter_agent(
        self, state: StateT, runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None: ...

    # 2. Model 节点环绕钩子（每轮 ReAct 循环调用 LLM 前 / 后执行）
    async def abefore_model(
        self, state: StateT, runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None: ...

    async def aafter_model(
        self, state: StateT, runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None: ...

    # 3. Model 执行函数包装器（拦截模型调用本身：重试/降级/缓存/改写 Prompt）
    async def awrap_model_call(
        self,
        request: ModelRequest[ContextT],
        handler: Callable[[ModelRequest[ContextT]], Awaitable[ModelResponse[ResponseT]]],
    ) -> ModelResponse[ResponseT] | AIMessage | ExtendedModelResponse[ResponseT]: ...

    # 4. Tool 执行函数包装器（拦截单次工具调用：鉴权/超时兜底/子图代理）
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]: ...
```

---

### 3.2 底层怎么跑：双层洋葱模型与图拓扑编译

`langchain/agents/factory.py` 在编译 `create_agent` 时，对 Middleware 实施了极其严密的**双层洋葱装配（Two-Tier Onion Composition）**：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           AgentMiddleware 双层洋葱模型与拓扑流转全景                                      │
│                                                                                                        │
│  [START]                                                                                               │
│    │                                                                                                   │
│    ▼  (正序执行: m0 -> m1 -> mn)                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. before_agent 节点链: [m0.before_agent] ──► [m1.before_agent] ──► [mn.before_agent]             │  │
│  └─────────────────────────────────────────────┬────────────────────────────────────────────────────┘  │
│                                                │                                                       │
│    ┌───────────────────────────────────────────┴─────────────────────────────────────────┐             │
│    ▼                                                                                     │             │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │             │
│  │ 2. before_model 节点链 (Loop Entry):                                               │  │             │
│  │    [m0.before_model] ──► [m1.before_model] ──► [mn.before_model]                   │  │             │
│  └─────────────────────────────────────┬──────────────────────────────────────────────┘  │             │
│                                        │                                                 │             │
│                                        ▼                                                 │             │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │             │
│  │ 3. model 节点内部包装链 (awrap_model_call 函数洋葱):                                │  │             │
│  │    m0.awrap_model_call(request,                                                    │  │             │
│  │      m1.awrap_model_call(request,                                                  │  │             │
│  │        mn.awrap_model_call(request,                                                │  │             │
│  │          _execute_model_async(LLM.ainvoke)  <── 核心模型调用                       │  │             │
│  │        )                                                                           │  │             │
│  │      )                                                                             │  │             │
│  │    )                                                                               │  │             │
│  └─────────────────────────────────────┬──────────────────────────────────────────────┘  │             │
│                                        │                                                 │             │
│                                        ▼  (逆序执行: mn -> mn-1 -> m0)                   │             │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │             │
│  │ 4. after_model 节点链 (Loop Exit):                                                 │  │             │
│  │    [mn.after_model] ──► [mn-1.after_model] ──► [m0.after_model]                     │  │             │
│  └─────────────────────────────────────┬──────────────────────────────────────────────┘  │             │
│                                        │                                                 │             │
│                                        ▼ 条件边路由: 检查是否存在 ToolCalls               │             │
│                       ┌────────────────┴────────────────┐                                │             │
│      [存在 ToolCalls] │                                 │ [无 ToolCalls / 结束]           │             │
│                       ▼                                 ▼                                │             │
│  ┌──────────────────────────────────────────┐   ┌─────────────────────────────────────┐  │             │
│  │ 5. tools 节点 (awrap_tool_call 函数洋葱):│   │ 6. after_agent 节点链 (逆序执行):   │  │             │
│  │    m0.awrap_tool_call(request,           │   │    [mn.after_agent]                 │  │             │
│  │      m1.awrap_tool_call(request,         │   │          │                          │  │             │
│  │        mn.awrap_tool_call(request,       │   │          ▼                          │  │             │
│  │          tool.ainvoke)                   │   │    [m0.after_agent]                 │  │             │
│  │        )                                 │   │          │                          │  │             │
│  │      )                                   │   │          ▼                          │  │             │
│  └────────────────────┬─────────────────────┘   │        [END]                        │  │             │
│                       │                         └─────────────────────────────────────┘  │             │
│                       └──────────────────────────────────────────────────────────────────┘             │
│                         回边循环 ──► 返回 2. before_model (loop_entry_node)                            │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. 第一层洋葱：Graph 节点拓扑级编排（`factory.py#L1509-L1777`）
- **正序前置链**：`before_agent` 与 `before_model` 严格按照中间件列表声明顺序 `m0 -> m1 -> ... -> mn` 依次作为独立 Graph 节点串联；
- **逆序后置链**：`after_model` 与 `after_agent` 严格按照声明顺序的**反向** `mn -> mn-1 -> ... -> m0` 依次串联。这保证了外层中间件能够包裹内层中间件的输出。

#### 2. 第二层洋葱：函数调用包装链（`factory.py#L327-L416, L674-L730`）
- 在 `model` 节点内部，`_chain_async_model_call_handlers` 将所有声明了 `awrap_model_call` 的中间件递归包装为 `outer(request, inner_handler)`；
- 在 `tools` 节点内部，`_chain_async_tool_call_wrappers` 将所有声明了 `awrap_tool_call` 的中间件包装为 `outer(request, inner_tool_executor)`；
- 列表第一个中间件（`m0`）位于最外层，最先接收请求，最后处理响应。

---

### 3.3 State 交互、状态隔离与 Command 回写

1. **状态模式扩展与合并（`_resolve_schemas`, `factory.py#L424-L440`）**：
   每个 Middleware 可以定义自己的 `state_schema`（如 `LongTaskSharedState`）。编译器在组装时将所有中间件的 Schema 与基础 `AgentState` 进行属性合并。
2. **私有状态安全隔离（`PrivateStateAttr`, `types.py#L343-L345`）**：
   中间件可通过 `Annotated[T, PrivateStateAttr]` 声明内部私有状态字段（例如 `_summarization_event`、`jump_to`）。此类字段会被自动排除在对外暴露的 Input/Output Schema 之外，避免污染客户端 API 契约。
3. **`ExtendedModelResponse` 与 `Command` 状态回写（`types.py#L289-L312`）**：
   `awrap_model_call` 不仅可以返回 `ModelResponse`，还可以返回 `ExtendedModelResponse(model_response=..., command=Command(update={...}))`。执行器会在模型节点结束时，通过 LangGraph 的 Reducer（如 `add_messages`）将 Command 中的状态原子回写到 Checkpoint。

---

### 3.4 langAgent 中的 Middleware 实践

在 `langAgent`（特别是 Long Task Agent 执行面）中，自研了一系列关键 Middleware：

#### 1. `SkillActivationMiddleware`（技能激活观测）
- **源码文件**：[`src/agent/long_task/skill_activation_middleware.py#L28-L124`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/long_task/skill_activation_middleware.py#L28-L124)
- **机制**：重写 `awrap_tool_call`。
- **逻辑**：拦截针对 `SKILL.md` 的 `read_file` 调用；当工具成功返回（`status != "error"`）且未在当前 run 激活过时，记录 `_activated_skill_ids` 去重集合，并调用 `dispatch_agui_custom_event("copilotkit_emit_activity", ...)` 发射技能激活卡片。不篡改文件读取内容，报错静默降级记录 Warning。

#### 2. `SubgraphToolMiddleware`（子图拦截与状态双向同步）
- **源码文件**：[`src/agent/long_task/subgraph_tool_middleware.py#L38-L125`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/long_task/subgraph_tool_middleware.py#L38-L125)
- **机制**：重写 `awrap_tool_call`，定义 `state_schema = LongTaskSharedState`。
- **背景**：早期设计采用 `SubAgentMiddleware` 调度子图，但框架原生中间件会覆盖 `messages` 导致子图参数丢失（`DELTA-LT-002`, `FACT-LT-009`）。
- **逻辑**：显式拦截 `chatbi_text2sql`、`visualize`、`manage_report` 等工具调用；调用已编译子图 `await graph.ainvoke(subgraph_input)`；提取子图返回的私有字段（如 `data_envelope`、`visualization_result`、`report_draft`），并通过 `Command(update={"messages": [tool_message], ...})` 双向同步回主图。

#### 3. `ToolErrorGuardMiddleware`（沙箱异常兜底保护）
- **源码文件**：[`src/agent/long_task/tool_error_guard_middleware.py#L23-L68`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/long_task/tool_error_guard_middleware.py#L23-L68)
- **机制**：重写 `awrap_tool_call`。
- **逻辑**：捕获底层 Daytona 沙箱抛出的 `DaytonaTimeoutError` 与 `DaytonaError`，封装为包含排查与参数调整建议的 `ToolMessage(status="error")` 回传给大模型，避免单步命令失败导致整轮 SSE 会话崩溃中断。

#### 4. `ObservedDeepAgentsSummarizationMiddleware`（上下文压缩观测）
- **源码文件**：[`src/agent/long_task/observed_summarization_middleware.py#L47-L306`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/long_task/observed_summarization_middleware.py#L47-L306)
- **机制**：直接继承 deepagents 的 `SummarizationMiddleware`，重写 `awrap_model_call` 与 `_should_summarize`。
- **逻辑**：增加最小消息数（`min_messages=6`）保底；在模型调用后统计当前近似 Token 消耗（`_count_tokens`），并通过 `adispatch_custom_event("context.usage_updated", ...)` 向前端广播最新的上下文用量。

---

## 4. 机制串联：Middleware 与 Callback 的协同与事件泵出

在复杂的 Agent 执行过程中，Middleware 与 Callback 不是孤立的，而是紧密咬合在一起。

### 4.1 执行时序与嵌套层级

**执行先后原则**：
1. **外层拦截优先于内层监听**：Middleware 始终处于调用的外围（Outer Layer），Callback 处于调用的内核与边界（Inner Core）；
2. **短路与重试影响 Callback 触发**：若 Middleware 短路（Short-circuit）未调用 `handler(request)`，则底层的 `on_chat_model_start` / `on_tool_start` 根本不会被触发；若 Middleware 重试 3 次，底层的 Callback 钩子会相应触发 3 次完整的 Start/End 周期。

```
[Middleware.awrap_model_call 进入 (Outer)]
  │
  ├─► 修改 Prompt / 检查缓存
  │
  ├─► 调用 handler(request)
  │     │
  │     ├─► [Callback: on_chat_model_start 触发]
  │     │
  │     ├─► LLM 网络 I/O 流式传输
  │     │     ├─► [Callback: on_llm_new_token 逐 Token 触发]
  │     │     └─► [Callback: ReasoningCallbackHandler 提取思考]
  │     │
  │     └─► [Callback: on_chat_model_end 触发]
  │
  ├─► 接收 ModelResponse
  │     │
  │     └─► [Middleware 内部调用 adispatch_custom_event]
  │           │
  │           └─► [Callback: AsyncCallbackManager.on_custom_event 触发]
  │
  └─► 返回 ExtendedModelResponse (Outer 退出)
```

---

### 4.2 自定义事件流转：Middleware 产生事件如何流出到 astream_events

在 `SkillActivationMiddleware` 或 `ObservedDeepAgentsSummarizationMiddleware` 等中间件内部，当需要向前端发送非标准业务事件时，必须通过 **`adispatch_custom_event` 桥接回 Callback 体系**。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 adispatch_custom_event 端到端流转与事件泵出链路                         │
│                                                                                        │
│  1. 中间件内部触发:                                                                    │
│     await adispatch_custom_event("context.usage_updated", data, config=config)         │
│        │                                                                               │
│        ▼ (langchain_core/callbacks/manager.py#L2614-L2738)                             │
│  2. 获取当前上下文的 AsyncCallbackManager:                                              │
│     callback_manager = get_async_callback_manager_for_config(config)                   │
│     await callback_manager.on_custom_event("context.usage_updated", data, ...)         │
│        │                                                                               │
│        ▼ 广播给所有绑定的 Handlers                                                      │
│  3. astream_events 的内置拦截器捕获:                                                   │
│     _AstreamEventsCallbackHandler.on_custom_event(name, data, ...)                     │
│        │                                                                               │
│        ▼ 写入内部内存流 (_MemoryStream)                                                 │
│     self._send({"event": "on_custom_event", "name": "context.usage_updated", ...})     │
│        │                                                                               │
│        ▼                                                                               │
│  4. CompiledStateGraph.astream_events(version="v2") yield 输出:                        │
│     {"event": "on_custom_event", "name": "context.usage_updated", "data": {...}}       │
│        │                                                                               │
│        ▼ (ag_ui_langgraph/agent.py#L1298-L1347)                                        │
│  5. LangGraphAGUIAgent._handle_single_event 转换:                                      │
│     yield CustomEvent(type=EventType.CUSTOM, name="context.usage_updated", value=data) │
│        │                                                                               │
│        ▼ (src/server/services/agent_service.py#L466-L508)                              │
│  6. 10 级协议中间件流水线透传 / 注入                                                   │
│        │                                                                               │
│        ▼ (ag_ui/encoder/encoder.py)                                                    │
│  7. EventEncoder 序列化为 SSE 数据帧:                                                  │
│     data: {"type": "CUSTOM", "name": "context.usage_updated", ...}\n\n                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. langAgent 协议层 10 级流式中间件流水线

在 `src/server/services/agent_service.py` 中，定义了在 LangGraph 外部运行的 **10 级协议流式中间件流水线（Protocol Stream Pipeline）**。

> [!IMPORTANT]
> **概念辨析**：此 10 级流水线不是 `AgentMiddleware`（不参与图拓扑编译，不拦截模型/工具调用函数），而是针对 `LangGraphAGUIAgent.run` 输出的 **AG-UI 事件流** 进行后处理的流式转换器（Stream Translators / Injectors）。

```
[LangGraph astream_events 事件]
             │
             ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 10 级流式中间件流水线 (AgentService.generate_events)                     │
│                                                                        │
│  ① ToolNameTranslator            ➔ 工具英文名转前端中文名 (如 search ➔ 查询)│
│  ② MessageSnapshotSanitizer      ➔ 修复 MESSAGES_SNAPSHOT 中 ToolMessage ID│
│  ③ ActivityEventTranslator       ➔ 将 copilotkit activity 转换为快照事件   │
│  ④ AskUserToolArgsMasker         ➔ ask_user 敏感入参掩码并拆分为事件流     │
│  ⑤ AskUserInterruptTranslator    ➔ 拦截并转译 LangGraph Interrupt 中断事件│
│  ⑥ FileDownloadActivityInjector  ➔ file_download 后注入下载活动卡片       │
│  ⑦ RenderHtmlActivityInjector    ➔ render_inline_html 后注入 HTML 渲染卡片 │
│  ⑧ SubgraphToolResultBridge      ➔ 补发子图缺失的 TOOL_CALL_RESULT 事件   │
│  ⑨ RAGSourceCollector            ➔ 汇聚知识检索来源并广播 rag_sources 事件 │
│  ⑩ ToolStatisticsCollector       ➔ 在 RUN_FINISHED 前发射 tool_usage 度量  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                      ┌──────────────┴──────────────┐
                      ▼                             ▼
          ┌───────────────────────┐     ┌───────────────────────┐
          │ SSE 流式输出分支      │     │ Blocking 聚合输出分支 │
          │ EventEncoder 编码推送 │     │ BlockingEventAggregator│
          │ 客户端断连轮询保障    │     │ 内存聚合为 JSON 响应  │
          └───────────────────────┘     └───────────────────────┘
```

### 5.1 决策演进：`ToolStatisticsCollector` 旁路度量 vs 已废弃的 `ToolIDRewriter` 原地篡改

- **触发场景**：前端业务埋点需要按产品视角对底层工具调用进行 1:N 聚合统计与中文重命名展示。
- **历史缺陷（方案 A：原地篡改，`DESIGN-AGUI-001`，已废弃）**：早期设计试图在协议层引入 `ToolIDRewriter`，在 SSE 编码前原地修改 `tool_call_id` 与 `tool_call_name`。这直接破坏了 `ToolMessage` 与 `AIMessage.tool_calls` 的 ID 配对一致性，导致断点恢复、多轮会话加载 Checkpoint 时 LangGraph 状态崩溃。
- **当前实现（方案 B：旁路度量，`FACT-TOOL-006`，`tool_statistics_collector.py`）**：
  - 源码明确保证：**保持 LangGraph 原生 `tool_call_id` 与 `tool_call_name` 绝对不变**；
  - `ToolStatisticsCollector` 在流经 `TOOL_CALL_START` 时记录原始 ID 与名称；
  - 在收到 `RUN_FINISHED` 事件时，在 `RUN_FINISHED` **之前** 额外插入一个 `CUSTOM` 事件（`name="tool_usage"`），将业务统计元数据旁路通知给前端。

---

## 6. 端到端调用流转与事件追踪（End-to-End Traces）

### 6.1 Trace 1：模型思考流式提取与推理结束事件链路

**场景**：用户发送请求，LLM（GLM-5 / DeepSeek）以流式 Chunk 输出思考过程，随后输出正文。

```
[客户端] ──── (POST /react-agent/stream) ────► [AgentService.generate_events]
                                                        │
                                                        ▼
                                             [LangGraph CompiledStateGraph]
                                                        │
                                                        ▼ 调度 model 节点
                                             [ReasoningCallbackHandler] (AsyncCallbackHandler)
                                                        │
┌───────────────────────────────────────────────────────┴──────────────────────────────────────────────────────┐
│ 时序执行跟踪                                                                                                  │
│ 1. LLM 产生 Chunk 1: message.additional_kwargs={"reasoning_content": "正在思考用户意图..."}                    │
│    ├─► ReasoningCallbackHandler.on_llm_new_token 捕获                                                        │
│    └─► 首个 delta 依次发射 copilotkit_reasoning_start 与 copilotkit_reasoning_message_start                    │
│        （dispatch_agui_custom_event，reasoning_handler.py L110-L124）                                        │
│           │                                                                                                  │
│           ▼ adispatch_custom_event ➔ AsyncCallbackManager ➔ _AstreamEventsCallbackHandler                    │
│        astream_events yield: {"event": "on_custom_event", "name": "copilotkit_reasoning_message_start"}      │
│           │                                                                                                  │
│           ▼ LangGraphAGUIAgent._handle_single_event 转换                                                     │
│        生成 AG-UI Event: CustomEvent(name="copilotkit_reasoning_message_start", ...)                         │
│           │                                                                                                  │
│           ▼ 10 级中间件流水线（原样透传——ActivityEventTranslator 只处理 copilotkit_emit_activity，           │
│             不转换 reasoning 事件；注意 Blocking 聚合器会显式丢弃 copilotkit_reasoning_*）                    │
│        以原生 CustomEvent 透传                                                                                │
│           │                                                                                                  │
│           ▼ EventEncoder 编码推送至 HTTP SSE ──► [前端按 CustomEvent 名自行展开思考折叠卡片]                    │
│                                                                                                              │
│ 2. LLM 产生 Chunk 2 (思考结束，正文开始): content="您好，根据数据分析..." (无 reasoning_content)              │
│    ├─► ReasoningCallbackHandler 发现 _has_started=True 且无 reasoning 增量                                    │
│    └─► 立即调用 dispatch_agui_custom_event("copilotkit_reasoning_message_end", ...)                           │
│           │                                                                                                  │
│           ▼ 经 astream_events ➔ AG-UI 转译 ➔ SSE 推送                                                        │
│        生成: ReasoningMessageEndEvent(message_id="reasoning-uuid-1")                                         │
│           │                                                                                                  │
│           ▼ [前端精准闭合思考卡片，无缝开启正文打字机]                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.2 Trace 2：自动技能发现与激活 Activity 链路

**场景**：Long Task Agent 在执行中决定读取 `/skills/financial_analysis/SKILL.md`，触发自动技能激活。

```
[LLM] ──► 生成 tool_call: name="read_file", args={"file_path": "/skills/financial_analysis/SKILL.md"}
            │
            ▼ 路由至 tools 节点
[SkillActivationMiddleware.awrap_tool_call] (AgentMiddleware)
  │
  ├─ 1. 前置解析: _resolve_package(request) 匹配到技能 "financial_analysis"
  │
  ├─ 2. 放行调用: result = await handler(request)
  │      │
  │      ▼ 调用底层沙箱
  │    [DaytonaSandbox.read] 读取容器内 SKILL.md 内容
  │      │
  │      ▼ 返回
  │    ToolMessage(content="---\nname: financial_analysis...", status="success", tool_call_id="call-99")
  │
  ├─ 3. 后置检查: status == "success" 且未激活过
  │      │
  │      ├─► 记录: self._activated_skill_ids.add("financial_analysis")
  │      │
  │      └─► 发射事件: await dispatch_agui_custom_event("copilotkit_emit_activity", activity_value, config)
  │             │
  │             ▼
  │          [adispatch_custom_event] ──► [AsyncCallbackManager.on_custom_event]
  │             │
  │             ▼
  │          [_AstreamEventsCallbackHandler] (astream_events v2)
  │             │
  │             ▼
  │          [LangGraphAGUIAgent] 转换为 CustomEvent(name="copilotkit_emit_activity", value=activity_value)
  │             │
  │             ▼
  │          [ActivityEventTranslator] (10 级流水线 ③)
  │             │
  │             ▼ 转换为标准 AG-UI 快照事件
  │          ActivitySnapshotEvent(
  │              type=EventType.ACTIVITY_SNAPSHOT,
  │              message_id="activity-skill-run1-financial_analysis",
  │              activity_type="skill_activation",
  │              content={"skill_name": "财务分析专家技能", "activation_source": "automatic_discovery"}
  │          )
  │             │
  │             ▼ SSE 推送 ──► [前端渲染带有专业图标的“已激活技能：财务分析专家”卡片]
  │
  └─ 4. 返回原始 ToolMessage (完全不改变工具返回结果)
```

---

### 6.3 Trace 3：子图工具拦截与状态隔离回传链路

**场景**：Long Task Agent 调用 `chatbi_text2sql` 垂直子图，子图内部执行多轮 SQL 生成与取数，主图同步状态。

```
[LLM] ──► 生成 tool_call: name="chatbi_text2sql", args={"query": "统计近半年各地区销售总额"}
            │
            ▼ 路由至 tools 节点
[SubgraphToolMiddleware.awrap_tool_call] (AgentMiddleware)
  │
  ├─ 1. 拦截判定: "chatbi_text2sql" 命中 self._registry 注册表
  │
  ├─ 2. 状态深拷贝与隔离: subgraph_input = deepcopy(dict(request.state))
  │
  ├─ 3. 子图独立执行:
  │      result_state = await chatbi_compiled_graph.ainvoke(subgraph_input, config=request.runtime.config)
  │      (子图内部经历 6 个私有节点流转，生成 10+ 条探索消息与 DataEnvelope 数据信封)
  │
  ├─ 4. 提取子图结果:
  │      - 提取最终 ToolMessage (tool_call_id="call-sql-01")
  │      - 提取领域状态字段: data_envelope = result_state["data_envelope"]
  │
  ├─ 5. 构建 Command 原子回写:
  │      return Command(update={
  │          "messages": [tool_message],
  │          "data_envelope": data_envelope
  │      })
  │
  └─ 6. 流经协议层 10 级流水线:
         [SubgraphToolResultBridge] (⑧) 检测到子图完成，确保补发 TOOL_CALL_RESULT 事件
         [RenderHtmlActivityInjector] (⑦) 若有内联渲染则追加渲染卡片
```

---

## 7. 框架源码核验清单与事实对照表

本文所有机制与调用链均已对照以下锁定源码逐行核验，杜绝任何臆测与非事实 API：

| 机制 / 类名 | 源码文件路径 | 关键行号 | 核验证明事实 |
|---|---|---|---|
| `BaseCallbackHandler` | `langchain_core/callbacks/base.py` | L496–L546 | Mixin 组合架构、钩子忽略属性（`ignore_llm` 等）与 `raise_error` 容错控制 |
| `AsyncCallbackHandler` | `langchain_core/callbacks/base.py` | L548–L1003 | 完整异步钩子方法族与类型签名 |
| `adispatch_custom_event` | `langchain_core/callbacks/manager.py` | L2614–L2738 | 从 `RunnableConfig` 提取 `AsyncCallbackManager` 并广播 `on_custom_event` |
| `_AstreamEventsCallbackHandler` | `langchain_core/tracers/event_stream.py` | L101–L1006 | `astream_events` 核心事件泵实现，基于自研 `_MemoryStream`（`asyncio.Queue` 无界队列）分发 |
| `_astream_events_implementation_v2` | `langchain_core/tracers/event_stream.py` | L1008–L1106 | 动态注入 CallbackHandler、启动后台消费 Task 并 yield 标准事件 |
| `AgentMiddleware` | `langchain/agents/middleware/types.py` | L383–L812 | `state_schema`, `abefore/aafter_agent`, `abefore/aafter_model`, `awrap_model_call`, `awrap_tool_call` 签名 |
| `_chain_async_model_call_handlers` | `langchain/agents/factory.py` | L327–L416 | `awrap_model_call` 递归洋葱包装算法与 `ExtendedModelResponse` 命令合并 |
| `_chain_async_tool_call_wrappers` | `langchain/agents/factory.py` | L674–L730 | `awrap_tool_call` 递归洋葱包装算法 |
| Middleware Graph Assembly | `langchain/agents/factory.py` | L1509–L1777 | `before_*` 正序串联、`after_*` 逆序串联的双层洋葱图节点装配 |
| `create_deep_agent` | `deepagents/graph.py` | L260 定义（L772–L855 为中间件装配段） | `TodoList` ➔ `Skills` ➔ `Filesystem` ➔ `SubAgent` ➔ `Summarization` ➔ `PatchToolCalls` ➔ `AsyncSubAgent` ➔ User Middleware ➔ `Memory` ➔ `HITL` 默认装配链 |
| `ReasoningCallbackHandler` | `src/agent/factory/reasoning_handler.py` | L21–L186 | Format A/B 思考提取、思考结束时机检测与自定义事件发射 |
| `OpikTracer` 集成 | `src/agent/core/opik_integration.py` | L57–L142 | `create_tracer`, `opik_context.clear_all()` 上下文隔离与 `flush_tracer` |
| `SkillActivationMiddleware` | `src/agent/long_task/skill_activation_middleware.py` | L28–L124 | `awrap_tool_call` 拦截 `read_file`，命中 `SKILL.md` 发射激活 Activity |
| `SubgraphToolMiddleware` | `src/agent/long_task/subgraph_tool_middleware.py` | L38–L125 | `awrap_tool_call` 拦截子图入口，隔离执行并通过 `Command(update=...)` 同步状态 |
| `ToolErrorGuardMiddleware` | `src/agent/long_task/tool_error_guard_middleware.py` | L23–L68 | 捕获 `DaytonaTimeoutError` / `DaytonaError` 转化为 `ToolMessage(status="error")` |
| `ToolStatisticsCollector` | `src/agent/middleware/tool_statistics_collector.py` | L35–L110 | 保持原生 `tool_call_id` 不变，在 `RUN_FINISHED` 前旁路发射 `tool_usage` CustomEvent |
| 10 级协议流水线 | `src/server/services/agent_service.py` | L271–L336, L495–L508 | `init_middlewares` 与 `generate_events` 中的事件流式转换与展开 |

---

## 8. 框架内置 Callback 与 Middleware 全景（学习向目录）

在深入掌握 LangGraph、LangChain 1.x 与 deepagents 0.6.12 框架时，开发者往往面临一个核心诉求：**“框架本身自带了哪些现成的扩展点？各自在什么场景下使用？我该如何选择？”**

本章作为学习向全景参考手册，基于锁定源码版本（`langchain_core 1.4.8`、`langgraph 1.2.8`、`deepagents 0.6.12`）逐一拆解框架自带的全部内置 CallbackHandler 与 Middleware 实现，提供源码级路径、参数契约、适用场景分析以及在 `langAgent` 工程基线中的实际对照。

---

### 8.1 框架内置 CallbackHandler 全景清单

LangChain 的 Callback 系统遵循经典的**观察者模式（Observer Pattern）**。所有处理器均派生自 `BaseCallbackHandler` 或 `AsyncCallbackHandler`。它们是**只读且无控制流副作用**的，用于在底层执行生命周期（LLM 推理、工具调用、链流转、自定义事件）中进行监听、日志记录、耗时统计与流式事件泵出。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 langchain_core 回调处理器家族拓扑                                │
│                                                                                                  │
│                             BaseCallbackHandler / AsyncCallbackHandler                           │
│                                (callbacks/base.py L496 / L548)                                   │
│                                    │                                                             │
│         ┌──────────────────────────┼──────────────────────────┬────────────────────────┐         │
│         ▼                          ▼                          ▼                        ▼         │
│  [ 标准流式/日志类 ]         [ 统计度量类 ]             [ 运行追踪树类 ]         [ 事件流泵类 ]    │
│  • StdOutCallbackHandler    • UsageMetadataCallback    • BaseTracer             • _AstreamEvents │
│  • StreamingStdOutHandler     Handler                  • FunctionCallback         CallbackHandler│
│  • FileCallbackHandler                                 • ConsoleCallbackHandler                  │
│                                                        • LangChainTracer                         │
│                                                        • LogStreamCallbackHandler                │
│                                                        • RunCollectorHandler                     │
│                                                        • EvaluatorCallbackHandler                │
│                                                        • RootListenersTracer                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 8.1.1 内置 CallbackHandler 逐项核验表

| 序号 | 处理器类名 / 函数 | 源码位置与行号 | 一句话核心用途 | 什么时候你会需要它（适用场景） | langAgent 是否在用 |
|---|---|---|---|---|---|
| 1 | `BaseCallbackHandler` / `AsyncCallbackHandler` | `langchain_core/callbacks/base.py`<br>L496–L546 / L548–L1003 | 回调处理器抽象基类，定义 6 大管理器能力钩子（LLM, Tool, Chain, Retriever, Run, CustomEvent） | 需要定制开发专属的可观测、日志打点或自定义事件流发射处理器时（一切自定义 Handler 的起点）。 | **在用（核心基类）**<br>`ReasoningCallbackHandler` 与 `ReportStreamingCallbackHandler` 均继承自 `AsyncCallbackHandler`。 |
| 2 | `StdOutCallbackHandler` | `langchain_core/callbacks/stdout.py`<br>L16–L123 | 将 Chain 进入/退出、Agent Action 与 Tool 执行结果按 ANSI 颜色格式化打印到标准输出 | CLI 命令行调试、单测运行或本地快速验证 Agent 工具调用与链式流转时。 | **未在用**<br>生产环境采用结构化 JSON 日志与前端 SSE 流。 |
| 3 | `StreamingStdOutCallbackHandler` | `langchain_core/callbacks/streaming_stdout.py`<br>L18–L154 | 在 `on_llm_new_token` 钩子中实时调用 `sys.stdout.write` 与 `flush` 输出打字机文本 | 本地命令行交互式 Agent Demo，需要低延迟打字机流式输出体验。 | **未直接在用**<br>langAgent 通过 `astream_events` + AG-UI 协议推流。 |
| 4 | `FileCallbackHandler` | `langchain_core/callbacks/file.py`<br>L21–L267 | 将 Chain、Tool、Agent 执行全量日志持久化追加写入指定文本文件（支持 ContextManager） | 无外部分布式追踪系统的简单生产环境、离线脚本批处理日志归档与事后回溯。 | **未在用**<br>采用 Loguru 结构化文件日志及数据库持久化。 |
| 5 | `UsageMetadataCallbackHandler`<br>（及 `get_usage_metadata_callback`） | `langchain_core/callbacks/usage.py`<br>L18–L79 / L81–L120 | 线程安全地从 `AIMessage.usage_metadata` 提取 Token 消耗并在多模型调用间累加聚合 | 需要跨多次调用（如多步 ReAct 循环或多 Agent 协同）精准核算各模型 Token 总消耗与计费。 | **未直接在用**<br>服务端协议流水线通过 `ToolStatisticsCollector` 聚合元数据。 |
| 6 | `FunctionCallbackHandler`<br>/ `ConsoleCallbackHandler` | `langchain_core/tracers/stdout.py`<br>L48–L197 / L198–L206 | 树状链路追踪器，计算每个 Run 耗时（`elapsed`）并生成面包屑调用链路（如 `Chain > Tool > LLM`） | 复杂嵌套图或多步骤调用性能排查，精确定位哪一个工具或子链耗时过长。 | **未在用**。 |
| 7 | `LangChainTracer` | `langchain_core/tracers/langchain.py`<br>L134–L469 | 官方 LangSmith 分布式追踪上报器，将全量 Run 树拓扑、输入输出与元数据异步推送至 LangSmith | 生产级分布式可观测性、Prompt 评测回归、生产故障回溯与真实调用集标注。 | **未在用（替换为 OpikTracer）**<br>langAgent 采用开源自建的 `OpikTracer` 对接 Comet Opik。 |
| 8 | `LogStreamCallbackHandler` | `langchain_core/tracers/log_stream.py`<br>L232–L564 | 维护全局运行状态树的 JSON Patch 差异日志流（`RunLogPatch`），驱动 `astream_log` API | 需要在客户端实时还原全局 Graph 完整状态树差异的场景（多数场景已被 `astream_events` 替代）。 | **未在用**。 |
| 9 | `RunCollectorCallbackHandler` | `langchain_core/tracers/run_collector.py`<br>L11–L40 | 将执行过程中产生的所有嵌套 `Run` 对象完整缓存在内存列表（`traced_runs`）中 | 单元测试与集成测试断言（断言是否调用了某工具、某节点的输入输出格式是否符合预期）。 | **未在用**。 |
| 10 | `EvaluatorCallbackHandler` | `langchain_core/tracers/evaluation.py`<br>L38–L226 | 在 Run 结束持久化时，异步线程池并发触发一系列 `RunEvaluator` 评估器打分并写回 feedback | 生产在线持续评测（Online Evaluation）、自动化质量护栏与打分监控。 | **未在用**。 |
| 11 | `RootListenersTracer`<br>/ `AsyncRootListenersTracer` | `langchain_core/tracers/root_listeners.py`<br>L23–L77 / L78–L130 | 专门只监听根节点（Root Run）的 `on_start`, `on_end`, `on_error`，过滤所有子运行噪音 | `Runnable.with_listeners(...)` 的底层实现，用于粗粒度请求边界耗时打点或错误告警。 | **未在用**。 |
| 12 | `_AstreamEventsCallbackHandler` | `langchain_core/tracers/event_stream.py`<br>L101–L831 | `astream_events(version="v2")` 的核心事件泵，基于无界异步内存队列标准化派发事件 | 构建流式 Web/SSE 应用的核心底层管道。调用 `graph.astream_events(..., version="v2")` 即自动启用。 | **在用（底层基础设施）**<br>`src/server/services/agent_service.py` 借此消费底层事件流。 |
| 13 | `GraphCallbackHandler` | `langgraph/callbacks.py`<br>L87–L115 | LangGraph 专属图生命周期处理器，提供 `on_interrupt` 与 `on_resume` 图级专用钩子 | 监听人机协同（HITL）场景下的图中断暂停与 Checkpoint 恢复事件，用于外部系统通知或状态持久化。 | **未直接继承在用**。 |

---

### 8.2 LangChain 1.x 运行时 Middleware 全景清单

`langchain.agents.middleware` 基于洋葱模型设计，每个中间件均继承 `AgentMiddleware`。它们能够**拦截模型请求（`wrap_model_call`）、拦截工具调用（`wrap_tool_call`）、注入动态提示词（`dynamic_prompt`）、修改状态并抛出 `Command` 短路执行**。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            langchain 1.x AgentMiddleware 核心能力矩阵                            │
│                                                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │   上下文与记忆治理   │  │   安全、限流与合规   │  │   容错与高可用调度   │  │ 工具增强与模拟 │  │
│  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤  ├──────────────┤  │
│  │• ContextEditing      │  │• ModelCallLimit      │  │• ModelRetry          │  │• ToolSelector│  │
│  │• Summarization       │  │• ToolCallLimit       │  │• ToolRetry           │  │• ProviderTool│  │
│  │• TodoList            │  │• PIIMiddleware       │  │• ModelFallback       │  │  Search      │  │
│  │                      │  │• HumanInTheLoop      │  │                      │  │• ToolEmulator│  │
│  │                      │  │• ShellTool           │  │                      │  │• FileSearch  │  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 8.2.1 LangChain 内置 15 个 Middleware 详析

#### 1. `ContextEditingMiddleware`
- **源码路径**：`langchain/agents/middleware/context_editing.py`（L187–L250；关联策略 `ClearToolUsesEdit` L58–L100）
- **解决什么问题**：当 Agent 经历多轮工具调用后，上下文历史急剧膨胀。该中间件在模型调用前按策略修剪早期工具的执行结果（用占位符替换），保持上下文轻量并防止超窗，对齐 Anthropic `clear_tool_uses_20250919` 规范。
- **关键配置项与真实默认值**：
  - `edits: Iterable[ContextEdit] | None = None`（默认单个 `ClearToolUsesEdit()`）
  - `token_count_method: Literal["approximate", "model"] = "approximate"`
  - `ClearToolUsesEdit` 配置项：`trigger: int = 100_000`、`clear_at_least: int = 0`、`keep: int = 3`（保留最近 3 个工具结果）、`clear_tool_inputs: bool = False`、`exclude_tools: Sequence[str] = ()`、`placeholder: str = DEFAULT_TOOL_PLACEHOLDER`
- **什么时候你会需要它**：构建超长会话编程或分析助手，不希望全量总结压缩历史，仅需“掏空”早期无用的工具大输出以节省 Prompt Token。
- **langAgent 对照**：**未用**（langAgent 采用 deepagents 的 `SummarizationMiddleware` 全量总结压缩与归档）。

#### 2. `FilesystemFileSearchMiddleware`
- **源码路径**：`langchain/agents/middleware/file_search.py`（L107–L160）
- **解决什么问题**：为基础 Agent 自动注入 `glob_search`（文件路径模式匹配）和 `grep_search`（基于 ripgrep/Python 的文本检索）两个标准工具，赋予 Agent 快速检索本地代码与文件的能力。
- **关键配置项与真实默认值**：
  - `root_path: str`（必填，搜索根目录）
  - `use_ripgrep: bool = True`（若系统未安装 ripgrep 则自动回退到 Python 原生实现）
  - `max_file_size_mb: int = 10`
- **什么时候你会需要它**：快速为 Agent 增加本地代码库检索能力，无需配置沙箱或外部向量数据库。
- **langAgent 对照**：**未用**（langAgent 使用 Daytona 远程沙箱配合 deepagents 的 `FilesystemMiddleware`）。

#### 3. `HumanInTheLoopMiddleware`
- **源码路径**：`langchain/agents/middleware/human_in_the_loop.py`（L216–L280；关联配置 `InterruptOnConfig` L146–L214）
- **解决什么问题**：拦截敏感工具调用（如文件删除、支付、发邮件），触发 LangGraph `interrupt` 暂停执行，等待人工审查并执行四种决策之一：批准（`approve`）、修改参数（`edit`）、拒绝（`reject`）或直接回复（`respond`）。
- **关键配置项与真实默认值**：
  - `interrupt_on: dict[str, bool | InterruptOnConfig]`（必填，工具名到审查规则的映射字典）
  - `description_prefix: str = "Tool execution requires approval"`
  - `InterruptOnConfig` 支持字段：`allowed_decisions`（如 `["approve", "edit", "reject", "respond"]`）、`description`（静态字符串或动态工厂函数）、`when`（条件谓词函数 `Callable[[ToolCallRequest], bool]`）
- **什么时候你会需要它**：生产级人机协同（HITL），对写操作、财务交易等高风险行为施加安全门禁。
- **langAgent 对照**：**未显式配置**（langAgent 在前端与协议层实现交互卡片控制与自动执行流）。

#### 4. `ModelCallLimitMiddleware`
- **源码路径**：`langchain/agents/middleware/model_call_limit.py`（L94–L140）
- **解决什么问题**：监控并强制限制 Agent 对 LLM 模型的调用次数，支持会话级（跨 run 持久化）和运行级（单次 run）配额，防止 Agent 陷入死循环刷爆 API 费用。
- **关键配置项与真实默认值**：
  - `thread_limit: int | None = None`（单线程/会话累计上限）
  - `run_limit: int | None = None`（单次 run 调用上限）
  - `exit_behavior: Literal["end", "error"] = "end"`（`end` 自动平滑收尾，`error` 抛出 `ModelCallLimitExceededError`）
- **什么时候你会需要它**：多租户 SaaS 计费防护、防止 ReAct Agent 陷入死循环失控。
- **langAgent 对照**：**未用**（langAgent 在 API 网关层通过全局超时和 Token 预算控制）。

#### 5. `ModelFallbackMiddleware`
- **源码路径**：`langchain/agents/middleware/model_fallback.py`（L24–L71）
- **解决什么问题**：在主模型调用失败（如遭遇 503 服务宕机、Rate Limit 限流等）时，按预设候选列表自动顺延回退并调用备用模型。
- **关键配置项与真实默认值**：
  - `first_model: str | BaseChatModel`（首个备用模型）
  - `*additional_models: str | BaseChatModel`（后续级联备用模型列表）
- **什么时候你会需要它**：对可用性要求极高的核心业务链路，如 OpenAI 宕机时自动平滑切至 Claude 或 DeepSeek。
- **langAgent 对照**：**未用**（由服务端统一网关进行集群调度与熔断）。

#### 6. `ModelRetryMiddleware`
- **源码路径**：`langchain/agents/middleware/model_retry.py`（L31–L140）
- **解决什么问题**：在模型调用抛出瞬态异常（网络超时、429 限流、5xx 服务器错误）时，以指数退避加随机抖动（Jitter）策略自动重试。
- **关键配置项与真实默认值**：
  - `max_retries: int = 2`
  - `retry_on: RetryOn = (Exception,)`（支持异常类型元组或条件判定函数）
  - `on_failure: OnFailure = "continue"`（`continue` 返回错误 AIMessage 让 Agent 感知，`error` 重新抛出异常，或自定义格式化函数）
  - `backoff_factor: float = 2.0`
  - `initial_delay: float = 1.0`
  - `max_delay: float = 60.0`
  - `jitter: bool = True`
- **什么时候你会需要它**：大模型 API 遭遇网络抖动或突发高并发限流时的通用容错。
- **langAgent 对照**：**未直接在用**。

#### 7. `PIIMiddleware`
- **源码路径**：`langchain/agents/middleware/pii.py`（L492–L600；关联规则 `RedactionRule` `_redaction.py` L398）
- **解决什么问题**：自动检测对话中的个人敏感信息（PII，包括邮箱、信用卡、IP、MAC 地址、URL），并在输入、输出或流式传输中执行阻断、脱敏、掩码或哈希脱敏。
- **关键配置项与真实默认值**：
  - `pii_type: Literal["email", "credit_card", "ip", "mac_address", "url"] | str`（内置类型或自定义类型名）
  - `strategy: Literal["block", "redact", "mask", "hash"] = "redact"`（`block` 抛异常，`redact` 替换占位符，`mask` 部分掩码，`hash` 确定性哈希）
  - `detector: Callable[[str], list[PIIMatch]] | str | None = None`（自定义正则或检测器函数）
  - `apply_to_input: bool = True`（拦截输入 Prompt）
  - `apply_to_output: bool = False`（拦截输出 AIMessage 与流式 chunk）
  - `apply_to_tool_results: bool = False`（拦截工具执行结果）
- **什么时候你会需要它**：金融、医疗、客服合规场景，防止敏感信息上传给模型提供商或向客户端泄露。
- **langAgent 对照**：**未用**（langAgent 在服务端协议流水线第 4 级 `DataDesensitizationTransformer` 针对业务字段统一脱敏）。

#### 8. `ProviderToolSearchMiddleware`
- **源码路径**：`langchain/agents/middleware/provider_tool_search.py`（L57–L130）
- **解决什么问题**：利用大模型提供商原生服务端工具搜索能力（如 Anthropic `tool_search_tool_bm25_20251119`、OpenAI `tool_search`），延迟加载工具 Schema，避免一次性在 System Prompt 中注入海量工具定义撑爆上下文。
- **关键配置项与真实默认值**：
  - `searchable_tools: list[ToolIdentifier] | None = None`（标记为延迟检索的工具名或工具实例）
- **什么时候你会需要它**：挂载数十上百个工具的大型 Agent 且底层模型为 Claude 或 GPT 原生 Tool Search 支持者。
- **langAgent 对照**：**未用**。

#### 9. `ShellToolMiddleware`
- **源码路径**：`langchain/agents/middleware/shell_tool.py`（L489–L540）
- **解决什么问题**：为 Agent 注入常驻的持久化 Bash Shell 会话，支持配置不同的隔离安全策略（本机、Codex 沙箱、Docker 容器）及输出脱敏规则。
- **关键配置项与真实默认值**：
  - `workspace_root: str | Path | None = None`（会话工作目录，默认自动创建临时目录）
  - `startup_commands: tuple[str, ...] | list[str] | str | None = None`
  - `shutdown_commands: tuple[str, ...] | list[str] | str | None = None`
  - `execution_policy: BaseExecutionPolicy | None = None`（默认 `HostExecutionPolicy`，可选 `CodexSandboxExecutionPolicy` 或 `DockerExecutionPolicy`）
  - `redaction_rules: tuple[RedactionRule, ...] | list[RedactionRule] | None = None`
  - `tool_name: str = "shell"`
- **什么时候你会需要它**：构建本地或容器化运维、终端自动化 Agent。
- **langAgent 对照**：**未用**（langAgent 采用 Daytona 远程沙箱环境隔离执行）。

#### 10. `SummarizationMiddleware`（LangChain 基础版）
- **源码路径**：`langchain/agents/middleware/summarization.py`（L219–L280；关联触发规则 `TriggerClause` L174）
- **解决什么问题**：在历史消息数或 Token 数达到阈值时，自动调用轻量总结模型提炼历史，将旧消息替换为结构化摘要，保持上下文连贯并防止超窗。
- **关键配置项与真实默认值**：
  - `model: str | BaseChatModel`（必填，总结专用模型）
  - `trigger: ContextSize | TriggerClause | list[...] | None = None`（如 `("messages", 50)`, `("tokens", 3000)`, `("fraction", 0.8)`）
  - `keep: ContextSize = ("messages", 20)`（总结后保留最近 20 条消息）
  - `token_counter: TokenCounter = count_tokens_approximately`
  - `summary_prompt: str = DEFAULT_SUMMARY_PROMPT`
  - `trim_tokens_to_summarize: int | None = 4000`
- **什么时候你会需要它**：标准 LangChain 1.x Agent 长轮次对话上下文管理。
- **langAgent 对照**：**未直接用该版**（langAgent 使用 deepagents 增强版）。

#### 11. `TodoListMiddleware`（LangChain 版）
- **源码路径**：`langchain/agents/middleware/todo.py`（L174–L230）
- **解决什么问题**：为 Agent 注入 `write_todos` 工具与 `PlanningState`（`todos` 字段），引导模型在执行复杂多步任务前先规划任务列表并在执行中实时打勾更新状态。
- **关键配置项与真实默认值**：
  - `system_prompt: str = WRITE_TODOS_SYSTEM_PROMPT`
  - `tool_description: str = WRITE_TODOS_TOOL_DESCRIPTION`
- **什么时候你会需要它**：需要多步自主规划、自我反思并让用户直观看到任务进度的复杂 Agent。
- **langAgent 对照**：**在用（通过 deepagents 继承）**。

#### 12. `ToolCallLimitMiddleware`
- **源码路径**：`langchain/agents/middleware/tool_call_limit.py`（L140–L220）
- **解决什么问题**：针对全局或特定工具施加调用次数配额（支持线程级和单次 run 级），防止死循环调用某个特定工具耗尽配额。
- **关键配置项与真实默认值**：
  - `tool_name: str | None = None`（针对特定工具；`None` 表示全局所有工具）
  - `thread_limit: int | None = None`
  - `run_limit: int | None = None`
  - `exit_behavior: ExitBehavior = "continue"`（`continue` 拦截超限工具并返回错误提示供模型自我纠正；`error` 抛异常；`end` 立即终止）
- **什么时候你会需要它**：严格限制高价值外部 API（如搜索、计费调用、爬虫）在单次交互中的调用上限。
- **langAgent 对照**：**未用**。

#### 13. `LLMToolEmulator`
- **源码路径**：`langchain/agents/middleware/tool_emulator.py`（L22–L108）
- **解决什么问题**：在测试或开发环境中，使用 LLM 模拟工具的返回结果，无需真实连通外部数据库、API 或执行真实系统命令。
- **关键配置项与真实默认值**：
  - `tools: list[str | BaseTool] | None = None`（`None` 表示模拟所有工具；也可指定工具名或实例列表）
  - `model: str | BaseChatModel | None = None`（默认 `'anthropic:claude-sonnet-4-5-20250929'`，`temperature=1`）
- **什么时候你会需要它**：离线单测、快速验证 Agent 逻辑决策树、无真实网络或无生产凭据下的流程验证。
- **langAgent 对照**：**未用**。

#### 14. `ToolRetryMiddleware`
- **源码路径**：`langchain/agents/middleware/tool_retry.py`（L30–L140）
- **解决什么问题**：在特定或全局工具执行抛出网络或临时异常时自动重试，支持指数退避与抖动。
- **关键配置项与真实默认值**：
  - `max_retries: int = 2`
  - `tools: list[BaseTool | str] | None = None`（指定需要重试的工具）
  - `retry_on: RetryOn = (Exception,)`
  - `on_failure: OnFailure = "continue"`（`continue` 返回错误 ToolMessage，`error` 抛出异常）
  - `backoff_factor: float = 2.0`
  - `initial_delay: float = 1.0`
  - `max_delay: float = 60.0`
  - `jitter: bool = True`
- **什么时候你会需要它**：第三方不稳定 HTTP API、网络爬虫工具或易发生连接抖动的外部数据源。
- **langAgent 对照**：**未直接在用**（langAgent 采用自定义 `ToolErrorGuardMiddleware` 统一转换沙箱异常交由 LLM 自行决策重试）。

#### 15. `LLMToolSelectorMiddleware`
- **源码路径**：`langchain/agents/middleware/tool_selection.py`（L93–L160）
- **解决什么问题**：当 Agent 可选工具量级巨大时，在主模型调用前先使用轻量小模型（如 GPT-4o-mini）根据用户意图预筛选出最相关的 Top-K 个工具，大幅削减主模型的 Prompt Token 并提升注意力聚焦度。
- **关键配置项与真实默认值**：
  - `model: str | BaseChatModel | None = None`（筛选用模型，默认使用 Agent 主模型）
  - `system_prompt: str = DEFAULT_SYSTEM_PROMPT`
  - `max_tools: int | None = None`（初筛最多保留工具数）
  - `always_include: list[str] | None = None`（白名单强制保留工具，不计入 `max_tools` 限制）
- **什么时候你会需要它**：拥有庞大工具市场（Tool Universe）或上百个 OpenAPI 插件的超大型 Agent 动态路由。
- **langAgent 对照**：**未用**。

---

### 8.3 deepagents 0.6.12 运行时 Middleware 全景清单

`deepagents` 在 LangChain 基础中间件之上，深度扩展了面向长任务、代码生成、多 Agent 协同与沙箱执行的高级中间件家族。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             deepagents 0.6.12 核心中间件生态全景                                 │
│                                                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │   长任务与状态管理   │  │   子 Agent 协同网络  │  │   技能与经验注入     │  │ 容错与评估闭环│  │
│  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤  ├──────────────┤  │
│  │• Filesystem          │  │• SubAgent            │  │• Skills              │  │• PatchTool   │  │
│  │• Summarization       │  │• AsyncSubAgent       │  │• Memory              │  │  Calls       │  │
│  │• SummarizationTool   │  │                      │  │                      │  │• Rubric      │  │
│  │                      │  │                      │  │                      │  │• _Tool       │  │
│  │                      │  │                      │  │                      │  │  Exclusion   │  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 8.3.1 deepagents 内置 10 个 Middleware 详析（`__all__` 导出 8 个；`PatchToolCallsMiddleware` 未入 `__all__` 但由 `create_deep_agent` 自动挂载）

#### 1. `FilesystemMiddleware`
- **源码路径**：`deepagents/middleware/filesystem.py`（L765–L850；关联权限配置 `FilesystemPermission` L91）
- **解决什么问题**：为 DeepAgent 注入全套文件系统工具（`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`）与沙箱命令执行工具（`execute`）。同时内置**大内容自动驱逐（Eviction）**机制：当工具执行结果或用户消息超出 Token 上限时，自动将全量数据持久化写入 Backend 并仅在上下文保留截断摘要与文件引用。
- **关键配置项与真实默认值**：
  - `backend: BACKEND_TYPES | None = None`（默认 `StateBackend()`；生产环境可传 `CompositeBackend` 或沙箱 Backend）
  - `system_prompt: str | None = None`
  - `custom_tool_descriptions: Mapping[str, str] | None = None`
  - `tool_token_limit_before_evict: int | None = 20000`（工具输出超过 20,000 Token 自动驱逐存盘）
  - `human_message_token_limit_before_evict: int | None = 50000`
  - `max_execute_timeout: int = 3600`（单条命令执行硬超时，默认 1 小时）
  - `_permissions: list[FilesystemPermission] | None = None`
- **什么时候你会需要它**：代码编写、数据分析、需要可靠读写工作区文件与在容器沙箱中执行命令的深任务 Agent 核心基石。
- **langAgent 对照**：**在用（核心基石）**。配置 Daytona 沙箱 Backend 实现远程文件读写与命令隔离执行。

#### 2. `SkillsMiddleware`
- **源码路径**：`deepagents/middleware/skills.py`（L748–L815）
- **解决什么问题**：实现技能的**渐进式发现（Progressive Disclosure）**。启动时仅将技能名称与一句话描述（从各技能目录的 `SKILL.md` YAML 头部提取）注入 System Prompt；当模型判定需要该技能时，自主调用 `read_file` 读取完整操作 SOP，极致节省 Prompt Token。
- **关键配置项与真实默认值**：
  - `backend: BACKEND_TYPES`（必填，读取技能文件的存储后端）
  - `sources: Sequence[SkillSource]`（必填，技能路径列表，支持 `"/path/to/skills"` 或 `("/path", "Label")` 元组）
  - `system_prompt: str | None = SKILLS_SYSTEM_PROMPT`（必须包含 `{skills_locations}`, `{skills_load_warnings}`, `{skills_list}` 占位符）
- **什么时候你会需要它**：拥有海量专业领域技能库（如数据分析、代码重构、财务审计）的专业 Agent。
- **langAgent 对照**：**在用**。搭配 `SkillActivationMiddleware` 在模型读取 `SKILL.md` 时向前端发射技能激活卡片。

#### 3. `MemoryMiddleware`
- **源码路径**：`deepagents/middleware/memory.py`（L180–L250）
- **解决什么问题**：从持久化存储（如 `~/.deepagents/AGENTS.md` 或工作区 `AGENTS.md`）加载长期记忆与行为准则，动态拼装注入 System Prompt；针对 Anthropic 模型自动标记 `cache_control: {"type": "ephemeral"}` 保证跨轮次 Prompt 缓存命中。
- **关键配置项与真实默认值**：
  - `backend: BACKEND_TYPES`（必填）
  - `sources: list[str]`（必填，记忆文件路径列表）
  - `add_cache_control: bool = False`（在 `create_deep_agent` 中默认设为 `True`）
  - `system_prompt: str | None = MEMORY_SYSTEM_PROMPT`（必须包含 `{agent_memory}` 占位符）
- **什么时候你会需要它**：跨会话持久化用户偏好、项目级规范约束、开发准则记忆。
- **langAgent 对照**：**在用**。通过 `chinese_deep_agent.py` 注入中文长期记忆规范。

#### 4. `SubAgentMiddleware`
- **源码路径**：`deepagents/middleware/subagents.py`（L734–L800；关联配置 `SubAgent` TypedDict L36–L54）
- **解决什么问题**：为 Agent 注入同步 `task` 工具，支持在单图内声明式装配垂直领域子 Agent（如 general-purpose 编码子 Agent、researcher 调研子 Agent 等）。子 Agent 执行完毕后将内部探索过程折叠，仅向主图返回干净精炼的结论，隔离上下文。
- **关键配置项与真实默认值**：
  - `backend: BackendProtocol | BackendFactory`（必填）
  - `subagents: Sequence[SubAgent | CompiledSubAgent]`（必填，子 Agent 规范列表，必须包含 `name`, `description`, `system_prompt`, `model`, `tools`）
  - `system_prompt: str | None = TASK_SYSTEM_PROMPT`
  - `task_description: str | None = None`（自定义 `task` 工具描述，支持 `{available_agents}` 占位符）
  - `private_state_keys: frozenset[str] | None = None`
  - `state_schema: type | None = None`
- **什么时候你会需要它**：复杂多步长任务的领域拆解与上下文隔离（如主 Agent 负责规划，派发子 Agent 深入代码库检索）。
- **langAgent 对照**：**在用**。

#### 5. `AsyncSubAgentMiddleware`
- **源码路径**：`deepagents/middleware/async_subagents.py`（L868–L950；关联配置 `AsyncSubAgent` TypedDict L34–L45）
- **解决什么问题**：允许 Agent 向远程 Agent Protocol 兼容服务器（如 LangGraph Cloud、FastAPI 远程 Agent）异步派发后台任务。调用时非阻塞立即返回 Task ID，主 Agent 可继续工作并按需调用 `check_task`, `update_task`, `cancel_task`, `list_tasks` 工具。
- **关键配置项与真实默认值**：
  - `async_subagents: list[AsyncSubAgent]`（必填，每项包含 `name`, `description`, `graph_id`，可选 `url`）
  - `system_prompt: str | None = ASYNC_TASK_SYSTEM_PROMPT`
- **什么时候你会需要它**：分布式长耗时 Agent 协同（如后台持续运行数小时的自动化评测或跨夜批处理）。
- **langAgent 对照**：**未用**（langAgent 采用同步 SubAgent 与垂直子图中间件）。

#### 6. `SummarizationMiddleware` / `_DeepAgentsSummarizationMiddleware`（deepagents 增强版）
- **源码路径**：`deepagents/middleware/summarization.py`（L499–L560；关联入参裁剪配置 `TruncateArgsSettings` L173）
- **解决什么问题**：deepagents 核心上下文压缩中间件。除基于 Token 与消息数自动总结外，具备三大杀手级能力：① 自动将超长历史会话持久化**归档存盘至 Backend**；② 在提示词中保留被归档会话的追溯文件路径；③ 支持通过 `truncate_args_settings` 对旧消息中的巨大工具入参进行静默裁剪。
- **关键配置项与真实默认值**：
  - `model: str | BaseChatModel`（必填，用于总结的模型）
  - `backend: BACKEND_TYPES`（必填，历史归档存储后端）
  - `trigger: ContextSize | TriggerClause | list[...] | None = None`
  - `keep: ContextSize = ("messages", 20)`
  - `token_counter: TokenCounter = count_tokens_approximately`
  - `summary_prompt: str = DEEPAGENTS_DEFAULT_SUMMARY_PROMPT`
  - `trim_tokens_to_summarize: int | None = 4000`
  - `truncate_args_settings: TruncateArgsSettings | None = None`（如 `{"trigger": ("messages", 50), "keep": ("messages", 20), "max_length": 2000}`）
- **什么时候你会需要它**：构建超长生命周期的 Deep Coding Agent，既要杜绝上下文爆窗，又要支持用户全量追溯历史会话。
- **langAgent 对照**：**在用（核心在用）**。langAgent 派生了 `ObservedDeepAgentsSummarizationMiddleware` 在上下文压缩前后发射可观测事件。

#### 7. `SummarizationToolMiddleware`
- **源码路径**：`deepagents/middleware/summarization.py`（L1822–L1880；工厂函数 `create_summarization_tool_middleware` L1731）
- **解决什么问题**：为 Agent 注入 `compact_conversation` 工具，允许大模型在感知到历史杂乱时**主动**发起上下文总结压缩（受 50% 阈值门禁保护防止过早压缩），也可供前端 CLI 命令（如 `/compact`）手动调用。
- **关键配置项与真实默认值**：
  - `summarization: _DeepAgentsSummarizationMiddleware`（必填，关联的总结中间件实例）
  - `system_prompt: str | None = SUMMARIZATION_SYSTEM_PROMPT`
- **什么时候你会需要它**：开发交互式 CLI 工具或赋予大模型自主管理上下文窗口的决策权。
- **langAgent 对照**：**未用**（langAgent 采用自动化被动压缩策略）。

#### 8. `PatchToolCallsMiddleware`
- **源码路径**：`deepagents/middleware/patch_tool_calls.py`（L11–L47）
- **解决什么问题**：在 Agent 执行前扫描历史消息，若发现有未匹配 ToolMessage 的悬空 `tool_call`（由于并发打断、前端中断造成）或参数损坏的 `invalid_tool_call`，自动补全占位 `ToolMessage(content="...cancelled/malformed...")`，防止主流大模型 API 报 400 校验错误导致 Agent 挂死。
- **关键配置项与真实默认值**：
  - 无构造参数，纯自动化拓扑防御中间件。
- **什么时候你会需要它**：**生产级 Agent 必备**。任何存在用户手动打断、并发网络中断或流式异常的环境均需此护栏。
- **langAgent 对照**：**在用（默认装配）**。在 `create_deep_agent` 核心链中自动挂载。

#### 9. `RubricMiddleware`
- **源码路径**：`deepagents/middleware/rubric.py`（L298–L370；关联状态 `RubricState` L218）
- **解决什么问题**：提供基于 Rubric（结构化评价标准）的**自我评估与迭代打回闭环**。当调用 state 传入 `rubric` 时激活，在 Agent 生成最终输出前自动唤起 Grader 评测子 Agent；若评测不达标（`needs_revision`），将失败原因与修改建议注入历史，强制 Agent 重新迭代修正，直至达标或达到最大迭代次数。
- **关键配置项与真实默认值**：
  - `model: str | BaseChatModel`（必填，Grader 评测模型）
  - `system_prompt: str | None = None`（默认 `GRADER_SYSTEM_PROMPT`）
  - `tools: Sequence[BaseTool] | None = None`（Grader 评测时允许使用的核验工具）
  - `max_iterations: int = 3`（最大迭代轮数，硬上限 20）
  - `on_evaluation: Callable[[RubricEvaluation], None] | None = None`
- **什么时候你会需要它**：对生成质量有严苛要求的自动化场景（如专业研报生成、高精代码重构、合规文档起草）。
- **langAgent 对照**：**未用**。

#### 10. `_ToolExclusionMiddleware`（内部辅助）
- **源码路径**：`deepagents/middleware/_tool_exclusion.py`（L31–L66）
- **解决什么问题**：内部装配辅助中间件。在中间件链最末尾拦截 `ModelRequest`，根据 Harness Profile 的 `excluded_tools` 黑名单配置强行剔除特定工具，确保 LLM 绝不会看到被禁用的工具定义。
- **关键配置项**：`excluded: frozenset[str]`
- **什么时候你会需要它**：框架内部根据运行配置屏蔽部分内置工具（如在只读环境中禁用 `execute` 工具）。
- **langAgent 对照**：**框架隐式在用**。

---

### 8.4 `create_deep_agent` 默认装配拓扑与执行顺序

在 `deepagents/graph.py`（L772–L855）中，`create_deep_agent` 会将上述中间件按照严格的工程依赖顺序组装为洋葱执行链：

```
                             create_deep_agent 默认中间件装配序列
                                                                                               
  [1. TodoListMiddleware]           ──► 注入 write_todos 工具与 PlanningState                   
          │                                                                                    
  [2. SkillsMiddleware]             ──► 扫描 SKILL.md，注入技能目录列表（可选）                
          │                                                                                    
  [3. FilesystemMiddleware]         ──► 注入 ls/read/write/edit/glob/grep/execute 工具与自动存盘
          │                                                                                    
  [4. SubAgentMiddleware]           ──► 注入 task 工具与子 Agent 隔离执行环境（可选）          
          │                                                                                    
  [5. SummarizationMiddleware]      ──► 监控 Token 上限，自动历史归档与总结截断                 
          │                                                                                    
  [6. PatchToolCallsMiddleware]     ──► 自动修复悬空 tool_call，防止模型 API 报错 400          
          │                                                                                    
  [7. AsyncSubAgentMiddleware]      ──► 注入异步远程任务工具（可选）                           
          │                                                                                    
  [8. User Extra Middleware]        ──► 开发者自定义中间件（如 ToolErrorGuard, SkillActivation）
          │                                                                                    
  [9. _ToolExclusionMiddleware]     ──► 根据 Profile 过滤被禁用的工具 Schema                   
          │                                                                                    
  [10. MemoryMiddleware]            ──► 加载 AGENTS.md 注入长期记忆，设置 Anthropic Cache Breakpoint
          │                                                                                    
  [11. HumanInTheLoopMiddleware]    ──► 敏感工具调用拦截与审批（可选）                         
```

> [!TIP]
> **装配顺序精妙之处**：
> 1. `MemoryMiddleware` 位于用户中间件之后、HITL 之前：确保动态记忆内容变化不会破坏 Anthropic 静态提示词前缀的 Prompt Cache。
> 2. `PatchToolCallsMiddleware` 位于 `Summarization` 之后：确保即使历史消息被总结裁剪，悬空的工具调用也能被及时修补。

---

### 8.5 框架学习路径建议：3 个扩展点覆盖 80% 定制场景

对于希望高效掌握 LangGraph / deepagents 扩展体系的开发者，切忌平均用力。只需优先攻克以下 **3 个核心扩展点**，即可满足 80% 以上的企业级深度定制场景：

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 80/20 核心扩展点掌握路径决策树                                   │
│                                                                                                  │
│  你的定制诉求是什么？                                                                            │
│    │                                                                                             │
│    ├─► 诉求 A: 只读监听、耗时度量、Token 打字机流式、提取思考过程 (Reasoning)                     │
│    │     └──► 【扩展点 1】: 实现 AsyncCallbackHandler                                            │
│    │            • 核心钩子: on_chat_model_start, on_llm_new_token, adispatch_custom_event        │
│    │            • 优势: 零侵入、不干扰图执行逻辑、天然作为 astream_events 底层事件源             │
│    │                                                                                             │
│    ├─► 诉求 B: 工具拦截、沙箱超时熔断兜底、动态技能卡片发射、垂直子图隔离与状态同步              │
│    │     └──► 【扩展点 2】: 实现 AgentMiddleware.awrap_tool_call                                 │
│    │            • 核心能力: try-catch 拦截异常返回 ToolMessage、Command 状态原子回写             │
│    │            • 优势: 完全掌控工具执行流，支持短路、重试与跨图状态同步                         │
│    │                                                                                             │
│    └─► 诉求 C: 动态提示词注入（SystemPrompt 拼装）、多轮持久记忆、长会话防爆窗治理               │
│          └──► 【扩展点 3】: 实现 AgentMiddleware.wrap_model_call + state_schema                  │
│                 • 核心能力: request.override(system_message=...)、扩展私有 TypedDict State       │
│                 • 优势: 在模型推理前拦截并重塑 Prompt，掌控 Agent 认知与上下文生命周期           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. 扩展点 1：`AsyncCallbackHandler`（只读事件观察与旁路流式推送）
- **核心契约**：`on_chat_model_start`、`on_llm_new_token`、`on_tool_start`、`on_tool_end` 及 `adispatch_custom_event`。
- **典型定制场景**：
  - 流式打字机与思考链提取（如 `ReasoningCallbackHandler` 解析 `<think>` 标签并实时推流）。
  - 第三方链路追踪集成（如 `OpikTracer` 监听 Run 生命周期并上报度量）。
  - 旁路数据提取（如报告生成 Handler 拦截 Token 发射专用 SSE 事件）。
- **实战法则**：永远保持 Callback 只读，严禁在 Handler 中抛出阻断性业务异常或尝试篡改输出。

#### 2. 扩展点 2：`AgentMiddleware.awrap_tool_call`（工具执行环绕拦截与状态同步）
- **核心契约**：接收 `ToolCallRequest`，在 `handler(request)` 前后执行拦截逻辑，返回 `ToolMessage` 或 `Command(update=...)`。
- **典型定制场景**：
  - 沙箱异常熔断兜底（如 `ToolErrorGuardMiddleware` 捕获沙箱超时异常转化为 `status="error"` 的 `ToolMessage`）。
  - 动态技能激活感知（如 `SkillActivationMiddleware` 拦截 `read_file` 命中 `SKILL.md` 时发射活动卡片）。
  - 垂直子图路由隔离（如 `SubgraphToolMiddleware` 拦截垂直业务图调用，深拷贝隔离执行并原子合并状态）。
- **实战法则**：工具拦截器必须保证始终返回与 `tool_call_id` 匹配的 `ToolMessage`，杜绝悬空破坏消息血缘。

#### 3. 扩展点 3：`AgentMiddleware.wrap_model_call` / `awrap_model_call` + `state_schema`（动态上下文与状态治理）
- **核心契约**：接收 `ModelRequest`，在调用底层模型前通过 `request.override(...)` 动态修改 `system_message`、`tools` 或 `messages`；声明 `state_schema` 扩展私有状态字段。
- **典型定制场景**：
  - 领域上下文动态注入（如 `FileContextInjectionMiddleware` / `RAGContextMiddleware` 注入当前激活文件与检索文档）。
  - 跨轮次持久化记忆加载（如 `MemoryMiddleware` 读取 `AGENTS.md` 并拼装 Prompt）。
  - 长上下文防爆窗治理（如 `SummarizationMiddleware` / `ContextEditingMiddleware` 实现智能总结与修剪）。
- **实战法则**：修改 `system_message` 时注意 Prompt 缓存边界，避免在静态前缀中间频繁插入动态内容导致缓存失效。

