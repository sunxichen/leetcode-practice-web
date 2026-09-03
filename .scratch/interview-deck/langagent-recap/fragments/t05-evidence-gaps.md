# Evidence Gaps Fragment: Ticket 05 (Business Subgraphs, A2UI & ChatBI Upgrade)

> **所属 Ticket**：Ticket 05 (`issues/05-audit-business-a2ui-and-chatbi-upgrade.md`)  
> **审计领域**：Domain 5 (业务子图、A2UI 与 ChatBI 智能体化升级)  
> **用途**：收集源码与文档无法完全自证的架构演进定位、分支合入状态与外部联调表现，作为第二轮 Grilling（Ticket 08）的输入。

---

## 1. 未决事实与第二轮 Grilling 清单

### GAP-CBI-001: ChatBI Agent Loop 分支的主线合入与采纳现状
- **Gap ID**: `GAP-CBI-001`
- **Topic**: `ChatBI`
- **Affected Deliverable**: `recap-blog/Ch4 业务子图演进：从固定流水线到 Agent Loop`
- **Available Code/Doc Baseline**:
  - `chatbi_implementation_plan.md` 与 `ichatbi_upgrade_implementation_plan.md` 冻结了全量 M-Schema 内联与 4 工具设计。
  - `langagent-chatbi-agent-loop-reference` 分支完整实现了 `chatbi_agent_graph.py` 与 `chatbi_agent_tools.py`。
  - `develop` 主线基线保持固定 6 节点 DAG 架构（`src/agent/graph/subgraphs/chatbi/graph.py`）。
- **Unproven Gap / Unknown**:
  - ChatBI Agent Loop 分支在当前平台中的主线合入与采纳状态。
- **Proposed Question for User**:
  - ChatBI Agent Loop 分支在当前平台中的主线合入与采纳状态是什么？
- **Recommended Conservative Formulation**:
  - 平台完成了 ChatBI ReAct 循环架构的方案收敛与分支代码实现，当前主线运行固定流水线架构。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-CBI-002: 主线保留固定 DAG 架构的主要工程权衡与考量
- **Gap ID**: `GAP-CBI-002`
- **Topic**: `ChatBI`
- **Affected Deliverable**: `recap-blog/Ch4 业务子图演进：从固定流水线到 Agent Loop`
- **Available Code/Doc Baseline**:
  - `chatbi_agentic_redesign_analysis.md` 详尽分析了固定 DAG 的 7 大结构性缺陷。
  - `develop` 主线基线保持固定 6 节点 DAG 架构。
- **Unproven Gap / Unknown**:
  - 在 Agent Loop 分支已实现的情况下，主线仍维持固定 DAG 的实际工程考量。
- **Proposed Question for User**:
  - 在 Agent Loop 分支已完成代码实现的情况下，主线保留固定 DAG 架构的主要工程权衡与考量是什么？
- **Recommended Conservative Formulation**:
  - 架构上保留了高确定性的固定流水线作为主线基准，同时完成了高自由度探索式 Agent Loop 的分支研发。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-A2UI-001: A2UI 基础交互能力在完成 PoC 后的产品定位
- **Gap ID**: `GAP-A2UI-001`
- **Topic**: `A2UI`
- **Affected Deliverable**: `recap-blog/Ch4 A2UI 智能体交互与动态 UI 协议`
- **Available Code/Doc Baseline**:
  - `prd/a2ui-luckin-poc.md` 规划了 A2UI + 瑞幸 MCP 在线下单 PoC。
  - 本地未提交工作树包含完整 `a2ui_graph.py`、`a2ui_nodes.py`、`a2ui_tool.py` 及单测。
  - 用户口头确认 A2UI 为早期已实现的基础能力 PoC。
  - `develop` clean baseline 中未合入 A2UI 模块。
- **Unproven Gap / Unknown**:
  - A2UI 基础交互能力在完成 PoC 验证后，在当前平台中的产品定位。
- **Proposed Question for User**:
  - A2UI 基础交互能力在完成瑞幸点单 PoC 验证后，在当前平台中的产品定位是什么？
- **Recommended Conservative Formulation**:
  - 平台通过瑞幸点单场景完成了 A2UI 协议、分批渲染、HITL 中断与交互回流的基础能力 PoC 验证，作为前瞻交互原型资产留存。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-A2UI-002: A2UI 与 Canvas 文件型工作区的架构边界与分工
- **Gap ID**: `GAP-A2UI-002`
- **Topic**: `A2UI`
- **Affected Deliverable**: `recap-blog/Ch4 A2UI 智能体交互与动态 UI 协议`
- **Available Code/Doc Baseline**:
  - A2UI 聚焦会话流中的动态生成式 UI 交互。
  - Canvas 聚焦文件型与长文报告的工作区编辑。
- **Unproven Gap / Unknown**:
  - A2UI 生成式 UI 协议与 Canvas 工作区在平台交互架构中的边界与分工关系。
- **Proposed Question for User**:
  - A2UI 生成式 UI 协议与 Canvas 文件型工作区在平台交互架构中的边界与分工关系是什么？
- **Recommended Conservative Formulation**:
  - A2UI 探索会话内卡片式即时组件交互，Canvas 承载持久化文件与富文本编辑，二者分属不同交互形态。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-VIS-001: Visualization client_fetch 策略的前端集成与对接现状
- **Gap ID**: `GAP-VIS-001`
- **Topic**: `Visualization`
- **Affected Deliverable**: `recap-blog/Ch4 数据信封与海量数据可视化`
- **Available Code/Doc Baseline**:
  - `src/agent/nodes/visualization_nodes/nodes.py#L388-L401` 实现了当 `envelope.data_complete=False` 时下发 `dataset_strategy="client_fetch"` 与 `sql=envelope.query_sql`。
  - `chatbi_data_flow_prd.md#L41-L51` 规划了前端通过 SQL 分页接口懒加载海量数据填充图表。
- **Unproven Gap / Unknown**:
  - 外部前端图表组件对 `client_fetch` 策略的实际集成与对接现状。
- **Proposed Question for User**:
  - 可视化子图下发的 `client_fetch` 策略在前端图表组件中的实际对接与集成现状是什么？
- **Recommended Conservative Formulation**:
  - 可视化子图在服务端契约层面支持内联直出（`inline_complete`）与明文 SQL 旁路分页（`client_fetch`）双模式，与 DataEnvelope 截断规则保持契约对齐。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-VIS-002: 图表端消费 client_fetch 时的实际加载性能与渲染表现限制
- **Gap ID**: `GAP-VIS-002`
- **Topic**: `Visualization`
- **Affected Deliverable**: `recap-blog/Ch4 数据信封与海量数据可视化`
- **Available Code/Doc Baseline**:
  - `chatbi_data_flow_prd.md#L41-L51` 提出了海量数据图表渲染的架构设想。
- **Unproven Gap / Unknown**:
  - 在海量数据查询场景下，图表端消费 `client_fetch` 时的实际加载性能与渲染表现限制。
- **Proposed Question for User**:
  - 在海量数据查询场景下，图表端消费 `client_fetch` 时的实际加载性能与渲染表现限制是什么？
- **Recommended Conservative Formulation**:
  - 服务端已定义海量数据分页获取契约，具体渲染吞吐与延迟表现取决于前端渲染引擎能力。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`
