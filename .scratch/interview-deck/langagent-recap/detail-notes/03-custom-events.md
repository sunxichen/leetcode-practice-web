# 专题三：langAgent Custom 事件机制详解

> **文档定位**：本文档针对 `langAgent` 项目中的 AG-UI Custom 事件体系进行全链路、源码级剖析。全面解构从业务节点/中间件的事件触发，到 LangChain/LangGraph 事件总线捕获，再到 AG-UI 协议层中间件拦截转译，最后经由 `EventEncoder` 序列化为 Server-Sent Events (SSE) 并在前端渲染消费的完整工业级实现。

---

## 1. Custom 事件的发送方式与框架原语剖析

在 `langAgent` 的架构中，事件通信分为 **框架原生原语** 与 **项目自建发送助手** 两个层次。清晰界定二者的签名、语义区别及适用场景，是理解全系统带外通信（Out-of-band Communication）的关键。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              发送层次全景图                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [应用业务层 / 节点 / 中间件]                                                │
│    • dispatch_agui_custom_event()  ──► 统一封装异常捕获与日志记录              │
│    • LongTaskEventBridge           ──► 长任务/沙箱专用强类型事件工厂            │
│    • build_usage_updated()         ──► 上下文压缩 Payload 规范构造器           │
├─────────────────────────────────────────────────────────────────────────────┤
│  [框架原语层 (Framework Primitives)]                                        │
│    • adispatch_custom_event()      ──► LangChain 核心异步事件广播原语         │
│    • copilotkit_emit_state()       ──► CopilotKit 节点中间状态快照发射器       │
│    • copilotkit_emit_message()     ──► CopilotKit 游离消息发射器               │
│    • interrupt()                   ──► LangGraph 人机交互中断原语 (生成事件)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 框架原生原语 (Framework Primitives)

#### 1. `langchain_core.callbacks.manager.adispatch_custom_event`
- **源码定义**：[langchain_core/callbacks/manager.py#L2614-L2660](file:///.scratch/langagent-framework-sources/langchain_core/callbacks/manager.py#L2614-L2660)
- **函数签名**：
  ```python
  async def adispatch_custom_event(
      name: str,
      data: Any,
      *,
      config: RunnableConfig | None = None
  ) -> None
  ```
- **底层机制与语义**：
  - LangChain 最底层的自定义事件派发原语。它通过当前异步上下文中的 `AsyncCallbackManager` 向所有已注册的 `AsyncCallbackHandler` 广播 `on_custom_event(name, data, run_id=..., tags=..., metadata=...)`。
  - 在 LangGraph 图执行期间，该事件会被 `astream_events(version="v2")` 捕获并封装为 `{"event": "on_custom_event", "name": name, "data": data, "run_id": ...}` 事件帧。
  - **无副作用与非阻塞**：若未挂载对应监听器或下游消费变慢，不会阻塞核心模型推理与图状态迁移。

#### 2. `copilotkit.langgraph.copilotkit_emit_state` / `copilotkit_emit_message`
- **源码定义**：[copilotkit/langgraph.py#L298-L375](file:///.scratch/langagent-framework-sources/copilotkit/langgraph.py#L298-L375)
- **函数签名**：
  ```python
  async def copilotkit_emit_state(config: RunnableConfig, state: Any):
      await adispatch_custom_event("copilotkit_manually_emit_intermediate_state", state, config=config)
      await asyncio.sleep(0.02)
      return True

  async def copilotkit_emit_message(config: RunnableConfig, message: str):
      await adispatch_custom_event(
          "copilotkit_manually_emit_message",
          {"message": message, "message_id": str(uuid.uuid4()), "role": "assistant"},
          config=config
      )
      await asyncio.shield(asyncio.sleep(0.02))
      return True
  ```
- **底层机制与语义**：
  - CopilotKit 提供的便捷辅助方法，本质是对 `adispatch_custom_event` 的薄封装，固定了事件名称为 `copilotkit_manually_emit_*`。
  - `ag_ui_langgraph.LangGraphAGUIAgent` 在拦截到这些特定名称的 `on_custom_event` 时，会将其转换为 AG-UI 标准的 `StateSnapshotEvent` 或 `TextMessage*` 事件序列。

#### 3. `langgraph.types.interrupt`
- **源码语义**：挂起当前图执行并抛出中断 Envelop。
- **与事件流的关系**：在 `astream_events` 体系下，`interrupt()` 会触发 `on_interrupt` 事件帧，随后被 `ag_ui_langgraph` 包装为 `CustomEvent(name="on_interrupt", value=...)` 暴露给中间件流水线。

---

### 1.2 langAgent 项目自建发送助手

为防止业务节点直接调用底层原语时引发未捕获异常、日志缺失或 Schema 不一致，`langAgent` 构建了统一的封装层：

#### 1. 统一事件发射器 `dispatch_agui_custom_event`
- **源码文件**：[src/agent/core/event_utils.py#L11-L32](file:///src/agent/core/event_utils.py#L11-L32)
- **实现逻辑**：
  ```python
  async def dispatch_agui_custom_event(
      name: str, 
      data: Dict[str, Any], 
      config: RunnableConfig | None = None
  ) -> None:
      """统一的事件发射器。
      
      将数据安全发射至 LangGraph 事件总线，由 ag_ui_langgraph 转换为 CustomEvent(name, value=data)。
      异常被严格捕获与日志记录，确保观测与带外通信不影响主流程稳定性。
      """
      try:
          from langchain_core.callbacks import adispatch_custom_event
          await adispatch_custom_event(name, data, config=config)
      except Exception as e:
          logger.error(f"dispatch_agui_custom_event: 事件发送失败 - {e}")
  ```

#### 2. 长任务事件桥接器 `LongTaskEventBridge`
- **源码文件**：[src/agent/long_task/event_bridge.py#L12-L145](file:///src/agent/long_task/event_bridge.py#L12-L145)
- **设计定位**：纯事件构造器（Event Builder），负责产出符合 AG-UI 协议的 Pydantic 事件对象与内部 Activity 字典，消除硬编码。
- **核心工厂方法**：
  - `skill_activation_activity_value(run_id, skill_id, skill_name, activation_source)`：构造技能激活 Activity 内容。
  - `workspace_status_event(thread_id, status, message)`：构造沙箱状态 `long_task.workspace_status` CustomEvent。
  - `file_imported_event(thread_id, file_count, file_names)`：构造文件回灌 `long_task.file_imported` CustomEvent。
  - `all_files_activity_event(thread_id, artifact_count)`：构造 All files 入口 `ActivitySnapshotEvent`。
  - `artifacts_updated_event(thread_id, new_artifacts)`：构造产物变更 `long_task.artifacts_updated` CustomEvent。

#### 3. 上下文压缩 Payload 构造器
- **源码文件**：[src/agent/long_task/context_compaction_events.py#L15-L59](file:///src/agent/long_task/context_compaction_events.py#L15-L59)
- **核心方法**：`build_usage_updated(thread_id, run_id, context_tokens, max_input_tokens, compacted)`，统一注入 `approximate=True`、`mode="auto"` 以及精确的 `context_ratio` 整数百分比。

---

## 2. 完整发送链路：从业务调用到前端渲染

`langAgent` 的 Custom 事件流经 6 个核心阶段，横跨执行期（Execution-time）、协议转译期（Protocol-time）、序列化层（Serialization）与客户端消费层（Client-side Consumption）。

### 2.1 端到端架构时序与转换流

```
[ 执行期 Execution-time ]
 1. 业务逻辑触发 (Node / Tool / Middleware / Callback)
    │
    ▼ await adispatch_custom_event(name, data, config=config)
 2. LangChain Callback 总线 (AsyncCallbackManager.on_custom_event)
    │
    ▼ astream_events(version="v2") 生成事件帧 {"event": "on_custom_event", "name": ..., "data": ...}
 3. ag_ui_langgraph 框架适配层 (LangGraphAGUIAgent._handle_single_event 的 OnCustomEvent 分支)
    │  - 匹配 LangGraphEventTypes.OnCustomEvent
    │  - 产出 ag_ui.core.events.CustomEvent(type="CUSTOM", name=name, value=data, raw_event=event)
    │
[ 协议转译期 Protocol-time (agent_service.generate_events) ]
 4. 中间件流水线链式过滤与转译 (Middleware Pipeline)
    │
    ├─► ActivityEventTranslator       (若 name=="copilotkit_emit_activity" ──► 转为 ActivitySnapshotEvent)
    ├─► AskUserToolArgsMasker         (若 tool_call=="ask_user" ──► 掩码 TOOL_CALL_ARGS 为友好提示)
    ├─► AskUserInterruptTranslator    (若 name=="on_interrupt" & type=="ask_user" ──► 转为 ask_user.pending)
    ├─► FileDownloadActivityInjector  (若 tool_call=="file_download" ──► 注入 ActivitySnapshotEvent)
    ├─► RenderHtmlActivityInjector    (若 tool_call=="render_inline_html" ──► 注入 ActivitySnapshotEvent)
    ├─► SubgraphToolResultBridge      (子图直写消息 ──► 补发 TOOL_CALL_RESULT)
    ├─► RAGSourceCollector            (提取 ToolMessage.artifact ──► RUN_FINISHED 前发射 rag_sources)
    └─► ToolStatisticsCollector       (汇总工具调用 ──► RUN_FINISHED 前发射 tool_usage)
    │
[ 序列化与传输层 Serialization & Transport ]
 5. EventEncoder.encode(event) (ag_ui.encoder.EventEncoder)
    │  - 执行 event.model_dump_json(by_alias=True, exclude_none=True)
    │  - 输出: data: {"type":"CUSTOM","name":"...","value":{...}}\n\n
    │
 6. HTTP Streaming (FastAPI StreamingResponse, Content-Type: text/event-stream)
    │
[ 前端消费层 Client-side Consumption ]
 7. 前端流式解析 (parseSSEChunk / agui.ts)
    │  - 提取 data: JSON 载荷
    │  - 按 event.type ("CUSTOM" / "ACTIVITY_SNAPSHOT") 与 name/activity_type 分发到对应组件
```

### 2.2 链路关键跃点 (Hops) 源码核验

| 跃点 | 职责 | 关键代码位置 | 处理逻辑与产出 |
|---|---|---|---|
| **Hop 1: 业务调用** | 派发事件 | `src/agent/core/event_utils.py#L27-L29` | 调用 `langchain_core.callbacks.adispatch_custom_event(name, data, config=config)`。 |
| **Hop 2: 框架分发** | 捕获并推入流 | `langchain_core/callbacks/manager.py#L2614` | 回调管理器触发 `AsyncCallbackHandler.on_custom_event`，进入 LangGraph `astream_events(v2)` 队列。 |
| **Hop 3: SDK 协议封装** | 转换为 Pydantic | `ag_ui_langgraph/agent.py#L1298-L1346` | `LangGraphAGUIAgent` 将 `on_custom_event` 封装为 `CustomEvent(type=EventType.CUSTOM, name=event["name"], value=event["data"])`。 |
| **Hop 4: 中间件转译** | 业务增强与拦截 | `src/server/services/agent_service.py#L495-L508` | 10 项中间件构成的流水线顺序处理（例如 `ActivityEventTranslator` 拦截 `copilotkit_emit_activity` 转为 `ActivitySnapshotEvent`）。 |
| **Hop 5: SSE 编码** | 序列化为规范文本 | `ag_ui/encoder/encoder.py#L28-L32`<br>`src/server/services/agent_service.py#L557-L574` | `EventEncoder._encode_sse` 执行 `f"data: {event.model_dump_json(by_alias=True, exclude_none=True)}\n\n"`。 |
| **Hop 6: 前端解析渲染** | UI 挂载与状态刷新 | `frontend-demo/src/agui.ts#L36-L55`<br>`frontend-demo/src/App.tsx#L63-L86`<br>（**原型事实源**：未提交工作树 `/Users/sunxichen/Projects/langAgent/frontend-demo/`，独立 PoC 演示工程，非企业主前端；FACT-A2UI-004） | 切分 SSE 帧，按 `type` 与 `activity_type` 驱动 React 组件（如 AntV 图表卡片、A2UI Surface 等）更新。 |

---

## 3. langAgent 全部 Custom / Activity 事件类型完整清单

在 `langAgent` 项目中，所有带外通信、运行时度量、人机交互与富交互卡片均通过 Custom 事件体系（包括纯 `CustomEvent` 与转译后的 `ActivitySnapshotEvent`）承载。以下为基于源码逐项核验的完整清单：

### 3.1 运行时度量与血缘审计类 (Runtime Metrics & Lineage)

#### 1. `tool_usage`
- **事件类别**：原生 `CustomEvent`
- **发射源与代码路径**：[src/agent/middleware/tool_statistics_collector.py#L85-L106](file:///src/agent/middleware/tool_statistics_collector.py#L85-L106)
- **触发时机**：中间件在流中收集 `TOOL_CALL_START` 事件，在收到 `RUN_FINISHED` 时、正式发出 `RUN_FINISHED` 之前发射。
- **设计哲学**：**旁路通知，不原地篡改**（`FACT-TOOL-006`，替代已废弃的 `ToolIDRewriter`）。保持 LangGraph 原生 `tool_call_id` 绝对不变，不破坏 Checkpoint 消息血缘。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "tool_usage",
    "value": {
      "tool_calls": [
        {
          "tool_call_id": "call_98f1a2bc",
          "backend_tool_name": "search_knowledge_base",
          "tool_id": "tool-kb-search",
          "tool_name": "知识库检索"
        }
      ]
    }
  }
  ```
- **前端用途**：供前端按业务维度统计工具调用频次与耗时，并完成后端工具标识到前端友好中文名的映射展示。

#### 2. `rag_sources`
- **事件类别**：原生 `CustomEvent`
- **发射源与代码路径**：[src/agent/middleware/rag_source_collector.py#L82-L151](file:///src/agent/middleware/rag_source_collector.py#L82-L151)
- **触发时机**：监听 `STATE_SNAPSHOT` 事件，从 `messages` 中的 `ToolMessage.artifact` 提取当前 `run_id` 的来源信息；当 `quote_enable=True` 时在 `RUN_FINISHED` 之前发射。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "rag_sources",
    "value": {
      "sources": [
        {
          "source": "2026年Q1财报分析.pdf",
          "file_id": "file-cb9812a",
          "page": 14,
          "score": 0.92,
          "run_id": "run-f182c4"
        }
      ]
    }
  }
  ```
- **前端用途**：在对话气泡下方渲染“参考文档 / 引用来源”折叠卡片，支持用户点击查看原文溯源。

#### 3. `context.usage_updated`
- **事件类别**：原生 `CustomEvent`
- **发射源与代码路径**：[src/agent/long_task/observed_summarization_middleware.py#L263-L274](file:///src/agent/long_task/observed_summarization_middleware.py#L263-L274) 与 [context_compaction_events.py#L41-L59](file:///src/agent/long_task/context_compaction_events.py#L41-L59)
- **触发时机**：`ObservedDeepAgentsSummarizationMiddleware` 在每次模型调用（`awrap_model_call`）完成后计算最新上下文 Token 占用并即时发射。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "context.usage_updated",
    "value": {
      "thread_id": "thread-109283",
      "run_id": "run-f182c4",
      "context_tokens": 45200,
      "max_input_tokens": 128000,
      "context_ratio": 35,
      "approximate": true,
      "mode": "auto",
      "compacted": false
    }
  }
  ```
- **前端用途**：驱动前端顶部/侧边栏的上下文容量利用率仪表盘（Context Window Progress Bar），当发生自动压缩（`compacted=true`）时触发视觉高亮提示。

---

### 3.2 人机协同与挂起恢复类 (HITL & Interrupts)

#### 4. `ask_user.pending`
- **事件类别**：经中间件转译的 `CustomEvent`
- **发射源与代码路径**：[src/agent/middleware/ask_user_interrupt_translator.py#L13-L48](file:///src/agent/middleware/ask_user_interrupt_translator.py#L13-L48)
- **触发时机**：`ask_user` 工具调用 `langgraph.types.interrupt(pending_payload)` 产生框架 `on_interrupt` 事件后，由 `AskUserInterruptTranslator` 拦截并转译为业务专属事件。
- **伴随机制**：`AskUserToolArgsMasker`（[ask_user_tool_args_masker.py#L12-L53](file:///src/agent/middleware/ask_user_tool_args_masker.py#L12-L53)）同步将流式参数掩码为 `"正在准备澄清问题"`，杜绝未校验 JSON 碎片泄漏。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "ask_user.pending",
    "value": {
      "type": "ask_user",
      "requestId": "req-98f1a2bc",
      "threadId": "thread-109283",
      "runId": "run-f182c4",
      "toolCallId": "call_ask_01",
      "status": "pending",
      "questions": [
        {
          "question": "请确认您希望分析的时间范围：",
          "options": ["本季度", "本年度", "历史全量"]
        }
      ]
    }
  }
  ```
- **前端用途**：挂起当前输入流，在前端对话区渲染交互式澄清表单/多选模态框，等待用户选择。

#### 5. `ask_user.resolved`
- **事件类别**：原生 `CustomEvent`
- **发射源与代码路径**：[src/agent/ask_user/tool.py#L130-L147](file:///src/agent/ask_user/tool.py#L130-L147)
- **触发时机**：用户提交恢复请求并通过 `validate_resolution` 强类型契约校验后，在 `ask_user` 工具内部通过 `adispatch_custom_event` 广播。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "ask_user.resolved",
    "value": {
      "type": "ask_user",
      "requestId": "req-98f1a2bc",
      "threadId": "thread-109283",
      "runId": "run-f182c4",
      "toolCallId": "call_ask_01",
      "status": "submitted",
      "answers": [
        {
          "questionIndex": 0,
          "selectedOption": "本季度"
        }
      ]
    }
  }
  ```
- **前端用途**：通知前端将挂起的提问表单锁定为“已提交”状态，转为只读历史卡片并展示用户选择。

---

### 3.3 交互式富卡片与可视化类 (Activity & Rich Visualization)

多数此类事件在执行期以 `copilotkit_emit_activity` 内部 Custom 事件发射，在协议层经 `ActivityEventTranslator`（[activity_event_translator.py#L6-L36](file:///src/agent/middleware/activity_event_translator.py#L6-L36)）统一转译为标准 `ActivitySnapshotEvent`；例外：`all_files`、`file_download`、`render_html` 三类由 service 层中间件直接构造 `ActivitySnapshotEvent` 注入，不经过 `copilotkit_emit_activity`。

#### 6. `activity_type="antv_chart"` (ChatBI 可视化图表)
- **发射源与代码路径**：[src/agent/nodes/visualization_nodes/nodes.py#L487-L498](file:///src/agent/nodes/visualization_nodes/nodes.py#L487-L498)
- **设计哲学**：**双通道带外分发**（`FACT-BI-006`）。大型 Chart Spec 与数据集通过 Activity 带外推送给前端，`emit_visualization_tool_message` 仅向主图回传简短文本，彻底杜绝图表 JSON 污染 LLM 上下文。
- **转译后 AG-UI 事件**：
  ```json
  {
    "type": "ACTIVITY_SNAPSHOT",
    "message_id": "activity-viz-98f1a2bc34de",
    "activity_type": "antv_chart",
    "replace": true,
    "content": {
      "component": "AntVChart",
      "chart_type": "line",
      "title": "2026年Q1各产品线营收走势",
      "spec": {
        "xField": "date",
        "yField": "revenue",
        "seriesField": "product"
      },
      "data": [
        {"date": "2026-01", "revenue": 1200000, "product": "LLM-Agent"},
        {"date": "2026-02", "revenue": 1500000, "product": "LLM-Agent"}
      ],
      "dataset_strategy": "inline_complete"
    }
  }
  ```
- **前端用途**：前端识别 `component: "AntVChart"`，直接挂载 AntV 图表引擎完成交互式渲染。

#### 7. `activity_type="skill_activation"` (技能自动激活卡片)
- **发射源与代码路径**：[src/agent/long_task/skill_activation_middleware.py#L70-L82](file:///src/agent/long_task/skill_activation_middleware.py#L70-L82)
- **触发时机**：中间件拦截到模型对 `SKILL.md` 的 `read_file` 工具调用且成功返回时发射，同 run 内基于 `skill_id` 去重。
- **转译后 AG-UI 事件**：
  ```json
  {
    "type": "ACTIVITY_SNAPSHOT",
    "message_id": "activity-skill-run123-skill_patent",
    "activity_type": "skill_activation",
    "replace": true,
    "content": {
      "schema_version": 1,
      "run_id": "run-f182c4",
      "skill_id": "skill_patent",
      "skill_name": "专利检索与规避分析技能",
      "activation_source": "automatic_discovery"
    }
  }
  ```
- **前端用途**：在对话流中展示“已自动激活技能”徽章卡片，让用户直观感知 Agent 的专业能力加载。

#### 8. `activity_type="artifact"` (显式产物策展卡片)
- **发射源与代码路径**：[src/agent/long_task/tools.py#L105-L123](file:///src/agent/long_task/tools.py#L105-L123)
- **触发时机**：Agent 自主调用 `export_artifacts`（单文件）或 `export_artifact_bundle`（打包为 `.zip`）时发射。
- **转译后 AG-UI 事件**：
  ```json
  {
    "type": "ACTIVITY_SNAPSHOT",
    "message_id": "activity-artifact-87a1b2c3d4e5",
    "activity_type": "artifact",
    "replace": true,
    "content": {
      "message": "已生成分析报告，请查收：",
      "artifacts": [
        {
          "path": "/workspace/artifacts/Q1_Report.docx",
          "name": "Q1_Report.docx"
        }
      ],
      "downloadable": true
    }
  }
  ```
- **前端用途**：在聊天流中生成显式下载卡片，包含文件图标、文件名与直接下载/预览按钮。

#### 9. `activity_type="a2ui_surface"` (动态 A2UI 界面渲染)

> ⚠️ **成熟度标注**：本条为**原型事实**（`prototype_verified`）——事实源是未提交工作树 `/Users/sunxichen/Projects/langAgent`（瑞幸 PoC），**未合入 develop 主线**（FACT-A2UI-001/DESIGN-A2UI-001）。
- **发射源与代码路径**：工作树 `src/agent/nodes/a2ui_nodes.py#L433-L440`（develop 基线中不存在该文件）
- **触发时机**：A2UI 子图分批生成 Basic Catalog 组件，经 JSON Schema 校验通过后转换为 A2UI 规范组件树发射。
- **转译后 AG-UI 事件**：
  ```json
  {
    "type": "ACTIVITY_SNAPSHOT",
    "message_id": "activity-a2ui-3a4b5c6d7e8f",
    "activity_type": "a2ui_surface",
    "replace": true,
    "content": [
      {
        "beginRendering": {
          "surfaceId": "surface-luckin-order",
          "root": "root",
          "styles": {}
        }
      },
      {
        "surfaceUpdate": {
          "surfaceId": "surface-luckin-order",
          "components": [
            {
              "id": "root",
              "component": {
                "Column": {
                  "children": {"explicitList": ["card-1"]},
                  "distribution": "start",
                  "alignment": "stretch"
                }
              }
            },
            {
              "id": "card-1",
              "component": {
                "Card": {"child": "btn-confirm"}
              }
            },
            {
              "id": "btn-confirm",
              "component": {
                "Button": {
                  "child": "btn-label",
                  "primary": true,
                  "action": {"name": "confirm_order", "context": []}
                }
              }
            }
          ]
        }
      }
    ]
  }
  ```
- **前端用途**：前端 `@a2ui/react`（工作树 `frontend-demo/` PoC 演示工程）消费组件树，动态挂载可交互原生 UI，并捕获用户操作回流至 Agent。

#### 10. `activity_type="all_files"` (产物全量入口卡片)
- **发射源与代码路径**：[src/agent/long_task/event_bridge.py#L98-L125](file:///src/agent/long_task/event_bridge.py#L98-L125) 与 [src/server/services/long_task_agent_service.py#L597-L607](file:///src/server/services/long_task_agent_service.py#L597-L607)
- **触发时机**：同 run 内首次检测到存在产物时发射一次（run 级一次性信号；前端契约层表现为 thread 级粘性卡片）。
- **转译后 AG-UI 事件**：
  ```json
  {
    "type": "ACTIVITY_SNAPSHOT",
    "message_id": "activity-all-files-thread-109283",
    "activity_type": "all_files",
    "content": {
      "thread_id": "thread-109283",
      "artifact_count": 3
    }
  }
  ```
- **前端用途**：在最新 AI 气泡底部挂载文件夹图标（All files 入口），点击后懒加载全量产物抽屉。

#### 11. 中间件注入型 Activity (`file_download` / `render_inline_html`)
- **发射源与代码路径**：[src/agent/middleware/file_download_activity_injector.py#L158-L166](file:///src/agent/middleware/file_download_activity_injector.py#L158-L166) 与 [render_html_activity_injector.py#L70-L85](file:///src/agent/middleware/render_html_activity_injector.py#L70-L85)
- **触发时机**：分别在工具 `file_download` 和 `render_inline_html` 调用结束（`TOOL_CALL_END`）时由中间件就地注入。
- **转译后 AG-UI 事件**：
  - `file_download`: `{"type": "ACTIVITY_SNAPSHOT", "message_id": "activity-call_1", "activity_type": "file_download", "content": {"file_type": "xlsx", "object_key": "oss://..."}}`
  - `render_inline_html`: `{"type": "ACTIVITY_SNAPSHOT", "message_id": "activity-call_2", "activity_type": "render_html", "content": {"html_content": "<div class=..."}}`

---

### 3.4 长任务与沙箱生命周期类 (Long Task & Sandbox Status)

此类事件由 `LongTaskAgentService` 在流式传输的不同生命周期点直接通过 `LongTaskEventBridge` 构造并由 `EventEncoder` 编码输出。

#### 12. `long_task.workspace_status`
- **发射源与代码路径**：[src/agent/long_task/event_bridge.py#L60-L79](file:///src/agent/long_task/event_bridge.py#L60-L79) 与 [src/server/services/long_task_agent_service.py#L259-L276](file:///src/server/services/long_task_agent_service.py#L259-L276)
- **触发时机**：沙箱初始化分配中（`allocating`）、休眠恢复中（`resuming`）、执行就绪（`active`）或异常（`error`）时。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "long_task.workspace_status",
    "value": {
      "thread_id": "thread-109283",
      "workspace_status": "active",
      "message": "工作环境状态: active"
    }
  }
  ```
- **前端用途**：在前端顶部沙箱状态指示灯上展示连接进度与健康状态。

#### 13. `long_task.file_imported`
- **发射源与代码路径**：[src/agent/long_task/event_bridge.py#L81-L96](file:///src/agent/long_task/event_bridge.py#L81-L96) 与 [src/server/services/long_task_agent_service.py#L398](file:///src/server/services/long_task_agent_service.py#L398)
- **触发时机**：用户在请求中上传的文件成功同步写入沙箱 `/workspace/input/` 之后。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "long_task.file_imported",
    "value": {
      "thread_id": "thread-109283",
      "file_count": 2,
      "file_names": ["raw_data.csv", "config.yaml"]
    }
  }
  ```
- **前端用途**：在对话起始阶段提示文件已就绪，增强可感知性。

#### 14. `long_task.artifacts_updated`
- **发射源与代码路径**：[src/agent/long_task/event_bridge.py#L128-L144](file:///src/agent/long_task/event_bridge.py#L128-L144) 与 [src/server/services/long_task_agent_service.py#L637](file:///src/server/services/long_task_agent_service.py#L637)
- **触发时机**：后台异步扫描任务检测到沙箱中产生新产物并成功同步至对象存储后。
- **真实 Payload 结构**：
  ```json
  {
    "type": "CUSTOM",
    "name": "long_task.artifacts_updated",
    "value": {
      "thread_id": "thread-109283",
      "new_count": 1,
      "artifacts": [
        {
          "artifact_id": "art-9f3e2a",
          "path": "/workspace/artifacts/output.xlsx",
          "title": "output.xlsx",
          "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "size_bytes": 1048576
        }
      ]
    }
  }
  ```
- **前端用途**：静默通知前端侧边栏文件树局部重刷，完全不干扰正在进行的流式对话。

---

### 3.5 报告流式生成与思考链类 (Report Streaming & Reasoning)

#### 15. 报告独立流式事件组 (`report_stream_*` / `manual_report_*`)
- **发射源与代码路径**：
  - Handler 拦截：[src/agent/nodes/report_nodes/report_handler.py#L82-L145](file:///src/agent/nodes/report_nodes/report_handler.py#L82-L145)
  - 节点完成通知：[src/agent/nodes/report_nodes/nodes.py#L438-L446](file:///src/agent/nodes/report_nodes/nodes.py#L438-L446)
  - 独立路由服务：[src/server/services/manual_report_service.py#L104-L129](file:///src/server/services/manual_report_service.py#L104-L129)
- **事件系列**：
  - `report_stream_chunk` / `manual_report_stream_chunk`：`{"chunk": "### 1. 背景介绍", "report_id": "rpt-a1b2c3"}`
  - `report_stream_end` / `manual_report_stream_end`：`{"report_id": "rpt-a1b2c3"}`
  - `report_stream_complete` / `manual_report_complete`：`{"report_id": "rpt-a1b2c3", "title": "2026战略规划报告", "action": "create"}`
  - `report_stream_error` / `manual_report_stream_error`：`{"report_id": "rpt-a1b2c3", "error": "LLM 超时"}`
- **前端用途**：报告 Token 游离于主对话流外，右侧分屏 Markdown 渲染器监听 `chunk` 增量追加，收到 `complete` 后提示保存。

#### 16. 模型思考链事件组 (`copilotkit_reasoning_*`)
- **发射源与代码路径**：[src/agent/factory/reasoning_handler.py#L96-L186](file:///src/agent/factory/reasoning_handler.py#L96-L186)
- **事件系列**：
  - `copilotkit_reasoning_start` / `copilotkit_reasoning_message_start`
  - `copilotkit_reasoning_content`：`{"messageId": "reasoning-98a1", "delta": "正在分析销售趋势..."}`
  - `copilotkit_reasoning_message_end` / `copilotkit_reasoning_end`
- **前端用途**：驱动前端流式展开“思考过程（Thinking Process）”折叠卡片，正文开始时自动收起。

---

## 4. 代表性端到端 Trace：ChatBI `antv_chart` 可视化图表生成

以 ChatBI 业务中用户请求“*绘制 2026 年 Q1 产品营收走势折线图*”为例，演示从算法节点产生数据到前端图表渲染的全生命周期端到端 Trace。

```
[ Step 1: Subgraph Node 生成并带外发射 ]
  文件: src/agent/nodes/visualization_nodes/nodes.py#L490
  代码: 
    activity_message_id = f"activity-viz-{uuid.uuid4().hex[:12]}"
    await adispatch_custom_event(
        "copilotkit_emit_activity",
        {
            "message_id": activity_message_id,
            "activity_type": "antv_chart",
            "content": {
                "component": "AntVChart",
                "chart_type": "line",
                "title": "2026年Q1产品营收走势",
                "spec": {"xField": "date", "yField": "revenue"},
                "data": [{"date": "2026-01", "revenue": 100}],
                "dataset_strategy": "inline_complete"
            }
        }
    )
       │
       ▼
[ Step 2: LangChain Callback 总线捕获 ]
  文件: langchain_core/callbacks/manager.py#L2614
  行为: 异步回调管理器捕获事件，以 version="v2" 格式输出 LangGraph 框架事件帧：
        {
          "event": "on_custom_event",
          "name": "copilotkit_emit_activity",
          "data": { "message_id": "activity-viz-98f1", ... },
          "run_id": "run-f182c4"
        }
       │
       ▼
[ Step 3: ag_ui_langgraph 框架适配层封装 ]
  文件: ag_ui_langgraph/agent.py#L1345
  行为: LangGraphAGUIAgent 拦截 on_custom_event 并封装为 AG-UI 原生 Pydantic 模型：
        CustomEvent(
            type=EventType.CUSTOM,
            name="copilotkit_emit_activity",
            value={ ... },
            raw_event={ ... }
        )
       │
       ▼
[ Step 4: agent_service 协议层中间件转译 ]
  文件: src/agent/middleware/activity_event_translator.py#L17-L32
  代码:
    if isinstance(event, CustomEvent) and event.name == "copilotkit_emit_activity":
        return ActivitySnapshotEvent(
            type=EventType.ACTIVITY_SNAPSHOT,
            message_id="activity-viz-98f1",
            activity_type="antv_chart",
            content=event.value.get("content"),
            replace=True
        )
       │
       ▼
[ Step 5: EventEncoder 序列化为 SSE 帧 ]
  文件: ag_ui/encoder/encoder.py#L28-L32
  输出文本流:
    data: {"type":"ACTIVITY_SNAPSHOT","message_id":"activity-viz-98f1","activity_type":"antv_chart","replace":true,"content":{"component":"AntVChart","chart_type":"line","title":"2026年Q1产品营收走势","spec":{"xField":"date","yField":"revenue"},"data":[{"date":"2026-01","revenue":100}],"dataset_strategy":"inline_complete"}}\n\n
       │
       ▼
[ Step 6: HTTP 网络流式传输 ]
  FastAPI 端点: POST /api/v1/graphs/react-agent/stream
  响应 Header: Content-Type: text/event-stream; charset=utf-8
       │
       ▼
[ Step 7: 前端消费与 AntV 挂载 ]
  文件: frontend-demo/src/agui.ts & App.tsx（未提交工作树独立 PoC 演示工程，仅作消费端示意；企业主前端不在本事实源内）
  过程:
    1. parseSSEChunk 解析出 AGUIEvent { type: "ACTIVITY_SNAPSHOT", activity_type: "antv_chart", ... }
    2. handleAGUIEvent 匹配到 ACTIVITY_SNAPSHOT
    3. 前端 UI 容器实例化 <AntVChartRenderer spec={content.spec} data={content.data} />
    4. 用户界面无缝呈现交互式折线图，主对话窗口仅显示简短提示文字！
```

---

## 5. 架构设计总结与工程规范

1. **执行域与协议域严格解耦**：
   - 执行期（Graph 内部）：仅使用 `adispatch_custom_event` / `dispatch_agui_custom_event` 广播原生语义。
   - 协议期（Service 层）：由 `agent_service.py` 组织的中间件流水线完成中文化、快照修复、Schema 适配与统计度量，严禁在 LangGraph 节点内硬编码协议转换。
2. **状态与消息血缘神圣不可侵犯**：
   - 坚决废弃原地篡改 `tool_call_id` 的 `ToolIDRewriter`，全面转向由 `ToolStatisticsCollector` 发送旁路 `tool_usage` CustomEvent，彻底保全了 Checkpoint 的一致性与可恢复性。
3. **带外数据（Out-of-band）保护大模型上下文**：
   - 巨量图表 Spec（`antv_chart`）、复杂组件树（`a2ui_surface`，原型）与长篇流式报告（`report_stream_chunk`）一律通过 Custom / Activity 事件通道直接分发给浏览器，ToolMessage 仅回传极简文本摘要，显著节约 Token 成本并防止模型注意力分散。
