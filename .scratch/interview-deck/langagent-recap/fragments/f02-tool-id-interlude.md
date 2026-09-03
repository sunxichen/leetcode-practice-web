# Fragment f02: Tool ID 透传演进——从原地篡改到 ToolStatisticsCollector 旁路统计详解

> 对应 follow-up: [#2 (follow-ups.md)](../follow-ups.md)  
> 对应 blog 小节: [§1.6 recap-blog.md](../recap-blog.md#16-决策插叙三tool-id-透传演进从原地篡改到-toolstatisticscollector-旁路统计)  
> 涉及事实条目: `FACT-TOOL-006`, `DELTA-RT-001`, `DESIGN-AGUI-001`

---

## 1. 电梯答案 (Elevator Pitch)

前端需要将底层多个微观工具（如 `query_data` + `visualize`）聚合成单个宏观卡片并重命名展示，早期方案试图在 SSE 流中**原地篡改** `tool_call_id`，经评估该方案会破坏 `AIMessage.tool_calls` 与 `ToolMessage` 的 1:1 配对不变式、多轮会话恢复时必然触发大模型 API 400 校验失败，因此在落地前被否决；最终演进为**旁路通知**架构：主链路保持原生 `tool_call_id` 绝对纯洁，由 `ToolStatisticsCollector` 在 `RUN_FINISHED` 前发射 `tool_usage` CustomEvent 提供业务聚合元数据。

---

## 2. 机制详解 (Deep Dive)

### 2.1 前端为什么需要 1:N 聚合统计与中文重命名

根据产品设计（`tool_id.prd.md` 与 `docs/tool_id_透传架构方案.md`）：

1. **宏观与微观的概念错位**：
   - **前端视角（产品层）**：定义的是宏观业务插件（例如“智能可视化”，前端为其分配了 `tool_id = "vis_plugin_001"`，名称为“数据图表”）。
   - **后端视角（算法层）**：大模型为了完成该业务，在底层被拆分为多个原子算子（例如先调用 `query_data` 查数，再调用 `visualize` 生成 AntV Spec）。
2. **业务核心痛点**：
   - **UI 状态割裂**：前端希望两个连续执行的后端工具能合并渲染在同一个 UI 卡片中，展示“取数中 ➔ 绘图完成”的统一进度，而不是弹出两个互不相关的零散卡片。
   - **计量与计费**：前端大盘需要按照宏观 `tool_id` 统计用户调用各业务插件的次数。
   - **展示可读性**：需要将后端内部函数名（如 `search_knowledge_base`）映射为用户友好的中文名（“知识库检索”）。

---

### 2.2 方案 A（ToolIDRewriter 原地篡改）为什么必定崩溃

早期设计的方案 A（`DESIGN-AGUI-001`）试图在 SSE 流式编码前（`event_generator` 内部），通过 `ToolIDRewriter` 拦截 `ToolCallStartEvent`、`ToolCallArgsEvent`、`ToolCallResultEvent`，直接将事件内部的 `tool_call_id` 与 `tool_call_name` 强行篡改为前端下发的 `tool_id` 与中文名称。

该方案在单轮简单文本展示下看似可用，但在以下核心场景直接引发致命崩溃：

```
【方案 A 原地篡改的失败链路】

Turn 1 执行:
1. LLM 产生原生 ToolCall:       AIMessage(tool_calls=[{"id": "call_abc123", "name": "query_data"}])
2. ToolNode 执行并产生回执:      ToolMessage(tool_call_id="call_abc123", content="50000")
3. ToolIDRewriter 原地篡改:      SSE 输出事件被篡改为 tool_call_id="vis_plugin_001"
                                (此时 LangGraph 内部 Checkpoint 存的是 call_abc123，前端拿到的是 vis_plugin_001)

Turn 2 多轮恢复 / 客户端状态回传:
4. 前端将历史消息带回后端:       [..., AIMessage(tool_calls=[call_abc123]), ToolMessage(tool_call_id="vis_plugin_001")]
5. 后端组装 messages 送入 LLM:   LLM API 发现 AIMessage 里的 call_abc123 没有对应的 ToolMessage！
                                ToolMessage 里的 vis_plugin_001 也没有前置调用！
6. 💥 LLM API 校验失败:          400 Bad Request: "tool_call_id 'vis_plugin_001' does not match any tool_call"
```

此外，在 **1:N 复合工具场景** 下，`query_data`（原生 `call_1`）和 `visualize`（原生 `call_2`）均被篡改为相同的 `tool_call_id = "vis_plugin_001"`，导致消息流中出现两个 ID 完全相同的 `ToolMessage`，直接违反了 Tool Calling 协议的唯一性校验约束。

---

### 2.3 方案 B（ToolStatisticsCollector + tool_usage 旁路）设计

针对方案 A 的致命缺陷，我们确立了方案 B（`FACT-TOOL-006`，`DELTA-RT-001`）：**“主链路原生透传，度量信息旁路发射”**。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              方案 B 旁路度量架构流转图                                 │
│                                                                                        │
│  【LLM & LangGraph 主链路】                                                            │
│   AIMessage(tool_calls=[call_01, call_02]) ──► ToolNode ──► ToolMessage(call_01/02)   │
│   (保持原生 tool_call_id 绝对不变，保证 Checkpoint / LLM API 协议 100% 纯洁)           │
│                                                                                        │
│  【AG-UI SSE 事件流】                                                                  │
│   TOOL_CALL_START (call_01: query_data) ────────► 原样编码下发（前端展示底层微步动画）   │
│         │ (拦截记录)                                                                   │
│         ▼                                                                              │
│   ToolStatisticsCollector ──► 查询 ToolMappingRegistry (BUILTIN_AGGREGATION_RULES)     │
│         │                                                                              │
│         ▼ (收集到 records: [call_01 -> vis_plugin_001, call_02 -> vis_plugin_001])    │
│   【RUN_FINISHED 触发时】                                                              │
│   插入 CustomEvent(name="tool_usage", value={tool_calls: [...]}) ──► 旁路下发          │
│   下发 RUN_FINISHED                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **ToolMappingRegistry（请求级映射表）**：
   - 基于前端 `forwardedProps.dynamic_mcp_tools` 与内置规则 `BUILTIN_AGGREGATION_RULES = {"visualization": ("query_data", "visualize")}`，建立 `backend_tool_name -> (tool_id, tool_name)` 的反向解析索引。
2. **ToolStatisticsCollector 拦截与发射**：
   - 监听 `TOOL_CALL_START`：仅记录 `(tool_call_id, backend_tool_name, tool_id, tool_name)` 到内存列表 `_records`，不修改事件对象。
   - 监听 `RUN_FINISHED`：在真正结束前，构建 `CustomEvent(name="tool_usage", value={"tool_calls": [...]})` 插入事件流，提供前端所需的 1:N 聚合元数据。

---

## 3. 面试官追问时怎么讲（3 句话黄金版本）

> 1. **业务矛盾**：前端产品视角需要将底层多个细粒度算子（如查数与绘图）聚合成一个宏观工具卡片并进行中文命名与调用统计，但底层 LangGraph 与大模型 API 严格依赖原生 `tool_call_id` 的 1:1 状态配对拓扑。
> 2. **踩坑教训**：早期方案尝试在 SSE 协议层原地篡改 `tool_call_id`，经分析会在多轮会话恢复和 1:N 工具连续调用时引发 `tool_call_id` 碰撞与大模型 API 400 校验失败，故在实施前否决。
> 3. **架构解法**：我们推翻了原地篡改，改为“主链路原生透传 + 旁路 `tool_usage` CustomEvent 异步度量”的方案，既满足了前端的业务聚合统计，又彻底保全了 Checkpoint 状态快照与消息血缘的纯洁性。

---

## 4. 具体示例：数据结构与事件流对照

### 4.1 方案 B 真实发射的 `tool_usage` CustomEvent 结构

```json
{
  "type": "custom",
  "name": "tool_usage",
  "value": {
    "tool_calls": [
      {
        "tool_call_id": "call_9a8b7c_sql",
        "backend_tool_name": "query_data",
        "tool_id": "vis_plugin_001",
        "tool_name": "智能可视化"
      },
      {
        "tool_call_id": "call_1d2e3f_vis",
        "backend_tool_name": "visualize",
        "tool_id": "vis_plugin_001",
        "tool_name": "智能可视化"
      }
    ]
  }
}
```

### 4.2 完整的 SSE 事件时序

```text
event: tool_call_start
data: {"type": "TOOL_CALL_START", "tool_call_id": "call_9a8b7c_sql", "tool_call_name": "query_data"}

event: tool_call_result
data: {"type": "TOOL_CALL_RESULT", "tool_call_id": "call_9a8b7c_sql", "content": "{\"row_count\": 10}"}

event: tool_call_start
data: {"type": "TOOL_CALL_START", "tool_call_id": "call_1d2e3f_vis", "tool_call_name": "visualize"}

event: tool_call_result
data: {"type": "TOOL_CALL_RESULT", "tool_call_id": "call_1d2e3f_vis", "content": "{\"spec\": {...}}"}

event: custom
data: {"type": "CUSTOM", "name": "tool_usage", "value": {"tool_calls": [{"tool_call_id": "call_9a8b7c_sql", "backend_tool_name": "query_data", "tool_id": "vis_plugin_001", "tool_name": "智能可视化"}, {"tool_call_id": "call_1d2e3f_vis", "backend_tool_name": "visualize", "tool_id": "vis_plugin_001", "tool_name": "智能可视化"}]}}

event: run_finished
data: {"type": "RUN_FINISHED", "thread_id": "thread-1", "run_id": "run-1"}
```

---

## 5. 证据清单 (Evidence List)

1. **核心中间件源码**：
   - `src/agent/middleware/tool_statistics_collector.py`：
     - 第 1-11 行清晰注释：“与已废弃的 `ToolIDRewriter` 的关键区别：不修改任何 `tool_call_id` 或 `tool_call_name`，保持 LangGraph 原生值不变，通过‘旁路通知’而非‘原地篡改’提供前端所需的业务映射信息”。
     - 第 35-100 行实现 `process()` 处理 `TOOL_CALL_START` 收集并在 `RUN_FINISHED` 前插入 `tool_usage` CustomEvent。
2. **映射注册表源码**：
   - `src/agent/middleware/tool_id_registry.py`：
     - 第 32-34 行声明 `BUILTIN_AGGREGATION_RULES: dict[str, tuple[str, ...]] = {"visualization": ("query_data", "visualize")}`。
     - 第 7-11 行说明 `tool_id`（前端展示）与 `tool_call_id`（LLM 原生调用）的概念隔离。
3. **单元测试验证**：
   - `tests/test_agent_generate_events.py`：第 69-100 行 `test_generate_events_filters_raw_and_preserves_event_order` 验证事件流水线顺序与原生 ID 保持。
   - `tests/test_agent_blocking_aggregator.py`：第 108-149 行 `test_collects_tool_result_rag_usage_and_activity` 验证聚合器准确消费 `tool_usage` CustomEvent。
4. **历史设计与演进记录**：
   - 原废弃设计：`tool_id.prd.md`、`docs/tool_id_透传架构方案.md` (`DESIGN-AGUI-001`)。
   - 事实基准：`fact-base.md` 中 `FACT-TOOL-006` 与 `DELTA-RT-001`。
