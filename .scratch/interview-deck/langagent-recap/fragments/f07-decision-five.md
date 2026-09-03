# Fragment f07: 子图挂载机制重构——从 CompiledSubAgent 到 SubgraphToolMiddleware 详解

> 对应 follow-up: [#7 (follow-ups.md)](../follow-ups.md)  
> 对应 blog 小节: [§2.8 recap-blog.md](../recap-blog.md#28-决策插叙五子图挂载机制重构-fact-lt-009)  
> 涉及事实条目: `FACT-LT-009`, `DELTA-LT-002`, `DESIGN-LT-002`, `FACT-LT-001`

---

## 1. 电梯答案 (Elevator Pitch)

长任务 Agent 早期试图将 ChatBI / Visualization 子图包装为 `CompiledSubAgent` 供框架 `task` 工具调度，但 `deepagents 0.6.12` 会将子图输入粗暴重写为单条 `HumanMessage(description)`，导致依赖 `AIMessage.tool_calls` 的子图入口节点因参数丢失抛 `KeyError` 崩溃；我们推翻了该方案，改用自研 `SubgraphToolMiddleware` 在中间件层（`awrap_tool_call`）拦截 schema-only 工具调用，直接透传完整状态并在子图执行后通过 `Command(update=...)` 双向同步领域状态与 `ToolMessage`。

---

## 2. 机制详解 (Deep Dive)

### 2.1 触发场景与架构背景

在 Long Task Agent 演进过程中，智能体基于 `deepagents 0.6.12` 框架的 `create_deep_agent()` 构建，需要在一个长程会话中自由调度多项垂直复杂业务能力：
- **ChatBI Text-to-SQL**：`chatbi_text2sql(query)` 多轮取数与纠错子图；
- **Visualization**：`visualize(user_hint)` 图表规范推导与 AntV Spec 生成子图；
- **Report Expert**：`manage_report(action, instruction)` 深度研报撰写子图。

这些子图在普通 Agent（基于 `LangGraph` 原生构建）中已经非常成熟，各自拥有严密的状态机、提示词体系和入口解析契约。

---

### 2.2 早期方案与框架冲突根因

#### ❌ 早期规划方案（CompiledSubAgent 模式，`DESIGN-LT-002`，已废弃）
Phase 1 方案规划按照 `deepagents` 官方的多 Agent 模式，将业务子图包装为 `CompiledSubAgent`，注册进 `create_deep_agent(subagents=[...])`，大模型通过内置的通用调度工具 `task(description="...", subagent_type="report-expert")` 来调用子图。

#### 💥 框架致命冲突分析
当 `deepagents` 的 `SubAgentMiddleware` 处理 `task` 工具时，其状态准备逻辑（`deepagents/middleware/subagents.py` L655-L666，锁定 0.6.12）如下：

```python
def _validate_and_prepare_state(subagent_type, description, runtime):
    subagent_state = {k: v for k, v in runtime.state.items() if k not in _EXCLUDED_STATE_KEYS}
    subagent_state["messages"] = [HumanMessage(content=description)]  # 💥 致命根因
    return subagent, subagent_state
```

框架为了保证通用子 Agent 的独立性，将 `messages` 强制覆盖为了只有一条纯文本描述的 `HumanMessage`。然而，我们既有的三大业务子图入口契约依赖大模型结构化 Tool Calling：

| 子图名称 | 入口节点函数 | 强依赖的输入契约 | 框架覆盖导致的故障后果 |
|---|---|---|---|
| **ChatBI** | `chatbi_entry_node()` | `messages[-1]` 为包含 `chatbi_text2sql(query)` 的 `AIMessage` | 入口节点对缺失 `tool_calls` 优雅降级（记 `NodeStatus.FAILED` 并返回 state），但下游节点因缺 `pipeline_flags`/`user_input` 抛 `KeyError` 崩溃 |
| **Visualization** | `extract_visualization_request()` | `messages[-1]` 为包含 `visualize(user_hint)` 的 `AIMessage` | 无法提取 `user_hint`，图表生成中断 |
| **Report Expert** | `route_action()` | `messages[-1]` 为包含 `manage_report(action, instruction)` 的 `AIMessage` | 结构化动作丢失，默认走入空 action 假 query |

---

### 2.3 方案权衡与 SubgraphToolMiddleware 架构设计

#### 候选方案对比

1. **方案 A（侵入式双轨改造）**：
   - 侵入修改 `deepagents` 源码透传 messages，或改造所有业务子图入口以支持文本和 ToolCall 双轨解析。
   - *代价*：破坏第三方框架升级能力，使子图逻辑高度脆弱且难以维护。
2. **方案 B（自研 `SubgraphToolMiddleware` 中间件拦截，`FACT-LT-009`）**：
   - 利用 `deepagents` 官方一等公民扩展点 `AgentMiddleware.awrap_tool_call`；
   - 子图在主 Agent 中仅作为 schema-only `@tool` 注册（提供给 LLM 进行 Tool Calling 决策）；
   - 中间件在底层拦截对应工具调用，直接 invoke 对应编译好的子图，保持子图接收到的 state 与普通 Agent 完全对等。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SubgraphToolMiddleware 拦截与同步机制                            │
│                                                                                        │
│   LLM 决策生成: AIMessage(tool_calls=[chatbi_text2sql(query="近7天销售额")])          │
│        │                                                                               │
│        ▼                                                                               │
│   【SubgraphToolMiddleware.awrap_tool_call 拦截】                                      │
│        │ 检查 tool_name in _registry                                                   │
│        ▼                                                                               │
│   深拷贝主图状态: subgraph_input = deepcopy(dict(request.state))                        │
│   (包含完整的 messages 历史与 AIMessage.tool_calls)                                    │
│        │                                                                               │
│        ▼                                                                               │
│   CompiledStateGraph 执行: result_state = await graph.ainvoke(subgraph_input, config)  │
│        │                                                                               │
│        ▼                                                                               │
│   提取 ToolMessage 与领域字段 (data_envelope / visualization_result / report_draft)    │
│        │                                                                               │
│        ▼                                                                               │
│   返回: Command(update={"messages": [tool_msg], "data_envelope": envelope})            │
│        │ (原子合并回主图 State)                                                         │
│        ▼                                                                               │
│   LLM 进入下一步推理 (读取 data_envelope 并决策下一步动作)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 具体示例：一次端到端真实执行序列

### 场景：用户提问“查询近 7 天各区域销售额并生成柱状图”

```python
# 步骤 1: LLM 生成 ChatBI 子图入口调用
ai_message = AIMessage(
    content="",
    tool_calls=[
        {
            "name": "chatbi_text2sql",
            "id": "call_sql_001",
            "args": {"query": "近7天各区域销售额"}
        }
    ]
)

# 步骤 2: SubgraphToolMiddleware 拦截并执行
# request.state 包含完整 messages=[..., ai_message], chatbi_config={...}, llm_config={...}
# 中间件检测到 "chatbi_text2sql" in registry，直接调用 chatbi_graph.ainvoke(subgraph_input)

# 步骤 3: ChatBI 子图内部流转完成 Text2SQL 与数据库执行，生成 DataEnvelope
envelope = DataEnvelope(
    row_count=4,
    column_metadata=[
        ColumnMeta(field="region", type="string", alias="区域"),
        ColumnMeta(field="sales", type="number", alias="销售额")
    ],
    sample_rows=[{"region": "华东", "sales": 32000}, {"region": "华北", "sales": 18000}],
    full_data=[{"region": "华东", "sales": 32000}, {"region": "华北", "sales": 18000}],
    query_sql="SELECT region, sum(sales) AS sales FROM sales_data WHERE date >= ... GROUP BY region"
)
tool_msg = ToolMessage(
    content="SQL 查询成功，已获取 4 条区域销售数据",
    tool_call_id="call_sql_001"
)

# 步骤 4: 中间件返回 Command 对象原子写回主图
return Command(
    update={
        "messages": [tool_msg],
        "data_envelope": envelope
    }
)

# 步骤 5: 主图 State 原子更新
# messages 列表安全追加 ToolMessage(call_sql_001)，主图 state["data_envelope"] 注入最新数据

# 步骤 6: 主模型根据最新 State 发起第二步调用：图表可视化
ai_vis_message = AIMessage(
    content="",
    tool_calls=[
        {
            "name": "visualize",
            "id": "call_vis_002",
            "args": {"user_hint": "生成柱状图展示区域销售额对比"}
        }
    ]
)
# 中间件再次拦截 "visualize"，子图读取 state["data_envelope"] 成功生成 AntV Spec 并回写！
```

---

## 4. 证据清单 (Evidence List)

1. **核心中间件源码**：
   - `src/agent/long_task/subgraph_tool_middleware.py`：
     - 第 20-29 行定义 `LongTaskSharedState` 共享状态（含 `messages`、`data_envelope`、`visualization_result`、`report_draft`）。
     - 第 31-35 行定义 `_SUBGRAPH_RESULT_FIELDS` 回写白名单。
     - 第 48-108 行实现 `awrap_tool_call()`：拦截子图工具、深拷贝注入 state、`ainvoke` 执行、提取 ToolMessage 并返回 `Command(update=...)`。
2. **完整单元测试**：
   - `tests/test_long_task_subgraph_tool_middleware.py`：
     - 第 55-99 行 `test_subgraph_tool_middleware_returns_command_with_shared_state` 验证了子图正常执行后 `Command` 对 `data_envelope` 与 `messages` 的双向状态同步。
     - 第 101-115 行 `test_subgraph_tool_middleware_returns_error_tool_message_on_failure` 验证了子图抛异常时自动封装 `ToolMessage(status="error")` 优雅降级。
3. **架构方案文档与演进记录**：
   - 改造方案与设计对比：`long_task_subgraph_middleware_prd_and_solution.md`（第 1-150 行详细阐明了从 CompiledSubAgent 到 SubgraphToolMiddleware 的重构背景）。
   - 框架源码比对：`deepagents 0.6.12` 中 `deepagents/middleware/subagents.py` L655-L666。
4. **事实基准条目**：
   - `fact-base.md` 中 `FACT-LT-009`、`DELTA-LT-002` 与 `DESIGN-LT-002`。
