# Fragment f01: LangGraph 状态 Reducer 机制与 add_messages 修复详解

> 对应 follow-up: [#1 (follow-ups.md)](../follow-ups.md)  
> 对应 blog 小节: [§1.4 recap-blog.md](../recap-blog.md#14-langgraph-state-架构与-add_messages-reducer-稳定性修复-fact-rt-003)  
> 涉及事实条目: `FACT-RT-003`

---

## 1. 电梯答案 (Elevator Pitch)

`lambda x, y: x + y` 是纯 Python 列表粗暴拼接，完全无视消息 `id`，在子图写回、工具重试与 Checkpoint 状态修正时会导致**相同 ID 消息重复堆叠**、`ToolMessage` 与 `AIMessage.tool_calls` 的**配对拓扑被破坏**，进而导致下一轮大模型调用直接报 HTTP 400 协议错误；而 LangGraph 原生 `add_messages` Reducer 严格基于 `message.id` 实现了**同 ID 原位覆盖、新 ID 末尾追加、`RemoveMessage` 物理删除**的幂等语义，保障了分布式快照重放与多分支合并的拓扑一致性。

---

## 2. 机制详解 (Deep Dive)

### 2.1 触发场景与故障现象

在系统演进早期与部分领域子图初版（如 `ReportState`）中，消息通道曾定义为 `Annotated[List[BaseMessage], lambda x, y: x + y]`。在实际运行中，以下三个典型场景必定触发严重故障：

1. **子图回写与多分支状态同步**：
   - 当主图通过路由调用子图（如 `Visualization` 或 `ChatBI`），子图执行完成后将自身产生的 `[AIMessage, ToolMessage]` 写回主图状态。
   - 若子图状态初始化时继承了父图的全部历史消息，在退出合并时，`lambda x, y: x + y` 会把子图返回的列表全量拼接到父图列表之后，导致整段历史消息在 `messages` 中直接**翻倍重复**。
2. **工具重试与中间状态刷新**：
   - 当某个工具执行失败触发内部重试，或节点需要更新上一条 `ToolMessage` 的执行结果时，节点返回带有相同 `id` 的新 `ToolMessage`。
   - `lambda x, y: x + y` 无法执行原地更新，只能追加在列表末尾，导致消息列表中存在同一个 `tool_call_id` 的多个互相冲突的 `ToolMessage`。
3. **大模型 API 契约崩溃 (400 Bad Request)**：
   - 主流大模型（OpenAI、Anthropic、DashScope Qwen 等）对 Tool Calling 消息协议有严格的**拓扑配对强约束**：
     - 每个包含 `tool_calls=[{"id": "call_1", ...}]` 的 `AIMessage` 后面，必须紧跟且仅跟对应 `tool_call_id="call_1"` 的 `ToolMessage`。
     - 不允许出现孤立的 `ToolMessage`、不允许出现重复 ID 的 `ToolMessage`、不允许在 `AIMessage` 与 `ToolMessage` 之间插入非法的重复 `AIMessage`。
   - 粗暴拼接产生的乱序或重复消息送入 LLM 时，API 服务会因 tool_call 配对校验失败而拒绝请求（示意性报错形如 `Invalid message history: tool_call_id '...' does not match`，具体文案因供应商而异），导致 Agent 运行中断。

---

### 2.2 根因剖析：覆盖型 Reducer 如何破坏消息语义

```
【早期 lambda x, y: x + y 行为】
State Messages:  [UserMsg(1), AIMsg(2, call_id=A)]
Update:          [ToolMsg(3, call_id=A), AIMsg(4, "重试思考"), ToolMsg(5, call_id=A)]
合并后结果:       [UserMsg(1), AIMsg(2, call_id=A), ToolMsg(3, call_id=A), AIMsg(4, "重试思考"), ToolMsg(5, call_id=A)]
                  ↳ 出现同一个 call_id=A 的多个 ToolMessage，且中间被 AIMsg 阻断，LLM API 抛 400 崩溃！

【标准 add_messages 行为】
State Messages:  [UserMsg(id=1), AIMsg(id=2, call_id=A), ToolMsg(id=3, call_id=A, content="失败")]
Update:          [ToolMsg(id=3, call_id=A, content="成功")]  # 相同 id=3 执行原位更新
合并后结果:       [UserMsg(id=1), AIMsg(id=2, call_id=A), ToolMsg(id=3, call_id=A, content="成功")]
                  ↳ 严格保持 1:1 配对，历史线性整洁，幂等可重入！
```

1. **缺乏 ID 寻址与去重能力 (ID-Agnostic)**：
   - Python 原生 `+` 操作是纯物理追加，无法感知消息的唯一标识 `message.id`。
2. **破坏 Checkpoint 恢复与状态修正可重入性**：
   - LangGraph 依赖 Checkpointer 实现持久化与 Human-in-the-loop (HITL) 挂起恢复。
   - 当通过 `graph.update_state(config, values={"messages": [...]})` 人工修正历史消息（如修改用户指令或纠正工具输出）时，覆盖型 Reducer 只会将修改值追加在尾部，根本无法替换历史 checkpoint 中的脏数据。
3. **不支持物理删除语义**：
   - 无法通过向通道发送 `RemoveMessage(id=...)` 来剔除超长上下文或敏感内容。

---

### 2.3 add_messages 修复机制与核心契约

LangGraph 原生 `add_messages`（定义于 `langgraph.graph.message`）提供了严格的列表代数语义：

1. **根据 ID 唯一性合并 (Upsert)**：
   - 维护输入消息的 `id`（若未指定，系统自动生成 UUID）。
   - 遍历增量消息 `y`：若 `msg.id` 在当前 `x` 中已存在，则**在原索引位置就地替换**该消息；若不存在，则追加至列表末尾。
2. **显式删除支持 (`RemoveMessage`)**：
   - 若 `y` 中包含 `RemoveMessage(id="msg_xyz")`，`add_messages` 会遍历定位并从列表中物理移除对应 `id` 的消息，而非将其作为消息体加入。
3. **保持 Tool Calling 线性配对**：
   - 确保 `AIMessage.tool_calls` 与后续 `ToolMessage` 始终保持拓扑对应，消除因状态重放、子图重入产生的重复垃圾消息。

---

## 3. 具体示例：修复前后消息序列对照

### 场景：Agent 调用子图执行 Text2SQL，子图执行产生结果并写回主图

#### ❌ 修复前 (`lambda x, y: x + y`) 的故障序列

```python
# 初始主图状态
initial_state = {
    "messages": [
        HumanMessage(id="msg-1", content="查询近7天销售额"),
        AIMessage(
            id="msg-2",
            content="",
            tool_calls=[{"name": "chatbi_text2sql", "args": {"query": "近7天销售额"}, "id": "call-100"}]
        )
    ]
}

# 子图节点执行，返回包含自身上下文与结果的消息更新
subgraph_update = {
    "messages": [
        # 子图若误传了父图上下文
        HumanMessage(id="msg-1", content="查询近7天销售额"),
        AIMessage(
            id="msg-2",
            content="",
            tool_calls=[{"name": "chatbi_text2sql", "args": {"query": "近7天销售额"}, "id": "call-100"}]
        ),
        ToolMessage(id="msg-3", tool_call_id="call-100", content="SELECT sum(sales)... 结果: 50000")
    ]
}

# 使用 lambda x, y: x + y 合并后的 messages 列表：
merged_messages = initial_state["messages"] + subgraph_update["messages"]
# 结果列表包含 5 条消息：
# [
#   HumanMessage(id="msg-1", ...),
#   AIMessage(id="msg-2", tool_calls=[call-100]),
#   HumanMessage(id="msg-1", ...),                     <-- 错误重复
#   AIMessage(id="msg-2", tool_calls=[call-100]),      <-- 错误重复
#   ToolMessage(id="msg-3", tool_call_id="call-100")
# ]
# 💥 下一轮推理将 messages 传给 DashScope / OpenAI 时：
# 抛出 BadRequestError: "An assistant message with tool calls must be followed by tool messages..."
```

---

#### ✅ 修复后 (`add_messages`) 的正确序列

```python
from langgraph.graph.message import add_messages

# 同样执行合并
safe_messages = add_messages(initial_state["messages"], subgraph_update["messages"])

# 结果列表严格保持 3 条消息，按 ID 精确去重与追加：
# [
#   HumanMessage(id="msg-1", content="查询近7天销售额"),
#   AIMessage(id="msg-2", tool_calls=[{"name": "chatbi_text2sql", "id": "call-100", ...}]),
#   ToolMessage(id="msg-3", tool_call_id="call-100", content="SELECT sum(sales)... 结果: 50000")
# ]
# ✅ 拓扑结构合法，大模型顺利进入下一轮推理并生成最终自然语言回复。
```

---

## 4. 证据清单 (Evidence List)

1. **状态类型契约与 Reducer 标注**：
   - 主状态定义：`src/agent/core/state.py` 第 201 行：`messages: Annotated[List[BaseMessage], add_messages]` (`FACT-RT-003`)。
   - 基础状态定义：`src/agent/core/state.py` 第 38 行：`messages: Annotated[List[BaseMessage], add_messages]`。
   - 可视化子图状态：`src/agent/core/state.py` 第 118-119 行：`messages` 与 `vis_messages` 均声明为 `Annotated[List[BaseMessage], add_messages]`。
   - 历史遗留残留点：`src/agent/core/state.py` 第 139 行 `ReportState` 中仍保留有早期标注 `lambda x, y: x + y`，已作为后续重构治理项锚定。
2. **长任务子图共享状态契约**：
   - `src/agent/long_task/subgraph_tool_middleware.py` 第 23 行：`LongTaskSharedState` 中 `messages` 明确标注为 `Annotated[list[BaseMessage], add_messages]`。
3. **多工具并发与路由测试**：
   - `tests/test_multi_tool_calls.py`：第 34-87 行 `test_direct_tool_execution` 为架构模拟用例（顺序调用工具并断言批量 `ToolMessage` 数量与内容形态），用于演示多工具返回的消息结构，并非全图配对契约的强回归测试（定性见 `FACT-RT-004`）。
4. **事实登记库**：
   - `fact-base.md` 中 `FACT-RT-003` 明确记录 Reducer 升级背后的技术演进与缺陷修复背景。
