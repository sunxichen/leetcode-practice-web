# 平台编排演进：确定性工作流 (Workflow/Chatflow) 与 多智能体协作 (Agent Teams)

> **本章定位**：作为平台向高阶确定性编排与复杂多角色分工演进的核心蓝图，本章系统阐述 `langAgent` 在单智能体 ReAct 循环之外的两大关键演进方向——确定性工作流（Workflow/Chatflow DAG 图引擎）与多智能体团队协作（Agent Teams 集中式编排体系）。
>
> 深入剖析三大编排范式的正交共存与协同拓扑（即 Workflow 可作为工具供 Agent 决策调用、Agent 也可作为节点嵌入 Workflow 的相互嵌合关系）、工作流引擎技术选型权衡（Dify 平台级耦合 vs. LangFlowMVP 运行时轻量化）、Human-Input 中断挂起与强类型恢复桥接，以及 Agent Teams 架构体系的核心设计契约（一成员一持久实例、三槽位持久准入调度、Follow-up 有界队列与 Interrupt/Redirect、双层超时控制、三层流解耦与只读 Timeline 读模型、断连恢复与级联删除 Fence）。
>
> **代码与事实基线说明**：
> - **主线开发基线**：`develop` Reference Worktree (`.scratch/langagent-develop-reference`)，经全量负向核验确认：当前主线尚未合入 Workflow 引擎运行时与 Agent Teams 调度器代码（`FACT-WF-002`, `FACT-TM-002`）。
> - **Agent Teams 设计基线**：Master PRD (`Agent_Teams_PRD_与技术方案.md` @ Ready for implementation)、ADR 0001～0006 (`docs/docs/adr/` @ Accepted)、Slice 1 PRD (`sunxichen/work/agent-team/PRD.md` @ ready-for-agent)；设计契约完备 (`design_complete`)。
> - **Workflow 探索性调研**：`.scratch/workflow-feature/research/` 调研笔记 (`proposed` / `accepted_unknown`)，口述演进意图明确，待后续正式 PRD 补充。
> - **框架锁定源码**：`deepagents 0.6.12` (`.scratch/langagent-framework-sources/deepagents/middleware/async_subagents.py`)，核验原生异步子代理行为与演进差异 (`DELTA-TM-001`)。
> - **白板复现代码**：[workflow_agent_teams.py](../recap-code/evolution/workflow_agent_teams.py)

---

## 1. 架构范式分类学与非线性协同网络 (Paradigm Synthesis)

在企业级 AI 应用的落地演进中，单一的 ReAct（Reasoning + Acting）自主循环无法穷尽所有业务形态。不同业务场景对**确定性（Determinism）**、**自主性（Autonomy）**、**长周期协作（Long-running Coordination）**与**上下文隔离（Context Isolation）**的要求截然不同。

`langAgent` 平台将编排体系梳理为三大正交且互补的架构范式：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 三大编排范式特征与职责边界全景                                          │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────────────────────┤
│ 编排范式                 │ 控制流拓扑与核心机制        │ 典型适用业务场景                              │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────────────────────┤
│ 1. Single Agent Loop     │ 动态 ReAct 循环；大模型自主 │ 开放式问答、探索式数据排查、跨工具链灵活调度、│
│    (通用自主单智能体)    │ 规划、多步工具调用与自发纠错│ 局部意图未知的交互探索                        │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────────────────────┤
│ 2. Workflow / Chatflow   │ 确定性有向无环图 (DAG)；    │ 刚性业务 SOP、固定数据管道、多节点审批流、    │
│    (工作流与对话流图引擎)│ 严格按拓扑分支、循环与条件边│ 强合规结构化表单处理、确定性步骤批量作业      │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────────────────────┤
│ 3. Agent Teams           │ 集中协调多智能体系统；      │ 复杂跨领域复合任务、多角色分工协作、超长周期  │
│    (多智能体团队协作体系)│ Leader 委派 + 专家持久 Worker│ 异步背景调研、高隔离度专业上下文探索          │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────────────────────┘
```

### 1.1 为什么三者不是线性替代关系？

在平台演进探讨中，一个常见的架构误区是将这三者理解为“由初级向高级演进的替代链条”（即认为有了 Teams 就不需要 Workflow，有了 Workflow 就可以废弃 Agent Loop）。事实上，三者解决的是完全不同的控制论问题：

1. **确定性与自由度的张力**：
   - Agent Loop 的优势在于**自由度与动态纠错**，劣势在于控制流不可控、步数不可预测、易发生幻觉漂移；
   - Workflow 的优势在于**100% 确定性与可复现性**，劣势在于无法应对非预期的动态输入与突发歧义；
   - Agent Teams 的优势在于**上下文物理隔离与角色专业化分工**，劣势在于系统协调开销大、状态机复杂度高。

2. **综合概念框架 (Synthesis & Non-linear Topology)**：
   在平台技术演进设计中，三者通过高内聚低耦合的协议相互嵌合，形成复合拓扑：
   - **Workflow-as-Tool**：将经过严格测试的确定性 Workflow 封装为标准 Tool Schema（输入参数由 JSON Schema 约束），作为动作原子注入 ReAct Agent 的工具集。当模型识别到需要执行刚性 SOP（如“生成合规审计报表并归档”）时，直接调用该工作流工具，既保证了关键路径的零偏差，又保留了外层调度的灵活性。
   - **Agent-in-Workflow**：在确定性 Workflow 的某个特定处理节点（如“非结构化合同异常条款研判”）内部嵌入一个具备工具调用与反思能力的 ReAct Agent 节点，将局部非确定性推理限定在严格的节点输入输出沙箱内。
   - **Team-level Dispatch**：由 Orchestrator 作为主控中枢，依据用户的复杂目标，将子任务分配给专注于不同垂直领域的持久 Claw Agent（如数据分析专家、合规审计专家、文档撰写专家），每个 Teammate 内部可独立运行其自身的 Agent Loop 或调用其专属的 Workflow。

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              编排范式协同网络 (Workflow-as-Tool & Agent-in-Workflow)                   │
│                                                                                                        │
│   [ 最终用户 ] ◄──────────► [ Orchestrator 协调器 ] (Team-level Multi-Agent Dispatch)                   │
│                                      │                                                                 │
│                 ┌────────────────────┴─────────────────────┐                                           │
│                 ▼                                          ▼                                           │
│       [ Teammate A: 分析专家 ]                   [ Teammate B: 合规专家 ]                                │
│       (ReAct Loop 动态探索)                     (执行确定性 SOP 图)                                    │
│                 │                                          │                                           │
│                 ▼ (Workflow-as-Tool)                       ▼ (Agent-in-Workflow)                       │
│       ┌──────────────────────┐                   ┌──────────────────────────────────────────┐          │
│       │  Data_Pipeline_DAG   │                   │ Step 1 ──► [ Contract Agent ] ──► Step 3 │          │
│       │  (Node 1 ──► Node 2) │                   │ (Node)     (ReAct 局部推理)       (Node) │          │
│       └──────────────────────┘                   └──────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 确定性工作流 (Workflow / Chatflow) 选型、契约与可靠性边界

> **事实与演进说明**：
> 在当前已检查的主线源码基线（`develop`）与主项目文档中，尚未合入正式归档的 Workflow/Chatflow PRD、SPEC、ADR 或运行时代码（`FACT-WF-002`）。
> 本节技术探讨基于前期探索性调研报告（`02-dify-vs-langflowmvp-runtime-route.md`、`03-workflow-human-input-resume-bridge-audit.md`、`09b-engine-runtime-reliability-audit.md`）以及针对外部候选引擎（Dify 与 LangFlowMVP）的原生代码核验，记录平台选型逻辑与技术架构契约蓝图（`DESIGN-WF-001`, `DESIGN-WF-002`）。具体集成交付物料待后续补充（GAP-20～24 `accepted_unknown`）。

### 2.1 引擎选型逻辑：Dify 平台级耦合 vs. LangFlowMVP 运行时轻量化

在评估工作流运行时集成路线时，团队对两条代表性技术路线进行了深入的架构与代码级审计：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 工作流候选引擎架构权衡对比 (Dify vs. LangFlowMVP)                       │
├──────────────────────────┬──────────────────────────────────────────┬──────────────────────────────────┤
│ 评估维度                 │ 路线 A：Dify Engine + Adapter            │ 路线 B：LangFlowMVP 演进独立引擎 │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **内核成熟度**           │ 极高。具备成熟的节点拓扑、多版本管理、   │ 较低。原型级别，基于 FastAPI +   │
│                          │ 循环/迭代、Sandbox 隔离及完备事件体系。  │ LangGraph 构建，缺乏高可用治理。 │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **领域模型侵入性**       │ 极高。强耦合 Dify 自有的 App/Workspace/  │ 极低。代码完全自主可控，直接贴合 │
│                          │ Dataset/Provider/Tool/File 数据平面。    │ 平台的 Agent/RAG/MCP 领域模型。  │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **资产管理与发布闭环**   │ 存在严重割裂。公开 Service API 仅支持    │ 原生支持平台统一的 DSL 定义、    │
│                          │ 运行，App CRUD 与 Publish 依赖非公开     │ Draft 编辑态与 Release 发布态，  │
│                          │ Console API，面临双写同步与升级锁定风险。│ 无需跨系统翻译资产。             │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **协议与事件对接**       │ 需在 Dify 事件与 AG-UI 协议之间建立复杂  │ 共享 LangGraph 核心事件模型，    │
│                          │ 的双向状态翻译器与鉴权透传层。           │ 天然对接平台的 AG-UI 中间件流水线│
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **调研权衡结论**         │ 仅复用其独立的 **Dify Sandbox** 容器执行 │ 建议以 **LangFlowMVP** 为原型演进│
│                          │ Python Code Node，隔离不受信代码。       │ 独立 Engine，彻底掌控数据与生命周期│
└──────────────────────────┴──────────────────────────────────────────┴──────────────────────────────────┘
```

#### 决策背后的工程权衡
Dify 的成熟度是以其**全栈平台封闭性**为代价的。如果仅仅为了使用其工作流引擎而引入 Dify，平台必须在后端持续维护两套资产模型（平台自有 Builder DSL 与 Dify App DSL）的编译与双向同步，且不得不调用 Dify 内部未公开且随时可能变更的 Console 私有 API。

因此，技术调研得出的清晰推荐是：**“资产与引擎自研/轻量演进，沙箱执行独立复用”**——即以基于 LangGraph 的轻量化 Graph Compiler 作为 Workflow Engine 内核，原生对接平台资产中心与 AG-UI 协议；同时复用经过生产检验的 Dify Sandbox（基于 seccomp/AppArmor 与 internal 隔离网络容器）来承载 Python Code 节点的安全执行。

---

### 2.2 资产模型、DSL 与版本管理契约

工作流资产被定义为一种可通过可视化拖拽编排的结构化 DAG 资产：

1. **GraphDSL 规范**：
   - **节点集 (`nodes`)**：包括 `start`（入口传参）、`end`（输出收敛）、`llm`（模型生成）、`code`（Python 沙箱脚本）、`http_request`（外部 API 调用）、`knowledge_retrieval`（RAG 检索）、`tool`（MCP/本地工具）、`human_input`（人机协同中断表单）、`iteration`（数组批量循环）。
   - **边与条件路由 (`edges`)**：定义节点之间的显式依赖；条件分支通过 `source_handle` 与表达式路由判定下发。
2. **编辑态 (Draft) 与发布态 (Release) 生命周期隔离**：
   - 搭建者在可视化画布上的拖拽与参数修改即时持久化为 `workflow_draft`（带乐观锁版本校验）；
   - 发布操作对当前 Draft 执行全量拓扑合法性校验（环路检测、孤立节点检查、强类型变量绑定推断），校验通过后生成不可变的 `workflow_release` 快照；
   - 运行态根据 `release_id` 实例化执行，**执行期间不受搭建端后续修改影响**。

---

### 2.3 运行时契约、AG-UI 适配与流式传输

工作流执行引擎的核心运行时契约建立在事件驱动的异步生成器之上：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              工作流事件流向 AG-UI 协议转译流水线                                       │
│                                                                                                        │
│  [ Workflow Engine ]                                                                                   │
│         │                                                                                              │
│         ├─► workflow_started ──────► [ AG-UI RUN_STARTED ] (注入 workflow_id, run_id)                  │
│         │                                                                                              │
│         ├─► node_started (node_id) ──► [ AG-UI STEP_STARTED ] (step_name = node_title)                 │
│         │                                                                                              │
│         ├─► custom_chunk (LLM/Code) ─► [ AG-UI TEXT_MESSAGE_CHUNK ] (实时流式打字机)                   │
│         │                                                                                              │
│         ├─► node_finished (outputs) ─► [ AG-UI STEP_FINISHED ] (记录耗时、状态、输出快照)             │
│         │                                                                                              │
│         ├─► human_input_suspend ────► [ AG-UI CUSTOM ask_user.pending ] (触发前端交互卡片)            │
│         │                                                                                              │
│         └─► workflow_finished ─────► [ AG-UI RUN_FINISHED ] (全量输出信封打包)                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **数据信封与变量传递**：
   - 每个节点在执行时从全局 State 提取其声明的上游变量依赖（通过 JSONPath 或 `{{node_id.output_var}}` 表达式解析）；
   - 节点执行结果写入私有命名空间 `node_outputs[node_id]`，并在节点结束时发布变量变更事件。
2. **AG-UI 协议转译桥接**：
   - 引擎将底层的拓扑执行细节转译为前端通用的标准 AG-UI 协议，上层应用无需理解特定的图引擎事件；
   - 工具节点执行转译为 `TOOL_CALL_STARTED` / `TOOL_CALL_FINISHED`；
   - 异常发生时自动补发 `STEP_FINISHED(status='failed')` 与 `RUN_ERROR` 保活事件，防止前端流式连接悬挂。

---

### 2.4 Human-Input Bridge：中断挂起与强类型恢复机制

人机协同（HITL）是工作流承载复杂审批、确认与动态补充信息的核心机制。基于 LangGraph `interrupt()` 语义与 Checkpointer 状态机构建：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                工作流 Human-Input 中断挂起与恢复时序                                   │
│                                                                                                        │
│  User / Client                Workflow Engine                 LangGraph Node             Checkpointer  │
│       │                              │                              │                          │       │
│   1.  │ ── POST /workflows/run ────► │                              │                          │       │
│       │                              │ ── 启动图执行 ─────────────► │                          │       │
│   2.  │                              │                              │ (执行至 HumanInputNode)  │       │
│       │                              │                              │ ── interrupt(payload) ─► │ (写入)│
│   3.  │ ◄── SSE: human_input_suspend │ ◄── GraphInterrupt ───────── │                          │       │
│       │     (包含 form_elements,     │     (记录 suspended 状态)    │                          │       │
│       │      user_actions,           │                              │                          │       │
│       │      thread_id)              │                              │                          │       │
│       │                              │                              │                          │       │
│   [ 挂起等待：浏览器断开/关闭不影响状态，Checkpoint 永久保留于存储层 ]                                 │
│       │                              │                              │                          │       │
│   4.  │ ── POST /runs/resume ──────► │                              │                          │       │
│       │    { action, inputs,         │ ── 提取 Checkpoint ─────────┼────────────────────────► │ (读取)│
│       │      thread_id }             │ ── Command(resume=payload) ─►│                          │       │
│   5.  │                              │                              │ (动态 Pydantic 校验表单) │       │
│       │                              │                              │ (沿 action 对应条件边推进)│       │
│   6.  │ ◄── SSE: workflow_finished ──│ ◄── 图执行完成 ───────────── │                          │       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **中断挂起语义 (`interrupt`)**：
   - 当工作流流转至 `HumanInputNode` 时，节点解析预填字段与表单 Schema，构建 `SuspendPayload`（包含 `node_id`、`form_elements`、允许的操作 `user_actions` 如 `['approve', 'reject']` 以及当前图的 `dsl_snapshot`）；
   - 调用 `langgraph.types.interrupt(suspend_payload)` 抛出 `GraphInterrupt` 异常，LangGraph 捕获并原子提交中断点快照至 Checkpointer，图执行优雅挂起。
2. **恢复机制与动态参数校验 (`Command(resume=...)`)**：
   - 前端用户填写表单并点击动作后，通过 API 提交恢复请求；
   - 引擎从 Checkpointer 恢复运行时状态，向挂起点注入 `Command(resume={"action": action, "inputs": inputs})`；
   - `HumanInputNode` 唤醒并恢复执行：首先比对 `action` 是否属于允许的合法操作集，接着通过动态生成的 Pydantic Model 对 `inputs` 表单输入进行类型强制转换与校验；校验通过后写入 `node_outputs`，由下游条件边根据 `action` 决定分支走向（如通过走审批后流程，拒绝走归档流程）。
3. **版本快照隔离**：
   - 挂起 Payload 中内联了 `dsl_snapshot`。即使在长达数天的审批等待期间该工作流被管理员发布了新版本，恢复执行时仍然严格依据挂起时的 DSL 快照进行拓扑路由，彻底杜绝因拓扑变更导致的节点找不到或变量未定义异常。

---

### 2.5 运行时可靠性与非功能边界 (NFR & Failure Boundaries)

针对工作流运行时的健壮性，工程审计指出了从原型迈向生产必须解决的四大边界风险：

1. **SQLite Checkpointer 的并发写锁风险 (`09b-engine-runtime-reliability-audit.md`)**：
   - 原型中单例 `AsyncSqliteSaver` 在多并发请求下存在数据库写锁竞争（`database is locked`）风险，且未开启 WAL 模式；
   - **生产演进方案**：生产环境必须迁移至基于 PostgreSQL 或 Redis 的分布式 Checkpointer，并采用连接池隔离与基于行级锁/分布式锁的并发控制。
2. **孤儿 Checkpoint 泄漏与生命周期治理**：
   - 正常结束的工作流在终态异步清理中间状态 Checkpoint，但处于挂起状态（`suspended`）或因客户端强制断连导致异常终止的工作流会残留 Checkpoint；
   - **治理机制**：引入后台定时 Lease 扫描与 TTL 淘汰策略，对超过保留期（如调研建议的 7 天 TTL）未恢复的挂起会话进行优雅归档并释放资源。
3. **无 Run 级超时与级联取消**：
   - 单节点超时不能替代整图的全局超时控制。必须在 Engine 入口构建基于 `asyncio.timeout` 的全局 Run 级超时守护，并在外部 Cancel 请求到达时通过取消事件向下游所有并发子节点广播中断信号。
4. **Code 节点沙箱安全隔离**：
   - Python 代码执行严禁在主进程直接 `eval` / `exec`，必须通过专用隔离网络调用 Dify Sandbox 容器执行，施加内存与 CPU 资源限制（设计建议配置）、禁用外部网络访问（`internal: true`）及执行超时（默认 5s），输出严格截断（最大 2MB）。

---

## 3. Agent Teams 架构体系深度剖析 (Design Blueprint & ADRs)

> **设计基线说明**：
> 本节全面依据已批准的总纲 Master PRD（`Agent_Teams_PRD_与技术方案.md` @ Ready for implementation）、切片 PRD（`docs/docs/sunxichen/work/agent-team/PRD.md` @ ready-for-agent）以及 6 项已接受的架构决策记录（`docs/docs/adr/0001-0006` @ Accepted）展开深度阐述（`DESIGN-TM-001` 至 `DESIGN-TM-011`）。
>
> 经对 `develop` 源码基线全量核验，运行时调度器与多 Agent 会话代码尚未进入主线（`FACT-TM-002`），本节确立为**设计完备的技术契约蓝图 (`design_complete`)**，区分作者参与主导的架构设计与后续团队的工程落地。

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                Agent Teams 运行时架构与三层流交互全景                                   │
│                                                                                                        │
│    [ 桌面 Web 用户端 ]                                                                                 │
│         │                                                                                              │
│         ├─ 1. 主流 (Standard AG-UI SSE) ─────────► [ Orchestrator Run ] (唯一面向用户主控)             │
│         │                                                  │                                           │
│         ├─ 2. 状态流 (Team Status SSE) ◄───┐               ├─► [ 直接完成工作并回复用户 ]              │
│         │    (TEAMMATE_UPSERT 成员卡片)    │               │                                           │
│         │                                  │ (Team Events) └─► [ 委派工具 ] (delegate / redirect)      │
│         └─ 3. 详情流 (Detail SSE & REST) ◄─┼───────────────┐              │                            │
│              (按需加载只读 Timeline 历史)   │               │              ▼                            │
│                                            │               │   ┌─────────────────────────────────────┐ │
│                                            │               │   │ aibot-service                       │ │
│                                            │               │   │ TeamAssignmentScheduler (持久调度器)│ │
│                                            │               │   │ • 3 槽位并发硬限制 (Active <= 3)    │ │
│                                            │               │   │ • 持久化 FIFO 队列 (queued 映射)    │ │
│                                            │               │   │ • Follow-up 有界队列 (上限 5)       │ │
│                                            │               │   └──────────────────┬──────────────────┘ │
│                                            │                                      │                    │
│                                            │              ┌───────────────────────┴─────────────────┐  │
│                                            │              ▼                                         ▼  │
│                                  ┌──────────────────────────────────┐      ┌─────────────────────────┐ │
│                                  │ Teammate 1 (持久线程 & 沙箱)      │      │ Teammate 2 (持久线程)   │ │
│                                  │ • Worker Mode (禁用 Ask User)    │      │ • Worker Mode           │ │
│                                  │ • 运行该 Agent 最新有效配置      │      │ • 运行该 Agent 最新配置 │ │
│                                  │ • 输出纯文本总结 + 结构化状态    │      │ • 输出纯文本总结        │ │
│                                  └──────────────────────────────────┘      └─────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.1 资产模型与配置生命周期 (`DESIGN-TM-001`, ADR 0001 & ADR 0003)

Agent Team 被定义为由 1 个 Orchestrator 与 1～10 个已有 Type 7 Claw Agent 组合而成的独立资产：

1. **组合资产与引用独立性**：
   - Team 自身不创建私有 Agent，不覆盖成员的人设、模型、MCP 工具、知识库、Skills 或执行环境配置；
   - Team 仅保存成员的稳定 `agent_id` 引用及其在当前 Team 中的必填**团队职责说明**，不固化成员的配置快照。
2. **动态解析最新有效配置 (ADR 0001)**：
   - 每次 Orchestrator Run 或 Teammate Run 在启动执行时，动态解析对应 Agent 最新保存且已生效的配置，并在运行记录中记录规范化 `config_hash`；
   - **运行中不可变，新运行自动刷新**：单个 Run 进行中配置不可变；后续发起的 Run 自动加载最新配置；
   - **Checkpoint 隔离与状态清理**：`aibot-service` 向 `langAgent` 发起执行时显式透传业务 `agent_id`，且在复用底层 Checkpointer 时必须主动清理旧 Run 残留的 `llm_config`、`chatbi_config`、`quote_enable` 等字段，防止跨 Run 历史配置污染。
3. **会话跟随最新 Team 定义 (ADR 0003)**：
   - 已创建的 `team_thread_id` 仅绑定稳定 `team_id`，不绑定不可变 Team 版本；
   - 每个新 Orchestrator Run 动态读取最新 Team 定义：若管理员在 Team 中新增了成员，后续 Run 即可发起委派；若删除了某成员，该成员不再接收新任务，但历史 Teammate 卡片、Timeline 记录与已产生的文件产物在会话中予以只读保留。

---

### 3.2 Orchestrator 协调器与交互契约 (`DESIGN-TM-002`)

Orchestrator 是 Team 中唯一面向用户的协调主控，确立了严格的人机交互边界：

1. **单一主控心智**：
   - 最终用户在 Team 会话中**始终只与 Orchestrator 对话**。页面开场白、输入框占位符、文件上传及知识库选择直接继承 Orchestrator 的配置；
   - Orchestrator 具备自主决策权，可以零委派直接独立完成简单问答，亦可将复杂任务分解委派给一个或多个 Teammate。
2. **委派交互规则与能力边界**：
   - Orchestrator 仅委派信息完整、可独立闭环执行的任务；
   - **Teammate 运行于 Worker Mode**：在能力层（Tool Registration）严格禁用 `ask_user` 等 HITL 交互工具；所有面向用户的交互（追问、确认、选择）必须由 Orchestrator 在主会话中发起；
   - **后台完成无主动唤醒 (No Proactive Wakeup)**：后台委派任务完成时，仅向后端写入 Team Event 并更新卡片状态与 Timeline，**严禁主动唤醒 Orchestrator 或向主会话消息历史追加系统回复**。当用户后续主动提问（如“刚才的任务做完了吗？”）时，新触发的 Orchestrator Run 通过调用 `list_team_tasks` 查询持久运行记录并汇总回复。

---

### 3.3 持久 Teammate 与 Worker Mode (`DESIGN-TM-003`, ADR 0002)

为避免多智能体协作中常见的“成员卡片随任务次数爆炸增长”问题，架构确立了持久实例模型：

1. **一成员一持久实例 (`team_thread_id + member_agent_id -> teammate_thread_id`)**：
   - 在同一个 Team 会话（`team_thread_id`）中，每个 Team Member 在首次被委派时懒加载创建唯一的持久 Teammate 线程及沙箱映射；
   - 后续针对该成员的所有 Assignment、Follow-up 与 Interrupt/Redirect 均复用该持久线程与 Workspace，保持角色级上下文与文件状态的连续性。
2. **Worker Mode 运行契约**：
   - 输入为 Orchestrator 组装的完整指令；
   - 终态向 Orchestrator 返回结构化状态（`status`, `run_id`, `config_hash`, `reason`）与纯文本总结（完成要点、产物链接与失败说明）。

---

### 3.4 三槽位准入控制与持久调度器 (`DESIGN-TM-004`, ADR 0004)

为防止大模型失控派发导致服务器计算与显存资源崩溃，架构建立了持久并发准入控制：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              三槽位持久准入控制与状态流转拓扑 (ADR 0004)                               │
│                                                                                                        │
│  [ Orchestrator 委派请求 ] (delegate_and_wait / delegate_in_background)                                │
│              │                                                                                         │
│              ▼                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ aibot-service TeamAssignmentScheduler (持久事务边界)                                             │  │
│  │                                                                                                  │  │
│  │   检查当前 Team Thread 的 Active Teammate Runs 计数：                                            │  │
│  │                                                                                                  │  │
│  │   ├─► [ Active < 3 且目标 Teammate 空闲 ] ──────────────────────────────────────────────┐          │  │
│  │   │   • 占用 1 个 Slot                                                                   │          │  │
│  │   │   • 状态置为 working                                                                 ▼          │  │
│  │   │   • 通过 Dispatch Outbox 幂等派发 Teammate Run ───────────────────────────► [ 启动底层执行 ]   │  │
│  │   │                                                                                      │          │  │
│  │   └─► [ Active == 3 或目标 Teammate 正在执行 ]                                           │          │  │
│  │       • 写入持久化 FIFO 队列 (持久状态: queued)                                          │          │  │
│  │       • 用户端卡片统一映射展示为 “工作中”                                                │          │  │
│  │                                                                                          │          │  │
│  │   ┌──────────────────────────────────────────────────────────────────────────────────────┘          │  │
│  │   ▼                                                                                                 │  │
│  │  [ Teammate Run 进入终态 ] (succeeded / failed / timed_out / cancelled)                             │  │
│  │   • 原子释放 1 个 Slot                                                                              │  │
│  │   • 检查持久 FIFO 队列，自动唤醒并调度下一条就绪 Assignment                                         │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **三槽位硬限制 (Hard Slot Constraint)**：
   - 单个 `team_thread_id` 内部最多允许 **3 个 active Teammate Run** 同时并行执行；
   - 准入控制由 `aibot-service` 的持久调度器 `TeamAssignmentScheduler` 在数据库事务与 Outbox 边界内管理，**明确否定依靠模型提示词自觉约束或单进程内存 `asyncio.Semaphore` 的方案**。
2. **状态映射与透明体验**：
   - 当槽位满（Active == 3）时，新委派进入持久化 FIFO 队列，内部状态记为 `queued`；
   - 在用户端界面上，内部 `queued` 与 `working` 统一平滑映射为“工作中”状态，避免向用户暴露技术排队细节；
   - 任意 Run 到达终态时，原子释放槽位并触发下一就绪任务的出队派发。

---

### 3.5 Follow-up 有界队列与 Redirect 路由 (`DESIGN-TM-005`, ADR 0002)

当 Orchestrator 需要对正在工作的 Teammate 补充要求或调整方向时，系统提供两类截然不同的路由机制：

1. **Follow-up 有界 FIFO 队列 (上限 5 条)**：
   - 每个 Teammate 同时最多运行 1 个 active Run；
   - 当 Teammate 处于 `working` 状态时，普通的追加指令（Follow-up）进入该成员专属的 FIFO 队列，**队列上限为 5 条**；超过 5 条时调度器拒绝入队并向 Orchestrator 报错；
   - 平台不自动合并或推断 Follow-up 的语义覆盖关系，严格按 FIFO 顺序在当前 Run 结束后依次执行。
2. **Interrupt and Redirect (中断并替换)**：
   - 当业务目标发生根本性调整时，Orchestrator 调用 `interrupt_and_redirect`；
   - 调度器向当前 active Run 发送中断信号，**清空该 Teammate 尚未执行的 Follow-up 队列**，并在同一 Teammate 持久线程与槽位上原子创建替换 Assignment，不额外占用 Team 的 3 槽位配额。

---

### 3.6 双层超时机制与终态定义 (`DESIGN-TM-006`)

为平衡前端同步交互体验与后台超长任务执行，架构设计了双层超时体系：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Agent Teams 双层超时与控制流                                         │
├────────────────────────────────┬────────────────────────────────┬──────────────────────────────────────┤
│ 超时层级                       │ 默认阈值与规则                 │ 超时行为与控制流走向                 │
├────────────────────────────────┼────────────────────────────────┼──────────────────────────────────────┤
│ 1. 同步软等待窗口              │ 默认 5 分钟；                  │ 到期仅结束 Orchestrator 的同步阻塞， │
│    (Soft Wait Window)          │ 最多允许显式追加等待 3 次      │ **不判定 Assignment 失败**。         │
│                                │                                │ Orchestrator 显式决策：转后台 /      │
│                                │                                │ 继续等待 / Redirect 收尾 / 取消。    │
├────────────────────────────────┼────────────────────────────────┼──────────────────────────────────────┤
│ 2. Assignment 硬运行上限       │ 默认 2 小时；                  │ 从进入 working 开始计时（不含排队）；│
│    (Hard Runtime Limit)        │ 后台执行硬上限                 │ 到期强制中断底层执行，标记 timed_out │
├────────────────────────────────┼────────────────────────────────┼──────────────────────────────────────┤
│ 3. 会话删除优雅宽限期          │ 默认 30 秒                     │ Team Thread 删除时给予任务清理资源、 │
│    (Deletion Grace Period)     │                                │ 释放沙箱的宽限时间，超时强杀。       │
└────────────────────────────────┴────────────────────────────────┴──────────────────────────────────────┘
```

- **终态四分法**：
  - `succeeded` ──► 用户端映射展示为 **“已完成”**；
  - `failed` 与 `timed_out` ──► 用户端映射展示为 **“执行异常”**；
  - `cancelled` ──► 用户端映射展示为 **“已停止”**。

---

### 3.7 三层流架构与只读 Timeline 读模型 (`DESIGN-TM-007`)

多智能体同时输出海量事件时，若将所有子流无脑合并至主 SSE，会导致前端 Reducer 崩溃与消息混乱。架构确立了三层流解耦读模型：

1. **三层流物理拓扑**：
   - **主流 (Mainstream)**：Orchestrator 沿用主 AG-UI SSE 长连接，承载用户与协调器的主干对话；
   - **状态流 (Status SSE)**：Team 会话页面常驻轻量状态 SSE，仅推送 `TEAMMATE_UPSERT` 成员卡片四态流转（闲置、工作中、已完成、执行异常）；
   - **详情流 (Detail SSE & Timeline REST)**：仅当用户在侧边栏主动点击某个 Teammate 卡片时，前端按需调用 REST 接口分页拉取 Timeline 历史（默认每次 30 条，基于 `before_sequence` 游标），并建立专属的详情 SSE 增量订阅（基于 `afterSequence` 游标）。
2. **前端读模型隔离**：
   - 前端状态在 Reducer 层严格划分为 `orchestratorMessages`、`teamSummaryByThread`、`timelineByMember`、`connectionByStreamKey`、`activeTeamView` 5 个独立 Slice，严禁状态穿透；
   - **只读执行流体验**：沿用聊天气泡与 Agent Renderer 视觉规范，但用户端**无任何输入框，禁止直接向 Teammate 发送消息、停止、重试、追问或点赞**。

---

### 3.8 断连韧性、权限模型与数据生命周期 (`DESIGN-TM-008` 至 `DESIGN-TM-011`)

1. **断连韧性 (`DESIGN-TM-008`)**：
   - 后台 Teammate Run 由后台执行器独立推进，用户关闭浏览器、刷新页面或网络闪断不中断后台任务；
   - 服务重启后，调度器基于持久化 Dispatch Outbox 幂等键、Heartbeat 与 Lease 租约机制执行对账恢复，自动回收僵尸槽位，杜绝任务重复派发。
2. **权限与无提权原则 (`DESIGN-TM-009`, ADR 0005)**：
   - 复用现有 Agent 权限体系（`SUPER_ADMIN` / `ADMIN` / `NORMAL`），不新增 Team 专用权限类型；
   - **无提权原则**：用户具备 Team 使用权限即可使用 Team，无需单独持有成员 Agent 的直接权限；但 Team 访问不提升底层数据权限，用户身份与组织上下文必须全程向下透传至 MCP 与 RAG。
3. **审计与级联删除 Fence (`DESIGN-TM-010`, ADR 0006)**：
   - 运行记录（`TeamThread`, `Assignment`, `TeammateRun`, `TeamEvent`）作为 MVP 唯一审计源；
   - 删除 Team 会话时，原子建立 Fence 拒绝新任务，清空队列并给予 30s 优雅取消宽限期，随后级联清理 Checkpoint 与 Workspace 沙箱。
4. **Slice 1 资产切片范围界定 (`DESIGN-TM-011`)**：
   - Slice 1 处于 `ready-for-agent` 状态，严格界定为交付管理端 Agent Teams 模块 CRUD、候选 Type 7 Agent 查询与校验、权限配置、发布中心 `AGENT_TEAM` 资产适配与删除拦截保护；**明确排除了运行时调度器与会话执行代码**。

---

## 4. 框架中间件源码核验与平台演进差异 (Deep Delta Analysis)

对锁定依赖版本 `deepagents 0.6.12` 的异步子代理中间件源码（`deepagents/middleware/async_subagents.py`）进行了逐行核验，梳理出框架原生能力与平台 Agent Teams 架构设计之间的实质性演进差异：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      deepagents 0.6.12 async_subagents.py 源码机制与 Agent Teams 架构差异               │
├──────────────────────────┬──────────────────────────────────────────┬──────────────────────────────────┤
│ 比较维度                 │ deepagents 0.6.12 框架原生行为           │ Agent Teams 架构设计契约 (ADR)   │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **线程生命周期**         │ `astart_async_task` 每次调用均显式执行   │ **一成员一持久线程** (ADR 0002)：│
│                          │ `await client.threads.create()` 创建新   │ 同一会话中成员首次委派懒创建，   │
│                          │ 线程，并将 `task_id` 绑定为远程线程 ID。 │ 后续所有任务复用原线程与沙箱。   │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **并发准入控制**         │ 框架未定义任何会话级并发限制；所有任务   │ **3 槽位持久准入调度** (ADR 0004)：│
│                          │ 到达立即创建远程 Run。                   │ 持久调度器管理 3 槽位硬限制与    │
│                          │                                          │ FIFO 队列，排队映射为“工作中”。  │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **工具契约语义**         │ 暴露面向底层任务的技术工具：             │ 封装面向角色的高层委派语义：     │
│                          │ `start_async_task`, `check_async_task`,  │ `delegate_and_wait`,             │
│                          │ `update_async_task`, `cancel_async_task`,│ `delegate_in_background`,        │
│                          │ `list_async_tasks` (直接操作 task_id)。  │ `send_follow_up`,                │
│                          │                                          │ `interrupt_and_redirect`。       │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────┤
│ **事件流与读模型**       │ 仅提供轮询/更新等控制面操作，未定义独立  │ **自研 Team Event 桥接**：       │
│                          │ Worker 实时事件推送与多流解耦。          │ 驱动三层流解耦（主流、状态流、   │
│                          │                                          │ 详情流）与前端隔离读模型。       │
└──────────────────────────┴──────────────────────────────────────────┴──────────────────────────────────┘
```

---

## 5. 平台下一阶段演进实施蓝图

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   langAgent 编排演进实施路线图                                          │
│                                                                                                        │
│  [ Stage 1: 资产管理闭环 ] (Slice 1 PRD)                                                                │
│  • 管理端 Agent Teams 模块 CRUD                                                                        │
│  • 候选 Type 7 Claw Agent 校验与团队职责配置                                                           │
│  • 发布中心 AGENT_TEAM 资产适配与引用删除拦截保护                                                      │
│                                                                                                        │
│  [ Stage 2: 多智能体调度与运行时 ] (Master PRD & ADR 0001-0006)                                         │
│  • aibot-service TeamAssignmentScheduler 3 槽位持久调度器与 Outbox 派发                                │
│  • 持久 Teammate 实例管理与 Worker Mode 能力层 HITL 禁用                                               │
│  • 双层超时控制 (5m 软等待 + 2h 硬上限) 与 Interrupt/Redirect 队列清空原子替换                         │
│  • 三层流解耦 (主流 AG-UI + 状态 SSE + 详情 SSE/Timeline REST 30 条游标分页)                            │
│                                                                                                        │
│  [ Stage 3: 工作流引擎内核与双向互调 ] (Workflow Research Blueprint)                                   │
│  • 基于 LangGraph 的独立 Workflow Engine 生产化 (PostgreSQL Checkpointer + 全局 Run 超时)              │
│  • Human-Input Bridge (强类型 SuspendPayload 与 Command(resume) 校验路由)                              │
│  • Workflow-as-Tool 适配器与 Agent-in-Workflow 嵌入式推理节点                                          │
│  • Dify Sandbox 独立沙箱容器集成 (Python Code 节点隔离执行)                                            │
│                                                                                                        │
│  [ Stage 4: 异构协同与企业级治理 ]                                                                      │
│  • Orchestrator 统一编排 Agent Teams 与 Workflow 混合拓扑                                              │
│  • 分布式 Lease 续租、心跳检测与跨 Pod 僵尸槽位自动对账回收                                            │
│  • 统一运行记录审计与级联删除 Fence 幂等清理                                                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

通过这一演进路径，`langAgent` 平台构建起了从单智能体自主探索、到确定性业务流图编排、再到高内聚低耦合多角色团队协作的完整企业级 Agent 架构矩阵。
