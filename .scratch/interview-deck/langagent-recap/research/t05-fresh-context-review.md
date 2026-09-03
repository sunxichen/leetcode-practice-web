# Ticket 05 独立上下文重审与产物核验报告 (Fresh Context Review)

> **审计任务**：Ticket 05 - 审计业务子图、A2UI 与 ChatBI 升级 (`issues/05-audit-business-a2ui-and-chatbi-upgrade.md`)  
> **执行环境**：全新独立 Agent 会话上下文（Fresh Isolated Context）  
> **审计时间**：2026-08-27  
> **审计人**：Antigravity Ticket 05 Independent Worker  

---

## 1. 任务背景与独立审查原则

由于早期产物在复用上下文环境中生成、存在潜在跨任务污染风险，本审查在**全新隔离上下文**中启动，严格遵循如下规范：
1. **先源码后候选**：在完成对底层源码、工作树、测试用例与设计文档的独立研读前，完全不参考任何现存 Ticket 05 候选产物。
2. **三轨并存原则**：严格拆分 `DESIGN-*`（设计意图）、`FACT-*`（实现事实）与 `DELTA-*`（演进差异），绝不以文档推断代码落地，也不以代码反推原始设计。
3. **范围与成熟度显式标定**：实现事实必须明确物理范围（`develop` 运行基线、独立参考分支、未提交本地原型），绝不将未合入代码或 PoC 描述为主线已合入能力。
4. **置信度硬性分级**：实现类 High 必须代码 + 真实测试用例双重在场；单源码为 Medium；设计类 High 需冻结/批准的 PRD/SPEC/ADR；历史/线上事实需用户确认（枚举为 `confirmed`）。
5. **绝对路径锚定**：所有证据位置必须使用明确根路径的文件物理路径，严禁使用 commit hash 作为唯一证据锚点。

---

## 2. 原始输入独立阅读与核验清单

在独立研究阶段，完整阅读并核验了如下原始代码库、分支、测试集与设计材料：

### 2.1 源码与工作树基线
- **develop 主线基线 (`.scratch/langagent-develop-reference`)**：
  - `src/agent/graph/subgraphs/chatbi/graph.py`：核验固定 DAG 拓扑包含 **6 个命名节点**（`entry`, `query_rewrite`, `sql_generation`, `sql_self_check`, 可选 `error_correction`, `exit`），Happy Path 跳过纠错节点遍历 5 个节点。
  - `src/agent/graph/subgraphs/chatbi/state.py`：核验庞大的继承型 `ChatBIState` 与中间态字段定义。
  - `src/agent/graph/subgraphs/chatbi/nodes/*.py`：详细核验 `chatbi_entry_node`、`query_rewrite_node`、`sql_generation_node`、`sql_self_check_node`、`error_correction_node`、`exit_node`。
  - `src/agent/schemas/data_envelope.py`：核验 `DataEnvelope`、`ColumnMeta` 字段模型及 `data_complete` 属性。
  - `src/agent/graph/subgraphs/visualization_graph.py`：核验 Visualization 子图拓扑与条件重试边。
  - `src/agent/nodes/visualization_nodes/nodes.py`：核验 `fetch_envelope`、`parse_envelope`、`generate_chart_spec`、`validate_spec`（JSON/Key/Scale覆盖校验）、`build_output`（派发 Activity）与 `emit_visualization_tool_message`（回传 ToolMessage）。
  - `src/agent/graph/subgraphs/report_graph.py`：核验 Report 子图多动作路由（`create`/`modify`/`query`/`list`/`text_edit`）与自定义事件长文流式旁路传输机制。
  - `src/agent/tools/rag_tool.py`：核验 `create_rag_tool` 双路并行检索、RRF 融合、多模态 VL 解析与 `artifact=sources` 引用透传机制。
  - `tests/`：核验 develop 仓库中的 20 个测试文件，确认**主线无直接针对 ChatBI 或 Visualization 子图的独立单测**，仅 `test_long_task_subgraph_tool_middleware.py` 对子图进行了 Mock 包装拦截测试。
- **ChatBI Agent Loop 参考分支 (`.scratch/langagent-chatbi-agent-loop-reference`)**：
  - `src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py`：核验三段式 ReAct Loop 拓扑（`prepare_context -> agent_reasoning <-> tool_execution -> finalize`），单体图 `DEFAULT_MAX_ITERATIONS = 6` 常量定义，Fallback 提交逻辑与事件抑制配置（`copilotkit:emit-messages: False`）。
  - `src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py`：核验 4 个闭包工具（`probe_column_values`、`execute_sql`、`submit_final_sql`、`submit_clarification`）的实现与校验逻辑。
  - `src/agent/graph/subgraphs/chatbi/chatbi_agent_state.py`：核验精简可序列化的 `ChatBIAgentState`。
  - `src/agent/graph/subgraphs/chatbi/chatbi_agent_prompts.py`：核验 M-Schema、同义词、业务术语与 Few-shot 的 System Prompt 组装。
  - `tests/`：确认分支内**无任何针对 ChatBI Agent Loop 的自动化测试文件**。
- **A2UI 本地工作树与测试 (`/Users/sunxichen/Projects/langAgent`)**：
  - `src/agent/graph/subgraphs/a2ui_graph.py`：核验 A2UI Subgraph 拓扑（`emit_create_surface -> plan_batches -> process_batches`）与生成器接口。
  - `src/agent/nodes/a2ui_nodes.py`：核验 Basic Catalog 10 种基础组件校验器、JSON Schema 失败重试（最多 2 次）与 `@a2ui/web_core v0.8` 转换逻辑。
  - `src/agent/tools/a2ui_tool.py`：核验 `render_a2ui` 工具包装与 ActivitySnapshot 派发。
  - `src/agent/luckin_orchestration.py` & `src/agent/luckin_mcp.py`：核验 8 个瑞幸 MCP 工具定义及 Mock 模式。
  - `tests/test_a2ui_subgraph.py`：核验批次规划、校验重试与 2 次失败异常抛出的自动化测试断言。
  - `tests/test_a2ui_tool.py`：核验 ActivitySnapshot 事件派发与纯文本简短返回的自动化测试断言。
  - `tests/test_luckin_main_agent_orchestration.py`：核验下单确认/取消的 LangGraph 中断（`__interrupt__`）与 Resume 恢复、普通操作交互回流的自动化测试断言。
  - `tests/test_luckin_mcp_tools.py`：核验 8 个 MCP 工具的参数 Schema 与 Mock 数据测试断言。
  - `frontend-demo/`：核验基于 Vite + React + `@a2ui/react` 的独立演示前端，及其自动化测试 `App.test.tsx` 和 `App.interaction-reflux.test.tsx`。
- **A2UI Clean Negative Reference (`.scratch/langagent-a2ui-reference`)**：
  - 核验确认 clean commit 工作树中完全不含 A2UI 源码与测试，证实 A2UI 为本地未提交原型资产。

### 2.3 设计与架构文档
- `/Users/sunxichen/Projects/langAgent/chatbi_agentic_redesign_analysis.md`
- `/Users/sunxichen/Projects/langAgent/chatbi_implementation_plan.md`
- `/Users/sunxichen/Projects/langAgent/ichatbi_upgrade_implementation_plan.md`
- `/Users/sunxichen/Projects/langAgent/chatbi_data_flow_prd.md`
- `/Users/sunxichen/Projects/langAgent/visualization_subgraph_plan.v3.md`
- `/Users/sunxichen/Projects/langAgent/visualization_integration_plan.v4.md`
- `/Users/sunxichen/Projects/langAgent/visualization_generalization_review.md`
- `/Users/sunxichen/Projects/langAgent/prd/a2ui-luckin-poc.md`
- `/Users/sunxichen/Projects/langAgent/prd/issues/01-luckin-mcp-integration.md` 至 `08-e2e-demo-script.md`
- `/Users/sunxichen/Projects/langAgent/Report Generation Prd And Technical Solution.md`
- `/Users/sunxichen/Projects/langAgent/report_final_prd_and_solution.md`

---

## 3. 独立审计核心结论

### 3.1 ChatBI：固定 6 节点 DAG vs Agent Loop
1. **develop 固定 DAG 事实**：
   - 拓扑包含 **6 个命名节点**（`entry`, `query_rewrite`, `sql_generation`, `sql_self_check`, 可选 `error_correction`, `exit`）；Happy Path 跳过纠错遍历 5 个节点。
   - `error_correction` 为单次被动纠错，不回环。
   - 依赖全量 DDL 填入 M-Schema，无 Schema Linking，无 Value Grounding。
   - 主线仓库中无独立 `test_chatbi_*.py` 单测，置信度标定为 `Medium`（`code-only`）。
2. **Agent-Loop 演进决策与分支事实**：
   - 早期提议（`chatbi_agentic_redesign_analysis.md`）建议 5 工具并包含 `get_table_schema` 动态按需选表。
   - 方案收敛（`chatbi_implementation_plan.md` / `ichatbi_upgrade_implementation_plan.md`）因单技能仅涉及 3~4 张表，果断**否定 `get_table_schema` (DELTA-CBI-001)**，改为在 `prepare_context` 中全量内联 M-Schema（约 2000~4000 tokens），节省 1 轮工具调用延迟；移除独立 `query_rewrite`。
   - **架构形态演进 (DELTA-CBI-002)**：从固定 6 节点流水线升级为三段式 ReAct 循环（`prepare_context -> agent_reasoning <-> tool_execution -> finalize`），实现 4 个闭包工具（`probe_column_values`、`execute_sql`、`submit_final_sql`、`submit_clarification`）。
   - `submit_clarification` 仅结构化返回 `{question, options}` 给主 Agent，ChatBI 子图不直接接触用户。
   - `chatbi_agent_graph.py` 设定 `DEFAULT_MAX_ITERATIONS = 6`（设计方案建议默认 5），超限走 Option B（提交最后一次尝试的 SQL，带 `confidence: "low"` 标记）。
   - 分支无自动化测试文件，置信度严格标定为 `Medium`（`code-only`）。

### 3.2 DataEnvelope 与双层阈值控制
1. **协议结构**：包含 `row_count`, `column_metadata`, `sample_rows`, `full_data`, `query_sql`, `page_size`, `data_complete`。
2. **第一层阈值（主模型 Prompt 截断，`PREVIEW_THRESHOLD = 20`）**：
   - `total_rows <= 20`：`ToolMessage` 返回完整行预览，`is_truncated = False`。
   - `total_rows > 20`：`ToolMessage` 仅展示前 5 行预览，`is_truncated = True`。
3. **第二层阈值（信封内联与分页分流，`DETAIL_QUERY_THRESHOLD = 200`）**：
   - `total_rows <= 200`：`envelope.full_data` 内联完整数据，`data_complete = True`。
   - `total_rows > 200`：`envelope.full_data = None`，`data_complete = False`，必须附带明文 `query_sql`。

### 3.3 Visualization 子图
1. **Spec 校验与重试**：
   - 校验必须包含 `chart_type`, `title`, `spec`；表格校验 `spec.scale`；图表校验 `spec.encode` 与 `spec.scale`，且 `scale` 必须覆盖 `encode` 中使用的全部物理列。
   - 校验失败将错误回填 Prompt，最多重试 2 次（总计 3 次调用），超限降级。
2. **双通道输出**：
   - 带外：`build_output` 派发 `copilotkit_emit_activity`（`activity_type="antv_chart"`，携带 `dataset_strategy: inline_complete / client_fetch`）。
   - 带内：`emit_visualization_tool_message` 回传简短确认 ToolMessage，避免大 JSON 污染主模型上下文。
3. **演进差异 (DELTA-VIS-001)**：
   - PRD 规划为 500 行及 `mode: embedded / lazy_fetch`。
   - develop 代码实现为 200 行及 `dataset_strategy: inline_complete / client_fetch`。
   - 服务端组装派发 `client_fetch` Activity 为已实现事实，前端对接现状与海量数据表现保留为 Gaps（`GAP-VIS-001` 与 `GAP-VIS-002`）。

### 3.4 A2UI 生成式 UI（6 个维度独立核验）
1. **分批渲染 (Batch Rendering)**：`plan_batches` 规划批次（header/content），`process_all_batches` 逐批生成并累加。
2. **Schema 校验与重试 (Validation & Retry)**：`validate_a2ui_components` 校验 Basic Catalog 10 种组件类型，失败重试最多 2 次，超限抛异常。测试覆盖：`tests/test_a2ui_subgraph.py`。
3. **Activity 派发 (Activity Emission)**：`adispatch_custom_event` 派发 `a2ui_surface`，`render_a2ui` 返回简短文本。测试覆盖：`tests/test_a2ui_tool.py`。
4. **HITL 中断与恢复 (Interrupt & Resume)**：`createOrder`/`cancelOrder` 触发 `__interrupt__` 挂起并派发 `luckin_hitl_confirmation`；`Command(resume=...)` 恢复。测试覆盖：`tests/test_luckin_main_agent_orchestration.py`。
5. **普通交互回流 (Interaction Reflux)**：前端点击传结构化 JSON 消息进入新对话轮次，触发下一轮工具与渲染。测试覆盖：`test_luckin_main_agent_orchestration.py` + `frontend-demo/src/__tests__/App.interaction-reflux.test.tsx`。
6. **独立前端 Demo (Independent Frontend Demo)**：`frontend-demo/` 实现了完整的 Vite + React + `@a2ui/react` 演示。
7. **成熟度界定**：代码 + 4 套单元测试在场，用户口述已确认，标定为 `prototype_verified` (High, `confirmed`)；**明确为未提交工作树中的本地 PoC，未合入 develop，不包含生产支付/订单/鉴权**。

---

## 4. 与原候选产物 (Untrusted Candidate) 比对分析

在独立完成上述源码与文档审查后，对照此前跨任务复用上下文产生的候选文件进行了详细比对与修正：

| 比对维度 | 候选产物状态 | 独立审查确认与修正 | 改进说明 |
|---|---|---|---|
| **节点计数 (Node Counting)** | 曾表述为“固定 5-node DAG” | 修正为 **“6 个命名节点，Happy Path 遍历 5 个节点”** | 严谨区分图节点全量定义（含可选 error_correction）与 Happy Path 遍历路径 |
| **Delta 拆分** | 仅含 `DELTA-CBI-001` (选表方案) | 新增 **`DELTA-CBI-002`**，专门对照固定 DAG 与 Agent Loop 分支实现 | 区分选表设计演进决策与整体架构形态演进 |
| **A2UI 用户确认状态** | 曾使用 `user_confirmed_basic_capability_poc` | 规范化为统一枚举 **`confirmed`** | 严格遵循全局 Fact Base Schema 枚举定义 |
| **Evidence Gaps 颗粒度** | 3 条复合问题 | 拆分为 **6 条原子单问 Gaps**（`GAP-CBI-001/002`, `GAP-A2UI-001/002`, `GAP-VIS-001/002`） | 消除复合追问，每条聚焦单一真正未知点 |
| **置信度校准** | 部分 implementation 事实标定 | 严格核查测试文件：仅 A2UI 具备直接针对性测试标为 High；develop ChatBI、DataEnvelope、Visualization、Report、RAG 均定为 Medium | 严格遵守“无测试即 Medium”规则 |

---

## 5. 产物交付与核验汇总

本次独立重审已完全重构并覆盖 Ticket 05 全部交付文件：
1. **Topic Brief**：`briefs/t05-business-a2ui-chatbi.md`（完整覆盖业务子图架构、ChatBI 演进、DataEnvelope 双层阈值、Visualization 双通道、A2UI 6 维度、Report 与 RAG 全貌）。
2. **Fact Fragment**：`fragments/t05-facts.md`（严格按照三轨制输出 22 条 Claims：7 Design + 3 Delta + 12 Fact）。
3. **Evidence Gaps Fragment**：`fragments/t05-evidence-gaps.md`（包含 6 个原子开放式 Gaps）。
4. **Fresh Context Review**：`research/t05-fresh-context-review.md`（本审查核验报告）。

### 统计指标
- **Design Intent Claims (`DESIGN-*`)**: 7 项
- **Evolution Delta Claims (`DELTA-*`)**: 3 项 (`DELTA-CBI-001`, `DELTA-CBI-002`, `DELTA-VIS-001`)
- **Implementation & Prototype Facts (`FACT-*`)**: 12 项 (`FACT-CBI-001`~`004`, `FACT-VIS-001`~`002`, `FACT-A2UI-001`~`004`, `FACT-REP-001`, `FACT-RAG-001`)
- **总 Claim 数量**: 22 项
- **Evidence Gaps (`GAP-*`)**: 6 项 (`GAP-CBI-001`, `GAP-CBI-002`, `GAP-A2UI-001`, `GAP-A2UI-002`, `GAP-VIS-001`, `GAP-VIS-002`)
