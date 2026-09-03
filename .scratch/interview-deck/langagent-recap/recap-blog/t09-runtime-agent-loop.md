# 平台 Runtime 与 Agent Loop：动态图编译、ReAct 闭环与协议引擎

> **本章定位**：作为全篇工程复现的运行时底座，本章深入剖析 `langAgent` 的通用 Dynamic Agent 架构。系统阐述从客户端请求进入、强类型配置解析、基于哈希的动态图编译与 LRU 缓存，到 ReAct 循环调度、工具/子图边界划分、10 级中间件流水线、AG-UI 协议适配、多模态 RAG 接入、双格式思考流提取，以及客户端断连感知与两阶段延迟状态回滚的完整生命周期。
>
> **代码与事实基线**：
> - 运行与版本基线：`develop` Reference Worktree (`.scratch/langagent-develop-reference`)
> - 核心依赖锁定：`deepagents 0.6.12`、`langgraph 1.2.8`、`ag-ui-protocol 0.1.19`、`ag-ui-langgraph 0.0.42`、`copilotkit 0.1.94`
> - 白板复现代码：[runtime_agent_loop.py](../recap-code/core/runtime_agent_loop.py)

---

## 1. 平台定位与架构全景蓝图

在企业级 AI 应用平台中，单一预设的 Agent 拓扑往往难以同时应对轻量交互式问答、多模态知识库检索、复杂数据分析（ChatBI/可视化）与沙箱深度长任务。`langAgent` 平台在架构设计上确立了**双执行面、统一协议底座**的平台蓝图：

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     langAgent 平台运行时架构全景                                   │
│                                                                                                  │
│  [ 前端客户端 / 管理端 ] ──── (HTTP POST / SSE 流式长连接: /react-agent/stream & /react-agent/blocking) │
│                                                │                                                 │
│                                                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. 传输与接入层 (Streaming / Blocking API & Disconnect Watcher)                              │  │
│  │    - Starlette 0.52+ 断连感知监听器 (with_disconnect_watcher 独立协程轮询)                     │  │
│  │    - 请求元数据提取与 Opik 分布式追踪注入 (RunnableConfig["callbacks"])                      │  │
│  └─────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                                │                                                 │
│                                                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. 配置解析与动态图编译层 (Dynamic Graph Compilation & LRU Cache)                            │  │
│  │    - AgentConfig 强类型 Pydantic 解析与动态校验                                              │  │
│  │    - AgentRegistry: 基于 MD5(AgentConfig) 的进程级 LRU 编译缓存 (容量 128)                   │  │
│  │    - Nacos 动态配置监听与 PromptProxy 内存代理 (实现提示词热更与编译缓存解耦)                  │  │
│  └─────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                                │                                                 │
│                                                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. 核心执行面分工 (Dual Execution Runtimes)                                                │  │
│  │                                                                                            │  │
│  │  【通用 Dynamic Agent 执行面】 (本章主干)         【Long Task Agent 执行面】 (第 3 章展开)     │  │
│  │  • 架构: LangGraph StateGraph ReAct 闭环          • 架构: deepagents + Daytona 沙箱隔离环境  │  │
│  │  • 状态: MainAgentState + add_messages Reducer    • 治理: Workspace 租约与 Artifact 外化回灌   │  │
│  │  • 路由: 条件边分流 (ToolNode vs 业务子图)        • 机制: 上下文自动压缩、长记忆与技能动态装载 │  │
│  └─────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                                │                                                 │
│                                                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. 协议适配与 10 级中间件流水线 (AG-UI Protocol Pipeline)                                   │  │
│  │    - 消费 LangGraph astream_events 事件流                                                  │  │
│  │    - 10 级中间件: 工具名翻译 ➔ 快照修复 ➔ 活动注入 ➔ 问询遮蔽 ➔ 子图结果桥接 ➔ 来源广播 ➔ 旁路度量  │  │
│  │    - 异常保活流: 自动补发 STEP_FINISHED + RUN_ERROR + RUN_FINISHED 保证连接确定性闭合          │  │
│  │    - 韧性保证: SQLite 两阶段延迟状态回滚 (_pending_rollbacks 规避异步死锁)                   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 通用 Dynamic Agent 与 Long Task Agent 的职责边界

平台将复杂的业务场景严格划分为两套执行面，避免用单一机制强行覆盖所有负载：
1. **通用 Dynamic Agent（本章核心）**：
   - **定位**：承载开放式多轮对话、实时工具调用、知识库多模态检索与交互式轻量业务子图（如 ChatBI 取数、AntV 图表渲染、交互式报告草稿编辑、Ask User 人机协同）。
   - **运行特征**：基于 LangGraph `StateGraph` 构建，面向即时对话与交互式编排，依托进程内存与持久化 Checkpointer 维护状态，通过动态编译实现千人千面的 Agent 能力组装。
2. **Long Task Agent（后续章节展开）**：
   - **定位**：承载代码生成与执行、多步骤复杂研究、超长会话处理与批量文件分析。
   - **运行特征**：基于 `deepagents` 框架构建，依托 Daytona 容器沙箱提供 OS 级别的安全隔离执行环境，集成自动上下文压缩、多级命名空间长期记忆与文件产物持久化外化机制。

---

## 2. 端到端生命周期：从请求进入到事件收尾

一次通用 Dynamic Agent 请求的完整执行流线包含 8 个关键阶段，构成了确定性的执行拓扑：

```
[客户端请求: /react-agent/stream 或 /react-agent/blocking]
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 1. 路由接入与断连监听 (agent_routers.py & streaming_disconnect.py)│
│    - 解析 ChartAgentRunInput (thread_id, run_id, messages)     │
│    - with_disconnect_watcher 启动独立任务轮询 is_disconnected()  │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. 配置构建与校验 (AgentService.build_agent_config)            │
│    - 解析 MCP 工具、知识库配置、ChatBI/Report 配置               │
│    - process_uploaded_files 解析上传文件生成 file_context      │
│    - 生成强类型 AgentConfig Pydantic 对象                      │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. 动态图编译与 LRU 缓存获取 (AgentRegistry.get_or_build)       │
│    - 计算 config_hash = MD5(AgentConfig.model_dump_json())     │
│    - 命中缓存直接返回；未命中则调用 DynamicAgentFactory.build() │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 4. 延迟回滚检查与实例包装 (AgentService.create_agent)          │
│    - 检查 _pending_rollbacks[thread_id]，存在则执行状态回滚      │
│    - 实例化 LangGraphAGUIAgent，注入 Opik Tracer 到 callbacks   │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 5. LangGraph ReAct 状态循环执行 (Dynamic ReAct Loop)           │
│    - START ──► agent 节点 (调用 LLM 生成流式 AIMessageChunk)     │
│    - 条件路由 route(state): 检查 tool_calls 首个工具名称        │
│      ├── tool_executor (ToolNode 并发执行 MCP/RAG/内置工具)      │
│      ├── visualization_subgraph (AntVChart 图表生成子图)       │
│      ├── chatbi_subgraph (SQL 生成与自检纠错子图)                │
│      ├── report_subgraph (报告管理与草案隔离子图)                │
│      └── END (无工具调用，输出文本并终止)                       │
│    - 各工具/子图节点执行后输出 ToolMessage，回边到 agent 节点    │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 6. 状态合并与 Checkpoint 持久化 (LangGraph 原生机制)           │
│    - add_messages Reducer 基于 message.id 智能合并消息          │
│    - 节点步骤推进时向 Checkpointer (SQLite) 提交快照           │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 7. 协议适配与 10 级中间件流水线 (AgentService.generate_events)   │
│    - 拦截原始图事件，经过 10 项中间件转译、修复、脱敏、注入与度量│
└────────────────────────┬───────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│ 8a. 流式 SSE 分支       │   │ 8b. Blocking 聚合分支    │
│ EventEncoder 序列化输出 │   │ BlockingEventAggregator  │
│ 持续监听客户端断开      │   │ 内存聚合为 JSON 响应     │
└─────────────────────────┘   └──────────────────────────┘
```

---

## 3. 核心机制设计与工程决策插叙

### 3.1 决策插叙一：动态图编译缓存与 System Prompt 热更新解耦

#### 触发场景与问题定义
在平台设计初期，每个 Agent 的能力配置（挂载的 MCP 工具列表、是否启用 ChatBI/可视化子图、模型参数、提示词）均支持在管理端灵活调整。如果每次对话请求都全量调用 LangGraph 的 `StateGraph.compile()` 构建图实例，在高频请求下会引入不必要的图编译 CPU 开销与内存对象分配抖动。反之，如果直接按 `agent_id` 缓存编译图，当用户在后台调整了配置或更新了 Prompt 时，存量缓存会导致新配置无法生效。

#### 方案评估与权衡
- **候选方案 A（全局单例图 + 动态全局路由）**：维护一张包含所有可能节点与工具的巨大静态图，在运行时通过 State 动态控制分支跳过。
  - *代价*：图拓扑臃肿，大量无用工具 Schema 暴露给大模型，严重分散模型的注意力并增加幻觉概率。
- **候选方案 B（进程级 AgentRegistry MD5 哈希 LRU 缓存）**：以 `agent_id + MD5(AgentConfig.model_dump_json())` 作为缓存 Key，维护容量为 128 的 `OrderedDict` LRU 缓存。相同配置的会话共享编译图；配置变更时自然命中不同 Key 触发新图编译，旧图按容量上限自然淘汰。
- **配置热更新解耦（PromptProxy 机制）**：将静态的图拓扑编译与高频的提示词更新解耦。System Prompt 模板由 `src/server/config/system_prompts.py` 中的 `PromptProxy` 代理托管。

```
                    PromptProxy 提示词动态代理与图缓存解耦拓扑
                    
┌──────────────────────┐         Nacos 配置变更推送 (add_listener)
│ Nacos 配置中心       │ ──────────────────────────────────────┐
└──────────────────────┘                                       │
                                                               ▼
┌──────────────────────┐   MD5(AgentConfig)    ┌───────────────────────────────┐
│ AgentRegistry        │ ◄──────────────────── │ 模块级内存字典 _prompts_cache  │
│ (LRU 128 编译缓存)   │                       └───────────────┬───────────────┘
└──────────┬───────────┘                                       │ __str__() / format()
           │ 共享 CompiledStateGraph                           ▼
           ▼                                   ┌───────────────────────────────┐
┌──────────────────────┐                       │ PromptProxy 动态取值代理      │
│ LangGraph 执行实例   │ ◄─────────────────────│ (在 agent_node 组装 Prompt 时) │
└──────────────────────┘                       └───────────────────────────────┘
```

#### 落地结果与演进边界
- **当前落地事实 (`FACT-RT-002`, `FACT-RT-011`, `ORAL-T08-RT-002`, `ORAL-T08-RT-003`)**：
  - `AgentRegistry` 在进程内实现了最大容量 128 的 LRU 图编译缓存。
  - `NacosConfigProvider` 注册了监听器并在收到推送时更新 `_prompts_cache`；`PromptProxy` 在每次 `agent_node` 组装 Prompt 时动态读取最新内容。提示词热更新完全在进程内生效，无需重新哈希或重建编译图。
- **架构演进说明与面试建议 (`WRITING-NOTE-T08-RT-001`)**：
  - *当前实现边界*：当前系统主要面向企业私有化部署，未按多 Pod/多 Worker 分布式集群设计，图编译缓存为各计算节点进程内独立 LRU（无跨实例广播）。
  - *面试追问扩展*：在多实例/分布式部署演进中，建议将配置版本号（或全局唯一 Hash）下发至网关层作为缓存失效边界，或引入集中式发布订阅广播（如 Redis Pub/Sub）通知各 Pod 显式调用 `AgentRegistry.invalidate(agent_id)`。

---

### 3.2 决策插叙二：State 架构、Reducer 稳定性修复与子图状态隔离

#### 消息 Reducer 的历史缺陷与修复 (`FACT-RT-003`)
在 `src/agent/core/state.py` 中，主状态 `MainAgentState` 定义如下：

```python
class MainAgentState(TypedDict):
    # 消息历史（核心字段，使用 LangGraph 原生 add_messages Reducer）
    messages: Annotated[List[BaseMessage], add_messages]
    
    # 运行时动态注入字段
    user_input: NotRequired[str]
    final_response: NotRequired[str]
    user_hint: NotRequired[str]
    visualization_result: NotRequired[Optional[Dict[str, Any]]]
    chatbi_config: NotRequired[Dict[str, Any]]
    llm_config: NotRequired[Dict[str, Any]]
    quote_enable: NotRequired[bool]
    thread_id: NotRequired[str]
    run_id: NotRequired[str]
    text_edit_request: NotRequired[Dict[str, Any]]
```

- **历史缺陷与演进（早期覆盖型 Reducer）**：早期版本曾使用自定义覆盖型 `lambda x, y: x + y` 作为消息 Reducer。当底层存在并发工具返回，或者嵌套子图完成计算向主图回写 `ToolMessage` 时，简单的列表相加容易导致相同 ID 的消息重复追加，或者在状态重放时发生消息乱序与丢失。
- **当前实现**：采用 LangGraph 原生 `add_messages` Reducer。其内部基于 `message.id` 建立映射：相同 ID 更新内容，新 ID 追加列表，`RemoveMessage(id=...)` 执行物理剔除，确保了多轮对话与子图状态合并的幂等性。

#### 子图领域状态隔离原则
为了防止子图内部细节污染主 ReAct 循环的上下文，系统对业务子图状态进行了严格分层隔离：
1. **VisualizationState 隔离**：仅包含信封 ID `id` 与私有缓存 `_envelope`，生成的图表 spec 挂在根层级供 `AntVChart` 解析，不将图表配置塞入 `messages`。
2. **ReportState 隔离**：报告专员子图内部的 `report_draft`（正文可能达 3000+ 字）仅在子图节点流转与持久化，向主图仅回传轻量状态回执，防止巨大长文撑爆主模型上下文窗口。

---

### 3.3 决策插叙三：工具系统分类学与 Subgraph-as-Tool 架构边界

#### 工具系统 4 层分类学 (`FACT-TOOL-003`)
系统将所有可执行能力严格划分为 4 个层级，由编译器进行统一分类与路由编排：

| 层级 | 工具类型 | 代表实例 | 挂载与注册方式 | 运行时执行载体 | 状态可见性与回边机制 |
|---|---|---|---|---|---|
| **1** | **本地内置工具** | `file_download`<br>`manage_envelope`<br>`render_inline_html` | `direct_execution_tools.append()` 注入 | 主图 `ToolNode(tool_executor)` 统一执行 | 生成 `ToolMessage` 回写主图 `messages`，回边到 `agent` |
| **2** | **动态 MCP 工具** | 外部第三方 API 工具 | `ToolManager.create_mcp_tool()` 动态生成 `StructuredTool` | `MCPClientManager` 经 HTTP/SSE 远程调用 | 生成 `ToolMessage` 回写主图，执行日志参数脱敏 |
| **3** | **知识与交互工具** | `search_knowledge_base`<br>`ask_user` | `create_rag_tool()`<br>`create_ask_user_tool()` | `ToolNode` 执行；`ask_user` 内部触发 `interrupt()` | RAG 附带 `artifact=sources`；`ask_user` 挂起线程 |
| **4** | **业务子图入口 Schema** | `visualize`<br>`chatbi_text2sql`<br>`manage_report` | `@tool` 仅作为暴露给 LLM 的决策契约，**不包含本地函数体** | 主图条件路由 `route()` 拦截分流至独立 Compiled 子图节点 | 子图内部维护独立领域状态机，完成后回传 `ToolMessage` 并回边 |

#### Subgraph-as-Tool 核心设计考量
为什么不把 ChatBI 或 Visualization 直接写成普通 Python 函数在 `ToolNode` 中执行？
1. **复杂状态机需求**：ChatBI 包含 Query 改写、DDL 获取、M-Schema 组装、SQL 生成、自检试执行与纠错（多节点 DAG 或 ReAct Loop）；Visualization 包含 Spec 生成、Schema 校验、重试提示词回填（最多 2 次重试）。普通 Tool 无法内嵌 LangGraph 状态机与独立的条件重试边。
2. **上下文隔离**：子图内部可以拥有专属的 System Prompt、专属的 LLM 参数配置（如 Visualization 关闭流式且 `temperature=0.1`），并且中间探索消息不会暴露给主模型。
3. **协议暴露统一**：通过将子图入口包装为标准的 `@tool` Schema 暴露给大模型，使大模型能够用统一的 Function Calling 机制进行决策，而主图编译器在条件边拦截该调用分流至独立子图节点，实现了决策契约与执行载体的优雅分离。

---

### 3.4 决策插叙四：Tool ID 透传演进——从原地篡改到旁路统计

#### 演进对比 (`DESIGN-AGUI-001`, `FACT-TOOL-006`, `DELTA-RT-001`)
- **原始设计意图 (`DESIGN-AGUI-001`, 已废弃)**：早期 PRD 规划了 `ToolIDRewriter` 中间件，试图在 SSE 事件流编码前拦截事件，原地篡改 `tool_call_id` 与 `tool_call_name`，按 `BUILTIN_AGGREGATION_RULES` 执行 1:N 工具宏观聚合。
- **发现问题**：LangGraph 内部严格依赖 `tool_call_id` 与 `ToolMessage.tool_call_id` 的配对一致性。在流式传输层原地篡改 ID 会破坏协议层的消息血缘，导致后续多轮对话或状态回放时找不到对应的工具调用。
- **当前落地实现 (`FACT-TOOL-006`, `implemented`)**：废弃 `ToolIDRewriter`，引入 `ToolStatisticsCollector`。源码明确声明：*“不修改任何 tool_call_id 或 tool_call_name，保持 LangGraph 原生值不变，通过'旁路通知'而非'原地篡改'提供前端所需的业务映射信息”*。在收到 `RUN_FINISHED` 之前，向前端发送一个包含全量工具调用元数据的 `tool_usage` CustomEvent，彻底解耦了运行时内部调度与前端业务统计。

---

### 3.5 具体失败与边界路径剖析：多 ToolCall 路由边界缺陷

在对主线源码（`src/agent/factory/agent_factory.py#L653`）与测试用例（`tests/test_multi_tool_calls.py`）的严格审计中，确认了当前主图条件路由在处理多工具调用时存在一处**已证实的设计边界与缺陷（Verified Boundary Defect）**。

#### 路由控制流源码落点
```python
def route(state: MainAgentState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return END

    last_msg = messages[-1]
    if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
        return END

    # ⚠️ 关键缺陷落点：无条件仅检查首个工具调用
    tool_name = last_msg.tool_calls[0]["name"]

    if tool_name in builtin_routes:
        return builtin_routes[tool_name]

    if direct_execution_tools and tool_name in {t.name for t in direct_execution_tools}:
        return "tool_executor"

    return END
```

#### Happy Path vs Non-Happy Path 行为差异追踪

```
【场景 1：纯普通工具调用 (Happy Path)】
LLM 返回: tool_calls = [search_knowledge_base, search_weather]
  │
  ├─► route() 检查 tool_calls[0] ("search_knowledge_base") ──► 路由命中 "tool_executor"
  │
  └─► ToolNode(tool_executor) 接收整个 AIMessage:
        - 内部调用 parse_input 提取全部 2 个 tool_calls
        - 使用 asyncio.gather(*coros) 并发执行全部工具
        - 返回 2 个 ToolMessage 回写 messages ──► ✅ 两个工具均正确并发执行！

【场景 2：混合调用 (Defect Path / Non-Happy Path)】
LLM 返回: tool_calls = [visualize, search_weather]
  │
  ├─► route() 检查 tool_calls[0] ("visualize") ──► 路由命中 "visualization_subgraph"
  │
  └─► visualization_subgraph 节点执行:
        - 子图仅识别并处理自身的 visualize 领域逻辑
        - 执行完毕输出 1 个可视化 ToolMessage 回边到 agent 节点
        - ❌ 结果: search_weather 工具调用被静默丢弃，从未被任何执行器消费！
```

> **测试基线说明**：`tests/test_multi_tool_calls.py` 记录了针对该缺陷的代码模拟与单点分析，证明了底层 `ToolNode` 具备并发能力，但主图路由结构限制了跨子图混合调用的正确分发。

---

### 3.6 动态 MCP 客户端容错与技术债

#### 参数反序列化容错与日志脱敏 (`FACT-TOOL-001`, `FACT-TOOL-002`)
在 `src/agent/core/tool_manager.py` 中，动态 MCP 工具的 Schema 由 JSON Schema 动态生成。
- **容错基类 `_JsonCoercingBaseModel`**：Qwen 等大模型在生成工具入参时，极易将嵌套对象（如 `customFilter`）或数组序列化为 JSON 字符串。Pydantic v2 默认会抛出类型校验异常。系统在动态创建 Pydantic 模型时注入了前置校验器：
  ```python
  @model_validator(mode='before')
  @classmethod
  def _coerce_json_strings(cls, data: Any) -> Any:
      if not isinstance(data, dict):
          return data
      for key, value in data.items():
          if isinstance(value, str) and value.strip() and value.strip()[0] in ('[', '{'):
              try:
                  data[key] = json.loads(value)
              except Exception:
                  pass
      return data
  ```
- **日志安全脱敏**：`_mask_args_for_log` 针对字符串参数统一执行 `ab***yz` 脱敏，防止敏感数据或认证 Key 泄露至日志。

#### MCP 客户端实现技术债 (`FACT-TOOL-004`)
在 `src/agent/core/mcp_client.py#L43-L104` 中存在两项明确的技术债：
1. **超时未主动强制拦截（Unenforced Timeout）**：`execute_tool()` 接收 `timeout: int = 30` 参数并捕获 `asyncio.TimeoutError`，但底层在调用 `fastmcp` 的 `client.call_tool` 时未传递该参数，亦未通过 `asyncio.wait_for(..., timeout=timeout)` 进行包裹，实际调用受底层 HTTP 连接自身的默认超时制约。
2. **连接池复用未启用**：虽然定义了 `_clients` 字典，但每次调用均通过 `async with Client(StreamableHttpTransport(...)):` 重新建立连接。

---

### 3.7 多模态 RAG 检索与上下文注入机制

系统构建了两条互不干扰的知识与文件接入通路：

```
                              多模态知识检索与文件注入流
                              
   【上传文件动态注入】                                 【RAG 多模态知识检索】
   file_service.process_uploaded_files                 rag_tool: search_knowledge_base
            │                                                    │
            ▼ (解析为文本)                                        ├─► 文本库检索 (text_task)
   file_context                                                  ├─► 图片库检索 (image_task)
            │                                                    │    (asyncio.gather 并发)
            ▼                                                    ▼
   动态构造为临时 HumanMessage                          Reciprocal Rank Fusion (RRF) 融合排序
   (注入在历史消息之前，不存入 Checkpointer)                             │
            │                                                    ▼ (针对 image 结果)
            ▼                                           按需获取临时 URL 并调用 VL 视觉模型解析
   当前轮次 LLM 可见，持久化 DB 零膨胀                                     │
                                                                 ▼
                                                        返回 ToolMessage(content=文本摘要,
                                                                         artifact=sources)
                                                                 │
                                                                 ▼ (中间件拦截)
                                                        RAGSourceCollector 广播 rag_sources 事件
```

1. **RAG 多模态并发与 RRF 融合 (`FACT-TOOL-005`)**：
   - 文本与图片知识库通过 `asyncio.gather(text_task, image_task, return_exceptions=True)` 并发检索。
   - 检索结果通过 RRF（Reciprocal Rank Fusion）算法融合排序。
   - 图片类文档通过 `file_service.fetch_public_url_by_object_key` 获取临时签名 URL，并调用 VL 视觉多模态大模型解析图片细节补充为文本。
   - 检索来源元数据放入 `ToolMessage.artifact=sources` 中，由 `RAGSourceCollector` 中间件拦截并在收尾时广播至前端，避免元数据直接堆砌在 LLM Prompt 中。
2. **上传文件动态注入 (`FACT-RT-005`)**：
   - 上传文件解析生成的 `file_context` 在 `agent_node` 组装 Prompt 时作为临时 `HumanMessage` 动态拼接。**该消息不写入 Checkpointer**，既确保了当前轮次模型可见，又防止了持久化数据库体积无限膨胀。

---

### 3.8 Reasoning 思考流双格式提取与闭合时机检测

在 `src/agent/factory/reasoning_handler.py` 中，`ReasoningCallbackHandler` 实现了模型流式思考内容的自适应提取：
1. **双格式自适应提取 (`FACT-RT-006`)**：
   - **Format A（标准字段）**：从 Chunk 的 `additional_kwargs` 提取 `reasoning_content`、`thinking_content` 或 `thinking`（适配 DeepSeek 等标准输出）。
   - **Format B（标签解析）**：通过正则匹配 `content` 中的 `<think>...</think>` 标签，流式提取标签内文本。
2. **思考框闭合检测机制**：
   - 当检测到首次出现有效思考内容时，发射 `copilotkit_reasoning_start` 与 `copilotkit_reasoning_message_start` 事件。
   - **关键闭合时机**：当收到无 reasoning delta 但具有实际正文 `content` 的 chunk 时，立即发射 `copilotkit_reasoning_message_end` 与 `copilotkit_reasoning_end`，确保前端思考卡片在正文流式输出前精准闭合。

---

### 3.9 LangGraph Checkpoint 与 Interrupt 框架底层语义下钻

基于锁定版本 `langgraph 1.2.8` 框架源码，平台实现了清晰的状态持久化与中断恢复体系：
- **Checkpointer 绑定与存储事实 (`ORAL-T08-RT-001`, `FACT-RT-010`)**：
  - 运行时通过 `RunnableConfig["configurable"]["thread_id"]` 与 Checkpointer 建立线程隔离的状态版本映射。
  - *生产存储事实*：线上实际部署使用 `SqliteSaver`（SQLite Checkpointer）；后端另行维护一套保存其业务数据的独立数据库，二者完全解耦。切换 PostgreSQL Checkpointer 的方案处于规划阶段。
- **Interrupt 与 Resume 机制**：
  - 当节点调用 `interrupt(value)`（如 Ask User 或不可逆确认）时，LangGraph 内部抛出 `GraphInterrupt` 异常。
  - Pregel 调度循环捕获该异常后，自动将当前状态快照提交至 Checkpointer 并正常退出。
  - 前端恢复时，向同一 `thread_id` 发起运行并携带 `Command(resume=answer)`，运行时将恢复值回传给中断点并继续推进。
- **状态终态操作的三种语义分离**：
  1. **正常完成（Normal Complete）**：推进至 `END` 节点，Checkpointer 写入最终完整状态。
  2. **业务中断（Business Interrupt）**：触发 `interrupt()` 保存中断快照，等待 `Command(resume=...)` 唤醒。
  3. **取消延迟回滚（Cancelled Delayed Rollback）**：客户端异常退出，由传输层记录并在下次进入时调用 `aupdate_state(pre_run_config, as_node=END)` 分叉回滚，三者语义互不混淆。

---

### 3.10 网络断连感知与两阶段 Checkpoint 延迟回滚

#### Starlette 0.52+ 断连失效与独立轮询 (`FACT-RT-007`)
- **背景**：Starlette 0.52.1 的 `StreamingResponse` 在 ASGI spec_version $\ge 2.4$ 时不再主动启动 `listen_for_disconnect` 任务，仅依赖 `send()` 抛出 `OSError` 来感知断开。在大模型长推理期间（无数据 yield），底层断开永远无法冒泡至生成器，导致后台计算资源悬挂且锁无法释放。
- **设计实现**：在 `src/server/utils/streaming_disconnect.py` 中实现 `with_disconnect_watcher`，利用 `anyio.create_task_group` 启动独立的轮询任务定期检查 `request.is_disconnected()`。一旦检测到断连，立即向生成器注入 `asyncio.CancelledError`，促使协程安全退出并执行清理逻辑（`tests/test_streaming_disconnect.py` 验证）。

#### 两阶段 Checkpoint 延迟回滚机制 (`FACT-RT-008`)
当长流被取消或异常中断时，如果直接在 Async Generator 的 `finally` 块中 `await graph.aupdate_state()`，由于当前事件循环与 SQLite 连接池竞争，极易引发死锁。

```
              两阶段 Checkpoint 延迟回滚时序
              
【第 1 阶段：流异常中断 / 客户端取消】
  生成器捕捉到 CancelledError 或未捕获异常
  进入 finally 块:
    ❌ 不在此处直接 await aupdate_state (避免 SQLite 死锁)
    ✅ 仅在全局字典中记录: _pending_rollbacks[thread_id] = pre_run_checkpoint_config
  正常关闭本次 HTTP 连接

【第 2 阶段：同会话下次请求进入】
  AgentService.generate_events() 启动
    1. 检查 thread_id 是否存在于 _pending_rollbacks
    2. 若存在，弹出配置并执行 _rollback_checkpoint_on_cancel:
       - 已有 Checkpoint: aupdate_state(pre_run_config, values=None, as_node=END)
         (从 run 开始前的历史快照创建全新分支，清除悬挂任务)
       - 新线程: 执行 aupdate_state(config, [RemoveMessage(id=...)]) 物理清理
    3. 回滚完成后，再开始编译图并执行当前新请求
```

---

## 4. AG-UI 协议层与 10 级中间件流水线

在 `src/server/services/agent_service.py` 中，底层 LangGraph 事件经过 10 级专用中间件的处理，转化为符合前端渲染契约的 AG-UI 标准事件流（`FACT-AGUI-001`）：

```
[LangGraph astream_events 事件]
             │
             ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 10 级中间件流水线 (AgentService.generate_events)                         │
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

### 4.1 异常保活流机制（Fault-Tolerant Stream Closing）
若在中间件或图执行过程中发生未捕获异常，`generate_events` 会确定性触发异常恢复流：
1. **补发 `StepFinishedEvent`**：闭合当前未结束的 step，防止前端步骤卡片一直处于 loading 状态。
2. **发送 `RunErrorEvent`**：携带结构化错误信息。
3. **强制发送 `RunFinishedEvent`**：显式通知前端与网关连接正常关闭，防止客户端悬挂。

### 4.2 Streaming 与 Blocking 双模同源聚合 (`FACT-AGUI-002`)
- **同源性保证**：无论是流式接口还是阻塞式接口，底层**完全共享**同一套 `generate_events()` 事件生成与中间件流水线。
- **BlockingEventAggregator 聚合逻辑**：
  - 拼接 `TEXT_MESSAGE_CONTENT` 为完整输出；若缺失结束事件，降级从 `MessagesSnapshotEvent` 提取。
  - 解析 `TOOL_CALL_ARGS` 为结构化参数字典；若工具执行失败则标记 `tool_call.status="failed"`。
  - 解析 `rag_sources`、`tool_usage` 等自定义事件注入为响应中的结构化字段。

---

## 5. 原始材料核对与证据索引清单

本章内容均基于对项目源码、测试用例、设计文档与框架锁版本的独立阅读与核验：

### 5.1 核心源码落点 (`develop` Reference Worktree)
- `src/agent/factory/agent_factory.py#L265-L728`：`DynamicAgentFactory.build()` 动态图编译与条件边路由装配。
- `src/agent/factory/agent_registry.py#L22-L100`：`AgentRegistry` 基于 MD5 的 LRU 128 编译缓存。
- `src/agent/core/state.py#L170-L231`：`MainAgentState` 与 `add_messages` 消息合并 Reducer。
- `src/agent/core/tool_manager.py#L26-L335`：`_create_args_schema`、`_JsonCoercingBaseModel` 参数容错与日志脱敏。
- `src/agent/core/mcp_client.py#L43-L104`：`MCPClientManager` 客户端实现与超时技术债。
- `src/agent/tools/rag_tool.py#L36-L144`：`search_knowledge_base` 文本/图片两路并发检索、RRF 融合与 VL 解析。
- `src/agent/factory/reasoning_handler.py#L21-L150`：`ReasoningCallbackHandler` 思考流双格式提取与闭合检测。
- `src/server/services/agent_service.py#L51-L118, L271-L600`：10 级中间件流水线、延迟回滚与异常保活流。
- `src/server/services/agent_blocking_aggregator.py#L49-L350`：`BlockingEventAggregator` 内存聚合器。
- `src/server/utils/streaming_disconnect.py#L31-L67`：`with_disconnect_watcher` 客户端断连轮询。
- `src/server/config/nacos_provider.py#L80-L177` & `system_prompts.py#L12-L47`：Nacos 监听与 `PromptProxy` 动态提示词代理。

### 5.2 核心自动化测试落点
- `tests/test_multi_tool_calls.py`：多工具并发与子图路由边界模拟分析。
- `tests/test_tool_call_args.py`：MCP 参数校验、JSON 字符串强转与脱敏断言。
- `tests/test_agent_generate_events.py`：10 级中间件流水线与事件流断言。
- `tests/test_agent_blocking_aggregator.py` & `test_agent_blocking_endpoint.py`：Blocking 模式聚合断言。
- `tests/test_streaming_disconnect.py`：断连取消信号传播与协程回收断言。
- `tests/test_http_headers.py`：`Content-Disposition` 响应头 RFC 5987 编码断言。

### 5.3 框架源码与设计契约索引
- `.scratch/langagent-framework-sources/langgraph/`（`1.2.8`）：`StateGraph`、`ToolNode`、`interrupt()` 与 `add_messages` 语义。
- `.scratch/langagent-framework-sources/ag_ui/`（`0.1.19`）：AG-UI 协议事件定义与 `EventEncoder`。
- `docs/docs/ag_ui与langgraph messages融合策略.md` & `tool_id.prd.md`：设计意图与演进对比基线。
