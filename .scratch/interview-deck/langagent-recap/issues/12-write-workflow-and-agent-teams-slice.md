# 编写 Workflow/Chatflow 与 Agent Teams 演进章节及代码

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

交付 Workflow/Chatflow 与 Agent Teams 的平台演进章节和 `evolution` recap code，从 `langAgent` 运行时视角讲清设计逻辑、验证状态、可靠性边界和下一阶段实施蓝图。

## Acceptance criteria

- [x] Worker 独立核对设计文档、ADR、prototype、研究报告及必要的 Dify、LangFlowMVP、deepagents 源码。
- [x] 章节明确区分作者参与/主导的设计与团队最终落地的实现；设计态蓝图、原型证据和当前主线状态分层表述。
- [x] 明确区分 Agent loop、Workflow/Chatflow 和 Agent Teams 解决的不同问题，不写成线性替代关系。
- [x] Workflow 章节覆盖选型、资产版本、runtime contract、AG-UI adapter、human-input bridge 和可靠性。
- [x] Agent Teams 章节覆盖 Orchestrator、持久 Teammate、assignment、并发、超时、事件、断连、权限和审计。
- [x] 所有设计态代码标记成熟度，类名和函数名来自已确认契约或真实框架，不发明伪实现事实。
- [x] 新 research 与 fact base 冲突时回到事实层处理，章节不得静默改写成熟度或设计结论。

## Blocked by

- [08 - 执行第二轮 Evidence-Gap Grilling 并冻结事实](08-run-evidence-gap-grilling-and-freeze-facts.md)

## Comments

- **两轮独立验收结论**：
  1. **首轮双轴验收**：发现 2 项 P1（Dify Sandbox 安全措辞倒置、WorkflowToolAdapter 虚构默认超时与异常分支缺失）及 5 项 P2（挂起 TTL 与内存限制数值一致性、契约工具名缩写精度、interrupt_and_redirect 控制流建模一致性、摘要隐喻词汇释义）；全部精准窄修关闭。
  2. **争议主张驳回**：关于调度器归属（S-1/S-4）与 delegate_and_wait 异步化主张，经核对 ADR 0004（"enforced by a durable assignment scheduler in aibot-service"）与 DESIGN-TM-006（"同步软等待 5m 窗口与 2h 硬上限"）原文后维持正文与代码设计，明确驳回修改。
  3. **第二轮复验**：全部 7 项窄修项复验通过，确认无回归，解除阻塞。
- **交付产物**：
  1. `.scratch/interview-deck/langagent-recap/recap-blog/t12-workflow-agent-teams.md`（完整长文演进章节，涵盖编排范式分类学、Workflow 选型与契约、Agent Teams 架构体系深度剖析、框架源码对比与演进路线图）。
  2. `.scratch/interview-deck/langagent-recap/recap-code/evolution/workflow_agent_teams.py`（白板型核心控制流，涵盖 WorkflowHumanInputNode、WorkflowToolAdapter、TeamAssignmentScheduler 3 槽位持久准入控制、PersistentTeammateManager、OrchestratorDelegationTools 双层超时、TeammateWorkerRunner、三层流路由器与删除 Fence）。
- **主要原始证据路径**：
  - Agent Teams 设计主档：`/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md` (Master PRD @ Ready for implementation)
  - Agent Teams ADR：`/Users/sunxichen/Projects/langAgent/docs/docs/adr/0001-0006` (6 项已接受 ADR)
  - Agent Teams 切片 PRD：`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md` (Slice 1 @ ready-for-agent)
  - Workflow 调研笔记：`/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/` (`02-dify-vs-langflowmvp-runtime-route.md`, `03-workflow-human-input-resume-bridge-audit.md`, `09b-engine-runtime-reliability-audit.md`)
  - 外部候选引擎：`/Users/sunxichen/Projects/dify`、`/Users/sunxichen/Projects/langFlowMVP`
  - 框架锁定源码：`.scratch/langagent-framework-sources/deepagents/middleware/async_subagents.py` (锁定版本 `deepagents 0.6.12`)
  - 全量检查基线：`.scratch/langagent-develop-reference` (全量 `src/` 与 `tests/`)
- **设计 / 原型 / 实现状态分层核验**：
  - **Agent Teams**：Master PRD 与 ADR 0001-0006 确立了完整多智能体架构契约（`design_complete`）；Slice 1 PRD 规划管理端资产闭环（`ready-for-agent`）；全量检查 `develop` 源码基线未发现 Teams 运行时代码（`FACT-TM-002`），严格定性为待实施设计蓝图。
  - **Workflow / Chatflow**：口述演进意图明确，调研笔记探讨了轻量引擎路线与 Human-Input 挂起恢复（`proposed`）；`develop` 源码基线未包含官方 PRD/实现，相关技术物料留待后续补充（GAP-20～24 `accepted_unknown`）。
  - **框架演进差异 (DELTA-TM-001)**：`deepagents 0.6.12` `async_subagents.py` 每次调用 `start_async_task` 均新建独立线程、无会话级并发限制、暴露底层 `task_id`；而 Teams 设计要求一成员一持久线程、3 槽位持久准入控制、高层角色委派工具与 Team Event 三层流。
- **语法与合规核验**：
  - `python3 -m py_compile workflow_agent_teams.py` 语法检查通过，已清理 `__pycache__`。
  - 经 `grep_search` 全量扫描，禁词（Fake/Mock）0 命中，commit hash 叙事锚点 0 命中，无虚构性能指标或线上故障。
