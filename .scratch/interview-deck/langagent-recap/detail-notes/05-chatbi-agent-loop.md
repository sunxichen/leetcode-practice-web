# 专题五：ChatBI Agent Loop 版本详解

> **成熟度标注**：`prototype_verified`（独立参考分支原型实现）  
> **代码基线位置**：[chatbi_agent_graph.py](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py)（参考分支 `.scratch/langagent-chatbi-agent-loop-reference`）  
> **主线基线位置**：[graph.py](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/graph.py)（主线分支 `.scratch/langagent-develop-reference`）  
> **主线状态**：**未合入 `develop` 主线，无主线配套单元测试，未上线**（与事实基准 `FACT-BI-003`, `FACT-BI-004`, `ORAL-T08-CBI-001`, `ORAL-T08-CBI-002` 严格一致）。

---

## 1. 演进动机与核心设计决策

### 1.1 第一代架构：固定 6 节点 DAG 的结构性瓶颈 (`FACT-BI-001`, `DESIGN-BI-001`)

在 `develop` 主线基线中，ChatBI 子图被实现为一个严格的 **固定流水线（Fixed Pipeline DAG）**（源码见 [graph.py:L26-L74](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/graph.py#L26-L74)）。其拓扑结构包含 6 个命名节点：

```
START ──► entry ──► query_rewrite ──► sql_generation ──► sql_self_check ──┬──► exit ──► END
                                                                │         ▲
                                                    (报错纠错)   └──► error_correction ──┘
```

该流水线在处理企业真实复杂取数场景时暴露了四大结构性缺陷：

1. **单次生成与被动纠错的“脆弱链路”**：
   - Happy Path 仅经过 5 个节点（`entry` ➔ `query_rewrite` ➔ `sql_generation` ➔ `sql_self_check` ➔ `exit`）。
   - `sql_self_check` 节点仅基于数据库返回的错误码（`code != 0`）进行简单的语法级检验。当 SQL 语法完全合规但业务逻辑错误（例如使用了错误的聚合维度或错误的列名过滤条件，即“Plausible but wrong”）时，系统直接放行至 `exit` 节点。
   - `error_correction` 仅提供 **1 次** 被动修正机会，一旦纠错后的 SQL 再次执行失败，流程直接终止，无后续重试或降级空间。
2. **Schema 暴力灌入与 Token 浪费**：
   - 早期流水线通过 `table_name_list` 将所有关联表的 DDL 转换为全量 M-Schema 字符串，无差别塞入 Prompt（[sql_generation_node.py:L305-L335](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/nodes/sql_generation_node.py#L305-L335)），导致模型注意力被无关列稀释，容易发生幻觉关联。
3. **缺乏列值探测能力（Value Blindness）**：
   - 用户提问常使用自然语言简称或别名（如“杭州”、“技术部”），而数据库底层物理枚举值可能是“杭州市”、“研发中心-技术部”。固定流水线无法在生成 SQL 前探查物理字段的真实取值分布，导致生成的 SQL `WHERE` 条件命中率低下。
4. **缺乏意图歧义主动澄清机制**：
   - 当用户查询存在歧义时，固定流水线只能依赖大模型强行“猜测”用户意图生成单条 SQL，无法向主 Agent 返回结构化追问选项。

---

### 1.2 演进决策与权衡：从动态选表到全量内联 (`DESIGN-BI-002` ➔ `DESIGN-BI-003` ➔ `DELTA-BI-001`)

在向智能体化（Agentic）重构的过程中，团队经历了一次关键的架构决策收敛：

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ChatBI 架构演进决策路径                                        │
│                                                                                                  │
│  【早期重设计设想 (DESIGN-BI-002)】                                                               │
│    - 5 个工具：包含 get_table_schema 动态按需选表工具                                             │
│    - 流程：模型先调用 get_table_schema 获取表结构 ──► 再生成 SQL ──► 试执行                      │
│                                                                                                  │
│                                       │                                                          │
│                                       ▼ 经业务场景数据评估否定 (DELTA-BI-001)                    │
│                                                                                                  │
│  【最终实施方案 (DESIGN-BI-003 / chatbi-agent-loop 参考分支)】                                    │
│    - 决策 1：否定 get_table_schema 动态选表工具                                                  │
│      • 动机：企业单技能（app_info_id）通常仅绑定 3~4 张业务表或 1 张宽表，全量 M-Schema 仅占用    │
│        2000~4000 Tokens。在上下文窗口充裕的前提下，全量内联可直接节省 1 轮工具调用的网络 RTT。 │
│    - 决策 2：移除独立 query_rewrite 节点，由 LLM ReAct 循环推理自主覆盖语义理解。              │
│    - 决策 3：工具集固定收敛为 4 个闭包工具（probe / execute / submit_final / clarification）。     │
│    - 决策 4：设定 MAX_ITERATIONS 保护阈值防范死循环与 Token 耗尽（设计文档 DESIGN-BI-003 记默认 5 轮；分支实现 FACT-BI-003 实测 DEFAULT_MAX_ITERATIONS=6，二者为设计/实现偏差，口述以 6 为准）。│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **否定 `get_table_schema` 的核心权衡**：
  在单技能绑定的表数量可控（3～4 张）的实际业务前提下，动态选表不仅无法显著节省上下文，反而强制引入额外的 LLM 思考与 HTTP 交互时延。因此，将全量 M-Schema 在初始化阶段一次性构建并内联至 System Prompt 是最契合业务现状的工程最优解。

---

## 2. 三段式 Agent Loop 控制流与状态机

### 2.1 整体拓扑架构

参考分支中的 ChatBI 实现了标准的 **三段式自主循环架构（Prepare-Reason-Finalize ReAct Loop）**（源码见 [chatbi_agent_graph.py:L925-L971](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L925-L971)）：

```
                     ┌───────────────────────────┐
                     │           START           │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │   prepare_context_node    │
                     │  (拉取配置 / M-Schema 组装)│
                     └─────────────┬─────────────┘
                                   │
                                   ├─────────────────────────────────┐
                 route_after_prepare (发生初始化异常)                 │
                                   │ (正常)                          │
                                   ▼                                 │
                   ┌───────────────────────────────┐                 │
                   │      agent_reasoning_node     │                 │
                   │  (LLM 决策工具 / 终止 / 澄清)  │                 │
                   └───────┬───────────────▲───────┘                 │
                           │               │                         │
     route_after_agent     │ (工具调用)    │ (回填 ToolMessage)      │
     - probe_column_values │               │                         │
     - execute_sql         ▼               │                         │
                   ┌───────────────────────────────┐                 │
                   │      tool_execution_node      │                 │
                   │   (执行底层函数 / 缓存试运行) │                 │
                   └───────────────────────────────┘                 │
                           │                                         │
                           │ route_after_agent 条件分支              │
                           │ - submit_final_sql                      │
                           │ - submit_clarification                  │
                           │ - 迭代次数 >= MAX_ITERATIONS (6)        │
                           │ - LLM 无工具调用直接返回纯文本          │
                           ▼                                         │
                     ┌───────────────────────────┐                   │
                     │       finalize_node       │◄──────────────────┘
                     │(复用缓存/构建 DataEnvelope)│
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │            END            │
                     └───────────────────────────┘
```

---

### 2.2 状态契约与生命周期 (`ChatBIAgentState`)

为彻底隔离子图内部循环推理过程对主图状态的污染，ChatBI 定义了专门的强类型状态模型 [ChatBIAgentState](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_state.py#L15-L55)：

```python
# src/agent/graph/subgraphs/chatbi/chatbi_agent_state.py:L15-L55

class ChatBIAgentState(MainAgentState):
    """Agentic ChatBI State — 精简、可序列化.
    
    继承 MainAgentState 的 messages（add_messages reducer）等通用字段。
    """
    # ========== 配置（prepare 阶段填充）==========
    app_id: int
    api_urls: Dict[str, str]
    table_name_list: List[str]
    data_source_uuid: str | None
    table_collection_uuid: str | None
    tool_call_id: str

    # ========== Schema（prepare 阶段构建）==========
    m_schema: str

    # ========== Agent 运行时 ==========
    agent_messages: Annotated[List[BaseMessage], add_messages]  # 内部 Scratchpad，独立于主图 messages
    iteration_count: int
    max_iterations: int

    # ========== 输出 ==========
    final_sql: str | None
    clarification: Dict[str, Any] | None
    confidence: str                                            # "high" | "low"

    # ========== 缓存（避免 finalize_node 重复执行 SQL）==========
    last_execution_result: Dict[str, Any] | None

    # ========== 业务配置（prepare 阶段填充，供 prompt 组装）==========
    user_synonyms: List[Dict[str, str]]
    user_business_terms: List[Any]
    user_few_shot_examples: List[Dict[str, Any]]
```

#### 关键状态隔离设计：
- **`agent_messages` vs `messages`**：
  主 Agent 图仅通过 `messages` 传递外部输入与接收最终唯一的 `ToolMessage`。ChatBI 子图内部多轮 LLM ReAct 推理的中间对话（`SystemMessage`, `HumanMessage`, `AIMessage(tool_calls=...)`, `ToolMessage`）全部存储在私有的 `agent_messages` 内部通道中，实现了推理 Scratchpad 的物理级隔离。
- **`last_execution_result` 内存缓存**：
  在循环期间，`execute_sql` 工具每次试运行成功的原始载荷均被暂存在此字段中。当模型最终决定调用 `submit_final_sql` 提交相同 SQL 时，终结节点可直接命中该缓存，消除冗余的二次数据库 HTTP 请求。

---

### 2.3 四大核心节点的执行流与路由

#### 1. 上下文准备阶段 (`prepare_context_node`, [chatbi_agent_graph.py:L398-L498](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L398-L498))
- **输入提取**：从主图 `state["messages"][-1]` 提取 `chatbi_text2sql` 工具调用的 `query` 参数；优先通过 `state.get("tool_call_id")` 获取中间件注入的全局唯一调用 ID（防多工具并发错位）。
- **配置拉取**：根据 `app_info_id` 调用 `ChatBIPlugin._fetch_config()`（`await` 异步获取）取得 API URLs、表名清单、同义词映射与 Few-shot 示例。
- **M-Schema 构建**：调用 `_build_m_schema()`（[L350-L362](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L350-L362)），拉取表关系及 DDL，通过 `AsyncMSchemaEngine` 渲染结构化 M-Schema。
- **Prompt 组装**：通过 Jinja2 异步渲染 System Prompt，初始化 `agent_messages = [SystemMessage(system_prompt), HumanMessage(query)]`。
- **路由决策 (`route_after_prepare`, [L912-L918](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L912-L918))**：若初始化异常直接路由至 `finalize`；正常情况下流转至 `agent_reasoning`。

#### 2. Agent 推理阶段 (`agent_reasoning_node`, [chatbi_agent_graph.py:L500-L628](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L500-L628))
- **迭代递增与超限检查**：`iteration = state.get("iteration_count", 0) + 1`。若 `iteration >= max_iter`（默认 6），触发 Fallback 逻辑，通过 `_extract_sql_from_agent_messages()` 提取历史最后一次试执行的 SQL，标记 `confidence="low"` 并直接结束推理。
- **闭包工具动态绑定**：通过 `create_chatbi_tools()` 基于运行时 State 创建 4 个闭包工具实例，并使用 `llm.bind_tools(tools)` 绑定。
- **LLM 调用与事件抑制**：传入 `invoke_config` 显式注入抑制元数据，执行异步推理 `response = await llm.ainvoke(agent_msgs, config=invoke_config)`。
- **终止信号捕获与合成 ToolMessage 闭环**：
  - 若模型调用 `submit_final_sql`，提取 `sql` 参数，置 `final_sql = sql`，`confidence = "high"`。
  - 若模型调用 `submit_clarification`，提取 `question` 与 `options`，置 `clarification = {...}`。
  - **关键防御修补**：为满足 LangGraph / LangChain 对话模型对 Tool Call 必须有对应 Tool Message 回填的契约要求，在收到终止信号时，向 `agent_messages` 追加一条合成的 `ToolMessage(content='{"status": "acknowledged", "action": ...}', tool_call_id=tc_id)`（[L583-L602](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L583-L602)），保证消息链完整合规。

#### 3. 工具执行阶段 (`tool_execution_node`, [chatbi_agent_graph.py:L631-L718](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L631-L718))
- 遍历最新 `AIMessage.tool_calls` 中的非终止工具（`probe_column_values` 或 `execute_sql`）。
- **绕过 `ainvoke` 执行底层函数**（深度细节见后文 §5.1）。
- 若执行工具为 `execute_sql` 且执行成功，将解析后的 JSON 结果封装为 `{"sql": sql, "raw_result": parsed}` 写入 `state["last_execution_result"]`。
- 将生成的 `ToolMessage` 增量追加至 `agent_messages`，无条件连边回环流向 `agent_reasoning` 开启下一轮推理。

#### 4. 终结与信封封装阶段 (`finalize_node`, [chatbi_agent_graph.py:L721-L856](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L721-L856))
- **异常 / 追问短路分支**：
  - 若存在 `prepare_context` 阶段的错误，输出 `{"success": False, "message": "初始化失败: ..."}`。
  - 若存在 `clarification` 追问，输出 `{"success": False, "clarification": {"question": ..., "options": ...}}`。
  - 若无有效 `final_sql`，输出友好引导提示（附带可用表列表）。
- **SQL 执行与信封构建**：
  - **优先复用缓存**：检查 `last_execution_result.sql == final_sql`，若命中则直接复用缓存的 `raw_result` 调用 `_build_data_envelope()` 构建 `DataEnvelope`。
  - **未命中缓存兜底**：通过 AES 加密重新向后端 `check_sql_accuracy_url` 发起 HTTP 请求拉取数据。
- **信封持久化与对外消息派发**：
  - 若 `DataEnvelope` 构建成功，调用 `_save_envelope_to_db()` 将数据信封持久化至 Java 后端获取 `envelope_id`。
  - 调用 `_build_tool_message_content()` 构建标准 ToolMessage JSON 载荷，写入主图 `messages` 通道并结束子图生命周期。

---

### 2.4 路由条件判定逻辑 (`route_after_agent`)

[route_after_agent](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L879-L910) 实现了严密的决策判定，优先级由高到低如下：

```python
# src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py:L879-L910

def route_after_agent(state: ChatBIAgentState) -> str:
    # 1. 已提取到 final_sql 或 clarification → finalize
    if state.get("final_sql") or state.get("clarification"):
        return "finalize"

    # 2. 迭代轮次达到或超过上限 (DEFAULT_MAX_ITERATIONS = 6) → finalize
    iteration = state.get("iteration_count", 0)
    max_iter = state.get("max_iterations", DEFAULT_MAX_ITERATIONS)
    if iteration >= max_iter:
        return "finalize"

    # 3. 检查最后一条 agent_message
    agent_msgs = state.get("agent_messages", [])
    if not agent_msgs:
        return "finalize"

    last = agent_msgs[-1]

    # 4. LLM 未产生任何工具调用（直接文本回复）→ finalize
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return "finalize"

    # 5. 终止信号工具（submit_final_sql / submit_clarification）→ finalize
    tool_names = [tc["name"] for tc in last.tool_calls]
    if "submit_final_sql" in tool_names or "submit_clarification" in tool_names:
        return "finalize"

    # 6. 其余探索式工具（probe_column_values / execute_sql）→ tool_execution
    return "tool_execution"
```

---

## 3. 四大闭包工具设计与列值探测闭环

所有内部工具均由工厂函数 [create_chatbi_tools](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L17-L109) 在节点运行时动态创建，利用 Python 闭包特性捕获当前环境的 `api_urls`、`aes_key`、`data_source_uuid` 和 `table_name_list`。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                create_chatbi_tools 闭包捕获与工具集                              │
│                                                                                                  │
│  闭包捕获上下文: { api_urls, aes_key, data_source_uuid, table_name_list }                       │
│                                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │   probe_column_values   │  │       execute_sql       │  │ submit_final_sql / clarification │  │
│  ├─────────────────────────┤  ├─────────────────────────┤  ├──────────────────────────────────┤  │
│  │ 异步执行 DISTINCT 查询    │  │ 异步试执行 SQL 语句     │  │ 纯信号同步工具                   │  │
│  │ 安全白名单与字符正则校验│  │ 截断返回前 5 行预览     │  │ 显式提交最终 SQL / 结构化追问   │  │
│  │ 消除 WHERE 条件枚举偏差 │  │ 捕获 MySQL 错误码回填   │  │ 触发状态机退出循环               │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 工具接口签名与语义契约

| 工具名称 | 签名与参数 | 执行模式 | 语义契约与设计目的 | 源码位置 |
|---|---|---|---|---|
| `probe_column_values` | `async def probe_column_values(table_name: str, column_name: str, limit: int = 20) -> str` | 异步（I/O） | 查询指定表指定列的 DISTINCT 取值样本。用于校准自然语言与物理数据枚举（如“技术部” ➔ “研发中心-技术部”）。内建严格安全检查：表名必须在 `table_name_list` 白名单内，列名必须匹配 `isalnum() or _` 正则。 | [chatbi_agent_tools.py:L37-L68](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L37-L68) |
| `execute_sql` | `async def execute_sql(sql: str) -> str` | 异步（I/O） | 试运行生成的 MySQL 5.7 SQL，截断返回前 5 行数据（`preview_limit=5`）与总行数 `row_count`；若执行失败返回错误码与错误信息。用于模型在提交前自检语法与逻辑合理性。 | [chatbi_agent_tools.py:L70-L84](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L70-L84) |
| `submit_final_sql` | `def submit_final_sql(sql: str, explanation: str = "") -> str` | 同步（信号） | 终结信号工具。当模型自检通过后显式调用提交。返回 `{"status": "submitted", "sql": sql}`，驱动状态机流向 `finalize`。 | [chatbi_agent_tools.py:L86-L95](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L86-L95) |
| `submit_clarification` | `def submit_clarification(question: str, options: List[str] \| None = None) -> str` | 同步（信号） | 终结信号工具。当用户意图存在严重歧义时调用。返回结构化追问内容 `{"status": "clarification", "question": ..., "options": ...}`，子图不直接面对用户，由主 Agent 决定后续处理。 | [chatbi_agent_tools.py:L98-L108](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L98-L108) |

---

### 3.2 列值探测闭环与注入防御

Text2SQL 在真实业务落地中的高频失败案例是 **值不匹配（Value Mismatch）**。例如用户输入：“统计去年技术部的报销金额”。数据库中可能存储为 `"RD_Dept"`、`"研发-技术部"` 或 `"Technology"`。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     列值探测闭环执行流程                                         │
│                                                                                                  │
│  [1. 用户提问] ──► "统计技术部的出差支出"                                                        │
│                           │                                                                      │
│                           ▼                                                                      │
│  [2. 模型推理] ──► 发现表 department_info 的 dept_name 字段可能存在枚举偏差                      │
│                           │                                                                      │
│                           ▼ 调用 probe_column_values(table_name="department_info", ... )         │
│  [3. 安全校验] ──► ① 校验 "department_info" 是否在 table_name_list 白名单                        │
│                     ② 校验 "dept_name" 是否全为字母、数字或下划线 (防止 SQL 注入)                │
│                           │                                                                      │
│                           ▼ 构造执行: SELECT DISTINCT `dept_name` FROM `department_info` LIMIT 20│
│  [4. 探测回填] ──► 返回: '{"rows": [{"department": "研发中心-技术部"}, ...], "row_count": 3}'      │
│                           │                                                                      │
│                           ▼                                                                      │
│  [5. 精准校准] ──► 模型生成精准 SQL: WHERE dept_name = '研发中心-技术部'                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

安全防御机制（[chatbi_agent_tools.py:L54-L64](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py#L54-L64)）：
- **表名白名单校验**：`table_name.lower() in [t.lower() for t in table_name_list]`，杜绝越权扫描库内未授权的敏感表或系统表。
- **列名合法字符校验**：`all(c.isalnum() or c == '_' for c in column_name)`，杜绝利用列名拼接注入恶意 SQL 片段。

---

## 4. 退出条件与多层 Fallback 机制

系统通过严密的退出判定矩阵，保证 Agent Loop 无论在何种边界条件下均能确定性退出，避免出现死循环或线程挂起。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ChatBI Agent Loop 退出路径矩阵                                 │
│                                                                                                  │
│  【路径 A：正常完成退出】                                                                        │
│    - 触发条件：模型调用 submit_final_sql(sql=...)                                                │
│    - 状态演化：final_sql 赋值，confidence="high"                                                 │
│    - 结果处理：finalize_node 优先复用缓存执行结果，构建 DataEnvelope，返回成功 ToolMessage        │
│                                                                                                  │
│  【路径 B：主动追问退出】 (DESIGN-BI-004)                                                        │
│    - 触发条件：模型调用 submit_clarification(question=..., options=...)                         │
│    - 状态演化：clarification 赋值结构化字典                                                      │
│    - 结果处理：finalize_node 直接输出 success=False 并包装 clarification 字段给主 Agent           │
│                                                                                                  │
│  【路径 C：迭代超限兜底 (MAX_ITERATIONS Fallback)】                                              │
│    - 触发条件：iteration_count >= DEFAULT_MAX_ITERATIONS (6 轮)                                  │
│    - 状态演化：confidence="low"                                                                  │
│    - 结果处理：从 agent_messages 提取最后一次 execute_sql 的 SQL；若有则降级下发并追加警告提示；    │
│                若无则返回可用表列表并引导用户重新提问                                            │
│                                                                                                  │
│  【路径 D：运行时 / 编译期异常兜底】                                                             │
│    - 触发条件：prepare_context 失败或 LLM 调用崩溃                                               │
│    - 状态演化：errors["prepare_context"] 写入，直接短路至 finalize_node                          │
│    - 结果处理：返回明确错误提示 ToolMessage，防止异常外溢导致主 Agent 挂死                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 超限提取与低置信度降级

在 [agent_reasoning_node](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L506-L516) 与 [`_build_tool_message_content`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L274-L280)（finalize 的辅助函数）中：
1. 当迭代轮次达到 6 轮上限时，系统不直接抛出超时异常，而是通过 `_extract_sql_from_agent_messages()` 倒序扫描历史工具调用记录，提取模型最后一次尝试执行的 SQL 语句。
2. 状态被标记为 `confidence = "low"`。
3. `finalize_node` 在构建 ToolMessage 时，在文本提示尾部显式追加兜底警告：
   > `“（置信度较低，结果可能不准确。如果需要继续查询，请换一种完全不同的查询方式，不要重复类似查询。）”`
4. 这一设计既保证了长尾极端情况下尽可能交付初步数据，又通过显式元数据避免误导主 Agent 与最终用户。

---

## 5. 关键工程细节与防御性设计

在将 Agent Loop 接入主 Agent 链路的联调过程中，团队攻克了三项极为隐蔽但致命的工程缺陷。

### 5.1 绕过 `BaseTool.ainvoke`：根治 AG-UI 适配器崩溃 (`FACT-BI-004`)

#### 1. 缺陷复盘与崩溃机理
在 LangGraph / LangChain 生态中，通常通过 `await tool.ainvoke(...)` 执行工具。然而在与外层前端适配器（如 `ag_ui_langgraph` / CopilotKit）集成时，触发了严重崩溃：
- `ChatBI` 子图在主 Agent 眼中本身只是一个大工具（`chatbi_text2sql`）。
- 子图内部的 `execute_sql` 与 `probe_column_values` 仅仅是子图内部 Scratchpad 的私有辅助动作。
- 若调用 `tool.ainvoke()`，LangChain 会将内部执行封装为标准 Tool Run，并向全局 Callback 广播 `on_tool_end` 事件。
- 外层 `ag_ui_langgraph` 适配器监听整张主图的事件流，无法区分“主 Agent 对外工具”与“子图内部私有工具”，会将子图内部返回的普通 JSON 字符串当成外层 `ToolMessage` 对象解析，直接访问 `.tool_call_id` 属性，从而引发：
  ```
  AttributeError: 'str' object has no attribute 'tool_call_id'
  ```

#### 2. 解决方案与实现代码
在 [tool_execution_node:L689-L697](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L689-L697) 中，**有意绕过 `BaseTool.ainvoke`，直接反射提取 `@tool` 装饰器绑定的底层原始协程/函数**：

```python
# src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py:L689-L697

# 有意绕过 BaseTool 的 runnable/callback 包装，直接调用底层 coroutine/func
if getattr(tool_fn, "coroutine", None):
    result = await tool_fn.coroutine(**args)
elif getattr(tool_fn, "func", None):
    result = tool_fn.func(**args)
else:
    result = await tool_fn.ainvoke(args)

if not isinstance(result, str):
    result = json.dumps(result, ensure_ascii=False, default=str)

# 由子图在内存中手工构造 ToolMessage，仅写入内部 agent_messages Scratchpad
tool_messages.append(ToolMessage(content=result, tool_call_id=tc_id))
```

- **架构效果**：LLM 依然通过标准的 Tool Schema 生成结构化调用参数，但执行阶段完全被限制在 ChatBI 内存沙箱内，不产生任何 LangChain Tool Run 事件广播，彻底消除了外层适配器的解析崩溃。

---

### 5.2 Metadata 抑制子图事件冒泡

除了绕过工具执行层，在 [agent_reasoning_node:L542-L550](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L542-L550) 中，针对子图内部的 LLM 调用也进行了显式的元数据屏蔽：

```python
# src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py:L542-L550

invoke_config = config or {}
invoke_config = {
    **invoke_config,
    "metadata": {
        **invoke_config.get("metadata", {}),
        "copilotkit:emit-messages": False,
        "copilotkit:emit-tool-calls": False,
    },
}
response = await llm.ainvoke(agent_msgs, config=invoke_config)
```

- **业务价值**：防止子图内部多轮试错、纠错、探测的中间文本和中间思考过程泄露到前端用户界面，确保用户端只能看到整洁的主图响应与最终图表。

---

### 5.3 DataEnvelope 构建与缓存复用 (`FACT-BI-002`, `FACT-BI-004`)

#### 1. 双结构兼容的行数解析
在开发过程中曾出现严重 Bug：`finalize_node` 复用 `execute_sql` 的缓存时，由于缓存结构与后端 API 原始响应存在层级差异，导致数据被误判为空（`rows = []`），最终向主 Agent 发送 `total_rows = 0` 的错误结果。

源码在 [_normalize_rows](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L47-L69) 与 [_extract_row_count](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L124-L143) 中实现了双通道归一化兼容：

```python
# src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py:L47-L68

def _normalize_rows(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    # 结构 1：内部 execute_sql 工具缓存载荷 {"rows": [...], "row_count": N}
    direct_rows = payload.get("rows")
    if isinstance(direct_rows, list):
        return [row for row in direct_rows if isinstance(row, dict)]

    # 结构 2：后端 API 原始 HTTP 响应 {"data": {"rows": [...]}}
    data = payload.get("data")
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        for key in ("rows", "list", "records", "data", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
    return []
```

#### 2. 行数截断与数据信封契约
构建 `DataEnvelope` 时遵循以下核心约束（[chatbi_agent_graph.py:L146-L164](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py#L146-L164)）：
- `MAX_RETURN_ROWS = 20`：`full_data` 数组最多仅保留前 20 条记录。
- `PREVIEW_ROWS_WHEN_TRUNCATED = 5`：当总行数大于 20 行时，返回给主 Agent 对话上下文的 `data` 仅包含前 5 行预览，防止上下文超限。
- 当 `row_count > 20` 时，信封保留明文 `query_sql` 与 `page_size = 20`，指示前端调用后端接口分页拉取完整数据集。

---

## 6. 两代架构逐节点深度对照

| 维度 / 阶段 | 第一代：`develop` 固定 6 节点 DAG 流水线 | 第二代：`chatbi-agent-loop` 参考分支 ReAct Loop | 架构演进收益与取舍 |
|---|---|---|---|
| **核心执行拓扑** | 6 命名节点 DAG：`entry` ➔ `query_rewrite` ➔ `sql_generation` ➔ `sql_self_check` ➔ `[error_correction]?` ➔ `exit` | 4 节点三段式循环：`prepare_context` ➔ `agent_reasoning` ⇄ `tool_execution` ➔ `finalize` | 从确定性静态编排升级为状态驱动的自主循环探索。 |
| **初始化阶段** | `entry_node`：拉取配置，将配置与服务存入 State。 | `prepare_context_node`：拉取配置、组装 M-Schema、渲染 SystemPrompt，初始化私有 Scratchpad `agent_messages`。 | 职责内聚，明确分离外部与内部状态。 |
| **查询重写** | 独立 `query_rewrite_node`：单次调用 LLM 扩写改写查询。 | **已移除**：由 `agent_reasoning` 节点的多轮 ReAct 推理能力自然覆盖。 | 节省 1 次独立 LLM 调用，减少固定流水线时延。 |
| **Schema 装载** | `sql_generation_node` 内部同步获取全部 DDL，暴力注入 Prompt。 | `prepare_context_node` 一次性构建全量 M-Schema 内联（单技能 3~4 表）。 | 否定动态选表工具，平衡 Token 开销与网络 RTT（`DELTA-BI-001`）。 |
| **SQL 生成与校验** | `sql_generation`（单次生成）➔ `sql_self_check`（单次语法检查）。 | `agent_reasoning` 结合 `execute_sql` 工具，支持多次自主试运行与逻辑自检。 | 变“一次性盲猜”为“交互式试错与验证”。 |
| **列值分布探测** | **无**（无法探查字段实际存储的枚举值，易发生 WHERE 过滤失真）。 | `probe_column_values`：支持白名单校验下的 DISTINCT 列值探测。 | 彻底解决真实数据库枚举与自然语言简称不一致难题。 |
| **纠错能力** | `error_correction_node`：仅在语法报错（`code != 0`）时提供 **最多 1 次** 被动重试。 | ReAct Loop 内部多轮自主纠错，直至生成满意 SQL 或达到 `MAX_ITERATIONS`（默认 6）。 | 大幅提升复杂长查询与多表 JOIN 的容错上限。 |
| **歧义与追问** | **无**（强行猜测生成单条 SQL）。 | `submit_clarification`：结构化上报追问问题与候选选项给主 Agent。 | 建立标准的人机协同与意图确认协议（`DESIGN-BI-004`）。 |
| **输出终结与缓存** | `exit_node`：每次必须重新向后端发送 HTTP 请求执行 SQL 构建信封。 | `finalize_node`：优先命中 `last_execution_result` 内存缓存，免除重复 SQL 请求。 | 优化网络吞吐，保证数据一致性。 |
| **事件流与 UI 兼容** | 依赖外部事件过滤，存在内部事件冒泡风险。 | 双重防御：元数据抑制事件冒泡 + 绕过 `ainvoke` 直调底层函数。 | 根治前端 AG-UI 适配器 `'str' has no tool_call_id` 崩溃。 |

---

## 7. 一轮完整循环端到端演练（Walkthrough）

### 7.1 业务场景设定
- **用户提问**：“帮我查一下杭州地区上个月销售额排名前三的商品类别和销售额。”
- **底层数据库事实**：
  - 表 `goods_sales` 包含字段 `city_name`、`category_name`、`sales_amount`、`sale_date`。
  - 物理表中 `city_name` 存储的值为 `"杭州市"`（非 `"杭州"`）。

---

### 7.2 逐步状态与消息演化轨迹

```
[外部主 Agent]
   │
   ▼ 派发工具调用: chatbi_text2sql(query="帮我查一下杭州地区上个月销售额排名前三的商品类别和销售额。")
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 1: prepare_context_node                                                           │
│  - 提取 tool_call_id = "call_cb_001"                                                   │
│  - 拉取 app_id=101 配置，拉取表 goods_sales DDL 并生成 M-Schema                        │
│  - 组装 SystemPrompt，写入 state["agent_messages"] = [SystemMessage, HumanMessage]     │
│  - 初始化 state["iteration_count"] = 0, state["max_iterations"] = 6                    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ route_after_prepare ➔ "agent_reasoning"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 2: agent_reasoning_node (Iteration 1/6)                                           │
│  - LLM 分析提问，识别实体“杭州”，为避免枚举偏差，决定先探测列值                         │
│  - LLM 输出: AIMessage(tool_calls=[{                                                   │
│      "name": "probe_column_values",                                                     │
│      "args": {"table_name": "goods_sales", "column_name": "city_name", "limit": 10},  │
│      "id": "tc_probe_1"                                                                │
│    }])                                                                                 │
│  - 状态更新: iteration_count = 1, agent_messages 追加该 AIMessage                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ route_after_agent ➔ "tool_execution"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 3: tool_execution_node (Iteration 1)                                              │
│  - 校验 goods_sales 在白名单内，city_name 符合字符正则                                  │
│  - 绕过 ainvoke，直接执行底层 coroutine 查询 DISTINCT `city_name`                       │
│  - 返回: '{"rows": [{"city": "杭州市"}, ...], "row_count": 3}'                                   │
│  - 状态更新: agent_messages 追加 ToolMessage(content='{"rows": ..., "row_count": ...}', id="tc_probe_1")│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ 连边流转 ➔ "agent_reasoning"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 4: agent_reasoning_node (Iteration 2/6)                                           │
│  - LLM 观察到真实列值为 "杭州市"，生成精准 SQL 并决定试执行验证语法与数据                │
│  - 生成 SQL:                                                                           │
│    SELECT `category_name` AS `商品类别`, SUM(`sales_amount`) AS `销售额`                 │
│    FROM `goods_sales`                                                                  │
│    WHERE `city_name` = '杭州市'                                                        │
│      AND `sale_date` >= '2026-07-01' AND `sale_date` < '2026-08-01'                    │
│    GROUP BY `category_name` ORDER BY `销售额` DESC LIMIT 3                             │
│  - LLM 输出: AIMessage(tool_calls=[{"name": "execute_sql", "args": {"sql": ...}}])     │
│  - 状态更新: iteration_count = 2, agent_messages 追加该 AIMessage                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ route_after_agent ➔ "tool_execution"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 5: tool_execution_node (Iteration 2)                                              │
│  - 绕过 ainvoke 执行底层 coroutine 发送 HTTP 请求                                      │
│  - 数据库返回 3 行有效数据，成功提取 rows 与 total_rows=3                              │
│  - 状态更新:                                                                           │
│    • agent_messages 追加 ToolMessage(content='{"rows": [...], "row_count": 3}')        │
│    • last_execution_result = {"sql": "...", "raw_result": {"rows": [...], "row_count": 3}} │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ 连边流转 ➔ "agent_reasoning"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 6: agent_reasoning_node (Iteration 3/6)                                           │
│  - LLM 检查试运行结果，确认字段与聚合数值合理，满足用户需求                            │
│  - LLM 调用终止信号工具: submit_final_sql(sql="...", explanation="已按杭州市精准筛选") │
│  - 内部生成合成 ToolMessage 保持对话链完整                                             │
│  - 状态更新: iteration_count = 3, final_sql = "...", confidence = "high"               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ route_after_agent ➔ "finalize"
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 7: finalize_node                                                                  │
│  - 校验 final_sql 存在且与 last_execution_result.sql 一致 ➔ 命中内存缓存               │
│  - 直接使用缓存 raw_result 调用 _build_data_envelope 构建 DataEnvelope                 │
│  - 调用 _save_envelope_to_db 保存信封，获取 envelope_id = "env_88921"                  │
│  - 写入主图 state["messages"] 唯一对外回执:                                            │
│    ToolMessage(                                                                        │
│      tool_call_id="call_cb_001",                                                       │
│      content='{"success": true, "sql": "...", "total_rows": 3, "data": [...],         │
│                 "envelope_id": "env_88921", "is_truncated": false,                     │
│                 "message": "查询成功，共 3 行数据已完整展示。数据已自动保存..."}'         │
│    )                                                                                   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ 流转 ➔ END
```

---

## 8. 成熟度、验证范围与实施边界

为确保技术复盘与求职面试过程中的表述真实可信，以下对 ChatBI Agent Loop 的成熟度状态与落地边界作出严格界定：

1. **原型验证状态 (`prototype_verified`)**：
   - Agent Loop 完整实现仅存在于独立研发与参考分支 `.scratch/langagent-chatbi-agent-loop-reference`（[chatbi_agent_graph.py](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py)）中。
   - 该版本已在本地与沙盒环境中完成了端到端功能验证、防崩溃机制验证（绕过 `ainvoke` 与元数据抑制）与列值探测逻辑验证。
2. **主线与线上状态 (`not_in_develop`, `not_online`)**：
   - **未合入 `develop` 主线**：`develop` 分支目前依然采用成熟稳定的固定 6 节点 DAG 流水线架构（`FACT-BI-001`）。
   - **无主线专项单测**：参考分支代码尚未补齐主线自动化测试套件。
   - **未正式上线发布**：根据用户事实确认（`ORAL-T08-CBI-001`, `ORAL-T08-CBI-002`），该版本尚未在生产环境进行系统性准确率评测与线上发布。
3. **面试与答辩表述准则**：
   - 应将该设计定位为**“主导探索的高阶智能体化重构方案与原型验证”**，重点阐述架构决策背后的权衡思考（如否定动态选表、闭包工具设计、防 AG-UI 崩溃工程细节），切勿虚构生产 Benchmark 提升百分比或将其陈述为已全量上线的系统。
