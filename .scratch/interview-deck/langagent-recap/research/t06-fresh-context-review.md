# Ticket 06 独立审计与重构评审报告 (Fresh Context Review)

> **审计背景**：本报告由全新独立 Worker 上下文执行，针对 Ticket 06（Workflow / Chatflow 与 Agent Teams 演进）进行原始代码、设计文档与框架依赖的全量独立查验，并对此前由跨 Ticket 复用上下文生成的候选输出进行差异对照与废弃替换。

---

## 1. 独立审计输入与查验清单 (Inputs Inspected)

| 输入类别 | 物理路径 / 查验基线 | 查验内容与证据性质 |
|---|---|---|
| **主线开发基线** | `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference` | 全量检索 `src/` 与 `tests/`，核验是否存在 Teams 运行时、持久多智能体调度器或 Workflow 引擎代码（负向核验确认未合入）。 |
| **框架锁定源码** | `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-framework-sources/deepagents` (版本 `0.6.12`) | 逐行核验 `middleware/async_subagents.py`（5 项工具、线程创建与复用机制）与 `middleware/subagents.py`。 |
| **Agent Teams 设计主档** | `/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md` | Master PRD（状态 `Ready for implementation`，决策日期 2026-08-14），核验资产、调度、路由、超时、事件与读模型。 |
| **Agent Teams ADR** | `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0001-0006` | 6 项已接受架构决策记录（有效配置、持久 Teammate、跟随定义、3 槽位准入、权限复用、MVP 审计源）。 |
| **Agent Teams 切片与调研** | `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md`<br>`issues/01-07`<br>`research/deepagents-interpreter-subagents-evaluation.md` | Slice 1 PRD（状态 `ready-for-agent`，覆盖资产 CRUD 与发布，排除运行时与调度器）；以及 DeepAgents 评估报告。 |
| **Workflow 探索性调研** | `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/` | 核验 `01-existing-assets-reuse-audit.md`、`02-dify-vs-langflowmvp-runtime-route.md`、`03-workflow-human-input-resume-bridge-audit.md`、`09b-engine-runtime-reliability-audit.md`。 |
| **外部候选引擎** | `/Users/sunxichen/Projects/dify` 与 `/Users/sunxichen/Projects/langFlowMVP` | 核验外部引擎原生运行语义、DSL 结构、节点调度、Human Input 事件流与可靠性特征。 |
| **用户第一轮口述事实** | `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/langagent-recap/spec-recap-blog.md` 与第一轮 Grilling 记录 | 用户确认：Agent Teams 与 Dify Workflow/Chatflow 集成是项目最新演进重点，设计足够清晰，应进入正文。 |

---

## 2. 独立审计核心结论 (Independent Conclusions)

### 2.1 三轨审计与设计完成性质界定
- **严格遵循三轨原则**：设计意图（`DESIGN-*`）、演进偏差（`DELTA-*`）与实现事实（`FACT-*`）清晰分离。
- **设计完成 $\ne$ 代码实现 $\ne$ 线上状态**：Master PRD 与 ADR 0001-0006 是被批准的正式设计基线（`design_complete`）；但主线 `develop` 源码中并无 Teams 运行时代码。Slice 1 PRD 处于 `ready-for-agent` 状态，仅规划管理端资产闭环，且明确排除了运行时与调度器；其实际交付状态仍属未知。

### 2.2 Agent Teams 核心设计契约提炼
1. **资产与版本**：Team 组合已有 Claw Agent，仅引用稳定 `agent_id`；Run 启动时解析最新生效配置并记录 `config_hash`；会话绑定 `team_id` 并跟随最新 Team 定义，不维护不可变版本快照。
2. **Orchestrator 协调**：用户仅与 Orchestrator 交互；Orchestrator 可直接工作或委派；Teammate 运行于 Worker Mode，能力层禁用 Ask User，用户 HITL 全部由 Orchestrator 负责。
3. **持久 Teammate**：同一 Team Thread 中一成员对应一持久实例（`team_thread_id + member_agent_id -> teammate_thread_id`），懒加载创建，后续任务复用原线程与 Workspace。
4. **准入控制与并发**：单会话最多 3 个 active Teammate Run（硬限制）；由 `aibot-service` 持久调度器（`TeamAssignmentScheduler`）在事务与 Outbox 边界内管理 FIFO 队列；排队状态映射为“工作中”。
5. **Follow-up 与 Redirect**：忙碌成员的 Follow-up 进入有界 FIFO 队列（上限 5 条）；`interrupt_and_redirect` 中断当前任务、清空该成员队列，并在同线程同槽位创建替换任务。
6. **双层超时**：同步软等待 5 分钟（最多追加 3 次，到期不判失败，可转后台/Redirect/取消）；Assignment 硬上限 2 小时（超时中断并标记 `timed_out`）；会话删除优雅宽限 30 秒。
7. **三层流与读模型**：主流（AG-UI SSE）+ 状态流（常驻轻量 SSE）+ 详情流（按需 REST 历史 + 详情 SSE）；前端读模型严格隔离，呈现聊天式只读执行流，禁止用户直接对 Teammate 进行交互操作。
8. **断连韧性与恢复**：后台任务与浏览器连接解耦；服务重启后基于 Outbox 幂等键、Heartbeat 与 Lease 对账恢复，防任务丢失与僵尸占槽。
9. **权限与审计**：复用 Agent 权限体系，无提权；`TeamThread / Assignment / TeammateRun / TeamEvent` 构成 MVP 审计源；删除会话建立 Fence 并级联清理。

### 2.3 `deepagents 0.6.12` `async_subagents.py` 源码核验
- **原生语义**：
  - `start_async_task` 每次调用均显式执行 `await client.threads.create()` 创建新线程，并以 `task_id`（`thread_id`）持久化状态；
  - `update_async_task` 在已有 `thread_id` 上发起带 `multitask_strategy="interrupt"` 的新 run；
  - `check_async_task` 与 `list_async_tasks` 提供拉取与轮询能力；`cancel_async_task` 提供取消。
- **与 Team 架构设计的演进差异 (`DELTA-TM-001`)**：
  - 所检查的 `async_subagents.py` 中间件每次 `start_async_task` 均新建独立线程，而 Team 架构设计要求一成员一持久线程；
  - 所检查的 `async_subagents.py` 中间件未定义会话级 3 槽位准入控制；
  - 所检查的 `async_subagents.py` 中间件暴露底层技术 `task_id`，而 Team 架构设计要求角色导向的高层委派工具；
  - 所检查的 `async_subagents.py` 中间件未定义独立 Worker 实时事件推送与三层流前端投影。

### 2.4 Workflow 现状与口述事实调和
- **调研笔记性质**：`docs/.scratch/workflow-feature/` 下的文档是探索性调研笔记，而非主项目正式立项、PRD 或 ADR；Dify 与 LangFlowMVP 源码仅证明外部引擎自身语义，不证明 `langAgent` 的实际集成。
- **调和口述事实 (`FACT-TM-003`, `FACT-WF-003`, `DELTA-WF-001`)**：用户第一轮明确确认 Agent Teams 与 Dify Workflow/Chatflow 是最新演进重点，设计足够清晰，应进入正文。因此，在报告中完整记录设计意图与架构考量，同时如实指出已检查基线中尚未合入代码或正式 PRD/SPEC，将具体的集成架构细节、物料位置与实际交付状态列为待补充证据项（pending evidence）与 7 项原子化 Evidence Gaps 留待第二轮 Grilling 澄清，绝不将现状削足适履为“可能不存在 Workflow”。
- **概念范式分类**：Single Agent Loop、Workflow/Chatflow 与 Agent Teams 的分类，以及 Workflow-as-Tool / Agent-in-Workflow 的拓扑探讨，均定性为综合概念框架（`proposed`）。

---

## 3. 候选文件差异对照 (Candidate Differences)

对比此前跨 Ticket 复用上下文生成的候选输出（Candidate Outputs）与本次独立重构成果：

| 对比维度 | 候选输出 (Candidate Output) | 本次独立重构成果 (Fresh Reconstruction) | 改进与演进点 |
|---|---|---|---|
| **三轨对齐完整性** | 仅有 DESIGN 与 FACT 事实行，缺失 DELTA 演进偏差对比。 | 严格落实三轨规范，增加 `DELTA-TM-001`（框架中间件与 Teams 设计对比）与 `DELTA-WF-001`（口述演进重点与基线证据差距对比）。 | 完整建立设计意图、实现事实与演进偏差的三轨底稿。 |
| **口述事实标准化** | 用户口述确认未形成显式独立 FACT 记录。 | 新增 `FACT-TM-003` 与 `FACT-WF-003`，将用户口述重点确立为受控事实（`pending_grilling_2`），不越权推断代码已落地。 | 准确反映用户输入边界，防止事实扩大化。 |
| **Evidence Gaps 原子化与纯净化** | 复合型提问（将架构与路径混问、状态与仓库混问），包含括号内假定组件列表。 | 彻底拆分为 7 项严格单问题、原子化开放式 Gap（`GAP-WF-001` 架构契约、`GAP-WF-002` 设计物料路径、`GAP-WF-003` 落地状态、`GAP-WF-004` 代码仓库位置、`GAP-WF-005` 边界定位、`GAP-TM-001` 落地状态、`GAP-TM-002` 代码仓库位置），**完全剔除预设组件列表与 A/B/C 选项**。 | 保证第二轮 Grilling 的单一针对性与高精度。 |
| **术语表达精确度** | 使用宽泛的 “Stock lacks / Stock 缺少...”。 | 严格修正为规范表述：“所检查的 `async_subagents.py` 中间件未定义... (the inspected async_subagents.py middleware does not define...)”。 | 精准锚定代码观察对象，避免泛化整个框架。 |
| **路径全量显式化与 Git 锚点净化** | 包含 commit hash 锚点与不完整 scratch 相对路径。 | 所有 scratch 证据路径统一显式化为 `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/...`，全量剔除 commit hash 锚点叙事。 | 严格符合规范第 10 条（证据路径无歧义、根植于源码/工作树）。 |

---

## 4. 产物交付与统计清单

- **交付产物**：
  1. `briefs/t06-workflow-agent-teams.md`（完整审计报告，包含概念框架、Teams 深度审计、框架对比、调研核验与 Delta 矩阵）
  2. `fragments/t06-facts.md`（包含 21 条结构化事实行，所有 scratch 路径全量显式化）
  3. `fragments/t06-evidence-gaps.md`（包含 7 项严格单问题、原子化开放式 Evidence Gaps）
  4. `research/t06-fresh-context-review.md`（本独立评审报告）

- **精确 Claim 与 Gap 统计**：
  - **Design Claims (`DESIGN-*`)**: **13 条** (`DESIGN-TM-001` 至 `DESIGN-TM-011`, `DESIGN-WF-001` 至 `DESIGN-WF-002`)
  - **Delta Claims (`DELTA-*`)**: **2 条** (`DELTA-TM-001`, `DELTA-WF-001`)
  - **Fact Claims (`FACT-*`)**: **6 条** (`FACT-TM-001`, `FACT-TM-002`, `FACT-TM-003`, `FACT-WF-001`, `FACT-WF-002`, `FACT-WF-003`)
  - **Total Claims**: **21 条**
  - **Evidence Gaps (`GAP-*`)**: **7 项** (`GAP-WF-001` 至 `GAP-WF-005`, `GAP-TM-001` 至 `GAP-TM-002`)
