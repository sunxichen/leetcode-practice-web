# Ticket 06 专题审计报告：Workflow / Chatflow 与 Agent Teams 架构演进 (Deep Audit Brief)

> **审计范围**：
> 1. **编排范式分类学与综合概念框架 (Synthesis & Conceptual Framing)**：Single Agent ReAct 循环、工作流 (Workflow/Chatflow DAG) 与多智能体协同 (Agent Teams) 的概念边界与非线性协作拓扑（Workflow-as-Tool 与 Agent-in-Workflow 作为综合概念框架，非既定实现事实）。
> 2. **Agent Teams 体系深度审计 (Design Baseline)**：资产与版本模型（动态解析有效配置、会话跟随最新定义）、Orchestrator 协调器与交互契约、持久 Teammate 与 Worker Mode、三槽位持久调度（`TeamAssignmentScheduler`）与 FIFO 队列、Follow-up 有界队列与 Interrupt/Redirect 路由、双层超时机制（软等待 5m 与硬上限 2h）、三层流（主流 AG-UI、状态 SSE、详情 SSE & REST Timeline）与前端隔离读模型、断连后台推进与重启恢复、权限继承与无提权原则、MVP 审计源与会话删除保留/清理 Fence、Slice 1 资产闭环切片范围。
> 3. **底座框架与外部引擎精确核验**：`deepagents 0.6.12` `async_subagents.py` 源码核验（`start/check/update/cancel/list`、线程创建与复用机制）及其与 Agent Teams 架构设计契约的对比；Dify 与 LangFlowMVP 外部候选引擎调研笔记与运行语义核验。
> 4. **Workflow / Chatflow 现状与证据边界**：对 `langAgent` 主干、`develop` 源码基线与主文档全量核验，明确未发现官方 PRD/SPEC/ADR/代码实现，仅存在 `.scratch` 探索性调研笔记的事实；调和用户口述事实（Workflow/Chatflow 与 Teams 是最新演进重点且设计明确）与当前检查基线缺失的现状，明确材料位置与具体交付状态待第二轮 Grilling 澄清。
> 
> **基线环境与原始材料**：
> - Agent Teams 设计材料：`/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md` (Master PRD @ Ready for implementation)、`/Users/sunxichen/Projects/langAgent/docs/docs/adr/0001-0006` (Accepted ADRs)、`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md` (Slice 1 PRD @ ready-for-agent)、`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/research/deepagents-interpreter-subagents-evaluation.md`。
> - Workflow 探索性调研材料：`/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/02-dify-vs-langflowmvp-runtime-route.md`、`/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/03-workflow-human-input-resume-bridge-audit.md`、`/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/09b-engine-runtime-reliability-audit.md`。
> - 外部候选引擎源码：`/Users/sunxichen/Projects/dify`、`/Users/sunxichen/Projects/langFlowMVP`。
> - 框架只读源码：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-framework-sources/deepagents` (锁定版本 `0.6.12`)。
> - 全量检查基线：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference` (全量 `src/` 与 `tests/`)。

---

## 1. 架构范式分类学与综合概念框架 (Synthesis & Conceptual Framing)

> **核心说明**：本节讨论的编排范式分类（Agent Loop、Workflow、Agent Teams）以及 Workflow-as-Tool / Agent-in-Workflow 的协同关系，属于用于技术讨论与架构梳理的**综合概念框架 (Conceptual Framing / Proposed Synthesis)**，用于指导技术路线设计，**不作为 `langAgent` 既有的已实现事实**。

在平台架构演进探讨中，Agent Loop、Workflow/Chatflow 与 Agent Teams 针对不同业务确定性要求具有正交特征与协作可能：

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      编排范式分类学概念框架 (Conceptual Framing)                    │
├───────────────────────┬──────────────────────────┬───────────────────────────────┤
│ 范式类型              │ 核心特征与控制流          │ 典型适用场景                  │
├───────────────────────┼──────────────────────────┼───────────────────────────────┤
│ 1. Single Agent Loop  │ 动态 ReAct 循环；大模型  │ 开放式交互、多步探索、工具组  │
│    (通用单智能体)     │ 自主规划、工具决策与纠错 │ 合调用、开放问答              │
├───────────────────────┼──────────────────────────┼───────────────────────────────┤
│ 2. Workflow / Chatflow│ 确定性 DAG / 节点流图；  │ 刚性 SOP、数据管道、多步骤表  │
│    (工作流图引擎)     │ 拓扑控制、分支与循环     │ 单处理、审批流                │
├───────────────────────┼──────────────────────────┼───────────────────────────────┤
│ 3. Agent Teams        │ 集中协调 Multi-Agent；   │ 复杂多领域复合任务、长时间背  │
│    (多智能体团队)     │ Leader 委派 + 专家 Worker│ 景探索、多角色分工协作        │
└───────────────────────┴──────────────────────────┴───────────────────────────────┘
```

- **概念协同关系探讨**：
  - **Workflow-as-Tool**：将确定性 Workflow 封装为 Tool Schema 供 ReAct Agent 在决策循环中按需调用，作为执行刚性子流程的高可靠动作。
  - **Agent-in-Workflow**：在确定性 Workflow 的特定节点内嵌入自主决策 Agent，用于处理需要局部开放式探索或动态纠错的数据处理步骤。
  - **Team-level Dispatch**：由 Orchestrator 依据高层目标，将不同专业领域的子任务委派给多个独立的专业 Claw Agent，实现角色分工与上下文隔离。

---

## 2. Agent Teams 体系深度审计 (Design Baseline)

基于官方总纲 PRD（`/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md`，文档状态为 `Ready for implementation`，决策日期 2026-08-14）、切片 PRD（`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md`，Slice 1 @ `ready-for-agent`）以及 6 项已接受的架构决策记录（`docs/docs/adr/0001-0006`），对 Agent Teams MVP 进行技术契约与设计机制审计：

> [!IMPORTANT]
> **设计完成 $\ne$ 代码实现 $\ne$ 线上状态**：
> - Master PRD 与 ADR 0001-0006 确立了完整的多智能体协作架构契约（`design_complete`）；
> - Slice 1 PRD 规定了管理端资产 CRUD、候选 Agent 查询、权限配置、发布中心 `AGENT_TEAM` 资产适配与 Agent 引用删除保护的切片范围（`ready-for-agent`），明确排除了运行时代码、Team 会话页面与调度器实现；
> - 经对 `develop` 源码基线（`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference`）全量检查，未发现 Teams 运行时或调度器代码，其实际交付与上线状态仍属未知，需通过第二轮 Grilling 确认。

### 2.1 资产模型与配置生命周期 (`DESIGN-TM-001`, ADR 0001 & ADR 0003, PRD §4, §6, §10)
- **独立组合资产**：Agent Team 被定义为由 1 个 Orchestrator 与 1～10 个已有 Type 7 Claw Agent 组合而成的独立资产。Team 自身不创建私有 Agent，不覆盖成员的模型、人设、MCP、知识库、Skills 或权限配置。
- **引用稳定标识**：Team 仅保存成员的稳定 `agent_id` 引用，不保存 Agent 固化版本或配置快照。
- **动态解析最新生效配置 (ADR 0001)**：每个 Orchestrator Run 或 Teammate Run 在启动时解析对应 Agent 最新保存且生效的配置，并在运行记录中记录 `config_hash`。Run 进行中配置不可变；后续 Run 自动生效最新配置。执行请求必须显式传递业务 `agent_id`，且持久化 checkpoint 必须清理旧 Run 的 `llm_config`、`chatbi_config`、`quote_enable` 等字段，防止跨 Run 状态污染。
- **会话跟随最新 Team 定义 (ADR 0003)**：已有 `team_thread_id` 仅绑定稳定 `team_id`，不绑定不可变 Team 版本。每个新 Orchestrator Run 动态读取最新 Team 定义：新增成员在后续 Run 中可被委派；被删除成员不再接收新任务，但历史 Teammate 卡片、Timeline 记录与产物予以只读保留。

### 2.2 Orchestrator 协调器与交互契约 (`DESIGN-TM-002`, PRD §4.1, §7.2, §8.2)
- **单一面向用户主控**：用户在 Team Thread 中始终只与 Orchestrator 对话。页面开场白、输入框占位、文件上传与知识库选择等交互能力直接读取 Orchestrator 的有效配置。
- **自主决策与直接工作**：Orchestrator 可以零委派直接完成任务（直接在主 AG-UI 流中展示），亦可将任务委派给 Teammate。
- **委派与交互规则**：Orchestrator 仅委派信息完整、可独立执行的任务。Teammate 运行于 Worker Mode，在能力层严禁调用 Ask User 工具；所有用户交互（Ask User / 追问 / 确认）必须由 Orchestrator 在主会话中发起。
- **后台完成无主动唤醒**：后台委派完成时仅更新状态与 Timeline，不主动唤醒 Orchestrator 或向主会话追加系统消息；用户后续提问时，新 Orchestrator Run 通过查询工具获取结果。

### 2.3 持久 Teammate 与 Worker Mode (`DESIGN-TM-003`, ADR 0002, PRD §4.2, §8.3-8.4)
- **一成员一持久实例**：在同一个 `team_thread_id` 中，每个成员在首次被委派时懒加载创建唯一的持久 Teammate 线程（`team_thread_id + member_agent_id -> teammate_thread_id`）。后续针对该成员的所有 Assignment、Follow-up 与 Interrupt/Redirect 均复用该线程与 Workspace，防止成员卡片随任务量无界膨胀。
- **Worker 运行模式**：Teammate 输入为 Orchestrator 的完整指令；能力层禁用 HITL/Ask User；终态向 Orchestrator 返回结构化状态与纯文本总结（说明成功/失败/取消、完成事项与产物）；内部保留真实 `run_id`、`config_hash` 与终止原因。

### 2.4 三槽位准入控制与持久调度 (Assignment Admission Control, `DESIGN-TM-004`, ADR 0004, PRD §8.6)
- **三槽位硬限制**：每个 Team Thread 最多允许 3 个 active Teammate Run 同时执行。
- **持久调度器 (`TeamAssignmentScheduler`)**：由 `aibot-service` 在持久存储与事务边界内管理 Slot 占用、FIFO 队列与状态流转，明确否定仅靠提示词约束或单进程 `asyncio.Semaphore` 的方案。
- **状态流转与映射**：
  - 槽位可用（active < 3 且目标 Teammate 可运行）：占用 slot，状态置为 `working`，通过 Outbox 幂等派发；
  - 槽位满（active = 3）：持久化入队，状态置为 `queued`（FIFO 排序）；
  - 终态原子释放 slot，并自动唤醒下一条就绪队列项；
  - 用户界面将内部 `queued` 与 `working` 统一映射为“工作中”状态。

### 2.5 Follow-up 有界队列与 Redirect 路由 (`DESIGN-TM-005`, ADR 0002, PRD §8.5)
- **Follow-up 有界队列**：每个 Teammate 同时最多运行 1 个 active Run。当 Teammate 处于 `working` 时，普通 Follow-up 进入该成员专属的 FIFO 队列（上限 5 条）；超过 5 条时调度器拒绝入队并报错。平台不自动合并或推断 Follow-up 指令的语义覆盖关系。
- **Interrupt and Redirect**：当任务方向发生调整时，Orchestrator 发起 Redirect。调度器向当前 active Run 发送中断信号、清空该 Teammate 尚未执行的 Follow-up 队列，并在同一 Teammate 线程和槽位上创建替换 Assignment（在同一 slot 内原子替换，不额外占用 Team 槽位）。

### 2.6 双层超时机制与异常终态 (`DESIGN-TM-006`, PRD §9.1-9.2)
- **双层超时架构**：
  1. **同步软等待窗口 (Soft Wait Window)**：默认 5 分钟（最多允许追加等待 3 次）。到期仅结束 Orchestrator 当前同步等待，不判定 Assignment 失败。Orchestrator 可显式选择：继续等待、转为后台并正常回复用户、发起 Redirect 快速收尾、或取消。
  2. **Assignment 硬运行上限 (Hard Timeout)**：默认 2 小时（从进入 `working` 开始计时，不含排队时长）。超时强制中断底层执行并将 Assignment 标记为 `timed_out`。
  3. **会话删除优雅宽限期**：Team Thread 被删除时，提供 30 秒优雅取消窗口供工具与 Workspace 释放资源。
- **终态四分法**：内部状态 `succeeded` 映射为“已完成”，`failed` / `timed_out` 映射为“执行异常”，`cancelled` 映射为“已停止”。

### 2.7 三层流架构与只读 Timeline 读模型 (`DESIGN-TM-007`, PRD §1, §7.3-7.5, §13, §16)
- **三层流解耦模型**：
  1. **主流 (Mainstream)**：Orchestrator 沿用主 AG-UI SSE 流式传输，承载用户与协调器的主对话。
  2. **状态流 (Status SSE)**：Team 页面常驻轻量状态 SSE，推送 `TEAMMATE_UPSERT` 成员卡片四态变更。
  3. **详情流 (Detail SSE & Timeline REST)**：用户点击 Teammate 卡片时，按需通过 REST 拉取 Timeline 历史（默认每次 30 条，`before_sequence` 游标），并建立详情 SSE 增量订阅（`afterSequence` 游标），断线时根据游标精准补发。
- **前端读模型隔离**：前端状态被明确划分为 `orchestratorMessages`、`teamSummaryByThread`、`timelineByMember`、`connectionByStreamKey`、`activeTeamView`，严禁三条流互相污染主消息 Reducer。
- **只读执行流体验**：沿用聊天气泡与 Agent renderer 视觉呈现，不暴露内部技术游标与节点 ID；用户端无输入框，严禁直接对 Teammate 发送消息、停止、重试、追问或点赞。

### 2.8 断连执行与持久化韧性 (`DESIGN-TM-008`, PRD §13.3, §18.1)
- **浏览器连接解耦**：后台 Teammate Run 由后台执行器独立推进，用户关闭页面、刷新或 SSE 断开不中断后台任务执行。
- **服务重启恢复**：基于持久化 Dispatch Outbox 幂等键、Heartbeat 与 Lease 租约机制，服务重启后由调度器对账恢复 `queued` 与 `working` 任务，自动回收僵尸槽位，防止任务重复派发或永久占槽。

### 2.9 权限与安全模型 (`DESIGN-TM-009`, ADR 0005, PRD §5, §12.1)
- **复用 Agent 权限体系**：不新增 `TEAM_MANAGE` 等专用权限类型，复用已有的 `SUPER_ADMIN`、`ADMIN`、`NORMAL` 权限与发布中心可见范围配置。
- **无提权原则**：用户具备 Team 使用权限即可使用 Team，无需单独持有成员 Agent 的直接权限；但 Team 访问不提升底层数据权限，用户身份与组织上下文必须全程向下透传至 MCP 与 RAG。
- **内部通道鉴权**：内部委派端点仅限受信任微服务互调，严禁作为最终用户绕过鉴权直接调用成员 Agent 的后门。

### 2.10 审计与数据生命周期 (`DESIGN-TM-010`, ADR 0006, PRD §11, §12.2)
- **运行时记录作为 MVP 审计源**：`TeamThread`、`Assignment`、`TeammateRun` 与 `TeamEvent` 持久记录共同构成审计依据，记录关联 ID、成员 Agent、`config_hash`、发起用户、时间与终止原因，不独立建设重复的审计中心。
- **会话级联删除 Fence**：删除 Team Thread 时原子建立 Fence，拒绝新任务与晚到事件；清空队列并优雅取消后台任务（30s 宽限期）；确认退出后清理 Checkpoint 与 Workspace。
- **资产删除约束**：已发布 Team 必须先下架方可删除；存在 active Run 时拒绝删除；删除 Team 不影响 Orchestrator 与成员 Agent 本身。

### 2.11 Slice 1 资产切片范围界定 (`DESIGN-TM-011`, Slice 1 PRD)
- `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md`（Slice 1 @ `ready-for-agent`）严格界定了实施第一切片的范围：
  - 交付管理端 Agent Teams 模块 CRUD、候选 Type 7 Agent 搜索与校验、权限配置、发布中心 `AGENT_TEAM` 资产适配、以及 Agent 删除前的 Team 引用拦截保护。
  - **明确排除范围**：Slice 1 明确排除了运行时代码、Team 会话页面、持久调度器以及多智能体执行链路。

---

## 3. 底座框架与外部引擎精确核验

### 3.1 `deepagents 0.6.12` `async_subagents.py` 源码核验与设计契约对比
对锁定版本框架源码 bundle（`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-framework-sources/deepagents/middleware/async_subagents.py`）进行逐行核验：

- **原生工具与执行行为**：
  - 中间件通过 `_build_async_subagent_tools` 暴露 5 项核心工具：`start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks`。
  - **启动行为 (`start_async_task`)**：每次调用 `astart_async_task` 均显式执行 `thread = await client.threads.create()` 与 `client.runs.create(thread_id=thread["thread_id"], assistant_id=spec["graph_id"], input={"messages": [{"role": "user", "content": description}]})`。它将 `task_id` 绑定为远程线程 ID，并在父图 state 中以 `async_tasks: {task_id: task}` 持久化跟踪字典。**即原生 start 每次创建全新的独立线程**。
  - **更新行为 (`update_async_task`)**：接收 `task_id`，在已有 tracked `thread_id` 上调用 `client.runs.create(..., multitask_strategy="interrupt")`，中断当前 run 并在同一线程上以完整对话历史追加新指令。
  - **检查与列表 (`check_async_task`, `list_async_tasks`)**：`check_async_task` 查询单个 run 状态，并在成功时拉取 `thread.get("values")` 提取最终文本；`list_async_tasks` 通过 `asyncio.gather` 并发刷新非终态任务状态。
  - **取消行为 (`cancel_async_task`)**：调用 `client.runs.cancel(thread_id=..., run_id=...)` 并更新本地状态为 `cancelled`。
- **与 Agent Teams 架构设计的差异对比 (`DELTA-TM-001`)**：
  1. **线程生命周期**：所检查的 `async_subagents.py` 中间件每次 `start_async_task` 均新建独立线程；而 Team 架构设计明确要求**一成员一持久线程**（`team_thread_id + member_agent_id -> teammate_thread_id`），后续委派复用原线程。
  2. **并发准入控制**：所检查的 `async_subagents.py` 中间件未定义任何会话级并发限制；而 Team 架构设计要求 `aibot-service` 持久调度器严格控制**单会话最多 3 个 active Teammate Run**。
  3. **工具契约语义**：所检查的 `async_subagents.py` 中间件暴露底层技术 `task_id`（面向 Task 模型）；而 Team 架构设计要求封装角色导向的高层委派工具（`delegate_and_wait`, `delegate_in_background`, `send_follow_up`, `interrupt_and_redirect`, `cancel_team_work`, `list_team_tasks`）。
  4. **事件与读模型**：所检查的 `async_subagents.py` 中间件仅提供轮询/更新控制面，未定义独立 Worker 实时事件推送；而 Team 架构设计自研 Team Event 桥接与三层流读模型。

### 3.2 外部工作流候选引擎观察（Dify vs. LangFlowMVP）
依据调研笔记（`/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/02-dify-vs-langflowmvp-runtime-route.md`）及外部源码核验：
- **Dify 候选引擎观察 (`/Users/sunxichen/Projects/dify`)**：
  - Dify 外部源码展现了成熟的节点拓扑执行、多版本管理、Sandbox 隔离执行、以及基于 `workflow_started / node_started / human_input_required / workflow_finished` 的事件流体系。
  - 其运行高度耦合自有的 App / Workspace / Dataset / Provider 数据平面。若作为独立 Engine 接入，存在严重的资产双写、私有 Console API 依赖、开源协议限制及运维复杂度。
- **LangFlowMVP 候选引擎观察 (`/Users/sunxichen/Projects/langFlowMVP`)**：
  - 源码展示了基于 FastAPI + LangGraph 的轻量图执行器、基于 SQLite 的 Checkpoint 恢复与基础 Human Input 中断机制。
  - 但缺乏生产级全局并发控制、无 Run 级超时与 Cancel API，SQLite Checkpointer 存在写锁竞争风险（参见 `09b-engine-runtime-reliability-audit.md`）。
- **调研笔记建议性质**：调研笔记提出了“以 LangFlowMVP 为基础演进独立 Workflow Engine，并复用 Dify Sandbox 执行 Python Code Node”的路线设想。**该结论属于探索性调研笔记，未在主项目中形成正式立项、PRD 或 ADR 决策**。

---

## 4. Workflow / Chatflow 现状与证据边界

### 4.1 证据核验与口述事实调和 (`DELTA-WF-001`)
1. **源码与文档负向核验**：
   - 对检查的 `develop` 源码基线（`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference` 下全量 `src/` 与 `tests/`）及主项目文档（`docs/docs/`）进行了全面检索，**未发现任何官方归档的 Workflow/Chatflow PRD、SPEC、ADR 或运行时引擎实现代码**。
   - 仅在 `docs/.scratch/workflow-feature/research/` 目录下发现了前期探索性调研笔记。
2. **用户口述事实保留 (`FACT-TM-003`, `FACT-WF-003`)**：
   - 用户在第一轮口述中明确指出：**Agent Teams 与 Dify Workflow/Chatflow 集成是项目最新的演进重点，且两套设计均已足够明确，应当进入长文正文**。
3. **事实调和结论 (`DELTA-WF-001`)**：
   - 绝不能简单武断地下结论“项目中不存在 Workflow”；
   - 准确的事实表述为：**平台确立了将 Agent Teams 与 Dify Workflow/Chatflow 集成作为核心演进方向的设计意图；但当前检查的代码基线与主文档中尚未合入正式实现与官方 PRD/SPEC。具体的集成机制、材料位置与实际交付状态属于未证实差距（pending evidence），已录入 7 项原子化 Evidence Gaps，留待第二轮 Grilling 最终核验冻结**。

---

## 5. 结构化成熟度与 Delta 矩阵

| 领域 / 机制 | 原始设计 / 调研意图 | 对应 Design Claim | develop / 仓库核验现状 | 对应 Fact Claim | 成熟度状态 (Maturity) 与 Delta 评估 |
|---|---|---|---|---|---|
| **Teams 资产与生命周期** | PRD & ADR 0001/0003：组合资产，稳定 `agent_id` 引用，启动解析有效配置，会话跟随最新 Team 定义。 | `DESIGN-TM-001` | 全量检查 `develop` 源码基线未发现 Teams 运行时代码（生产交付状态待确认）。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 与 ADR 已接受）** |
| **持久 Teammate 与 Worker** | PRD & ADR 0002：一成员一持久实例，懒加载创建，Worker 模式运行，禁用 Ask User。 | `DESIGN-TM-003` | 全量检查 `develop` 源码基线未发现持久 Teammate 管理服务。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 与 ADR 已接受）** |
| **3 槽位并发与准入控制** | PRD & ADR 0004：`aibot-service` 持久调度器管理 3 槽位硬限制与 FIFO 队列。 | `DESIGN-TM-004` | 全量检查 `develop` 源码基线无持久调度器代码。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 与 ADR 已接受）** |
| **Follow-up 与 Redirect** | PRD & ADR 0002：有界 FIFO（上限 5 条），Redirect 中断当前任务并清空队列。 | `DESIGN-TM-005` | 全量检查 `develop` 源码基线无队列与中断替换实现。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 与 ADR 已接受）** |
| **双层超时与异常恢复** | PRD §9.1：同步软等待 5m（最多 3 次），Assignment 硬上限 2h，删除宽限 30s。 | `DESIGN-TM-006` | 全量检查 `develop` 源码基线无 Team 级双层超时调度器。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 已批准）** |
| **三层流与只读 Timeline** | PRD §1, §7.4, §13：主流 AG-UI + 状态 SSE + 详情 SSE & REST Timeline 历史。 | `DESIGN-TM-007` | 全量检查 `develop` 源码基线仅支持单 Agent AG-UI 流。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 已批准）** |
| **断连执行与后台韧性** | PRD §13.3：后台任务与浏览器断连解耦，基于 Outbox 与 Lease 恢复。 | `DESIGN-TM-008` | 全量检查 `develop` 源码基线未发现后台 Team 任务对账逻辑。 | `FACT-TM-002` | `design_complete`<br>**（Master PRD 已批准）** |
| **Slice 1 资产切片** | Slice 1 PRD：规划管理端资产 CRUD、候选查询与发布适配，明确排除运行时与调度器。 | `DESIGN-TM-011` | 全量检查 `develop` 源码基线未发现管理端资产代码（实际交付状态待确认）。 | `FACT-TM-002` | `design_complete`<br>**（Slice 1 PRD ready-for-agent）** |
| **Teams 中间件差异 (Delta)** | ADR 0002/0004：一成员一持久线程、3 槽位硬限制、角色委派工具与 Team 事件流。 | `DESIGN-TM-003`<br>`DESIGN-TM-004`<br>`DESIGN-TM-007` | 框架源码 `async_subagents.py` 每次新建线程、未定义 3 槽位并发限制、暴露底层 `task_id`。 | `FACT-TM-001`<br>`DELTA-TM-001` | `design_complete`<br>**（自研平台调度与事件契约）** |
| **Workflow 引擎路线调研** | 调研笔记：探讨建议 LangFlowMVP 演进独立引擎 + Dify Sandbox。 | `DESIGN-WF-001` | 外部源码 Dify 与 LangFlowMVP 展示外部候选引擎语义；主项目无立项代码。 | `FACT-WF-001`<br>`FACT-WF-002` | `proposed`<br>**（属于探索性调研建议，非项目决策）** |
| **Workflow 运行时与资产草案** | 调研笔记：探讨了 Workflow DSL、数据信封传递与 AG-UI 事件适配构想。 | `DESIGN-WF-002` | 全量检查 `develop` 源码基线未发现官方 PRD、SPEC、ADR 或代码实现。 | `FACT-WF-002` | `proposed`<br>**（项目设计证据缺失，待第二轮 Grilling）** |
| **Workflow 集成证据差异 (Delta)** | 口述事实确认 Dify Workflow 集成为重点，设计方案清晰。 | `FACT-WF-003` | 检查基线暂缺官方 PRD/代码，属于待补充证据项（pending evidence）。 | `FACT-WF-002`<br>`DELTA-WF-001` | `unconfirmed`<br>**（待第二轮 Grilling 补充物料与交付证据）** |

---

## 6. 原始材料阅读与证据索引清单

- **Agent Teams 核心设计材料**：
  - `/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0001-agent-teams-follow-latest-effective-agent-config.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0002-dynamic-persistent-teammates-over-agent-protocol.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0003-existing-team-threads-follow-latest-team-definition.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0004-durable-team-assignment-admission-control.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0005-agent-teams-reuse-agent-authorization-model.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0006-team-runtime-records-are-the-mvp-audit-source.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/research/deepagents-interpreter-subagents-evaluation.md`
- **Workflow 探索性调研材料**：
  - `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/02-dify-vs-langflowmvp-runtime-route.md`
  - `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/03-workflow-human-input-resume-bridge-audit.md`
  - `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/09b-engine-runtime-reliability-audit.md`
- **框架只读源码、全量核验基线与外部工程**：
  - `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-framework-sources/deepagents` (锁定版本 `0.6.12` 源码)
  - `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference` (全量 `src/` 与 `tests/`)
  - `/Users/sunxichen/Projects/dify`
  - `/Users/sunxichen/Projects/langFlowMVP`
