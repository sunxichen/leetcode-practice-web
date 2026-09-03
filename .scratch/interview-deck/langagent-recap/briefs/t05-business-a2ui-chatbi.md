# Topic Brief: 业务子图、A2UI 与 ChatBI 智能体化升级

> **审计领域**：Domain 5 (业务子图、A2UI 与 ChatBI 智能体化升级)  
> **对应 Ticket**：Ticket 05 (`issues/05-audit-business-a2ui-and-chatbi-upgrade.md`)  
> **基线代码与证据源**：
> - `develop` 主线基线：`.scratch/langagent-develop-reference` (Detached HEAD `4cebb661e88e02f5119fd013236c1402dc3d2cf8`)
> - ChatBI Agent-Loop 分支：`.scratch/langagent-chatbi-agent-loop-reference` (Detached HEAD `98b23b443b6864d1b85e5589cd852bab4f424869`，独立参考分支代码实现，非 develop 运行基线，无配套自动化单测)
> - A2UI 原型代码与测试：只读工作树 `/Users/sunxichen/Projects/langAgent`（`prototype_verified` + `confirmed`，未提交工作树与本地测试集，非主线，PoC 基础能力验证）
> - A2UI clean negative reference：`.scratch/langagent-a2ui-reference`（证明基础 commit 本身不含 A2UI 代码）
> - 设计与 PRD 文档：`/Users/sunxichen/Projects/langAgent`（只读，含 `chatbi_agentic_redesign_analysis.md`、`chatbi_data_flow_prd.md`、`chatbi_implementation_plan.md`、`ichatbi_upgrade_implementation_plan.md`、`prd/a2ui-luckin-poc.md`、`prd/issues/01-08`、`visualization_*` 系列、`report_final_prd_and_solution.md` 等）

---

## 1. 业务架构全景与三轨审计说明

在 `langAgent` 架构中，业务子图（ChatBI、Visualization、A2UI、Report）与业务工具（RAG）承担特定垂直领域的计算与交互职责，通过 LangGraph 状态机和标准工具契约与 ReAct 主 Agent 协同工作。

本次审计遵循**三轨审计原则**：
1. **设计意图轨 (Design Intent)**：基于正式 PRD、技术实施方案与架构分析，提取原始设计需求、演进决策与交互契约。
2. **实现事实轨 (Implementation Fact)**：严格标定代码范围（`develop` 主线基线 / 独立参考分支 / 本地未提交原型与测试），代码与测试分别核验，杜绝未提交代码与主线实现混淆。
3. **演进差异轨 (Delta & Evolution)**：比对设计与实现差异，归档无代码或文档直接证据支撑的动机、外部联调与线上表现至 Evidence Gaps。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   业务能力分层与数据流转拓扑                                        │
│                                                                                                  │
│   [ 用户请求 / AG-UI 对话流 ]                                                                     │
│               │                                                                                  │
│               ▼                                                                                  │
│   ┌────────────────────────┐                                                                     │
│   │ Dynamic Main Agent     │ ◄───► 共享 State (messages, data_envelope, chatbi_config, ...)      │
│   └───────────┬────────────┘                                                                     │
│               │                                                                                  │
│   ┌───────────┼──────────────────────────┬───────────────────────────┬───────────────────────┐   │
│   ▼           ▼                          ▼                           ▼                       ▼   │
│ ┌──────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────┐ ┌───┴──┐ │
│ │ ChatBI   │ │ Visualization           │ │ A2UI (PoC 原型)         │ │ Report              │ │ RAG │ │
│ │ 子图     │ │ 子图                    │ │ 子图                    │ │ 子图                │ │ 工具│ │
│ └────┬─────┘ └────────────┬────────────┘ └────────────┬────────────┘ └──────────┬──────────┘ └───┬──┘ │
│      │                    │                           │                         │                │   │
│      ▼                    ▼                           ▼                         ▼                ▼   │
│ DataEnvelope         AntV Spec                   A2UI Surface JSON         Report Draft     Citations│
│ (数据信封)           (copilotkit_emit_activity)  (copilotkit_emit_activity)(Custom Event)   (Sources)│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ChatBI 演进：固定 DAG 流水线 vs Agent Loop 架构演进

ChatBI 是将自然语言问题转换为 SQL 并在企业数据库中执行取数的核心模块。在项目演进中存在两套架构形态：

### 2.1 develop 主线实现：固定 DAG 流水线 (Fixed Pipeline)
- **源码位置**：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/graph.py`
- **节点计数与拓扑结构**：
  主线 ChatBI 子图包含 **6 个命名节点**（`entry`, `query_rewrite`, `sql_generation`, `sql_self_check`, 可选 `error_correction`, `exit`）。
  正常流程（Happy Path）跳过纠错节点，**遍历 5 个节点**：
  `START ──► entry ──► query_rewrite ──► sql_generation ──► sql_self_check ──► exit ──► END`
  异常流程（当自检报错且开启纠错时，经 `should_correct_sql` 条件边进入 `error_correction` 后直达 `exit`）：
  `START ──► entry ──► query_rewrite ──► sql_generation ──► sql_self_check ──► error_correction ──► exit ──► END`
- **关键节点职责**：
  1. `entry` (`chatbi_entry_node.py`)：从主图 AIMessage 提取 `chatbi_text2sql` 工具参数 `query`，拉取 `app_info_id` 对应的后端配置，将可序列化配置（API URLs、表名列表、同义词、术语、Few-shot 等）存入 `ChatBIState`。
  2. `query_rewrite` (`query_rewrite_node.py`)：利用同义词映射与时间规则对用户输入进行改写消歧。
  3. `sql_generation` (`sql_generation_node.py`)：调用后端 API 获取全量表 DDL，通过 `AsyncMSchemaEngine` 组装 M-Schema；通过关键词字串匹配检索 Few-shot 样例；拼装 Jinja2 Prompt 调用 LLM 生成初始 SQL。
  4. `sql_self_check` (`sql_self_check_node.py`)：正则提取 SQL 表名与允许列表 `table_name_list` 比对校验；将 AES 加密 SQL 发送至后端 `check_sql_accuracy_url` 接口试执行，检查 `code != 0` 或报错信息。
  5. `error_correction` (`error_correction_node.py`)：单次纠错节点，根据 `sql_self_check` 的报错信息调用 LLM 重新生成 SQL 后直接走向 `exit`，**不包含回环重试机制**。
  6. `exit` (`exit_node.py`)：执行最终 SQL，调用 `_build_data_envelope_from_sql_response` 构建 `DataEnvelope`，通过 HTTP POST `_save_envelope_to_db` 持久化至后端获取 `envelope_id`，并向主图回传 `ToolMessage`（带 `envelope_id` 与预览数据）。
- **固定 DAG 结构性缺陷（源自 `chatbi_agentic_redesign_analysis.md`）**：
  - **单次生成 + 单次纠错**：无法发现“语法正确但业务逻辑错误（plausible but wrong）”的 SQL。
  - **全量 Schema 暴力灌入**：将所有配置表的 DDL 完整塞入 Prompt，稀释注意力且浪费 Token，缺乏 Schema Pruning。
  - **缺乏 Value Grounding**：无法探测数据库中实际存储的列值（例如用户输入“杭州”而数据库存储“杭州市”）。
  - **Few-shot 关键词字串粗糙匹配**：共享虚词即可能误匹配，无法按语义相似度检索。

### 2.2 Agent-Loop 设计决策与独立分支实现
- **设计演进决策历程**：
  1. **早期方案探索 (`chatbi_agentic_redesign_analysis.md`, `deprecated`)**：提出 5 个工具按需探索设计，包括 `get_table_schema` 动态选表工具。
  2. **方案收敛与冻结 (`chatbi_implementation_plan.md` & `ichatbi_upgrade_implementation_plan.md`, `design_complete`)**：
     - **业务场景特征**：单个技能对应 1 个 `app_info_id`，仅关联 3~4 张表或 1 张宽表，全量 M-Schema 仅占约 2000~4000 tokens。
     - **演进决策 (DELTA-CBI-001 & DELTA-CBI-002)**：
       - **否定 `get_table_schema` 动态工具 (DELTA-CBI-001)**：全量 M-Schema 直接在 `prepare_context` 确定性构建并内联至 System Prompt，避免增加 1 轮工具调用延迟（节约 1~2s）。
       - **动态 ReAct 循环取代固定 DAG (DELTA-CBI-002)**：主线固定 6 节点 DAG 与独立分支三段式 ReAct Loop 的形态差异；移除独立 `query_rewrite`（同义词直接注入 Prompt 由 Agent 自然覆盖）。
       - **收敛为 4 工具闭包集**：`probe_column_values`（列值去重探测）、`execute_sql`（试执行与结果缓存）、`submit_final_sql`（终止信号）、`submit_clarification`（结构化歧义追问）。
       - **交互边界约定**：ChatBI 子图无权直接与用户对话，意图歧义时通过 `submit_clarification(question, options)` 结构化返回给主 Agent，由主 Agent 决定追问用户或结合上下文决策。
       - **Fallback 策略**：达到最大迭代次数时，若存在试执行过的 SQL，则以 `final_sql = last_sql` 且 `confidence: "low"` 提交；若无 SQL 则返回可用表提示信息。
- **分支代码实现 (`.scratch/langagent-chatbi-agent-loop-reference`, `implemented`, 非主线)**：
  - **拓扑结构**：
    `START ──► prepare_context ──► agent_reasoning ◄──► tool_execution ──► finalize ──► END`
  - **节点实现 (`chatbi_agent_graph.py`)**：
    - `prepare_context_node`：拉取配置，构建全量 M-Schema 文本，组装 System Prompt，初始化 `agent_messages`。
    - `agent_reasoning_node`：LLM 决策工具调用。设置 `metadata={"copilotkit:emit-messages": False, "copilotkit:emit-tool-calls": False}` 抑制子图内部事件泄露；针对终止信号追加合成 `ToolMessage` 保持消息链完整。
    - `tool_execution_node`：直接调用工具底层 coroutine/func（不通过 `BaseTool.ainvoke`，避免内部 `on_tool_end` 冒泡导致 AG-UI 适配器产生 `'str' object has no attribute 'tool_call_id'` 异常）；缓存 `execute_sql` 结果至 `last_execution_result`。
    - `finalize_node`：优先复用缓存的 SQL 执行结果构建 `DataEnvelope`，调用 `_save_envelope_to_db` 持久化，组装带 `confidence` 标记的 `ToolMessage` 返回主 Agent。
  - **迭代上限对比**：方案文档建议默认 5 轮，单体图 `chatbi_agent_graph.py` 常量设置 `DEFAULT_MAX_ITERATIONS = 6`；超限触发 fallback，标记 `confidence = "low"`。
  - **测试状态说明**：该分支代码在独立参考分支中完整编写，但分支和 develop 仓库中均**无配套自动化单元测试**（置信度标定为 `Medium`）。

---

## 3. DataEnvelope 协议与双层阈值控制

### 3.1 协议定义 (`src/agent/schemas/data_envelope.py`)
`DataEnvelope` 是跨子图、服务与前后端传递结构化查询结果的标准数据载体：
- `row_count: int`：查询总行数（校验要求 `> 0`）。
- `column_metadata: list[ColumnMeta]`：字段元数据（`field`, `type`, `alias`, `sample_values`）。
- `sample_rows: list[dict[str, Any]]`：前 3~5 行样本数据。
- `full_data: list[dict[str, Any]] | None`：内联行数据列表。
- `query_sql: str | None`：查询 SQL 文本。
- `page_size: int | None`：建议分页大小。
- `data_complete: bool`：当且仅当数据未被截断（`row_count <= len(full_data)`）时为 `True`。
- `field_alias_map: dict[str, str]`：字段到中文别名的映射字典。

### 3.2 阈值控制与完整性流转机制
系统在数据流转中设计了对话上下文预览与信封完整性分流机制：
1. **第一层：主模型对话上下文预览截断（`PREVIEW_THRESHOLD = 20`）**
   - 作用位置：`exit_node.py` / `chatbi_agent_graph.py` 中构建返回给主 Agent 的 `ToolMessage`。
   - 规则：
     - 若 `total_rows <= 20`：`ToolMessage` 返回完整数据预览，`is_truncated = False`。
     - 若 `total_rows > 20`：`ToolMessage` 仅展示前 5 行预览，`is_truncated = True`，提示主模型数据已截断且已自动保存至数据信封（带 `envelope_id`），防止海量数据撑爆 LLM 上下文。
2. **第二层：DataEnvelope 完整性判定与分页分流（实际实现按 `MAX_RETURN_ROWS = 20`）**
   - 作用位置：`exit_node.py` 中 `_build_data_envelope_from_sql_response`。
   - 审计发现与代码实现：
     - 虽然文件中声明了常量 `DETAIL_QUERY_THRESHOLD = 200`（设计意图），但实际函数内部直接按 `is_detail = row_count > MAX_RETURN_ROWS`（20 行）进行判定，`DETAIL_QUERY_THRESHOLD` 未在函数中生效。
     - 实际规则：当 `row_count > 20` 时，`DataEnvelope.data_complete` 标记为 `False`，`full_data` 仅保留前 20 条，同时必须包含明文 `query_sql`，指示前端或下游组件执行分页拉取。

---

## 4. Visualization 子图：AntV Spec 生成、校验与双通道分发

- **源码位置**：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/visualization_graph.py` & `src/agent/nodes/visualization_nodes/nodes.py`
- **执行拓扑**：
  `START ──► fetch_envelope ──► extract_visualization_request ──► parse_envelope ──► generate_chart_spec ──► validate_spec ──► [should_retry]? ──► build_output ──► emit_visualization_tool_message ──► END`

```
                                  Visualization 双通道输出机制
                                  ┌───────────────────────────┐
                                  │   Visualization Subgraph  │
                                  └─────────────┬─────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
     【带外通道 Out-of-band Activity】                      【带内通道 In-band ToolMessage】
     copilotkit_emit_activity                              ToolMessage (messages 回传)
     • activity_type: "antv_chart"                         • status: "success" / "error"
     • spec: AntV G2 配置 JSON                             • message: "已生成...图表"
     • dataset_strategy: inline_complete / client_fetch    • 避免图表 spec JSON 写入主模型上下文
     • data / field_alias_map
```

### 4.1 阈值演进与协议命名差异 (DELTA-VIS-001)
- **PRD 设计 (`chatbi_data_flow_prd.md#L41-L51`)**：
  - 早期规划以 500 行作为分界：$\le 500$ 行走 `mode: embedded`；$> 500$ 行走 `mode: lazy_fetch`，下发 SQL 指示前端调用分页接口。
- **develop 主线实现 (`nodes.py#L359-L411`)**：
  - **直接消费 `data_complete`**：Visualization 子图不硬编码行数阈值，直接读取 `envelope.data_complete`。当 `data_complete=True` 时下发 `inline_complete`；当 `data_complete=False` 时下发 `client_fetch`（携带明文 `sql = envelope.query_sql` 与 `page_size`）。
  - **协议命名演进**：字段由 `mode` 演进为 **`dataset_strategy`**：
    1. `inline_complete`（对应 `data_complete=True`）：包含全量行数据，`sql = None`，前端直接绑定渲染。
    2. `client_fetch`（对应 `data_complete=False`）：不内联全量行数据，提供明文 `sql = envelope.query_sql` 与 `page_size`。
    3. `none`：无信封异常路径。
- **证据边界**：服务端生成与派发 `client_fetch` Activity 属于**已实现代码**；用户已确认业务前端完成与 `client_fetch` 策略的联调对接（`GAP-18: CONFIRMED`），但项目尚未遇到真实大数据量场景，因此无稳定性能指标与专项压测（`GAP-19: CONFIRMED`）。

### 4.2 Spec 生成、校验与重试机制
1. `generate_chart_spec`：调用 LLM（temperature=0.1，流式关闭）生成 AntV G2 配置 JSON。在调用配置中设置 `copilotkit:emit-messages: False` 抑制中间输出。
2. `validate_spec`：
   - 提取并解析 JSON 对象（兼容 Markdown 代码块）；
   - 检查必需顶层字段：`chart_type`, `title`, `spec`；
   - 若 `chart_type == "table"`，检查 `spec.scale`；
   - 若图表类型，检查 `spec.encode` 与 `spec.scale`，并校验 `scale` 必须完整覆盖 `encode` 中使用的所有物理列字段；
   - 校验失败时将错误信息填入 `VISUALIZATION_RETRY_PROMPT_TEMPLATE`，`should_retry` 控制最多重试 2 次（共 3 次机会），超限后进入降级输出。
3. `build_output`：组装图表（`component="AntVChart"`）或表格（`component="DataTable"`）结果，通过 `adispatch_custom_event("copilotkit_emit_activity", {"activity_type": "antv_chart", "content": result})` 派发。
4. `emit_visualization_tool_message`：仅向主图回传简短状态确认 `ToolMessage`，避免巨大图表 JSON 污染主模型上下文。

---

## 5. A2UI 生成式 UI：PoC 验证、HITL 中断与交互回流

- **状态与成熟度标定**：A2UI 代码与测试存在于未提交工作树 `/Users/sunxichen/Projects/langAgent`（`a2ui_graph.py`、`a2ui_nodes.py`、`a2ui_tool.py`、`tests/test_a2ui_*.py`、`tests/test_luckin_*.py`）。经用户口述确认，A2UI 为早期已实现的基础能力 PoC，**标定为 `prototype_verified` + `confirmed`，未合入 `develop` 主线**。
- **范围与非目标 (Out of Scope)**：PRD（`prd/a2ui-luckin-poc.md#L138-L150`）明确声明该 PoC 为自取点单场景演示，**不包含真实支付回调、订单制作轮询、生产鉴权体系与定制业务组件（如 ShopCard），严格使用 Google 官方 Basic Catalog 基础组件自由组合**。

### 5.1 结构化分批渲染与校验 (A2UI Subgraph)
- **工具契约**：`render_a2ui(data: dict, intent: str)`（`a2ui_tool.py`）。
- **子图拓扑**：`START ──► emit_create_surface ──► plan_batches ──► process_batches ──► END`。
- **分批生成与校验流转**：
  1. `emit_create_surface`：初始化 `surface_id`，构建并写入 `beginRendering` 初始消息。
  2. `plan_batches`：结构化规划渲染批次（默认 `header` 标题区 + `content` 主内容区）。
  3. `process_batches`：循环调用生成器（`QwenA2UIGenerator`，JSON 模式）；经 `validate_a2ui_components` 严格校验 Basic Catalog 组件规范（`Text`, `Image`, `Card`, `Row`, `Column`, `List`, `Button`, `Badge`, `ChoicePicker`, `Tabs`）；单批校验失败时将错误信息回填入提示词重试（最多重试 2 次）；通过后转换为 `@a2ui/web_core v0.8` 规范组件树，通过 `copilotkit_emit_activity`（`activity_type="a2ui_surface"`）发射包含 `surfaceUpdate` 的 Activity 事件。
- **测试覆盖**：`tests/test_a2ui_subgraph.py`（验证分批规划、校验重试与 2 次失败异常抛出）与 `tests/test_a2ui_tool.py`（验证 ActivitySnapshot 事件派发与纯文本简短确认返回）。

### 5.2 关键操作 HITL 中断与恢复 (Interrupt & Resume)
- **不可逆操作保护**：在 `agent_factory.py` 编排中，当检测到 `createOrder` 或 `cancelOrder` 等不可逆操作时，主 Agent 在执行工具前触发 LangGraph `__interrupt__` 中断。
- **状态挂起与确认**：执行暂停并保存 Checkpoint（`MemorySaver`），同时向前端发射 `luckin_hitl_confirmation` Activity。
- **恢复执行**：外部通过 `Command(resume={"confirm": True/False})` 唤醒。若为 `True` 则真正调用下单 MCP 工具；若为 `False` 则取消调用并向用户回复已取消。
- **测试覆盖**：`tests/test_luckin_main_agent_orchestration.py#L117-L195` 包含确认下单与取消下单的 Interrupt/Resume 状态机测试断言。

### 5.3 交互回流机制 (Interaction Reflux)
- **普通交互（新对话轮次）**：用户在前端点击组件操作按钮（如 `select_shop`），前端 Demo 将其构造为结构化 JSON 消息发送至聊天流，主 Agent 识别为用户输入并触发下一轮 ReAct 推理（例如调用 `searchProductForMcp` 搜索商品并调用 `render_a2ui` 渲染）。
  - 后端测试：`tests/test_luckin_main_agent_orchestration.py#L221-L246`。
  - 前端测试：`frontend-demo/src/__tests__/App.interaction-reflux.test.tsx#L26-L48`。
- **关键操作（Resume 恢复）**：在 Interrupt 挂起状态下点击确认/取消按钮，前端直接调用后端 Resume 接口唤醒图实例。

### 5.4 独立前端 Demo (`frontend-demo/`)
- 基于 Vite + React + `@a2ui/react` 构建的独立演示前端工程，实现了 SSE 流式事件解析（`agui.ts`）、`a2ui_surface` 动态 Surface 渲染、`luckin_hitl_confirmation` 中断确认卡片以及交互回流。
- 明确边界：`frontend-demo` 为针对 PoC 的独立演示工程，非生产主前端。

---

## 6. Report 与 RAG 业务能力全貌

### 6.1 Report 子图全貌 (`develop/src/agent/graph/subgraphs/report_graph.py`)
- **入口工具**：`manage_report(action: str, instruction: str)`。
- **动作路由**：
  - `create` / `create_faithful` / `modify` ──► `create_or_modify_report`（调用大模型撰写报告正文草案）。
  - `query` ──► `query_report`（查询历史报告元数据与内容）。
  - `list` ──► `list_reports`（列出当前 Thread 下的所有报告）。
  - `text_edit` ──► `execute_text_edit`（基于指令对指定段落执行精准文本替换）。
- **状态与输出分离**：报告长文仅在 `ReportState` 与后端服务中维护，通过 `CUSTOM` 自定义事件向前端流式传输，主 Agent 仅接收轻量状态回执，避免长文报告污染主模型上下文。

### 6.2 RAG 检索与引用收集全貌
- **工具入口**：`create_rag_tool(dataset_config)`（`src/agent/tools/rag_tool.py`），封装 `RAGService` 为 LangGraph Tool。
- **双路并发与 RRF 融合**：支持文本知识库与图片知识库并发检索，经 Reciprocal Rank Fusion (RRF) 融合排序。
- **多模态 VL 解析**：针对图片类结果，通过 `file_service.fetch_public_url_by_object_key` 换取临时 URL 并调用 Vision-Language (VL) 模型解析图片内容。
- **引用收集与透传**：检索来源元数据（`sources`）存放在 `ToolMessage.artifact` 中（不直接塞入 LLM 文本内容），由 `agent_service.py` 中的 `RAGSourceCollector` 中间件拦截并在收尾时广播至 AG-UI 事件流。

---

## 7. 演进 Delta 汇总与未决边界

| 模块 | 原始设计意图 | 当前代码/分支实现 | 演进差异与依据 (Delta) | 成熟度标定 |
|---|---|---|---|---|
| **ChatBI 选表策略** | 早期提议 5 工具包含 `get_table_schema` 动态按需选表（`chatbi_agentic_redesign_analysis.md`） | 实施方案全量内联 M-Schema（`chatbi_implementation_plan.md`）并在分支实现 | **DELTA-CBI-001**：因单技能仅关联 3~4 张表，否定动态选表工具改为全量 M-Schema 内联，工具集收敛为 4 个 | `design_complete` |
| **ChatBI 架构形态** | develop 固定 6 节点 DAG 流水线（5 节点 Happy Path + 单次被动纠错） | `chatbi-agent-loop` 分支实现三段式 ReAct Loop 代码（4 闭包工具 + Fallback Option B） | **DELTA-CBI-002**：从硬编码固定流水线升级为 LLM 自主编排与列值探测的 Agent Loop；分支为独立参考代码实现，非 develop 运行基线，无配套单测 | develop: `implemented`<br>agent-loop 分支: `implemented` (非主线) |
| **ChatBI 意图追问** | 早期无追问机制 | 分支实现 `submit_clarification` 结构化返回主 Agent | 避免歧义时盲目查询，通过结构化协议交由主 Agent 决策（`ichatbi_upgrade_implementation_plan.md#L36-L50`） | agent-loop 分支: `implemented` (非主线) |
| **DataEnvelope 传输** | 早期在 ToolMessage 中回传完整数据（`chatbi_data_flow_prd.md#L6-L10`） | 实行 20 行对话预览截断与 20 行信封内联分流（200 行常量未接入） | **实际行为**：20 行控制主模型 Prompt 预览体积；`full_data` 亦按 20 行切分并置 `data_complete=False` 提供 `query_sql`（常量 `DETAIL_QUERY_THRESHOLD = 200` 未在函数中使用，见 GAP-27） | `implemented` |
| **Visualization 策略** | PRD 规划 $\le 500$ embedded / $> 500$ lazy_fetch（`chatbi_data_flow_prd.md#L41`） | develop 基于 `envelope.data_complete` 派发 `dataset_strategy: inline_complete / client_fetch` | **DELTA-VIS-001**：字段由 `mode` 演进为 `dataset_strategy`，子图直接消费信封完整性标识；业务前端已完成联调（GAP-18），大数据量性能指标未实测（GAP-19） | `implemented` |
| **A2UI 交互框架** | 瑞幸 MCP 在线下单 PoC（`prd/a2ui-luckin-poc.md`） | 本地工作树完成 A2UI Subgraph、分批生成、HITL 中断与交互回流测试 | 验证了 LLM 驱动 Basic Catalog UI 生成与关键操作保护可行性，未合入主线；前端仅独立 Demo | `prototype_verified` (`confirmed`) |
