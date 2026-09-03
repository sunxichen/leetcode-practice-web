# Ticket 06 Evidence Gaps Fragment: Workflow/Chatflow 与 Agent Teams

> **说明**：本文件为 Ticket 06 专题审计中发现的无法从当前仓库源码/文档自证的未知项片段（Evidence Gaps Fragment）。将在 Ticket 07 中汇总并作为 Ticket 08（第二轮 Grilling）的输入。
> **准入纪律**：
> 1. 能通过细读源码、Git 历史或测试用例查清的问题属于已证实事实，已直接写入 Brief 与 Facts，**严禁作为 Gap 录入**。
> 2. 每个 Gap 必须提供“推荐保守表述”，确保后续写作不被阻塞。
> 3. 提问保持开放、严格原子化（**每个 Gap 仅包含 1 个明确提问**），**严禁复合提问（不将方案与路径、状态与仓库混为一个问题）**，**严禁 A/B/C 选项**，不预设假定组件列表（不预设 DSL、Workflow-as-tool、HITL 一定存在）。
> 4. 重点聚焦 Dify 集成架构设计、材料位置、实际落地状态、代码位置，以及 Agent Teams 的实际交付状态与代码位置。

---

### GAP-WF-001: Dify Workflow / Chatflow 集成架构与设计契约
- **Gap ID**: `GAP-WF-001`
- **Topic**: `Workflow & Dify Integration Architecture`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 用户口述确认：Agent Teams 与 Dify Workflow/Chatflow 集成是项目最新的演进重点，且设计方案足够明确，应当进入正文。
  - `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/` 中存在关于 Workflow 引擎选型与 Human Input 恢复桥接的探索性调研笔记。
  - 对检查的 `langAgent` 主干、主文档与 `develop` 源码基线全量核验未发现官方归档的 Workflow PRD、SPEC 或 ADR。
- **Unproven Gap / Unknown**:
  - 平台针对 Dify Workflow / Chatflow 集成所确立的实际技术架构方案与运行契约具体内容。
- **Proposed Question for User**:
  - 平台针对 Dify Workflow / Chatflow 集成所确立的实际技术架构与运行契约具体是如何设计的？
- **Recommended Conservative Formulation**:
  - “平台确立了将 Agent Teams 与 Dify Workflow/Chatflow 集成作为核心演进方向的设计意图；但当前检查的代码基线与主文档中尚未合入正式实现与官方 PRD/SPEC。正文按架构设计契约展开，并明确其设计与交付边界。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-WF-002: Dify Workflow / Chatflow 权威设计文档与物料位置
- **Gap ID**: `GAP-WF-002`
- **Topic**: `Workflow & Design Material Location`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 用户口述确认 Dify Workflow/Chatflow 设计方案清晰。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/` 主文档目录下未检索到官方归档的工作流设计规范。
- **Unproven Gap / Unknown**:
  - 记录 Dify Workflow / Chatflow 集成方案的官方 PRD、SPEC 或权威设计物料的具体存放路径。
- **Proposed Question for User**:
  - 记录 Dify Workflow / Chatflow 集成方案的官方 PRD 或权威设计文档目前存放在哪些具体路径中？
- **Recommended Conservative Formulation**:
  - “已检查材料中包含前期技术调研笔记，权威设计物料位置待进一步核实。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-WF-003: Dify Workflow / Chatflow 实际工程实现、测试与发布状态
- **Gap ID**: `GAP-WF-003`
- **Topic**: `Workflow & Implementation Status`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 用户口述确认 Dify Workflow/Chatflow 是最新演进重点。
  - 对检查的 `develop` 源码基线（全量 `src/` 与 `tests/`）进行了负向核验，未发现工作流引擎运行时、适配器或测试代码。
- **Unproven Gap / Unknown**:
  - Dify Workflow / Chatflow 集成目前在实际工程层面的代码实现进度、自动化测试覆盖与生产发布状态。
- **Proposed Question for User**:
  - Dify Workflow / Chatflow 集成目前在实际工程层面的代码实现、自动化测试与发布上线状态如何？
- **Recommended Conservative Formulation**:
  - “工作流引擎集成属于平台规划的演进能力，正文重点阐述其架构设计与集成契约，并明确其在当前主线代码中的交付边界。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-WF-004: Dify Workflow / Chatflow 代码仓库与分支位置
- **Gap ID**: `GAP-WF-004`
- **Topic**: `Workflow & Code Repository Location`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - `langAgent` 主干与 `develop` 分支未包含工作流运行时或适配代码。
- **Unproven Gap / Unknown**:
  - Dify Workflow / Chatflow 集成相关代码所维护的具体代码仓库或分支名称。
- **Proposed Question for User**:
  - Dify Workflow / Chatflow 集成的实际研发代码目前存放在哪些代码仓库或分支中？
- **Recommended Conservative Formulation**:
  - “工作流集成相关代码尚未合并至已检查的主线参考分支，相关代码位置待第二轮核实。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-WF-005: Workflow 与 Claw Agent / Agent Teams 的边界与协作定位
- **Gap ID**: `GAP-WF-005`
- **Topic**: `Workflow & Architecture Boundaries`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 调研笔记探讨了工作流与智能体协同等关系。
  - 仓库缺乏关于工作流与现有 Type 7 Claw Agent 及 Agent Teams 之间明确产品定位边界与运行接口的正式文档。
- **Unproven Gap / Unknown**:
  - 平台在引入工作流能力后，工作流与现有 Claw Agent 及 Agent Teams 在产品定位、业务分工与调用关系上的明确定义。
- **Proposed Question for User**:
  - 平台在引入工作流能力后，工作流与现有 Claw Agent 及 Agent Teams 在产品定位、业务分工与调用关系上的边界是如何定义的？
- **Recommended Conservative Formulation**:
  - “在架构设想中，工作流体系与自主决策 Agent 形成互补关系，既可支持将确定性工作流封装为工具供 Agent 决策调用，也可在工作流特定节点内嵌入智能体处理非确定性推理。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-TM-001: Agent Teams 各端实际工程实现、测试与发布状态
- **Gap ID**: `GAP-TM-001`
- **Topic**: `Agent Teams & Implementation Status`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - Master PRD（`/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md` @ `Ready for implementation`）与 ADR 0001-0006 完整定义了设计契约；Slice 1 PRD（`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md` @ `ready-for-agent`）定义了资产管理闭环。
  - 对检查的 `langAgent` `develop` 源码基线（全量 `src/` 与 `tests/`）未发现 Teams 运行时与持久调度器实现代码。
- **Unproven Gap / Unknown**:
  - Agent Teams MVP 目前在各系统端的实际代码实现、测试覆盖与生产发布上线状态；Slice 1 资产功能是否已实际交付。
- **Proposed Question for User**:
  - Agent Teams 目前在各系统端的实际代码实现、测试覆盖与发布上线状态如何？
- **Recommended Conservative Formulation**:
  - “Agent Teams MVP 已建立涵盖总纲 PRD、切片需求（Slice 1）与 6 项架构决策记录（ADR）在内的完整设计体系，确立了一成员一持久实例、三槽位准入控制、三层流以及跟随最新有效配置等核心契约，为多智能体演进奠定了方案基础。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-TM-002: Agent Teams 代码仓库与物料位置
- **Gap ID**: `GAP-TM-002`
- **Topic**: `Agent Teams & Code Repository Location`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - `langAgent` `develop` 源码基线未发现 Teams 运行时与持久调度器实现代码。
- **Unproven Gap / Unknown**:
  - Agent Teams 相关的各端开发代码（包括调度器、管理端、客户端与运行时）目前所维护的具体代码仓库或分支路径。
- **Proposed Question for User**:
  - Agent Teams 相关的各端开发代码目前存放在哪些具体的代码仓库或分支中？
- **Recommended Conservative Formulation**:
  - “已检查的主线参考分支未包含 Teams 运行时代码，相关分支与代码仓库待第二轮核实。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`
