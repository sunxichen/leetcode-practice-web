# Ticket 02 专题审计报告：平台 Runtime、动态图编排、工具系统与 AG-UI 协议 (Deep Audit Brief)

> **审计范围**：通用 Dynamic Agent 架构、ReAct 核心循环、动态图编译与 LRU 缓存、State 与 Reducer 语义、工具系统分类学（普通工具 / 图节点 / 子图入口 / MCP）、多 ToolCall 路由边界与丢失缺陷、MCP 客户端与超时技术债、RAG 多模态（文本+图片）检索与 VL 解析、Reasoning 提取、AG-UI 协议层与 10 级中间件、Streaming 与 Blocking 聚合语义、断连检测与两阶段 Checkpoint 延迟回滚、设计意图与演进 Delta 对照。
> **基线环境**：
> - 运行基线：`develop` Reference Worktree (`.scratch/langagent-develop-reference` @ `4cebb661e88e`)
> - 框架源码：`.scratch/langagent-framework-sources` (`langgraph 1.2.8`, `ag-ui-protocol 0.1.19`, `ag-ui-langgraph 0.0.42`, `copilotkit 0.1.94`)
> - 历史与原型：`/Users/sunxichen/Projects/langAgent` (Read-Only)

---

## 1. 核心控制流一：通用 Dynamic Agent 请求至响应全生命周期

通用 Dynamic Agent 承载开放式多轮对话、工具调用与子图编排。其端到端控制流如下：

```
[客户端请求 (Stream: /react-agent/stream | Blocking: /react-agent/blocking)]
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. 路由接入层 (src/server/routes/agent_routers.py)                       │
│    - 解析 ChartAgentRunInput (thread_id, run_id, messages, tools, 等)  │
│    - 提取元数据 (Opik metadata & trace input)                            │
│    - 包装客户端断连监听器 (with_disconnect_watcher 轮询 is_disconnected) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. 配置构建与解析 (AgentService.build_agent_config)                      │
│    - 提取 system_prompt, llm_config, dynamic_mcp_tools, dataset_configs│
│    - 处理上传文件/对象存储 Key (file_service.process_uploaded_files)     │
│    - 解析 ChatBI、Report、Ask User 配置，生成强类型 AgentConfig Pydantic │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. 动态编译与 LRU 缓存 (AgentRegistry.get_or_build)                      │
│    - 计算 config_hash = MD5(config.model_dump_json())                  │
│    - 缓存命中: 直接返回 CompiledStateGraph (LRU 上限 128)               │
│    - 缓存未命中: 调用 DynamicAgentFactory.build() 编译并存入缓存         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Agent 包装与可观测注入 (AgentService.create_agent)                     │
│    - 实例化 LangGraphAGUIAgent 包装器 (继承自 ag_ui_langgraph)          │
│    - 注入 Opik Tracer 回调到 RunnableConfig["callbacks"]                │
│    - 检查并执行历史取消 run 的延迟回滚 (Delayed Rollback)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. 图执行 (LangGraph StateGraph ReAct Loop)                            │
│    - START -> agent 节点 (调用 LLM 生成 AIMessageChunk 并累加)           │
│    - 条件路由 route(state): 检查 last_msg.tool_calls[0]["name"]        │
│      ├─ tool_executor: ToolNode 并发执行 MCP/RAG/本地工具              │
│      ├─ visualization_subgraph: AntVChart 白盒子图 (visualize)         │
│      ├─ chatbi_subgraph: SQL 生成与纠错子图 (chatbi_text2sql)           │
│      ├─ report_subgraph: 报告管理与长文草稿隔离子图 (manage_report)     │
│      └─ END: 无工具调用，输出最终文本并结束                              │
│    - ⚠️ 关键边界: 若 LLM 返回混合调用，仅首个工具生效，后续调用被忽略     │
│    - 各工具/子图节点执行后直接回边到 agent 节点形成 ReAct 循环           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. 中间件拦截与协议适配 (AgentService.generate_events)                   │
│    - 10 级中间件流水线对事件流做脱敏、翻译、活动注入、聚合统计           │
│    - Stream 模式: EventEncoder 编码为 SSE 格式推送                      │
│    - Blocking 模式: BlockingEventAggregator 内存消费并聚合为 JSON 响应   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心控制流二：事件流转、中间件流水线与异常生命周期

```
[LangGraph 内部执行事件 (astream_events)]
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. 协议适配层 (ag_ui_langgraph 0.0.42 / copilotkit 0.1.94)             │
│    - 拦截 on_chat_model_stream / on_tool_start / on_tool_end 等事件   │
│    - 转换为标准 AG-UI 协议事件 (TEXT_MESSAGE_*, TOOL_CALL_*, CUSTOM 等) │
└───────────────────────┬────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. 10 级中间件处理流水线 (src/server/services/agent_service.py)          │
│    ① ToolNameTranslator: 工具英文名转前端展示中文名                    │
│    ② MessageSnapshotSanitizer: 消息快照 ToolMessage ID 规范化          │
│    ③ ActivityEventTranslator: 将 copilotkit activity 转换为快照        │
│    ④ AskUserToolArgsMasker: ask_user 工具敏感入参掩码 (展开为事件流)    │
│    ⑤ AskUserInterruptTranslator: 拦截并处理中断事件                    │
│    ⑥ FileDownloadActivityInjector: file_download 后注入下载活动卡片    │
│    ⑦ RenderHtmlActivityInjector: render_inline_html 后注入 HTML 渲染卡片│
│    ⑧ SubgraphToolResultBridge: 子图 ToolMessage 补发 TOOL_CALL_RESULT  │
│    ⑨ RAGSourceCollector: 汇聚 RAG 召回来源并广播 rag_sources 事件      │
│    ⑩ ToolStatisticsCollector: 统计工具耗时与调用量 (tool_usage)        │
└───────────────────────┬────────────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌──────────────────┐          ┌───────────────────────────┐
│ SSE 流式输出分支 │          │ Blocking 聚合输出分支     │
│ EventEncoder 编码│          │ BlockingEventAggregator   │
│ 客户端断连轮询   │          │ 仅聚合所支持的事件结构    │
└────────┬─────────┘          └─────────────┬─────────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. 非 Happy Path 与异常生命周期保障                                     │
│    - 未捕获异常:                                                       │
│      1. 补发 StepFinishedEvent (闭合未完成 Step)                        │
│      2. 发送 RunErrorEvent (消息体包含具体错误原因)                     │
│      3. 强制发送 RunFinishedEvent (闭合前端 SSE 连接)                   │
│    - 客户端断连 / 取消:                                                │
│      在 finally 块注册 _pending_rollbacks[thread_id]，                  │
│      下次该会话进入时由 _rollback_checkpoint_on_cancel 执行两阶段回滚    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心机制深度审计与关键代码落点

### 3.1 State 架构与 Reducer 语义演进
- **主状态定义**：`MainAgentState`（`src/agent/core/state.py#L170-L231`）。
- **消息 Reducer 演进**：
  ```python
  messages: Annotated[List[BaseMessage], add_messages]
  ```
  - **历史缺陷 (Commit `eeff172`)**：早期版本曾使用自定义覆盖型 `lambda x, y: x + y`，在并发工具调用返回或嵌套子图状态写回时容易导致消息重复或丢失。
  - **当前机制**：采用 LangGraph 原生 `add_messages`。其内部根据 `message.id` 执行合并与追加（相同 ID 更新内容，新 ID 追加列表，`RemoveMessage` 执行删除），确保了多轮对话与子图状态合并的幂等性。
- **子图状态隔离**：
  - `VisualizationState`（`src/agent/core/state.py#L95-L126`）：包含主图传入的 `id`（数据信封 ID）与内部私有字段 `_envelope`，图表 spec 直接挂在根层级供 `AntVChart` 解析。
  - `ReportState`（`src/agent/core/state.py#L128-L168`）：`report_draft`（可能达 3000+ 字）仅在报告子图内部流转，不写回主图 `messages`，避免主 ReAct 循环上下文膨胀。

### 3.2 动态图编译与 LRU 缓存
- **动态图编译器**：`DynamicAgentFactory.build(agent_config, checkpointer)`（`src/agent/factory/agent_factory.py#L265-L728`）。
  - 根据 `AgentConfig` 动态挂载节点与条件边：仅在配置了 `chatbi_config` 时挂载 `chatbi_subgraph`；仅在包含可视化工具时挂载 `visualization_subgraph`；仅在 `enable_report=True` 时挂载 `report_subgraph`。
- **LRU 缓存机制**：`AgentRegistry`（`src/agent/factory/agent_registry.py#L22-L100`）。
  - **Key 生成**：`cache_key = f"{agent_id}:{MD5(config.model_dump_json())}"`。
  - **容量控制**：基于 `OrderedDict` 维护最大 128 个 `CompiledStateGraph` 实例。相同请求级 `AgentConfig` 的会话共享同一编译图实例；当 `AgentConfig` 配置变更（如模型名称或挂载工具列表变化）时，生成新 hash key 并构建新图实例，旧实例留在 LRU 缓存中按容量淘汰。
- **提示词动态解析解耦**：
  - 系统的 System Prompt 模板由 `src/server/config/system_prompts.py` 中的 `PromptProxy` 托管，在 agent 节点组装消息时通过 `__str__()` / `format()` 动态从模块内存字典 `_prompts_cache` 取值。
  - Nacos 监听器在收到变更后调用 `set_prompts_config()` 更新内存字典，该过程直接对运行时生效，与 `AgentRegistry` 的图编译缓存相互解耦（无需重新哈希或重建图结构）。

### 3.3 多 ToolCall 机制与已知路由边界缺陷 (Architectural Boundary & Defect)
- **底层 ToolNode 的并发机制**：
  在 LangGraph 1.2.8 中，`ToolNode`（`langgraph/prebuilt/tool_node.py`）对分配给它的多个 ToolCall 采用 `asyncio.gather(*coros)` 并发执行并合并返回全部 `ToolMessage`。
- **主图路由设计缺陷 (Verified Defect in `agent_factory.py#L653` & `tests/test_multi_tool_calls.py`)**：
  在 `agent_factory.py` 的条件路由函数 `route(state)` 中：
  ```python
  tool_name = last_msg.tool_calls[0]["name"]  # ⚠️ 仅检查首个工具调用
  ```
  - **纯工具场景 (Happy Path)**：若 LLM 单轮返回的多个 ToolCall 全部为普通/MCP/RAG 工具（均归属于 `tool_executor`），首个工具命中 `tool_executor`，`ToolNode` 会同时接收并并发执行全部 ToolCall。
  - **混合调用场景 (Defect / Non-Happy Path)**：若 LLM 返回混合调用（例如 `[visualize, search_weather]` 或 `[chatbi_text2sql, search_weather]`），`route()` 仅根据首个工具路由到子图节点（如 `visualization_subgraph`），子图仅处理自身领域的工具，后续普通工具调用被静默丢弃。
- **测试现状说明**：`tests/test_multi_tool_calls.py` 主要是针对该架构路由缺陷的代码模拟与单点分析脚本，并非全图强回归测试。

### 3.4 工具系统分类学 (Tool Taxonomy & Boundaries)
系统中的工具与扩展能力分为 4 个层级：

| 工具类型 | 代表实例 | 挂载方式 | 执行运行时 | 状态可见性与回边 |
|---|---|---|---|---|
| **1. 本地内置工具** | `file_download`<br>`manage_envelope`<br>`render_inline_html` | `direct_execution_tools.append()` | 主图 `ToolNode(tool_executor)` 统一执行 | 生成 `ToolMessage` 回写主图 `messages`，直接回边到 `agent` |
| **2. 动态 MCP 工具** | 外部第三方 API 工具 | `create_mcp_tool()` 动态生成 `StructuredTool` | `mcp_client_manager` 经 HTTP/SSE 远程调用 | 生成 `ToolMessage` 回写主图，执行参数脱敏 |
| **3. 知识与交互工具** | `rag_tool`<br>`ask_user` | `create_rag_tool()`<br>`create_ask_user_tool()` | `ToolNode` 执行；`ask_user` 触发 `interrupt()` 中断 | `rag_tool` 携带 `artifact=sources`；`ask_user` 挂起线程 |
| **4. 业务子图入口 Schema** | `visualize`<br>`chatbi_text2sql`<br>`manage_report` | `@tool` 仅作为暴露给 LLM 的决策契约，**不作为本地函数执行** | 主图路由 `route()` 拦截并分流至独立 Compiled 子图节点 | 子图内部维护独立领域状态机，执行完毕输出 `ToolMessage` 回边到主 Agent |

### 3.5 动态 MCP 客户端实现与技术债 (MCP Client & Tech Debt)
- **动态 Pydantic Schema 解析**：`ToolManager._create_args_schema`（`src/agent/core/tool_manager.py#L267-L335`）。
  - 使用 `pydantic.create_model` 从 JSON Schema 动态生成参数类。
  - **参数类型容错**：基类继承 `_JsonCoercingBaseModel`，利用 `@model_validator(mode='before')` 拦截大模型（如 Qwen）将复杂嵌套对象/数组输出为 JSON 字符串的情况，自动 `json.loads` 反序列化为原生类型，避免 Pydantic 验证报错（`tests/test_tool_call_args.py` 验证）。
- **安全日志脱敏**：`_mask_args_for_log` 对字符串参数执行前 2 后 2 掩码（`"ab***yz"`），防止敏感参数外泄。
- **MCP 客户端代码实现偏差与技术债 (`src/agent/core/mcp_client.py#L43-L104`)**：
  1. **超时参数未真正生效 (Unenforced Timeout)**：`execute_tool()` 接收 `timeout: int = 30` 参数并在末尾捕获 `asyncio.TimeoutError`，但内部调用 `StreamableHttpTransport` 和 `Client.call_tool` 时均未传递 `timeout`，亦未通过 `asyncio.wait_for` 或 `anyio.fail_after` 包装。因此 MCP 远程调用目前无法触发主动超时拦截。
  2. **连接池复用未启用**：类属性中定义了 `_clients` 和 `_locks`，但 `execute_tool()` 在每次调用时均通过 `async with Client(StreamableHttpTransport(...)):` 重新建立连接，未实现连接复用。
  3. **认证头正常透传**：`headers` 参数正确传入了 `StreamableHttpTransport(headers=headers or {})`，保证了鉴权能力。

### 3.6 多模态 RAG 检索与文件上下文注入
系统包含两套独立的多模态与知识上下文链路：

1. **RAG 多模态知识检索 (`src/agent/tools/rag_tool.py` & `src/server/services/rag_service.py`)**：
   - **文本+图片两路并行检索**：当 `dataset_config.image_search_enable=True` 时，通过 `asyncio.gather(text_task, image_task, return_exceptions=True)` 并发检索文本库与图片库；图片检索失败时降级为空列表。
   - **RRF 融合排序**：调用 `reciprocal_rank_fusion(text_results, image_results, top_k)` 融合两路得分。
   - **图片按需 VL 解析**：针对 `_result_type == "image"` 的文档，通过 `file_service.fetch_public_url_by_object_key` 换取图片预签名/公网 URL，并调用 VL 视觉模型解析图片内容补充至文档 text 中。
   - **结构化来源外化**：返回 `Command(update={"messages": [ToolMessage(content=content, artifact=sources)]})`。`artifact=sources` 携带包含 `run_id` 的来源元数据，由 `RAGSourceCollector` 中间件拦截并广播 `rag_sources` CustomEvent，避免在 LLM Prompt 中堆叠冗余元数据。
2. **上传文件动态注入 (`src/server/services/file_service.py` & `agent_factory.py#L468-L479`)**：
   - 上传的文件由 `file_service.process_uploaded_files` 解析为 `file_context` 文本。
   - 在主图 `agent_node` 每次构造 Prompt 时，作为临时的 `HumanMessage` 动态注入到历史消息之前。**该消息不写入 Checkpointer**，既保证当前轮次可见，又避免持久化数据库膨胀。

### 3.7 Reasoning 思考流提取机制
- **双重格式自适应提取**：`ReasoningCallbackHandler`（`src/agent/factory/reasoning_handler.py#L21-L150`）。
  - **Format A (原生字段)**：从 chunk 的 `additional_kwargs` 提取 `reasoning_content` / `thinking_content` / `thinking`。
  - **Format B (标签提取)**：通过正则匹配 `content` 中的 `<think>` 与 `</think>` 标签，流式提取标签内文本。
- **思考框闭合检测**：当收到无 reasoning delta 但有实际正文 content 的 chunk 时，立即发射 `copilotkit_reasoning_message_end` 与 `copilotkit_reasoning_end`，确保思考框在正文流式输出前闭合。

### 3.8 Checkpoint 与 Interrupt 框架底层语义下钻
基于锁定版本 `langgraph 1.2.8` 源码（`langgraph/pregel/loop.py`, `langgraph/types.py`）：
- **Checkpointer 绑定**：运行时通过 `RunnableConfig["configurable"]["thread_id"]` 与 Checkpointer 建立绑定，以线程为单位隔离和持久化状态版本。
- **Interrupt 中断机制**：
  - 业务节点调用 `interrupt(value)` 时，LangGraph 内部抛出 `GraphInterrupt` 异常。
  - Pregel 调度循环捕获该异常后，自动将当前步骤的状态快照提交至 Checkpointer（标记待执行任务与中断元数据），并正常退出执行循环（不向外层抛出错误）。
  - **恢复机制**：前端提交用户答案后，通过向同一 `thread_id` 发起运行并在输入中附带 `Command(resume=answer)`，LangGraph 运行时将 resume 值回传给中断发生处的 `interrupt()` 调用并继续图执行。
- **独立的状态操作与终态区分**：
  1. **正常完成 (Normal Complete)**：执行流推进至 `END` 节点，Checkpointer 写入最终完整状态。
  2. **业务中断 (Business Interrupt)**：触发 `interrupt()`，Checkpointer 保存中断点快照，等待 `Command(resume=...)` 恢复指令。
  3. **异常/断连延迟回滚 (Cancelled Delayed Rollback)**：客户端中断退出，在 generator `finally` 记录 `_pending_rollbacks[thread_id]`，并在下次请求进入时调用 `graph.aupdate_state(pre_run_config, as_node=END)` 执行状态回滚，两者语义完全独立。

### 3.9 Streaming 与 Blocking 双模事件消费与聚合
- **事件源同源性**：Streaming 和 Blocking **共享**中间件流水线处理后的统一事件源 `AgentService.generate_events()`。
- **BlockingEventAggregator 聚合范围与容错行为 (`src/server/services/agent_blocking_aggregator.py`)**：
  - **文本聚合**：消费 `TEXT_MESSAGE_START/CONTENT/END`，拼接 `output.content`。若缺少 `TEXT_MESSAGE_END`，仅在存在 `MessagesSnapshotEvent` 降级时提取输出，否则丢弃未闭合的文本。
  - **工具调用聚合**：消费 `TOOL_CALL_START/ARGS/RESULT`，使用 `parse_tool_args` 拼接并解析 JSON 参数；若参数残缺则回退为原始字符串或从 `MessagesSnapshotEvent` 中提取；工具执行异常（含 `_tool_result_is_error`）时标记 `tool_call.status="failed"`。
  - **错误传播**：收到 `RUN_ERROR` 时，设置 `data.status="failed"`，响应根层级 `code=500`，构造 `BlockingError(type="agent_runtime_error", message=...)`。
  - **自定义事件**：专门解析 `rag_sources`、`tool_usage`、`report_stream_*` 为结构化字段；其余未知 `CUSTOM` 事件原样追加至 `data.custom_events` 列表中。

---

## 4. 关键非 Happy Path 与故障自愈设计汇总

1. **混合多 ToolCall 丢失 (Known Defect)**：
   LLM 单轮发出“业务子图入口 + 普通工具”时，`route()` 只根据首个工具路由，后续普通工具调用被静默丢弃。
2. **MCP 超时未 Enforcement (Technical Debt)**：
   `mcp_client.py` 虽接收 timeout 参数并有 catch 块，但底层未通过 `asyncio.wait_for` 包装，实际调用受底层 HTTP 默认行为制约。
3. **客户端断连检测 (Starlette ASGI Disconnect Fix)**：
   `with_disconnect_watcher` 启动独立 `anyio` 任务轮询 `request.is_disconnected()`，在断开时向生成器注入 `CancelledError`，防止后台资源悬挂。
4. **两阶段延迟 Checkpoint 回滚 (Delayed Rollback)**：
   流式中断时在 `finally` 块仅记录 `_pending_rollbacks[thread_id]` 字典，在下次同会话请求进入时执行 `_rollback_checkpoint_on_cancel`，避开 SQLite 异步死锁。
5. **异常分层兜底**：
   未捕获异常自动补发 `StepFinishedEvent` + `RunErrorEvent` + `RunFinishedEvent`，确保前端流式连接确定性关闭。

---

## 5. 框架底层边界与职责划分

```
┌────────────────────────────────────────────────────────────────────────┐
│ 业务编排与控制层 (langAgent 自身实现)                                     │
│ - DynamicAgentFactory: 动态配置解析与节点/子图条件路由装配              │
│ - AgentRegistry: 基于 MD5 配置哈希的 LRU Graph 编译缓存 (容量 128)      │
│ - 10 级中间件链: 工具名翻译、快照修复、活动注入、RAG来源广播、工具度量    │
│ - 两阶段延迟 Checkpoint 回滚与 Starlette 断连轮询监听器                  │
│ - BlockingEventAggregator: 结构化事件消费与 JSON 聚合器                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 传递 CompiledStateGraph & Callbacks
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CopilotKit / AG-UI 适配层 (copilotkit 0.1.94 & ag_ui_langgraph 0.0.42)  │
│ - LangGraphAGUIAgent: 处理 ManuallyEmitMessage / ManuallyEmitToolCall   │
│ - LangGraphAgent: 监听 LangGraph astream_events 事件流                  │
│ - 负责将 on_chat_model_stream / on_tool_start 转换为 AG-UI 标准事件对象 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 订阅 Graph 事件与状态
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 协议与图执行底座 (ag-ui-protocol 0.1.19 & langgraph 1.2.8)              │
│ - ag-ui-protocol: Pydantic 事件模型定义与 EventEncoder SSE 序列化       │
│ - LangGraph: StateGraph, CompiledStateGraph, ToolNode 并发调度          │
│ - add_messages Reducer 消息 ID 合并语义与 Checkpointer 状态持久化快照   │
│ - GraphInterrupt 异常拦截与 Command(resume=...) 状态恢复机制             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 设计意图、当前实现与演进 Delta 审计 (Design Intent vs. Implementation vs. Delta)

本节基于独立阅读的原始设计与架构文档（`docs/docs/ag_ui与langgraph messages融合策略.md`、`docs/docs/AG-UI_协议_参数说明.md`、`docs/tool_id_透传架构方案.md`、`tool_id.prd.md`、`docs/docs/NACOS_CONFIG_GUIDE.md`），系统对照 `develop` 源码，提取设计契约与当前实现之间的演进差异：

### 6.1 结构化 Delta 对照矩阵

| 机制 / 领域 | 原始设计意图 (PRD / Spec) | 对应 Design Claim | develop 实际实现 | 对应 Impl Claim | 演进差异与现状评估 (Delta Status) |
|---|---|---|---|---|---|
| **Tool ID 映射与透传** | `tool_id.prd.md` / `tool_id_透传架构方案.md`：设计 `ToolIDRewriter` 中间件在 SSE 编码前拦截事件，原地篡改 `tool_call_id` 并按 `BUILTIN_AGGREGATION_RULES` 执行 1:N 宏观工具聚合。 | `DESIGN-AGUI-001`<br>(`deprecated`) | `src/agent/middleware/tool_statistics_collector.py`：废弃并移除 `ToolIDRewriter`；源码注释明确声明“不修改任何 tool_call_id 或 tool_call_name，保持 LangGraph 原生值不变，通过'旁路通知'而非'原地篡改'提供前端所需的业务映射信息”，在 `RUN_FINISHED` 前发送 `tool_usage` CustomEvent，行为结果上保持了原生工具调用 ID 配对。 | `FACT-RT-028`<br>`FACT-RT-019`<br>(`implemented`) | **架构替代 (Deprecated & Replaced by Sidecar)**：从“原地篡改 ID”演进为“旁路统计事件”，在行为结果上保持了 LangGraph 消息 ID 与工具调用结果的配对完整性。 |
| **状态融合与回滚机制** | `ag_ui与langgraph messages融合策略.md`：客户端全量声明式上下文与服务端 Checkpointer 融合；长度缩短时通过寻找最后一条 HumanMessage 并在上一帧 Checkpoint 上 `aupdate_state` 分叉恢复。 | `DESIGN-AGUI-002`<br>(`design_complete`) | `ag_ui_langgraph` 实现消息 ID 去重与孤儿工具修补；`agent_service.py` 补充传输层断连延迟回滚字典 `_pending_rollbacks`。 | `FACT-RT-022`<br>`FACT-RT-027`<br>(`implemented`) | **实现契合且补充传输层韧性 (Aligned & Separate Resilience)**：前端消息重试走框架层时间旅行分叉；断连/取消走服务端两阶段延迟回滚，两者为相邻且职责独立的机制。 |
| **配置与 Prompt 热更新** | `NACOS_CONFIG_GUIDE.md`：通过 `nacos_provider.py` 注册 Nacos 变更监听器，触发 `reload_settings()` 与 `PromptProxy` 动态生效，实现免重启配置与 Prompt 热更新。 | `DESIGN-RT-001`<br>(`design_complete`) | `nacos_provider.py` 实现了 `_register_listener` 并在变更时更新 `_prompts_cache`；`system_prompts.py` 通过 `PromptProxy` 在格式化时动态取最新值，与 `AgentRegistry` 的图编译缓存解耦。 | `FACT-RT-029`<br>`FACT-RT-011`<br>(`implemented`) | **实现契合 (Aligned with In-Process Proxy)**：进程内通过 `PromptProxy` 实现提示词动态取值，与 `AgentRegistry` 的图编译缓存解耦；生产环境是否默认开启监听器长连接仍作为 Gap 待验证。 |

---

## 7. 原始材料阅读与证据索引清单

- **设计与规范原始材料**：
  - `/Users/sunxichen/Projects/langAgent/docs/docs/ag_ui与langgraph messages融合策略.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/AG-UI_协议_参数说明.md`
  - `/Users/sunxichen/Projects/langAgent/docs/tool_id_透传架构方案.md`
  - `/Users/sunxichen/Projects/langAgent/tool_id.prd.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/NACOS_CONFIG_GUIDE.md`
- **实现源码落点 (develop)**：
  - `src/agent/factory/agent_factory.py#L265-L728` (DynamicAgentFactory 动态图编译)
  - `src/agent/factory/agent_registry.py#L22-L100` (AgentRegistry LRU 128 编译缓存)
  - `src/agent/core/state.py#L170-L231` (MainAgentState 与 add_messages Reducer)
  - `src/agent/core/tool_manager.py#L26-L335` (MCP 动态 Schema 与参数脱敏)
  - `src/agent/core/mcp_client.py#L43-L104` (MCP 客户端与超时未闭环)
  - `src/agent/tools/rag_tool.py#L36-L144` (RAG 文本+图片两路检索与 RRF 融合)
  - `src/agent/middleware/tool_statistics_collector.py#L1-L40` (ToolStatisticsCollector 旁路通知)
  - `src/server/services/agent_service.py#L271-L534` (10 级中间件流水线与保活)
  - `src/server/services/agent_blocking_aggregator.py#L49-L350` (Blocking 聚合器)
  - `src/server/utils/streaming_disconnect.py#L31-L67` (客户端断连轮询)
  - `src/server/config/nacos_provider.py#L113-L169` (Nacos 配置与提示词监听)
- **自动化测试落点 (develop)**：
  - `tests/test_multi_tool_calls.py` (多工具并发调度与子图路由模拟)
  - `tests/test_tool_call_args.py` (MCP 参数校验与脱敏断言)
  - `tests/test_agent_generate_events.py` (中间件流水线与事件流断言)
  - `tests/test_agent_blocking_aggregator.py` & `test_agent_blocking_endpoint.py` (Blocking 模式聚合断言)
  - `tests/test_streaming_disconnect.py` (断连取消与协程回收断言)
  - `tests/test_http_headers.py` (Content-Disposition 响应头 RFC 5987 编码断言)
