# Fragment: 多工具并发调用的真实现状与面试方案 (`f03`)

> **定位说明**：针对 Follow-up #3，解答“§1.7 多工具并发：项目现状是否实现并发调用？缺陷如何解决（面试方案）”。本文件作为独立研究底稿片段，供后续整合至 `recap-blog.md` §1.7。

---

## 1. 电梯答案 (Elevator Answer)

1. **框架能力层**：锁定版本 `langgraph 1.2.8` 的 `ToolNode` **原生完全支持**多工具并发执行。异步运行时调用 `_afunc()` 解析 `AIMessage` 中的全部 `tool_calls`，通过 `asyncio.gather(*coros)` 实现全并发调度；同步运行时则通过 `ThreadPoolExecutor.map()` 并行执行。
2. **项目现状层**：`develop` 基线中，若 LLM 返回的多个 `tool_calls` **同属于普通/MCP/RAG 工具**（即目标均为 `tool_executor`），`route()` 检查 `tool_calls[0]` 命中 `tool_executor`，`ToolNode` 接收完整 `AIMessage` 并**真实并发执行了所有工具**（`FACT-RT-004`）。
3. **缺陷边界层**：若 LLM 返回**跨子图与普通工具的混合调用**（如 `[visualize, search_weather]`），`src/agent/factory/agent_factory.py#L653` 的 `route()` 硬编码仅检查 `tool_calls[0]` 并路由至 `visualization_subgraph`。子图执行完毕后直接回边到 `agent`，导致排在后面的普通工具调用被**静默丢弃（Silent Dropping）**，从未被任何执行器消费。
4. **面试方案层**：推荐采用 **“LangGraph `Command(goto=[Send(...)])` 动态扇出分发方案”**（建议方案，非已实现）：在条件路由层对 `tool_calls` 按执行节点归类，若检测到多节点混合调用，返回包含多个 `Send` 任务的 `Command` 分发至对应节点并发或有序执行，在 Agent 回边聚合前补齐各工具的 `ToolMessage`，彻底消除消息孤儿。

---

## 2. 详解 (Detailed Analysis)

### 2.1 框架能力层：LangGraph 1.2.8 ToolNode 原生并发机制

在 `.scratch/langagent-framework-sources/langgraph/prebuilt/tool_node.py` 中，`ToolNode` 实现了完善的多工具调用并发执行能力：

1. **多 ToolCall 完整提取** (`tool_node.py#L834`, `_parse_input` 定义于 `L1224`，tool_calls 提取在 ~L1265)：
   `_afunc` 入口调用 `_parse_input(input)`，当接收到包含多个工具调用的 `AIMessage` 时，不会做任何截断，完整提取出 `tool_calls: list[ToolCall]` 列表。
2. **异步协程并发调度** (`tool_node.py#L855-L858`)：
   ```python
   coros = []
   for call, tool_runtime in zip(tool_calls, tool_runtimes, strict=False):
       coros.append(self._arun_one(call, input_type, tool_runtime))
   outputs = await asyncio.gather(*coros)  # 真正底层并发
   ```
3. **同步线程池并行调度** (`tool_node.py#L821-L824`)：
   ```python
   with get_executor_for_config(config) as executor:
       outputs = list(
           executor.map(self._run_one, tool_calls, input_types, tool_runtimes)
       )
   ```
4. **输出扁平化与聚合** (`tool_node.py#L862-L888`)：
   `_combine_tool_outputs` 将 `asyncio.gather` 返回的多个 `ToolMessage` 展平为一个列表 `{self._messages_key: flat_outputs}`，通过 LangGraph 的 Reducer（如 `add_messages`）一次性追加回状态中。

---

### 2.2 项目现状层：develop 基线的实际执行路径与路由机制

在 `src/agent/factory/agent_factory.py#L636-L719` 中，系统构建了包含主 Agent、子图节点与通用工具执行器的状态图：

```python
# 注册 MCP/RAG 通用工具节点
if direct_execution_tools:
    builder.add_node("tool_executor", ToolNode(direct_execution_tools))

# 条件路由函数
def route(state: MainAgentState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return END

    last_msg = messages[-1]
    if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
        return END

    # 注意：仅检查首个工具调用（编者注，非源码注释）
    tool_name = last_msg.tool_calls[0]["name"]

    # 1. 业务子图入口路由
    if tool_name in builtin_routes:
        return builtin_routes[tool_name]

    # 2. 普通 MCP/RAG 工具路由
    if direct_execution_tools and tool_name in {t.name for t in direct_execution_tools}:
        return "tool_executor"

    return END
```

由此产生的实际执行分流如下：
- **纯普通工具多调用**（如 `tool_calls = [search_knowledge_base, search_weather]`）：
  - `route()` 检查 `tool_calls[0]` 为 `search_knowledge_base`，返回 `"tool_executor"`；
  - `tool_executor` 节点（即 `ToolNode`）接收整个 `AIMessage`，`_afunc` 提取全部 2 个调用并通过 `asyncio.gather` 并发执行；
  - 返回 2 个 `ToolMessage`，状态正常合并，**并发执行成功**。
- **纯子图单工具调用**（如 `tool_calls = [visualize]`）：
  - `route()` 命中 `"visualization_subgraph"`，进入子图执行，执行完毕回边到 `agent`，**单调用执行成功**。

---

### 2.3 缺陷影响层：跨节点混合调用缺陷剖析 (`FACT-RT-004`)

#### 2.3.1 触发条件 (Trigger Conditions)
当大模型在单轮推理中同时生成了**子图入口工具**与**普通 MCP/RAG 工具**时触发，典型输入：
```python
AIMessage(
    content="",
    tool_calls=[
        {"name": "visualize", "args": {"hint": "chart"}, "id": "call_001"},
        {"name": "search_weather", "args": {"city": "北京"}, "id": "call_002"},
    ]
)
```

#### 2.3.2 运行后果与源码级原因 (Failure Mechanism)
1. **路由盲区**：`route()` 仅依据 `tool_calls[0]`（`visualize`）将控制流转向 `visualization_subgraph`。
2. **子图无视多余工具**：`visualization_subgraph` 内部仅解析处理与其领域强绑定的 `visualize` 工具调用并产生对应输出。
3. **静默丢弃（Silent Dropping）**：子图执行完毕后根据静态边 `builder.add_edge("visualization_subgraph", "agent")` 直接回边到 `agent` 节点。
4. **状态与上下文不一致**：`search_weather`（`call_002`）从未被投递给 `tool_executor`，也未生成对应的 `ToolMessage`。当下一轮 `agent` 节点被激活时，LLM 上下文中存在一个未被回应的 `tool_call_id="call_002"`，违反了 OpenAI/Anthropic 工具调用必须 1:1 配对的协议约定，可能导致模型出现重复调用或幻觉报错。

#### 2.3.3 测试与影响边界
在 `tests/test_multi_tool_calls.py#L90-L160` 中，通过模拟用例明确指出了该缺陷。但在实际生产业务中，因 Prompt 编排与模型微调倾向于“先查询数据、下一轮再生成图表”，多工具跨子图混合调用的触发概率较低，属于已知架构边缘技术债（`FACT-RT-004`）。

---

### 2.4 修复方案层：面向面试的技术方案设计 (Interview Solutions)

> **声明**：以下修复方案为面试架构演进与技术选型建议方案（Suggested Solutions），未在基线 `develop` 分支中落地。

#### 2.4.1 候选方案对比 (Candidate Approaches)

| 方案 | 核心思路 | 优点 | 缺点 / 权衡 |
|---|---|---|---|
| **方案 1（推荐）：LangGraph `Command` + `Send` 动态扇出分发** | 在 `route()` 层使用 `Command(goto=[Send(...), ...])`，将同轮混合的 `tool_calls` 按目标节点拆分并并行/串行派发。 | • 原生兼容 LangGraph 架构<br>• 支持真正跨节点并行<br>• 不破坏各子图现有封装 | • 需要将条件边返回值升级为 `Command`<br>• 需保证各节点返回结果汇总写入 Reducer 时无冲突 |
| **方案 2：Prompt 级互斥约束 + 校验拦截（防御兜底）** | 在 System Prompt 中注入负向约束（禁止单轮同时调用子图与数据工具）；并在 `route()` 中增加 assert，一旦违规直接回传错误 `ToolMessage`。 | • 零架构改动成本<br>• 实施迅速 | • 依赖大模型遵守度，无法在架构层面提供确定性保证<br>• 限制了高阶大模型的并行规划能力 |
| **方案 3：子图统一工具化（Subgraphs as BaseTool）** | 取消主图上的子图独立 Node，将所有子图统一包装为标准的 LangChain `BaseTool` 实例，平铺注入给唯一的 `ToolNode`。 | • 架构极简，彻底消除条件路由层<br>• 所有工具天然享受 `ToolNode` 的 `asyncio.gather` | • 破坏现有子图复杂的独立状态隔离与 Checkpoint 中断恢复能力<br>• 重构成本高 |

---

#### 2.4.2 推荐方案白板级伪代码 (Whiteboard Implementation)

基于 LangGraph `Command` 与 `Send` 的动态调度方案伪代码：

```python
from typing import Literal
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.types import Command, Send

def route_multi_tool(state: MainAgentState) -> str | Command:
    """建议方案：支持跨节点混合调用的增强条件路由函数."""
    messages = state.get("messages", [])
    if not messages:
        return END

    last_msg = messages[-1]
    if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
        return END

    tool_calls = last_msg.tool_calls

    # 1. 收集目标执行节点
    direct_calls = []
    subgraph_sends = []

    for call in tool_calls:
        name = call["name"]
        if name in builtin_routes:
            # 针对子图入口构造独立的 Send 任务
            target_subgraph = builtin_routes[name]
            subgraph_sends.append(
                Send(target_subgraph, {"messages": [last_msg], "target_tool_call": call})
            )
        elif direct_execution_tools and name in {t.name for t in direct_execution_tools}:
            direct_calls.append(call)
        else:
            # 未知工具立即生成兜底错误 ToolMessage 避免挂起
            pass

    # 场景 A: 单一节点调用（退化为原生快速路径）
    if not subgraph_sends and direct_calls:
        return "tool_executor"
    if len(subgraph_sends) == 1 and not direct_calls:
        # 单一子图直接返回节点名称
        return builtin_routes[tool_calls[0]["name"]]

    # 场景 B: 跨节点混合调用（动态扇出）
    goto_targets = list(subgraph_sends)
    if direct_calls:
        # 将普通工具列表打包给 tool_executor
        goto_targets.append(
            Send("tool_executor", {"messages": [last_msg.model_copy(update={"tool_calls": direct_calls})]})
        )

    # 统一通过 Command(goto=...) 扇出执行
    return Command(goto=goto_targets)
```

---

#### 2.4.3 回归验证思路 (Regression Testing Strategy)

为确保修复后不破坏现有状态流转并覆盖全部边界，测试矩阵应覆盖以下场景：

1. **场景 1：纯普通 MCP/RAG 工具并发**（如 `[search_knowledge_base, search_weather]`）
   - 验证点：`tool_executor` 单节点执行，返回 2 个 `ToolMessage`，耗时接近 `max(t1, t2)` 而非 `t1 + t2`。
2. **场景 2：纯子图工具单调用**（如 `[visualize]`）
   - 验证点：精准路由到 `visualization_subgraph`，子图产物正常写入 State。
3. **场景 3：子图 + MCP 混合调用**（如 `[visualize, search_weather]`）
   - 验证点：`visualize` 与 `search_weather` 分别在 `visualization_subgraph` 和 `tool_executor` 中执行，两者的 `ToolMessage`（`call_id` 匹配）全部追加至 `state["messages"]`，Agent 收到完整上下文。
4. **场景 4：多子图混合调用**（如 `[visualize, chatbi_text2sql]`）
   - 验证点：两个独立子图均被分发调度，状态合并时无 Reducer 冲突。

---

## 3. 示例与对照表 (Examples & Comparison Tables)

### 表 1：单轮多工具调用场景行为对比矩阵

| 调用场景 | 模型输出 `tool_calls` | 当前 develop 实际行为 | 当前缺陷与风险 | 建议方案执行行为 |
|---|---|---|---|---|
| **场景 1：纯普通工具并发** | `[search_rag, weather_mcp]` | `route()` 取首项命中 `tool_executor`；`ToolNode` 内部 `asyncio.gather` 并发执行 | **无缺陷**（Happy Path） | 保持 `tool_executor` 并发执行 |
| **场景 2：子图 + 普通工具混合** | `[visualize, weather_mcp]` | `route()` 取首项命中 `visualization_subgraph`；子图执行后回边 `agent` | **严重缺陷**：`weather_mcp` 被静默丢弃，丢失工具响应 | `Command(goto=[Send(subgraph), Send(tool_node)])` 并发分发，结果全部回填 |
| **场景 3：普通工具 + 子图混合** | `[weather_mcp, visualize]` | `route()` 取首项命中 `tool_executor`；`ToolNode` 尝试执行 `visualize` 失败/报错 | **严重缺陷**：`ToolNode` 中未注册子图虚拟工具，导致执行报错 | 正确拆解工具列表，分别派发至 `tool_executor` 与子图 |
| **场景 4：多子图混合** | `[visualize, chatbi_text2sql]` | `route()` 取首项命中 `visualization_subgraph` | **严重缺陷**：`chatbi_text2sql` 被静默丢弃 | 扇出派发至两个子图，等待全部完成后回边 `agent` |

---

### 表 2：修复候选方案选型与权衡对照表

| 评估维度 | 方案 1：LangGraph Command 扇出分发 (推荐) | 方案 2：Prompt 互斥约束 (兜底) | 方案 3：子图平铺 ToolNode (重构) |
|---|---|---|---|
| **改动范围** | 仅修改 `agent_factory.py` 的路由函数与状态传递 | 仅修改 System Prompt / Schema | 重构所有子图为标准 BaseTool |
| **解决彻底性** | 彻底解决（引擎级保证） | 部分缓解（依赖模型遵循度） | 彻底解决 |
| **子图状态隔离** | 完全保留子图独立状态与 Checkpoint | 完全保留 | 丧失子图级独立状态机控制力 |
| **实现复杂度** | 中等（需熟悉 LangGraph `Command/Send` API） | 极低（改提示词） | 极高（改动整个 Agent 编译拓扑） |
| **面试推荐指数** | ⭐⭐⭐⭐⭐ (展现深入掌握 LangGraph 核心控制流) | ⭐⭐⭐ (作为工程兜底防线补充) | ⭐⭐ (作为反面权衡对比) |

---

## 4. 证据清单 (Evidence List)

### 4.1 框架源码证据 (Framework Sources)
- `.scratch/langagent-framework-sources/langgraph/prebuilt/tool_node.py#L828-L860`：`ToolNode._afunc` 使用 `asyncio.gather(*coros)` 并发执行多个 `tool_calls`。
- `.scratch/langagent-framework-sources/langgraph/prebuilt/tool_node.py#L800-L826`：`ToolNode._func` 使用 `executor.map` 线程池执行同步工具。
- `.scratch/langagent-framework-sources/langgraph/prebuilt/tool_node.py#L862-L900`：`ToolNode._combine_tool_outputs` 展平并合并多个 `ToolMessage` 输出。

### 4.2 项目源码证据 (Project Sources)
- `.scratch/langagent-develop-reference/src/agent/factory/agent_factory.py#L636-L638`：`tool_executor` 节点注册 `ToolNode(direct_execution_tools)`。
- `.scratch/langagent-develop-reference/src/agent/factory/agent_factory.py#L650-L678`：`route()` 函数仅读取 `last_msg.tool_calls[0]["name"]` 进行单分支路由判断。
- `.scratch/langagent-develop-reference/src/agent/factory/agent_factory.py#L684-L719`：条件边映射与子图节点静态回边配置。

### 4.3 测试用例证据 (Test Sources)
- `.scratch/langagent-develop-reference/tests/test_multi_tool_calls.py#L34-L86`：`test_direct_tool_execution` 以顺序模拟方式验证多工具批量调用返回 `ToolMessage` 的基本形态（架构模拟用例，非全图强回归，定性见 `FACT-RT-004`）。
- `.scratch/langagent-develop-reference/tests/test_multi_tool_calls.py#L89-L160`：`test_route_logic` 模拟当前 `route()` 逻辑，确认跨子图混合调用时后续工具被丢弃的缺陷。
- `.scratch/langagent-develop-reference/tests/test_multi_tool_calls.py#L162-L347`：架构分析、影响边界与修复建议代码。

### 4.4 Fact Base 锚点
- `fact-base.md` 条目 `FACT-RT-004` (L83)：确认多 `ToolCall` 路由缺陷事实与成熟度定义。
