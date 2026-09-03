# 02 项目二：企业级 Agent 平台与运行时 — 面试问答笔记

> **定位**：面试时间占比 25–30%（面向 Agent 平台岗时升为重头，占 40–45%）。  
> **角色定位**：本人主导设计 · 团队共同落地；`detail-notes` 中的架构与机制设计均出自本人。  
> **成熟度基线**：已合入主干（`develop`） / 参考分支（ChatBI ReAct） / 探索原型（A2UI） / 设计完成待实施（Agent Teams `design_complete`）。  
> **事实与词汇红线**：严禁出现黑话禁词（decisions.md 规定的五大直译词汇）；结果行零虚构量化数字；动词字面为真（未实施项限用“设计/确立/重设计/探索”）。

---

## A. 60 秒自述

“面试官您好，项目二是我在数字郑州主导架构设计的**企业级 Agent 平台与算法运行时体系**。

当时公司面临的痛点是业务 Agent 从单点 Demo 走向生产时，缺乏标准化的运行时约束、环境治理与人机交互协议。针对这些问题，我主导设计了一套自研可控的 **Agent Harness**：

在**运行时层**，我们用统一的 `AgentConfig` 驱动两条执行路径：短任务走轻量动态状态图，毫秒级响应；长任务基于 deepagents 与容器沙箱，支撑分钟级长程代码与数据挖掘。在**协议层**，统一了 AG-UI 事件流，彻底解耦前后端渲染，并设计了基于 LangGraph 中断机制与抗重放防串扰的 Ask User 人机协同协议。针对**长任务能力**，我们建立了沙箱生命周期管控与对象存储冷热回灌机制，解决了沙箱销毁历史产物丢失的痛点，并配合上下文自动压缩与分层长期记忆。此外，在**业务架构演进**中，我将 ChatBI NL2SQL 从固定 DAG 重设计为具备列值探测的三段式 ReAct 循环，并在多智能体演进中确立了单一主控心智的 Orchestrator-Worker 协调模式与分派工具化方案。

在成熟度上，核心双执行路径、协议层与长任务治理均已合入主干并稳定运行；ChatBI ReAct 在独立参考分支完成验证；Agent Teams 则完成了完整的 PRD 与 6 项架构决策记录，作为平台的演进蓝图。”

---

## B. 简历逐句对照表

| 简历原句（v3.1 原文） | 背后事实与技术细节 | 可说 / 不可说界限 | 成熟度标注 |
|---|---|---|---|
| **角色行**：公司 Agent 平台算法运行时：主导设计双执行路径编排、协议解耦、长任务沙箱与记忆体系等核心架构。 | 确立 Agent Harness 四层架构（业务层、插件/工具层、协议层、双执行路径运行时）。编写了架构蓝图、全套 `detail-notes`、动态图工厂、AG-UI 10 级中间件与 Ask User 状态机核心代码；Java 后端协同负责外部 API、数据库与对象存储交互。 | **可说**：架构设计全面 ownership，关键机制原型由本人编写。<br>**不可说**：不可暗示整个平台全部由个人单批写完，强调与工程团队的边界协同。 | **已合入主干** (`develop`) |
| **动作行 1**：双执行路径与协议层：设计配置驱动的短任务动态图/长任务沙箱（同一套 AgentConfig）；统一 AG-UI 事件流与展示解耦，支持 Ask User 人机协同（HITL）挂起恢复，并探索 A2UI 界面协议。 | 1. `DynamicAgentFactory` 根据 `AgentConfig` 动态编译内存图，短任务走动态状态图，长任务走 deepagents + Daytona 沙箱；<br>2. 图编译采用 LRU 128 缓存，提示词依托 Nacos 监听实现热更新；<br>3. 建立 10 级 AG-UI 事件中间件与异常补发保活；<br>4. Ask User 基于 `interrupt()` + `Command(resume)`，结合 `stable_request_id` 防串扰；<br>5. A2UI 完成瑞幸点单 PoC 原型。 | **可说**：双执行路径的设计权衡、Ask User 状态机与安全校验、A2UI 协议价值。<br>**不可说**：A2UI 仅为本地原型，绝不可说“已上线”；PromptProxy 热更新不在简历纸面展开。 | 动态图/沙箱/AG-UI/HITL：**已合入主干**<br>A2UI：**探索原型** |
| **动作行 2**：长任务与插件体系：构建沙箱生命周期管控，产物持久化至外部存储并可重建恢复，结合上下文自动压缩与分层长期记忆；建立 Subgraph 插件与 MCP 工具体系，Agentic RAG 等以插件形式接入。 | 1. Workspace 状态机管控租约，显式超时，心跳保活；<br>2. 产物生成即外化至对象存储，沙箱冷启动自动回灌（Restore），Single-Flight 去重；<br>3. 70% 占用触发压缩，保留 25%，淘汰消息转存本地 context 文件；<br>4. 长期记忆从 4 层收敛为 2 层（`USER_GLOBAL` / `USER_AGENT`）；<br>5. 自研 `SubgraphToolMiddleware` 解决子图参数丢失，支持 MCP 动态模型生成与脱敏。 | **可说**：从沙箱直读到对象存储回灌的演进逻辑；长期记忆收敛原因；子图挂载中间件方案。<br>**不可说**：MCP 工具目前缺少主动超时拦截（技术债，可诚实复盘）；不展开 internal API 细节。 | **已合入主干** (`develop`) |
| **动作行 3**：ChatBI 与 Agent Teams：将 NL2SQL 从固定 DAG 重设计为 ReAct Agent Loop，全量 M-Schema 内联消除选表级联错误；确立 Orchestrator-Worker 协调模式并将分派工具化，以 CompiledGraph 显式编排替代 deepagents 原生 tasks。 | 1. ChatBI 剖析固定 6 节点 DAG 缺乏列值探测与容错的瓶颈，重设计为 4 闭包工具的三段式 ReAct 循环；<br>2. 单技能 3~4 张表，M-Schema 全量内联省去选表 RTT 并消除级联错误；<br>3. 否定自由 handoff，确立 Orchestrator-Worker 模式，Worker 禁用 Ask User；<br>4. 规划 3 槽位持久准入与 7 大分派工具。 | **可说**：动词严格用“重设计/确立/设计”；深入阐述 ReAct 对比固定 DAG 的机制优势，以及团队编排的设计契约。<br>**不可说**：ChatBI ReAct 版未合入主线，绝不说“已替换上线”；Agent Teams 处于 `design_complete` 待实施阶段。 | ChatBI ReAct：**参考分支**<br>Agent Teams：**设计完成待实施** |
| **结果行**：形成公司自研可控的 Agent Harness：配置驱动、子图可插拔，支撑 ChatBI、长任务、多模态问答等业务 Agent 上线；新业务以配置与插件接入，运行时主干无需改动。 | 抽象出通用 Harness 架构底座，业务接入无需 Fork 平台主干，仅需编写声明式配置或实现子图插件契约；已承接 ChatBI DAG、长任务沙箱、多模态问答等核心业务上线。 | **可说**：定性阐述自研 Harness 的可控性、扩展性与配置驱动能力。<br>**不可说**：零量化编造，不编造业务 QPS 或调用量百分比等未经审计数据。 | **已合入主干** (`develop`) |

---

## C. Q&A 清单（P2-01 ~ P2-30）

### 锚点 A：角色行 + 结果行

### P2-01 60 秒讲平台全景：什么是 Agent Harness？ ｜ L1 基础
- **30 秒版**：
  大模型本身是概率性的文本生成器，而企业级业务要求确定性的结果与安全性。**Agent Harness 就是大模型之外的运行时约束与能力装配底座**。我们平台的架构分为四层：最底层是**双执行路径运行时**（短任务动态图 + 长任务沙箱）；之上是**协议解耦层**（AG-UI 标准事件流与 Ask User 中断契约）；再往上是**插件体系**（MCP 工具、Subgraph 插件与技能系统）；最上层是**业务 Agent 实例**（ChatBI、多模态问答、长任务代理）。Harness 保证了业务智能体在统一的上下文管理、权限管控和状态持久化规范下运行。
- **深挖版**：
  在架构实现上，Agent Harness 承担了三项核心职责：
  1. **环境与状态封装**：抹平计算环境差异。短任务封装为 LangGraph `CompiledStateGraph`，状态持久化至 Checkpointer；长任务封装为 Daytona 容器沙箱，提供独立虚拟文件系统与代码执行器 `[LA/recap-blog.md §0.1]`。
  2. **协议与流式契约**：前端不直接感知 LangGraph 底层消息模型，Harness 通过 10 级中间件流水线将图执行转换为标准 AG-UI SSE 事件流，隔离框架实现细节 `[LA/fact-base.md FACT-AGUI-001]`。
  3. **安全与治理围栏**：包括 MCP 参数动态校验与日志脱敏、长期记忆租户隔离、上下文自动压缩以及沙箱产物外化存储。
- **走查示例**（场景走查）：
  以市民在政务平台查询“公积金近 3 年提取额变化趋势”为例走查 Harness 四层流转：
  1. 接入层：用户在 Web 端发起提问，平台加载对应业务的 `AgentConfig`；
  2. 运行时层：`DynamicAgentFactory` 判定这是单次统计报表，启动轻量动态状态图，而非重型沙箱；
  3. 协议层：10 级中间件管道启动，向客户端发送 `RUN_STARTED`，首个 token 到达时触发打字机事件；
  4. 插件层：模型决策调用 MCP 数据库工具或 ChatBI 子图，中间件校验参数并隔离私有状态；
  5. 状态收敛：计算结果经由 DataEnvelope 封装，写入 Checkpointer 持久化，派发 `RUN_FINISHED` 优雅结束。
  *记住这个例子 = 记住 Agent Harness 四层架构如何把一个无状态的 LLM 包装成可控的企业级服务。*
- **追问**：
  *面试官追问*：“为什么叫 Harness 而不是 Framework？”
  *应对*：Framework 通常指提供 API 让开发者编写业务逻辑的代码库（如 LangChain/LangGraph）；而 Harness（挽具/测试装具）强调的是**包裹在模型外部、负责拉紧缰绳的运行时控制系统**。模型决定走哪一步，但 Harness 决定它能走多远、能调哪些工具、何时必须暂停向人类请示，以及出错时如何自愈。
- **素材**：`LA/recap-blog.md §0.1–0.2`；`LA/fact-base.md FACT-RT-001`。

---

### P2-02 主导设计与团队落地的边界是什么？ ｜ L1 基础
- **30 秒版**：
  我担任平台**算法运行时的架构主导者**。所有专题的技术演进方案、接口契约（即全套 `detail-notes` 涉及的设计）均由我独立推导与确立。在代码层面，我独立编写了核心动态图工厂、AG-UI 协议中间件、Ask User 状态机校验、ChatBI ReAct 原型分支以及长任务中间件；而工程团队同学主要负责后端 Java/Internal API 对接、数据库与对象存储接入、Daytona 沙箱集群部署以及业务前端组件适配。
- **深挖版**：
  在成熟度上，我主动对各模块进行清晰定界，做到字面为真：
  1. **已合入主干（`develop`）**：双执行路径工厂、AG-UI 10 级中间件、Ask User 挂起恢复、沙箱生命周期与产物外化、上下文压缩、分层长期记忆、MCP 与 Subgraph 挂载。这是线上运行的核心底座。
  2. **独立参考分支**：ChatBI ReAct Agent Loop。在独立分支完成了三段式循环与 4 个闭包工具的原型编写，主干仍运行固定 DAG。
  3. **探索原型**：A2UI 生成式界面协议。在本地工作树完成了瑞幸点单场景的端到端 PoC 验证。
  4. **设计完成待实施（`design_complete`）**：Agent Teams。完成了 Master PRD 与 6 项核心架构决策记录（ADR 0001~0006）的架构评审，定义了完整的协议与调度模型，运行时代码尚未实施。
- **走查示例**（场景走查）：
  以长任务容器沙箱模块的跨团队协作与排障为例：
  1. 架构与设计归属（本人）：推导并输出 Workspace 6 状态机契约、Run 级独占租约机制、显式超时阈值（创建 240s / 启停 60s / 命令 1800s）以及全套 detail-notes 文档；
  2. 算法端核心编码（本人）：独立编写沙箱调度工厂、状态机驱动、心跳保活协程与 ToolErrorGuard 错误自愈守卫；
  3. 工程协同（工程团队）：Java 后端开发 Internal API 与 MySQL 状态持久化，运维团队搭建 Daytona 容器集群，前端适配状态卡片；
  4. 现场故障定责：上线初期沙箱创建偶发 240s 超时报警，双方依据 Internal API 契约日志，迅速界定为底层物理机镜像拉取延迟，由运维扩充镜像缓存解决。
  *记住这个例子 = 记住本人负责拓扑、状态机与算法运行时核心代码，团队负责微服务、数据库与沙箱基础设施。*
- **追问**：
  *面试官追问*：“团队有多少人？日常怎么分工协作？”
  *应对*：算法与工程配合紧密。我负责算法侧运行时的拓扑定义、状态流转、大模型 Prompt 契约与核心协议中间件；工程团队负责企业级微服务体系的对接（如 Nacos 配置中心、S3/MinIO 对象存储、认证网关和业务数据库）。我们通过严格的 Internal API 契约和数据信封（DataEnvelope）实现算法端与后端工程的解耦。
- **素材**：`DEC` P6；`LA/recap-blog.md §0.2`；`LA/fact-base.md` 全局声明。

---

### P2-03 为什么选 LangGraph/deepagents 而不是自研或其他框架？ ｜ L2 机制
- **30 秒版**：
  选型核心权衡是**研发周期与底层原语成熟度**。我们对比了自研状态机、AutoGPT 以及 LangGraph/deepagents。最终选择 LangGraph，是因为其基于 Pregel 模型的显式状态图、细粒度 Checkpointer 快照持久化以及原生的 `interrupt()` 中断原语非常契合企业复杂流转；搭配 deepagents 则可以直接复用其沙箱文件系统、上下文压缩与复合代理结构。代价是我们必须接受框架版本锁定的技术债务，并针对中文支持与原生 tasks 机制的缺陷进行针对性二次定制。
- **深挖版**：
  1. **原语收益**：
     - **状态图与 Checkpointer**：LangGraph 允许将复杂业务拆解为显式节点与条件边，状态合并 reducer 机制使得多工具流转状态清晰；Checkpointer 原生支持执行点快照，是实现崩溃恢复与 HITL 暂停的基础 `[LA/fact-base.md FACT-RT-010]`。
     - **deepagents 能力复用**：提供了现成的工具执行封装、长任务文件系统中间件与上下文监控抽象 `[LA/fact-base.md FACT-LT-001]`。
  2. **引入的代价与自研补丁**：
     - **版本锁定**：主线严格锁定了 `deepagents 0.6.12` 与 `langgraph 1.2.8`，避免上游 breaking changes 破坏系统。
     - **中文适配补丁**：deepagents 原生内置大量英文提示词与系统工具描述，我们在内存中动态应用 `chinese_deep_agent.py` 覆盖 Prompt，不侵入修改第三方源码 `[LA/fact-base.md FACT-LT-001]`。
     - **原生 tasks 机制不可用**：deepagents 原生的 `async_subagents` 每次调用创建临时线程、无并发槽位控制、无状态隔离。因此我们在演进设计中彻底推翻其原生 tasks，重构为持久 Teammate 线程调度器 `[LA/fact-base.md DELTA-TM-001]`。
- **走查示例**（正反对比）：
  以实现“不可逆操作需人工点击确认才能继续”的审批场景为例：
  - **反例（自研状态机）**：必须徒手编写 300+ 行底层代码：自建节点调度队列、在执行中断点手动序列化所有内存变量存入 MySQL、管理分布式协程唤醒锁，且极其容易在恢复时发生局部变量丢失或并发死锁；
  - **正例（LangGraph + deepagents 选型）**：直接复用框架成熟原语：节点内调用 `interrupt(payload)` 抛出原生异常，LangGraph Runner 自动将未决操作冻结存入 Checkpointer；唤醒时一行 `Command(resume=...)` 即可无损重放。
  - **定制补丁代价**：面对 deepagents 原生英文提示词，在内存中动态应用 `chinese_deep_agent.py` 覆盖英文 Prompt，不侵入修改底层 site-packages。
  *记住这个例子 = 记住自研轮子的高昂状态持久化代价，以及成熟框架原语配合自研补丁的工程平衡。*
- **追问**：
  *面试官追问*：“如果完全自研一套状态机，难点在哪里？”
  *应对*：自研状态图本身不难（十几行 Python 代码即可跑通简单的拓扑分发），难点在于**工业级可靠性特性**：第一是分支并行执行时的增量状态合并与消息冲突消解；第二是执行拓扑任意节点的安全挂起、序列化落库以及唤醒重放机制；第三是流式事件的层级冒泡与元数据追踪。借助 LangGraph 这一层成熟底座，我们能将精力聚焦在业务协议与企业治理上。
- **素材**：`LA/detail-notes/01-framework-catalog`（`issues/29`）；`LA/fact-base.md FACT-LT-001`。

---

### 锚点 B：动作行 1 双执行路径与协议层

### P2-04 为什么要两条执行路径？同一份 AgentConfig 怎么编出两种图？ ｜ L2 机制
- **30 秒版**：
  不同企业业务对环境与时延的要求截然不同：短任务（如普通问答、图表生成、知识检索）对首字延迟（TTFT）极度敏感，要求毫秒级响应，无需容器隔离；长任务（如数据分析、代码运行、大规模文档清洗）需要独立的 Linux 环境与持久化磁盘，执行耗时往往数分钟。我们采用**单一 `AgentConfig` 规范驱动两条路径**：`DynamicAgentFactory` 根据配置中的能力开关，短任务动态编排为内存状态图，长任务则编排为挂载 Daytona 容器沙箱的 deepagents 实例，上层共享统一的工具集、知识库与协议层。
- **深挖版**：
  1. **短任务动态图路径**：
     - 核心工厂类为 `DynamicAgentFactory.build(config)`。
     - 解析 `AgentConfig`，根据启用的功能动态挂载节点（`agent` 核心节点、`tool_executor`、以及 `chatbi_subgraph`、`visualization_subgraph`、`report_subgraph` 等业务子图）。通过 `route()` 条件边判断 LLM 意图，执行轻量流转 `[LA/fact-base.md FACT-RT-001]`。
  2. **长任务沙箱路径**：
     - 核心工厂调用 `create_deep_agent()`。
     - 注入 Daytona 容器沙箱后端（`DaytonaSandboxBackend`），挂载独立工作区目录 `/workspace`；装配 `ObservedSummarizationMiddleware` 与文件系统工具链 `[LA/fact-base.md FACT-LT-001]`。
  3. **配置同源共享**：
     - 两者共享统一的 Pydantic 模型 `AgentConfig`（包含模型配置、System Prompt、MCP 工具清单、RAG 配置、挂载子图列表）。在配置加载阶段完成统一校验，业务开发者仅需维护一份 JSON/YAML 资产，即可无缝切换执行模式。
- **走查示例**（场景走查 / 正反对比）：
  同一份 `AgentConfig`（声明模型为 Qwen，挂载 SQL 查询与 Python 代码执行能力）驱动两种负载：
  - **场景 A（短任务动态图）**：业务人员问“郑州市公积金贷款封顶额度是多少？”——工厂路由至轻量动态状态图，在内存中检索 RAG 并回复，耗时 800ms，首字延迟极低，消耗计算资源几乎为零；
  - **场景 B（长任务沙箱）**：分析师输入“拉取本季度 10 万行公积金流水，运行 Python 脚本进行密度聚类并输出散点图”——工厂识别为长程计算，通过 Daytona 动态分配独立的 Linux 容器沙箱，挂载 `/workspace` 磁盘空间，后台执行 3 分钟完成分析并生成产物。
  *记住这个例子 = 记住同一套配置规范如何按业务计算特征在低延迟内存图与隔离容器沙箱间动态分流。*
- **追问**：
  *面试官追问*：“短任务和长任务在状态持久化上有什么区别？”
  *应对*：短任务只依赖 LangGraph Checkpointer 记录多轮对话的 Messages 序列与状态变量；长任务除了 Checkpointer 之外，还引入了 Daytona 沙箱的文件系统状态管理与对象存储产物外化，具备两套独立但协同的存储持久化机制。
- **素材**：`LA/recap-blog.md §1.1–1.2`；`LA/fact-base.md FACT-RT-001`。

---

### P2-05 配置驱动图编译的缓存怎么做？提示词变了要重编吗？ ｜ L2 机制
- **30 秒版**：
  为了避免每个用户请求都重复执行昂贵的 LangGraph 图编译过程，我们在 `AgentRegistry` 中建立了基于 `AgentConfig` MD5 哈希的 **LRU 128 进程级编译缓存**。相同配置的会话直接复用已编译的图实例。对于**提示词变更**，我们设计了轻量级热更新机制：提示词由 `PromptProxy` 代理，通过 Nacos 配置中心监听变更并更新内存字典，**提示词变化完全不需要重新编译图**，做到了零开销秒级生效。
- **深挖版**：
  1. **编译图缓存设计**：
     - `AgentRegistry` 内部维护 `OrderedDict` 结构，最大容量设为 128。
     - 将请求级 `AgentConfig` 规范化序列化后计算 MD5 哈希作为 cache key。如果命中且图实例健康，直接返回；未命中则调用工厂编译并存入缓存，超出容量自动淘汰最久未使用的旧图 `[LA/fact-base.md FACT-RT-002]`。
  2. **提示词热更新解耦（口头弹药）**：
     - 如果每次管理员在运营后台微调 System Prompt 都要清空缓存重编图，在高并发下会导致 CPU 尖峰与请求抖动。
     - 方案：在图构建时，注入的并非固定字符串，而是 `PromptProxy` 延迟求值代理对象。`NacosConfigProvider` 注册监听器，当监听到配置推送时，调用 `set_prompts_config()` 原子替换进程内存中的提示词缓存；当 LLM 节点执行 `prompt.format()` 时动态读取当前最新提示词，图结构本身保持恒定 `[LA/fact-base.md FACT-RT-011]`。
- **走查示例**（场景走查 + 数字演算）：
  以运营人员在线调整 System Prompt 规则为例：
  1. 运营在 Nacos 后台将公积金助手提示词增加一条：“输出金额统一格式化为千分位并保留两位小数”；
  2. `NacosConfigProvider` 监听到变更推送，调用 `set_prompts_config()` 在 5ms 内原子替换模块内存字典；
  3. 正在运行的 `AgentRegistry` 内部 LRU 128 编译缓存无需失效，`CompiledStateGraph` 实例保持不动；
  4. 下一个用户请求到达时，LLM 节点执行 `PromptProxy.__str__()` 延迟读取最新字典，立刻按新规则输出金额；
  5. 相比传统“清空缓存重编整图”耗费 150ms CPU 尖峰，延迟求值方案的图重编开销严格为 **0ms**。
  *记住这个例子 = 记住 PromptProxy 延迟求值如何在 Nacos 配置变更时做到零重编开销、秒级热生效。*
- **追问**：
  *面试官追问*：“多 Pod 分布式部署下，LRU 缓存怎么保持一致？”
  *应对*：当前的 LRU 缓存是各 Pod 本地自治的。因为图实例本身是纯逻辑无状态的计算图（所有执行状态全部外化存储于 Checkpointer 中），各 Pod 本地各自缓存 CompiledStateGraph 没有任何状态一致性风险；当配置更新时，Nacos 会广播到所有 Pod 同时刷新提示词缓存。
- **素材**：`LA/fact-base.md FACT-RT-002, FACT-RT-011`；`LA/recap-blog.md §1.3`。

---

### P2-06 LangGraph 状态合并踩过什么坑？ ｜ L3 深挖
- **30 秒版**：
  最严重的踩坑是 **`messages` 字段的 Reducer 冲突与工具配对断裂**。早期版本自定义状态使用了覆盖型 `lambda`，在子图回流或并发工具调用时，新返回的消息直接覆盖了历史序列，导致发送给 OpenAI API 的消息中 `ToolMessage` 找不到对应的 `tool_calls`，直接引发 400 报错。我们彻底改用 LangGraph 原生的 `add_messages` Reducer，按 Message ID 实现智能增量追加与更新。另外还发现了混合多工具调用时主图路由仅检查第一个工具调用的静默丢弃缺陷，设计了基于 `Send` 原语的扇出方案。
- **深挖版**：
  1. **Reducer 覆盖型陷阱与 400 报错**：
     - 在复杂 Agent 拓扑中，主图与子图之间通过状态传递数据。若定义为 `messages: Annotated[list, lambda x, y: y]`，子图仅返回一条最终总结消息，会导致外层会话的历史上下文被直接刷掉。
     - 尤其在工具调用场景下，大模型生成的 `AIMessage(tool_calls=[...])` 与后续工具执行生成的 `ToolMessage(tool_call_id=...)` 必须严格成对出现。早期覆盖逻辑导致部分 `ToolMessage` 丢失，底层调用大模型接口时校验失败，报错：*“Invalid parameter: messages with role 'tool' must be a response to a preceeding message with 'tool_calls'”*。
     - **修复方案**：全面将 `MainAgentState` 的 messages 字段声明为 `Annotated[Sequence[BaseMessage], add_messages]`，利用 LangGraph 内置的 ID 判重与追加逻辑 `[LA/fact-base.md FACT-RT-003; LA/fragments/f01-reducer-problem.md]`。
  2. **混合工具调用路由失效缺陷**：
     - 当模型在一轮决策中同时发出多个 tool_calls 时（例如同时调用一个普通 MCP 工具和一个业务子图入口），主图的条件路由函数 `route(state)` 仅读取了 `state.messages[-1].tool_calls[0]` 进行分支判断。
     - 这一行为导致只有排在第一个的工具被正确路由，后续工具调用被静默丢弃。我们在测试用例中明确记录了该已知缺陷，并给出了架构解法：利用 LangGraph 1.2+ 的 `Send(node_name, arg)` API 实现并行任务扇出 `[LA/fact-base.md FACT-RT-004; LA/fragments/f03-multi-tool-concurrency.md]`。
- **走查示例**（正反对比）：
  以模型单轮触发子图分析并返回结果的消息合并为例：
  - **反例（踩坑：覆盖型 lambda）**：模型生成 `AIMessage(tool_calls=[{"id": "call_99", "name": "chatbi"}])`；子图执行完 SQL 后仅返回一条统计结果 `ToolMessage(content="总额 100 万", tool_call_id="call_99")`；由于状态定义为 `lambda x, y: y`，子图输出把全局 `messages` 粗暴覆盖为仅剩这 1 条，外层历史全部丢失，发送给模型下一轮时报 400 错误：`messages with role 'tool' must be a response to preceeding tool_calls`；
  - **正例（修复：add_messages）**：改用 LangGraph 原生 `add_messages` Reducer；根据每条消息的唯一 ID 进行追加合并，`AIMessage` 与 `ToolMessage` 严格成对保存在序列中，400 报错彻底根治。
  *记住这个例子 = 记住 add_messages 如何基于 ID 智能增量合并，避免消息覆盖导致的 tool_call 配对断裂 400 报错。*
- **追问**：
  *面试官追问*：“并发工具调用时，多个工具如果写同一个状态字段怎么办？”
  *应对*：这正是为什么 LangGraph 强制要求所有共享状态字段必须声明 Reducer 函数。对于列表类型字段使用 `operator.add` 或 `add_messages` 进行累加；对于字典或标量字段，必须定义自定义合并逻辑（例如按时间戳更新或只允许特定节点回写），否则 LangGraph 运行时会在并发写发生时直接抛出 `InvalidUpdateError` 异常。
- **白板（关联 C11）**：
  手写具备配对保证与循环退出的 ReAct Loop 核心状态逻辑：
  ```python
  # C11: 核心 ReAct 迭代与消息配对保证
  messages = [SystemMessage(...), HumanMessage(...)]
  for iteration in range(max_iterations):
      response = llm.invoke(messages)
      messages.append(response)
      if not response.tool_calls:
          break  # 无工具调用，正常收敛
      for tc in response.tool_calls:
          try:
              out = execute_tool(tc["name"], tc["args"])
              messages.append(ToolMessage(content=str(out), tool_call_id=tc["id"]))
          except Exception as e:
              # 关键：即便出错也必须回填对应的 ToolMessage，防止配对断裂
              messages.append(ToolMessage(content=f"Error: {e}", tool_call_id=tc["id"], status="error"))
  ```
- **素材**：`LA/fact-base.md FACT-RT-003, FACT-RT-004`；`LA/fragments/f01, f03`；`LA/recap-code/skeleton/runtime_agent_loop.py`。

---

### P2-07 AG-UI 是什么？为什么用它做展示解耦？ ｜ L1 基础
- **30 秒版**：
  **AG-UI（Agent-to-UI）是我们平台确立的标准前端交互协议**。它定义了一套与框架解耦的标准事件流规范（如 `RUN_STARTED`、`TEXT_MESSAGE_*`、`TOOL_CALL_*`、`STATE_SNAPSHOT`、`CUSTOM` 等）。采用它的核心目的是**实现算法运行时与前端渲染的彻底解耦**：后端算法只负责按规范吐出语义化事件流，前端开发人员可以基于组件树自由渲染思考框、工具调用折叠板或富文本表格，而无需理解 LangGraph 底层的 Pregel 节点流转细节；同时阻塞接口与流式接口底层完全同源聚合。
- **深挖版**：
  1. **协议层价值与核心事件分类**：
     - 传统的做法是后端直接把 LangGraph `astream` 的内部 chunk 抛给前端，导致前端与 LangGraph 强绑定，一旦换框架或重构节点前端全崩。
     - AG-UI 将执行抽象为声明式事件：
       - 运行生命周期：`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`
       - 消息流式输出：`TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`
       - 工具执行追踪：`TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`
       - 业务自定义流：`CUSTOM`（用于承载 Ask User 澄清请求、思考过程标签、RAG 来源元数据）`[LA/fact-base.md FACT-AGUI-001]`。
  2. **流式与阻塞同源聚合**：
     - 系统提供了统一的 `AgentBlockingAggregator`。当第三方系统通过 HTTP POST 阻塞接口调用 Agent 时，后端并不是走另一套分支逻辑，而是在内存中直接消费这一套 AG-UI 事件流，在内存中汇聚为包含最终回复文本、工具调用清单、产物引用和来源归属的 `AgentBlockingResponse`，保证了流式与非流式行为的绝对一致性 `[LA/fact-base.md FACT-AGUI-002]`。
- **走查示例**（场景走查）：
  以长任务执行“清洗公积金异常数据”的流式事件派发为例：
  1. `t0`：发射 `RUN_STARTED`，前端创建会话卡片；
  2. `t1`：模型规划步骤，发射 `CUSTOM(name="on_thinking", payload="正在分析表结构...")`，前端展开思考框；
  3. `t2`：调用工具，发射 `TOOL_CALL_START(name="daytona_exec", call_id="c1")`，前端展示终端命令执行动效；
  4. `t3`：工具执行完毕，发射 `TOOL_CALL_END(call_id="c1")`；
  5. `t4`：生成结论文本，高频流式发射 `TEXT_MESSAGE_CONTENT(delta="已剔除 12 条异常数据...")`，打字机渲染；
  6. `t5`：发射 `RUN_FINISHED`，前端闭合加载状态。
  若第三方系统通过 HTTP POST 阻塞调用，`AgentBlockingAggregator` 在内存中完整消费上述 `t0~t5` 事件，聚合为包含最终文本与工具清单的单个 JSON 响应。
  *记住这个例子 = 记住标准事件枚举如何让前端摆脱框架束缚、流式与阻塞底层同源复用。*
- **追问**：
  *面试官追问*：“前端断网重连后，如何恢复当前界面的展示状态？”
  *应对*：通过 `STATE_SNAPSHOT` 与 `MESSAGES_SNAPSHOT` 事件。每次图执行关键节点或中断时，中间件会抓取当前 Checkpoint 中的权威快照广播给前端，前端依据快照进行增量比对与状态对齐，无需重放全量历史流。
- **白板（关联 C12）**：
  AG-UI 事件映射与生成器骨架：
  ```python
  # C12: astream_events 到 AG-UI 事件的流式转换骨架
  async def transform_to_agui_events(graph_stream):
      yield AGUIEvent(type="RUN_STARTED")
      try:
          async for event in graph_stream:
              kind = event["event"]
              if kind == "on_chat_model_stream":
                  content = event["data"]["chunk"].content
                  if content: yield AGUIEvent(type="TEXT_MESSAGE_CONTENT", delta=content)
              elif kind == "on_tool_start":
                  yield AGUIEvent(type="TOOL_CALL_START", name=event["name"], call_id=event["run_id"])
              elif kind == "on_custom_event":
                  yield AGUIEvent(type="CUSTOM", name=event["name"], payload=event["data"])
          yield AGUIEvent(type="RUN_FINISHED")
      except Exception as err:
          yield AGUIEvent(type="RUN_ERROR", error=str(err))
          yield AGUIEvent(type="RUN_FINISHED")
  ```
- **素材**：`LA/recap-blog.md §1.11`；`LA/detail-notes/06-hitl-and-ag-ui.md`；`LA/fact-base.md FACT-AGUI-001, FACT-AGUI-002`。

---

### P2-08 事件流中间件怎么组织？出错怎么保证流正常收尾？ ｜ L2 机制
- **30 秒版**：
  我们在 `agent_service.generate_events` 中组装了一条 **10 级异步事件流中间件链**（类似洋葱模型），逐级处理工具名称本地化、快照修复、参数脱敏、Ask User 转译、RAG 来源提取与思考链解析。为了确保前端永不卡死在加载状态，我们设计了严格的**保活与兜底收尾机制**：最外层包裹异常捕获守卫，一旦链路中任何环节抛出未捕获异常，中间件强制按序补发 `STEP_FINISHED`、`RUN_ERROR` 并以 `RUN_FINISHED` 显式闭合 SSE 连接。
- **深挖版**：
  1. **10 级中间件职责划分**：
     - 1~3 级（结构与翻译）：`ToolNameTranslator`（将内部英文工具名映射为中文展示名）、`SnapshotStateRepairer`（修补不一致状态）、`ActivityInjector`（注入步骤流转状态）。
     - 4~6 级（HITL 与安全）：`AskUserToolArgsMasker`（拦截发往前端的原始参数，替换为“正在准备澄清问题”，防参数未校验泄露与 JSON 闪烁）、`AskUserInterruptTranslator`（将底层 `on_interrupt` 转译为业务强类型 `CUSTOM ask_user.pending`）。
     - 7~9 级（增强与度量）：`RagSourceCollector`（提取 ToolMessage 的 artifact 来源广播）、`ToolStatisticsCollector`（旁路收集工具调用计数，不篡改原生 ID）、`ReasoningCallbackHandler`（解析 `<think>` 标签并闭合思考框）。
     - 10 级（链路保活）：`StreamingDisconnectWatcher`（感知客户端断连并安全退出）`[LA/fact-base.md FACT-AGUI-001; LA/detail-notes/01]`。
  2. **流收尾安全保证**：
     - 在异步生成器（AsyncGenerator）中，如果中间某个节点抛异常直接退出，前端 SSE 连接可能保持挂起，用户看到 Spinner 永久转圈。
     - 我们在最外层设置 `try...except...finally` 守卫：未捕获异常发生时，先发射带有错误详情的 `RUN_ERROR` 事件，紧接着必须触发 `RUN_FINISHED`，前端据此将对话框状态重置为就绪并展示错误横幅 `[LA/fact-base.md FACT-AGUI-001]`。
- **走查示例**（场景走查）：
  以异常链路中的中间件流式防护与收尾为例：
  1. 模型误将密码参数传给工具，流经第 4 级 `AskUserToolArgsMasker` 时，中间件将其原地替换为 `"正在准备澄清问题"`，阻止敏感 JSON 闪烁泄露给前端；
  2. 执行到第 8 级提取思考链时，下游代码因数据格式异常突发 `KeyError: 'content'` 未捕获异常；
  3. 最外层 `EventCompletionGuard` 守卫捕获该异常，阻止连接直接中断，并强制按序补发：
     `STEP_FINISHED` ➔ `RUN_ERROR(error="Internal processing error")` ➔ `RUN_FINISHED`；
  4. 前端浏览器收到显式的 `RUN_FINISHED` 闭合 SSE 连接，Spinner 加载状态立即恢复，并展示错误横幅，避免了前端用户页面永久卡死。
  *记住这个例子 = 记住 10 级中间件如何层层清洗参数，并在未捕获崩溃时强制补发事件保证流式连接安全闭环。*
- **追问**：
  *面试官追问*：“为什么强调通过‘旁路统计’而非‘原地篡改’处理工具调用信息？”
  *应对*：早期我们曾尝试设计 `ToolIDRewriter` 中间件在 SSE 编码前重写 tool_call_id 以便前端聚合展示，但发现原地篡改会导致 LangGraph 内部的追踪 ID 和上报 Checkpoint 的 ID 断裂。因此我们全面推翻了原地篡改方案，改用 `ToolStatisticsCollector` 发送旁路的 `tool_usage` CustomEvent，既满足了前端统计，又保护了原生消息链路的纯洁性 `[LA/fact-base.md FACT-TOOL-006; DELTA-RT-001]`。
- **素材**：`LA/fact-base.md FACT-AGUI-001, FACT-TOOL-006`；`LA/detail-notes/01-handler-callback-middleware.md`；`LA/detail-notes/03-custom-events.md`。

---

### P2-09 Ask User 挂起恢复怎么实现？恢复时怎么防串扰？ ｜ L2 机制
- **30 秒版**：
  Ask User 的挂起恢复基于 **LangGraph 原生 `interrupt()` 与 Checkpointer 机制**。节点调用 `interrupt()` 抛出特定异常，Runner 捕获后将中断状态存盘并暂停执行；前端用户作答后，通过 stream 接口将回答包装为 `Command(resume=...)` 唤醒状态机。为了**防串扰与防重放攻击**，系统生成由 thread_id、run_id 与 tool_call_id 混合计算的 `stable_request_id`，恢复时采用 `secrets.compare_digest` 进行常量时间校验；同时校验题目与答案顺序强对齐，并显式规定子代理（subagents）禁用 Ask User，杜绝多层递归中断混乱。
- **深挖版**：
  1. **挂起与唤醒全链路 Trace**：
     - 顶层 Agent 决策调用 `ask_user` 工具。
     - `create_ask_user_tool` 内部调用 `langgraph.types.interrupt(payload)`，抛出 `GraphInterrupt` 异常。
     - Runner 拦截异常，将未决写操作写入 Checkpointer，退出当前轮次执行并向客户端推送 `CUSTOM ask_user.pending`。
     - 用户在前端选择选项并提交，客户端调用恢复接口传入 `forwardedProps.command.resume`，服务端转换为 `Command(resume=answer_envelope)` 重新调用图，节点重放并从中断点直接取回用户回答 `[LA/detail-notes/06-hitl-and-ag-ui.md §1.1; LA/fact-base.md FACT-ASK-001~004]`。
  2. **防串扰与鲁棒性防御体系**：
     - **防重放与伪造**：生成规范化哈希标识 `stable_request_id = f"au_v1_{sha256(thread_id:run_id:tool_call_id)}"`。恢复时通过 `secrets.compare_digest` 常量时间比对，防止时序攻击与跨会话串扰。
     - **顺序强对齐与字段强校验**：返回的答案必须与提问题目在数量、question_id 上严格对齐；若用户选择取消（Cancel），工具推导默认的安全兜底值并打标 `cancelled=True`，让模型安全收敛。
     - **拓扑隔离**：明确规定只有顶层主 Agent 具备挂起权限；当挂载子图或多 Agent 委派时，中间件在能力层强制剥离 `ask_user` 工具，杜绝深层嵌套死锁 `[LA/fact-base.md FACT-ASK-005~008]`。
- **走查示例**（场景走查）：
  按时间线走查长任务中 Ask User 挂起与 20 分钟后恢复的防串扰全流程：
  - `t0 (挂起)`：长任务执行到第 3 步画图，模型调用 `ask_user` 发起澄清：“请选择按月份还是按季度汇总？”；平台计算生成 `stable_request_id = "au_v1_" + sha256("thread_101:run_88:call_03")`；工具调用 `interrupt()` 抛出 `GraphInterrupt`，状态写入 Checkpointer，当前生成器退出；
  - `t1 (等待)`：沙箱释放所有活跃计算资源，用户离席开会 20 分钟；
  - `t2 (作答)`：用户返回并在前端点选“按季度汇总”，客户端发送 resume 请求附带 `stable_request_id` 与选项结果；
  - `t3 (校验)`：服务端通过 `secrets.compare_digest` 在常量时间内比对 Request ID，并核验选项合法性，彻底杜绝跨会话篡改与重放攻击；
  - `t4 (重放唤醒)`：图接收到 `Command(resume=answer)` 唤醒，节点重放至中断点直接取回答案，继续驱动模型生成季度汇总折线图。
  *记住这个例子 = 记住 interrupt() 异常冻结 + stable_request_id 常量时间校验的抗重放挂起恢复闭环。*
- **追问**：
  *面试官追问*：“LangGraph 的 interrupt 恢复时，之前的代码会重新执行一遍吗？”
  *应对*：会。LangGraph 节点在 resume 时是从节点函数入口**重新开始执行**的。框架内部通过 scratchpad 维护了一个中断计数器，当执行到第 N 个 `interrupt()` 调用时，如果检测到恢复值已存在，框架会直接短路返回恢复值而不再抛出异常。因此，**中断节点内部在 interrupt 之前的逻辑必须保持严格幂等**，不能有外部不可逆副作用（如写库、发邮件），敏感副作用必须移到 interrupt 确认之后。
- **白板（关联 C13）**：
  手写 HITL 挂起恢复最小骨架：
  ```python
  # C13: 带有 Checkpointer 依赖的 interrupt / Command(resume) 最小骨架
  def ask_user_node(state: AgentState) -> dict:
      question_payload = {
          "request_id": f"au_v1_{hash(state['thread_id'])}",
          "questions": [{"id": "q1", "prompt": "请选择查询时间范围", "options": ["近7天", "近30天"]}]
      }
      # 抛出 GraphInterrupt 挂起，持久化至 Checkpointer 并等待外部输入
      user_response = interrupt(question_payload)
      
      # 外部传入 Command(resume=...) 唤醒时从此处恢复，必须进行 request_id 校验
      if not secrets.compare_digest(user_response.get("request_id", ""), question_payload["request_id"]):
          raise ValueError("Invalid or mismatched request_id")
      return {"user_answers": user_response["answers"]}
  ```
- **素材**：`LA/fact-base.md FACT-ASK-001~008`；`LA/detail-notes/06-hitl-and-ag-ui.md §2`。

---

### P2-10 HITL 的产品约束怎么定的？跨实例并发怎么办？ ｜ L3 深挖
- **30 秒版**：
  我们通过深入调研业内标准（OpenAI Codex、Claude Code 以及 pi-ask-user），确立了企业级 HITL 的**最小交互契约**：单次交互严格限制在 1 至 4 道独立问题、每题提供 2 至 4 个明确选项、允许单行 Other 补充（限制 500 字符以内）与一键 Skip，且在协议层严禁向用户索取密码或 Token 等敏感凭证。针对**跨实例多端并发作答**的冲突场景，架构上设计了基于分布式 CAS 409 的冲突拦截规范，当前线上实现依托 LangGraph Checkpointer 状态机天然保证了单实例串行一致性。
- **深挖版**：
  1. **产品交互边界设计（最小交互契约）**：
     - 自由开放式对话容易让用户无所适从。因此规定：必须是选择式结构化提问；严禁无选项的开放式提问；禁止支持多选以降低状态机复杂度。
     - **安全黑名单**：在 `AskUserQuestion` Schema 校验中强制执行敏感词过滤，任何包含 `password`、`token`、`secret`、`私钥`、`验证码` 的提问直接在工具初始化层拒绝，防止模型越权套取用户凭证 `[LA/fact-base.md DESIGN-ASK-001]`。
  2. **跨实例并发与演进偏差（DELTA-ASK-001）**：
     - *演进设计态（Phase 3+ 规划）*：设计独立的 `AskUserRequest` 业务表，利用分布式 CAS 乐观锁版本号控制。若用户在移动端和 PC 端同时打开并提交，后提交的请求直接返回 HTTP 409 `ASK_USER_ALREADY_RESOLVED` `[LA/fact-base.md DESIGN-ASK-003]`。
     - *当前主干实现态*：目前生产环境主要依托 Checkpointer 底层存储（SQLite / 数据库）的状态版本号。当第一次 resume 消费完该中断点后，Checkpoint 的 pending writes 被清空；后续并发请求重试时，因找不到处于 interrupted 状态的快照而报错拦截。我们在叙事上明确说明当前处于单体状态机保护阶段，CAS 业务表为演进规划 `[LA/fact-base.md FACT-ASK-002; DELTA-ASK-001]`。
- **走查示例**（场景走查 / 正反对比）：
  走查示例：承接 P2-09，重点关注产品契约约束与双端并发拦截：
  - **契约校验走查**：模型提问时若试图输出 5 道题或开放式输入框，Schema 验证直接拦截；若提问内容包含“请输入公积金网厅登录密码”，敏感词正则立即触发阻断并打标违规；
  - **双端并发拦截对比**：用户在 PC 端和手机端同时打开处于中断等待的公积金问答界面：
    - PC 端先点击提交，Checkpointer 消费未决中断点（pending write），状态机恢复向前流转；
    - 手机端 2 秒后并发提交同一 `stable_request_id`，服务端检查 Checkpointer 发现当前轮次已无该未决中断，直接拒绝并向手机端提示“该问题已在其他设备处理”，杜绝重复恢复执行。
  *记住这个例子 = 记住 1~4 题/2~4 项/禁凭证的最小交互契约，以及状态机未决点单次消费的并发防护。*
- **追问**：
  *面试官追问*：“用户很久不回答，超时怎么处理？”
  *应对*：图处于中断挂起状态时，本身是不占用任何线程和计算资源的，仅仅是 Checkpointer 中的一条持久化记录。产品侧设有前端定时轮询与失效提示，如果超过业务有效时间（如 24 小时），用户尝试提交时后端会提示该轮交互已过期，并引导发起新对话。
- **素材**：`LA/fact-base.md DESIGN-ASK-001~003, DELTA-ASK-001`；`LA/detail-notes/06-hitl-and-ag-ui.md`。

---

### P2-11 A2UI 是什么？和 AG-UI 什么关系？探索到什么程度？ ｜ L2 机制
- **30 秒版**：
  **A2UI（Agent-to-UI）是我们探索的生成式自适应界面协议**。它与 AG-UI 的区别在于：**AG-UI 负责传输事件流与会话状态，而 A2UI 负责传输动态生成的 UI 组件树**。在传统对话中 Agent 只能返回 Markdown，而在 A2UI 下，Agent 可以直接生成表单、商品卡片、确认按钮等界面元素，实现“边聊边生成界面”。我们基于瑞幸点单场景完成了端到端 PoC 验证，实现了组件目录分批生成、高危下单中断确认以及交互回流。口径上，这是**技术探索与验证原型**，尚未合入主干。
- **深挖版**：
  1. **协议定位与职责互补**：
     - `AG-UI` 是传输管道：规定了 SSE 的包装格式、事件命名与连接生命周期。
     - `A2UI` 是内容载荷：作为 AG-UI `CUSTOM` 事件的内部 Payload（`a2ui_surface`），定义了 JSON 格式的声明式组件树（Component Tree），前端利用 `@a2ui/react` 动态渲染原生控件 `[LA/fact-base.md DESIGN-A2UI-001; LA/recap-blog.md §5.5]`。
  2. **瑞幸点单 PoC 核心验证范围**：
     - **分批生成与渐进式呈现**：Agent 先生成饮品类目与规格选项卡片，用户点选后，再生成加料与温度配置表单。
     - **高危操作中断确认**：在调用最终提交订单工具（`createOrder`）前，A2UI 触发 LangGraph `interrupt()` 挂起，前端弹窗提示用户人工确认金额，确认后通过 resume 恢复执行。
     - **交互回流双模式**：支持“消息模式”（用户点击按钮自动拼装为一条 HumanMessage 发送）与“恢复模式”（用户操作直接作为 Command resume 参数回灌给挂起中的组件节点）`[LA/fact-base.md DESIGN-A2UI-001, DESIGN-A2UI-002]`。
- **走查示例**（场景走查）：
  以瑞幸咖啡点单场景走查 A2UI 生成式界面的端到端流转：
  1. 用户自然语言输入：“我想喝一杯生椰拿铁。”
  2. Agent 不输出纯文本，而是输出 `a2ui_surface` 组件树 JSON：`{type: "DrinkCard", title: "生椰拿铁", fields: [{type: "RadioGroup", name: "sweetness", options: ["标准糖", "半糖", "不另外加糖"]}]}`；
  3. 前端基于 `@a2ui/react` 动态渲染原生组件卡片，用户直接点击“半糖”单选框；
  4. 交互回流：前端捕获点击动作，打包为规范数据回传给服务端，驱动模型进入下单确认阶段；
  5. 不可逆中断拦截：在调用 `createOrder` 工具前，A2UI 触发 `interrupt()` 挂起，前端弹出带支付金额的二次确认框，用户点击确认后通过 resume 恢复下单。
  *记住这个例子 = 记住 A2UI 从组件树生成、原生渲染、交互回流到不可逆操作中断确认的原型闭环。*
- **追问**：
  *面试官追问*：“A2UI 距离工业级落地还差什么？”
  *应对*：主要是安全沙箱与性能挑战。首先是大模型输出复杂组件树时的 Schema 稳定性，偶发 JSON 畸变会导致前端白屏；其次是动态组件与企业微前端的样式/鉴权隔离；最后是高并发下的组件渲染性能。因此我们将其定界为探索原型，优先攻关更通用的文件型 Canvas 与表单交互。
- **素材**：`LA/fact-base.md DESIGN-A2UI-001, DESIGN-A2UI-002`；`LA/recap-blog.md §5.5`。

---

### 锚点 C：动作行 2 长任务与插件体系

### P2-12 长任务沙箱生命周期怎么管？ ｜ L2 机制
- **30 秒版**：
  长任务依托 Daytona 容器沙箱提供隔离环境。我们通过 `WorkspaceService` 建立了严谨的 **6 状态生命周期管理模型**（`allocating` ➔ `allocated` ➔ `reclaiming` ➔ `reclaimed` ➔ `destroying` ➔ `error`）。采用 Run 级独占租约保证并发安全；设立显式超时控制与心跳机制（线上配置 10 分钟空闲回收 TTL），防止沙箱被平台误判自动暂停；同时如果检测到沙箱类型或环境镜像与配置不一致，系统会自动触发销毁与重建。
- **深挖版**：
  1. **状态机与超时契约**：
     - 沙箱状态全生命周期映射至后端 Internal API 统一治理，算法层解耦了直接的数据库读写 `[LA/fact-base.md DELTA-LT-001]`。
     - Daytona SDK 的所有同步调用由专用的 `ThreadPoolExecutor`（固定 16 workers）隔离调度，防止阻塞异步事件循环。
     - **显式超时保护**：沙箱创建超时 240s；唤醒/启动（resume/start）超时 60s；挂起/停止（suspend/stop）超时 60s；沙箱内部代码命令执行默认超时 1800s（30 分钟），杜绝僵尸进程常驻耗尽集群资源 `[LA/fact-base.md FACT-LT-002]`。
  2. **租约与心跳保活机制**：
     - 每次执行长任务分配唯一的 Run 租约，避免多任务同时向同一个 Workspace 写文件发生脏覆盖。
     - Daytona 平台自带空闲检测（Auto Stop）。长任务在执行复杂计算或大模型长耗时推理时，沙箱没有外部 I/O 可能被判定为 idle。为此平台在后台维持周期性心跳探测，确保长任务执行期间沙箱处于活跃状态；任务结束后进入 reclaiming 状态，等待 TTL 到期安全释放 `[LA/fact-base.md FACT-LT-003, FACT-LT-004]`。
- **走查示例**（场景走查）：
  以一个 15 分钟长任务数据清洗的沙箱全生命周期流转为例：
  1. `t0: allocating`：长任务启动，向 Daytona 请求分配独立容器沙箱，在 240 秒显式超时内创建完毕；
  2. `t1: allocated`：绑定 Run 级独占租约，后台启动心跳定时器（每隔 30 秒探测），防止沙箱因无外部网络 I/O 被 Daytona 平台误判空闲暂停；
  3. `t2: running`：执行复杂数据聚合脚本，沙箱命令执行挂接 1800 秒（30分钟）硬超时保护；
  4. `t3: reclaiming`：任务正常执行完毕，租约释放，状态变更为回收中，等待 Nacos 线上配置的 10 分钟空闲回收 TTL；
  5. `t4: reclaimed / destroying`：10 分钟内无新指令，容器优雅停止并销毁；若下次同一会话新任务指定了不同的 Python 镜像版本，系统检测到类型不一致，自动销毁旧容器并新建。
  *记住这个例子 = 记住 6 状态 Workspace 状态机与 240s/60s/1800s 显式超时及 10 分钟 TTL 的资源管控链。*
- **追问**：
  *面试官追问*：“用户并发很多长任务，沙箱集群撑不住怎么办？”
  *应对*：我们引入了严格的准入控制与排队机制。在平台网关层限制每个用户或租户同时处于 `allocated` 状态的沙箱上限；超出配额的任务在调度队列中等待；同时对轻量任务优先引导走短任务动态图，只有检测到真实代码运行或大文件操作才下发沙箱。
- **素材**：`LA/fact-base.md FACT-LT-002~004`；`LA/recap-blog.md §2.2–2.5`；`LA/fragments/f06, f13`。

---

### P2-13 沙箱回收后产物怎么不丢？ ｜ L2 机制
- **30 秒版**：
  这是长任务架构演进中最典型的一次技术迭代。第一版设计中，产物（如生成的 PDF 报告、Excel 表格、图表图片）保存在沙箱本地，用户点击下载时直连沙箱读取字节流。但线上沙箱到期回收后，历史会话中的产物链接全部变成了 404。我们推翻了该设计，重构为 **“生成即外化至对象存储 + 冷启动回灌恢复”** 机制：结合 Single-Flight 机制消除并发同步毛刺，用 SHA256 校验去重，即便容器被销毁重建，产物也能秒级从外部存储回灌至工作区。
- **深挖版**：
  1. **演进对比（DELTA-ART-001）**：
     - *早期方案*：文件落在沙箱 `/workspace/artifacts/`，下载接口通过 Daytona SDK 从活跃沙箱流式拉取。缺陷：一旦沙箱因 10 分钟 TTL 空闲被销毁，用户无法再获取任何历史产物 `[LA/fact-base.md DESIGN-ART-001]`。
     - *重构方案*：产物生命周期与容器计算生命周期彻底解耦。建立外部对象存储（MinIO/S3）作为权威数据源，并在后端数据库维护 `artifact_manifests` 清单 `[LA/fact-base.md FACT-ART-001]`。
  2. **持久化与回灌的核心工程细节**：
     - **生成即同步与兜底检查**：在任务执行过程中，Agent 显式调用导出工具或中间件扫描到新文件时，自动异步上传对象存储；在整个 Run 结束前执行最终兜底同步，确保无遗漏。
     - **Single-Flight + Coalesce 防穿透**：高频文件产生时，采用单飞合并机制，相同文件的并发读写合并为单次上传，避免沙箱网络带宽打满。
     - **冷启动回灌（Restore）**：用户在几天后重新进入历史会话并发起新指令时，系统分配新沙箱，后台服务依据清单秒级将历史必要产物下载回灌至新沙箱工作区，模型无缝恢复上下文。
     - **跨平台中文路径中转**：针对非 ASCII 与中文文件名，引入 URL 编码与规范化中转层，避免在 Linux 容器与对象存储跨系统传输时出现乱码 `[LA/fact-base.md FACT-ART-002~004; DELTA-ART-001]`。
- **走查示例**（正反对比）：
  以生成一份“2024 年度公积金结息报告.xlsx”为例对比产物生命周期：
  - **反例（早期实现：直读沙箱）**：任务在沙箱 `/workspace/artifacts/report.xlsx` 生成文件，前端直接请求算法接口，算法通过 Daytona SDK 从活跃容器读取字节流。用户隔天再次进入历史记录点击下载，沙箱因 10 分钟空闲早已被销毁，下载接口报 HTTP 404，历史业务产物永久丢失；
  - **正例（当前重构：外化 + 回灌）**：任务在沙箱生成报表后，中间件触发 Single-Flight 机制，将文件异步上传至 MinIO 对象存储，计算 SHA256 并登记至 `artifact_manifests` 数据库表；3 天后用户重新打开该历史会话发起追问，平台分配全新沙箱，启动时依据 Manifest 清单秒级从 MinIO 回灌历史报表至新沙箱工作区，历史产物永不丢失且支持继续编辑。
  *记住这个例子 = 记住直读沙箱引发的 404 故障，以及生成即外化对象存储 + 冷启动回灌的持久化救赎。*
- **追问**：
  *面试官追问*：“怎么判断哪些文件是用户关心的‘产物’，哪些只是中间编译缓存垃圾？”
  *应对*：我们在产品上明确否定了复杂的黑盒资产图谱，收敛为 **“文件型 Artifact 预览器”** 策略：一方面支持 Agent 显式调用 `export_artifacts` 标记重要文件；另一方面平台按扩展名与目录白名单对 `/workspace/artifacts/` 目录进行权威收敛，临时代码和编译缓存留在 `/tmp`，不参与外部同步 `[LA/fact-base.md DESIGN-ART-002]`。
- **素材**：`LA/fact-base.md FACT-ART-001~004, DELTA-ART-001`；`LA/recap-blog.md §3`。

---

### P2-14 上下文自动压缩怎么触发、怎么保证不丢信息？ ｜ L2 机制
- **30 秒版**：
  我们通过自研的 `ObservedSummarizationMiddleware` 实现上下文自动压缩。策略是 **“70% 占用触发，保留最近 25% 上下文，且至少保留 6 条消息”**。为了**保证绝对不丢失核心信息**，我们不是粗暴地从 LangGraph State 中物理删除消息，而是将淘汰的早期消息转存为沙箱内部文件 `/conversation_history/{thread_id}.md`，供模型随时通过工具调阅；同时采用结构化的四段式摘要提示词提炼关键事实，并严格对齐在工具调用的安全边界，防止截断导致 `tool_calls` 孤儿错误。
- **深挖版**：
  1. **触发时机与安全截断边界**：
     - 中间件在每次模型调用前计算 Token 占用率。当 `current_tokens / max_tokens >= 0.7` 且总消息数 $\ge 6$ 时触发压缩 `[LA/fact-base.md FACT-CMP-001]`。
     - **截断点对齐**：绝对不能按绝对行数切断。截断索引必须向后微调，确保切分点不在 `AIMessage(tool_calls)` 与 `ToolMessage` 之间，保证消息序列的配对合法性。
  2. **信息保全的“虚实结合”机制**：
     - **外部化转存**：淘汰的明细消息并不丢弃，序列化写入沙箱文件 `/conversation_history/{thread_id}.md`。模型在 System Prompt 中被告知：“早期历史已归档至历史文件，如有需要可调用 `read_file` 查阅” `[LA/fact-base.md FACT-CMP-002]`。
     - **四段式结构化摘要**：总结并非自由发挥，而是严格按照四段式结构提炼：①原始任务目标与边界；②已完成的关键数据分析结论与产物路径；③当前执行进度与待处理事项；④用户明确表达的偏好与约束。
     - **可观测性**：触发压缩后发射 `context.usage_updated` CustomEvent，让前端能够实时展示当前上下文水位变化 `[LA/fact-base.md FACT-CMP-006; DELTA-CMP-001]`。
- **走查示例**（数字演算 + 场景走查）：
  以大模型 100k Token 上下文窗口下的具体压缩过程为例进行数字演算：
  1. **当前状态**：会话历经多轮分析，积累了 30 条消息，当前总 Token 达到 **71k**；
  2. **触发判定**：`71k / 100k = 71% >= 70%` 且 `30 条 >= 6 条`，命中触发条件；
  3. **计算截断比例**：目标保留后 25% 上下文，`30 * 25% = 7.5 条`，理论截断点在第 22 条左右；
  4. **安全边界对齐**：检查发现第 22 条是一条 `ToolMessage`，其对应的 `AIMessage(tool_calls)` 在第 21 条。若在第 22 条切断将破坏工具配对。中间件自动向后对齐，决定保留最后 8 条消息（第 23~30 条）；
  5. **转存与置顶**：前 22 条明细被完整写出到沙箱 `/conversation_history/thread_101.md`，提炼生成的 500 Token 四段式摘要置顶于新上下文头部；
  6. **收敛结果**：当前上下文 Token 从 71k 瞬间压回约 **18k**，并派发 `context.usage_updated` 事件通知前端刷新水位。
  *记住这个例子 = 记住 70% 触发、保留 25%、安全对齐工具配对边界与淘汰消息转存文件的完整数值计算。*
- **追问**：
  *面试官追问*：“为什么选 70% 和 25% 这两个参数？做过 Benchmark 吗？”
  *应对*：诚实说明，这两个参数是工程上线时结合经验与模型上下文窗口设定的安全阈值（当时模型窗口为 32k/128k），未经过学术级大规模 Benchmark。70% 留出了充足的余量供单轮大输出与工具调用突发缓冲，25% 约能保留最近 2~3 轮深度交互细节，上线后运行稳定，未观察到上下文断层问题。
- **白板（关联 C16）**：
  上下文压缩截断与安全边界对齐逻辑：
  ```python
  # C16: 上下文压缩安全截断核心算法
  def calculate_safe_cutoff(messages: list, target_keep_ratio: float = 0.25) -> int:
      n = len(messages)
      raw_cutoff = int(n * (1.0 - target_keep_ratio))
      # 边界保护：确保不切断 tool_calls 与 ToolMessage 的强配对
      cutoff = raw_cutoff
      while cutoff < n:
          msg = messages[cutoff]
          # 如果当前点正好是一条孤立的 ToolMessage，说明对应的 tool_call 在前面，必须继续后移
          if getattr(msg, "tool_call_id", None) is not None:
              cutoff += 1
          else:
              break
      return cutoff
  ```
- **素材**：`LA/fact-base.md FACT-CMP-001~006, DELTA-CMP-001`；`LA/detail-notes/04-summarization-middleware.md`；`issues/30`。

---

### P2-15 长期记忆和对话历史、checkpoint 有什么区别？为什么收敛成两层？ ｜ L2 机制
- **30 秒版**：
  我们建立了清晰的**五维存储体系**：对话历史是即时消息序列；Checkpoint 是图的单步执行恢复快照；Summary 是长窗口压缩；沙箱文件是工作区磁盘；而**长期记忆是跨会话持久存在的用户级知识**。早期我们曾规划了包含“组织级、Agent 级、用户共享、用户×Agent”的 4 层记忆方案，但在落地时出于**安全隔离与噪音防范**，全面收敛为 `USER_GLOBAL`（用户全局通用偏好）和 `USER_AGENT`（用户对特定智能体的业务习惯）两层，采用单张物理表配合联合唯一索引存储。
- **深挖版**：
  1. **五维存储分工对照**：
     - `Messages`：保存在当前会话内存/Redis，随会话结束而归档。
     - `Checkpoint`：LangGraph 内部存储，记录图节点未决操作与跳转指针，专用于中断唤醒与故障恢复。
     - `Context Summary`：单会话内的长文本摘要，防止 Token 超限。
     - `Sandbox Files`：临时计算代码与产物物理文件。
     - `Long-term Memory`：独立存储于数据库 `agent_memory` 表，跨会话注入 Prompt，例如“用户偏好输出 Pandas 代码而不是 SQL” `[LA/fact-base.md FACT-MEM-001]`。
  2. **收敛为两层的核心考量（DELTA-MEM-001）**：
     - *废弃组织级记忆*：不同员工对同一业务的定义往往冲突，全局灌入容易产生噪音干扰，且可能造成敏感信息跨部门泄露。
     - *废弃 Agent 级全局记忆*：一个 Agent 会服务成千上万个不同用户，Agent 级别的记忆容易将 A 用户的业务数据串扰给 B 用户。
     - *收敛为双层隔离*：仅保留 `USER_GLOBAL` 与 `USER_AGENT`，通过虚拟文件路径 `/memories/preferences.md` 暴露给 Agent 读写；写入采用乐观锁版本号防止并发写冲突，未授权（401/403）严格中断抛错，查询不存在（404）安全降级为空 `[LA/fact-base.md FACT-MEM-002~006; DELTA-MEM-001]`。
- **走查示例**（场景走查 / 正反对比）：
  以用户设定业务习惯“公积金统计报表金额统一使用万元单位”为例：
  - **反例（早期 4 层记忆架构）**：系统将该偏好写入“组织级记忆”或“Agent 级记忆”。第二天同一部门的张科员使用同一智能体查询个人小额明细（如几十元利息），结果被强制格式化为“0.00 万元”，造成业务数据失真与跨用户偏好污染；
  - **正例（收敛为 2 层架构）**：系统在 `agent_memory` 表中插入联合唯一记录 `(user_id=李处长, agent_id=公积金助手, key="preference", val="统计金额统一用万元")`；张科员的会话不受任何干扰；李处长后续新开任何会话时，系统自动挂载虚拟文件 `/memories/preferences.md`，仅对李处长生效。
  *记住这个例子 = 记住收敛为 USER_GLOBAL 与 USER_AGENT 两层单表架构如何彻底杜绝跨用户数据污染。*
- **追问**：
  *面试官追问*：“并发修改记忆时发生 409 冲突，怎么处理？”
  *应对*：长期记忆当前定位为私有化企业级 MVP，在单用户维度操作频次较低。我们采用了基于数据库版本号的乐观锁重试机制（默认重试 3 次）。若重试仍冲突，当前采取简单降级策略放弃写入并打印日志，避免阻塞主对话链路；未来高并发场景已规划引入合并策略。
- **素材**：`LA/fact-base.md FACT-MEM-001~006, DELTA-MEM-001`；`LA/recap-blog.md §4.1–4.2`。

---

### P2-16 Skill 系统怎么做渐进激活？ ｜ L2 机制
- **30 秒版**：
  为了避免给模型一次性灌入几十个技能导致上下文爆炸与幻觉，我们设计了 **“元数据常驻 + 内容按需渐进激活”** 机制。系统初始化时，仅扫描每个技能包的 `SKILL.md` frontmatter 元数据（名称与功能概述），轻量级注入 System Prompt；当 Agent 在思考中判定需要某项技能时，主动调用 `read_file` 读取该技能目录，中间件拦截该操作完成技能激活并向前端派发激活事件。同时配合 ZIP 安全校验与基于 URL 签名的跳过下载，保证了运行安全与秒级加载。
- **深挖版**：
  1. **渐进式激活工作流**：
     - **阶段 1（轻量声明）**：沙箱初始化时，`SkillImportService` 解压技能包，仅提取 `SKILL.md` 头部几十个 Token 的元数据描述，拼装成列表告知模型：“你拥有以下候选技能，仅在需要时按路径读取”。
     - **阶段 2（动态拦截激活）**：模型发出工具调用 `read_file(path="/skills/chart_export/SKILL.md")`。文件系统中间件精准拦截该路径访问，在内存中将该技能标记为“已激活（Active）”，并发射 `skill.activated` CustomEvent 通知前端高亮展示技能徽标；后续调用中，去重机制防止重复发射事件 `[LA/fact-base.md FACT-SKL-001~004]`。
  2. **安全防御与传输优化**：
     - **Zip 安全治理**：严格限制上传技能包 $\le 50\text{MB}$；解压前扫描文件名，防止 `../` 的 Zip Slip 路径穿越攻击；校验压缩包内必须有且仅有一个根目录 `SKILL.md`。
     - **原子替换与回滚**：解压先进入 staging 临时目录，校验完整性后再原子重命名至 `/skills/` 生产目录，失败立即回滚。
     - **去重与签名匹配**：计算 OSS URL 签名或文件哈希，相同版本直接复用沙箱本地文件，避免重复下载引发的沙箱 I/O 延迟 `[LA/fact-base.md FACT-SKL-005~008; DELTA-SKL-001]`。
- **走查示例**（场景走查）：
  以系统搭载 20 个专业技能包（包含图表生成、PDF 解析、税务核算等，解压总体积 300MB）为例：
  1. **初始化轻量声明**：Agent 启动时，Prompt 仅注入 20 个技能的 `SKILL.md` frontmatter 摘要（每项 2 行，总计不足 400 Token），沙箱内不预加载任何代码；
  2. **决策按需读取**：用户提出“把数据导出为带水印的 PDF 报告”。Agent 决策需要相关技能，发出工具调用 `read_file("/skills/pdf_watermark/SKILL.md")`；
  3. **拦截与激活**：文件中间件拦截该操作，将技能标记为激活态，发射 `skill.activated` CustomEvent 通知前端点亮技能图标；后续继续调用该技能脚本时不重复派发事件；
  4. **安全落地**：下载更新走 staging 临时目录原子重命名，防止解压半途损坏；计算 URL 签名跳过已存在的包，首字延迟不受 300MB 资源包拖累。
  *记住这个例子 = 记住 Frontmatter 元数据常驻 + read_file 首次拦截激活的渐进式加载机制。*
- **追问**：
  *面试官追问*：“为什么从最初的平铺解压演进为按业务 ID 隔离解压？”
  *应对*：早期线上运行一段时间后，发现不同业务人员上传的技能压缩包内部常常包含同名文件（如 `utils.py` 或 `template.json`），平铺在同一个目录下导致文件被互相覆盖破坏。演进后，我们在沙箱中强制建立 `/skills/{skill_id}/` 的独立业务隔离子目录，彻底消除了命名冲突。
- **素材**：`LA/fact-base.md FACT-SKL-001~008, DELTA-SKL-001`。

---

### P2-17 Subgraph 插件怎么挂？为什么不用 deepagents 的 CompiledSubAgent？ ｜ L2 机制
- **30 秒版**：
  平台将复杂的业务模块（如 ChatBI、数据可视化）抽象为独立子图（Subgraph）。在挂载时，子图入口伪装为一个标准的 `@tool` Schema 暴露给大模型作为决策契约，而在主图执行时，路由函数拦截该工具调用并重定向至专有子图节点。之所以**坚决不用 deepagents 原生的 `CompiledSubAgent`**，是因为其内置的 `SubAgentMiddleware` 存在严重设计缺陷：它会强制用外层用户的最新输入覆盖子图内部的消息，导致大模型生成的结构化子图输入参数丢失。我们自研了 `SubgraphToolMiddleware`，彻底解决了这一参数丢失问题。
- **深挖版**：
  1. **为什么推翻 CompiledSubAgent（DELTA-LT-002）**：
     - deepagents 官方推崇将子图包装为 `CompiledSubAgent`，作为通用子代理通过原生 `task` 工具调度。
     - 但深度排查源码发现：`SubAgentMiddleware` 在调用子图时，硬编码地将父级的用户输入提取并覆盖了子图状态的初始 messages。这直接导致父级通过结构化工具调用传递的复杂参数（如特定的 SQL、过滤字段）被冲刷丢失，子图启动时解析不到参数直接报错崩溃 `[LA/fact-base.md DELTA-LT-002; FACT-LT-009]`。
  2. **自研 `SubgraphToolMiddleware` 架构设计**：
     - **参数保护与独立 State**：中间件精确拦截命中子图的工具调用，保留工具调用的原始入参 dict，在内存中构建隔离的子图私有 State。
     - **隔离执行与结果包装**：调用 `subgraph.ainvoke(isolated_state)`，子图内部无论发生多少轮循环推理，均被封装在私有作用域中，绝不污染外层主图的状态空间。
     - **原子回写契约**：子图执行完毕后，中间件通过 `Command(update={"messages": [ToolMessage(content=result, tool_call_id=...)]})` 将执行结果包装为标准的工具返回消息回写给主图，完美契合 LangGraph 的原生状态流转 `[LA/fact-base.md FACT-LT-009; LA/recap-blog.md §1.5]`。
- **走查示例**（正反对比）：
  以长任务中挂载 ChatBI 复杂子图的参数传递为例：
  - **反例（使用原生 CompiledSubAgent）**：长任务父 Agent 调用子图入口，发出工具调用 `chatbi_tool(target_table="extract_log", filter_year=2024)`；deepagents 内置的 `SubAgentMiddleware` 介入，强行提取当前父级会话的最新一条用户原始文本覆盖了子图状态的初始 messages；导致结构化参数 `target_table` 与 `filter_year` 瞬间丢失，ChatBI 子图启动时解析不到参数直接报空指针异常崩溃；
  - **正例（使用自研 SubgraphToolMiddleware）**：中间件精准拦截 `chatbi_tool` 调用，保留完整的参数字典，在内存中构建隔离独立的子图私有 State，执行 `subgraph.ainvoke()`；子图内部流转 3 轮生成 SQL 后，中间件将结果原子打包为 `ToolMessage` 回写给父图，参数 100% 完整传递且状态互不污染。
  *记住这个例子 = 记住 SubgraphToolMiddleware 如何通过隔离 State 拦截保护被第三方中间件冲刷丢失的结构化参数。*
- **追问**：
  *面试官追问*：“这种设计在业界多智能体架构中属于什么流派？”
  *应对*：这正是典型的 **Subgraph-as-a-Tool（子图即工具）** 范式。相较于完全自由发散的 Subagent-as-Worker，子图即工具的优势在于：它把复杂子流程严格约束在确定性的工具调用输入输出契约内，既具备复杂状态图的局部推理与循环能力，又不会导致全局会话状态与执行拓扑失控。
- **白板（关联 C15）**：
  手写 SubgraphToolMiddleware 拦截与状态隔离逻辑：
  ```python
  # C15: SubgraphToolMiddleware 拦截与隔离状态回写
  class SubgraphToolMiddleware:
      def __init__(self, subgraphs: dict):
          self.subgraphs = subgraphs  # {"chatbi_tool": chatbi_compiled_graph}
      
      async def execute_subgraph_tool(self, tool_call: dict, parent_config: dict) -> ToolMessage:
          tool_name = tool_call["name"]
          subgraph = self.subgraphs[tool_name]
          
          # 1. 提取工具参数构建隔离状态，绝不继承父图全部历史
          subgraph_input = {"messages": [HumanMessage(content=json.dumps(tool_call["args"]))]}
          
          # 2. 独立作用域调用子图
          subgraph_output = await subgraph.ainvoke(subgraph_input, config=parent_config)
          
          # 3. 提取最终结果回写为 ToolMessage
          final_content = subgraph_output["messages"][-1].content
          return ToolMessage(content=final_content, tool_call_id=tool_call["id"])
  ```
- **素材**：`LA/fact-base.md FACT-TOOL-003, FACT-LT-009, DELTA-LT-002`；`LA/recap-blog.md §1.5, §2.8`。

---

### P2-18 MCP 工具体系怎么接？有什么技术债？ ｜ L2 机制
- **30 秒版**：
  平台全面适配了 Anthropic 的 MCP（Model Context Protocol）协议。我们在运行时通过 `ToolManager` 动态解析 MCP Server 提供的 JSON Schema，基于 Pydantic `create_model` 动态构建强类型参数校验模型；针对大模型常输出 JSON 字符串而非原生对象的坏味道，自研了 `_JsonCoercingBaseModel` 实现自动反序列化与修复，并在参数日志层自动执行敏感数据脱敏。当前遗留的技术债在于：MCP 客户端底层缺少主动超时包裹，且每次调用重新建立连接上下文，尚未做连接池复用。
- **深挖版**：
  1. **动态模式生成与反序列化强类型保障**：
     - 大模型生成的工具调用参数常常将复杂列表或对象写成被引号转义的 JSON 字符串（如 `args={'filters': '{"dept": "IT"}'}`）。
     - 我们继承 Pydantic 的 `BaseModel` 实现了 `_JsonCoercingBaseModel`：在字段验证触发前，自动拦截所有需要 `dict/list` 的字段，检测到字符串自动进行 `json.loads` 反序列化，彻底根治了大模型格式瑕疵导致的验证报错 `[LA/fact-base.md FACT-TOOL-001]`。
  2. **安全日志脱敏**：
     - 在调用动态工具前，通过 `_mask_args_for_log` 拦截并过滤敏感参数：所有长字符串只保留前 2 位与后 2 位，中间字符统一脱敏为 `***`，确保线上日志合规 `[LA/fact-base.md FACT-TOOL-002]`。
  3. **诚实复盘技术债（技术真实性）**：
     - **无主动超时拦截**：`MCPClientManager.execute_tool` 虽然接收 `timeout` 参数，但在代码实现中没有通过 `asyncio.wait_for` 对底层 transport 调用进行包裹。如果外部 MCP Server 进程由于死锁或断网无响应，该工具调用可能长时间卡住线程。
     - **无连接池**：目前的实现针对每次工具调用都会重新初始化一次 Transport 与 Client 上下文，调用完毕后即断开，在高频工具调用场景下存在握手延迟开销 `[LA/fact-base.md FACT-TOOL-004]`。
- **走查示例**（场景走查 / 正反对比）：
  以大模型调用天气与公积金网点 MCP 外部工具为例：
  - **格式自愈走查**：模型生成工具入参时将数组误输出为转义字符串：`args={"region_codes": "["410100", "410200"]"}`；标准 Pydantic 校验器会直接抛出类型错误中断；`_JsonCoercingBaseModel` 在字段解析前识别出 JSON 字符串，自动调用 `json.loads` 反序列化为 Python 列表，驱动工具调用成功；日志脱敏器自动把敏感字段转换为 `41***00`；
  - **技术债暴露场景**：若公积金网点 MCP Server 发生底层网络死锁无响应，由于代码中缺少 `asyncio.wait_for` 超时包裹，该工具协程将永久等待，只能依靠 180 秒网关全局超时兜底退出。
  *记住这个例子 = 记住 _JsonCoercingBaseModel 自动修复大模型 JSON 字符串瑕疵，以及缺少 wait_for 的真实技术债。*
- **追问**：
  *面试官追问*：“既然有技术债，线上如果真卡死怎么办？后续怎么修？”
  *应对*：目前我们在平台网关与请求层设置了全局的 HTTP 接口超时（默认 180s）作为大兜底。后续的架构演进规划非常清晰：第一是在 `execute_tool` 内层显式增加 `asyncio.wait_for(client.call_tool(...), timeout)`；第二是引入基于 session 的长连接池机制，对高频 MCP Server 维持长连接保活与健康检查探测。
- **素材**：`LA/fact-base.md FACT-TOOL-001, FACT-TOOL-002, FACT-TOOL-004`；`LA/recap-code/skeleton/mcp_tool_lifecycle.py`。

---

### P2-19 Agentic RAG 作为插件是什么形态？（轻提不深挖） ｜ L1 基础
- **30 秒版**：
  在平台中，Agentic RAG 不是写死在主干上的刚性流程，而是**作为一个通用的外挂工具插件**（`search_knowledge_base`）提供给 Agent 自由决策调用。该插件支持文本知识库与图片知识库的高性能并发检索，经由 RRF（倒数排名融合）算法混合重排；对于命中图片知识库的结果，工具在后台自动换取临时访问 URL 并调用多模态 VL 模型提取图表核心结论；最后将文档切片、图片来源与引用元数据通过 `ToolMessage.artifact` 透传给前端中间件进行高保真溯源渲染。
- **深挖版**：
  1. **并发检索与 RRF 融合**：
     - 插件内部启动异步任务，同时向稠密向量索引和 BM25 稀疏索引发起请求，并支持与图片知识库并发检索。
     - 采用标准 RRF 公式：$\text{score}(d) = \sum_{i} \frac{1}{60 + \text{rank}_i(d)}$，消除不同检索源分值尺度的不一致问题 `[LA/fact-base.md FACT-TOOL-005]`。
  2. **元数据透传管道**：
     - 检索到的原始结果并不全量塞给大模型（避免冲垮上下文）。
     - 工具返回的内容是经过精简提炼的文本切片；而包含文件名、页码、段落 ID 以及图片预览链接的完整元数据，被挂载到 `ToolMessage(artifact={"sources": [...]})`。
     - 外层的 `RagSourceCollector` 中间件在监听到该 ToolMessage 时，将其提炼为 `CUSTOM rag_sources` 事件推给前端，前端据此在界面下方渲染可点击展开的“参考来源”折叠抽屉 `[LA/fact-base.md FACT-TOOL-005; LA/detail-notes/01]`。
- **走查示例**（场景走查）：
  走查示例：承接 P2-07 与 P2-18，重点关注多模态并发检索与来源元数据广播：
  1. 用户提问：“公积金按月提取的办理材料和流程是什么？”；
  2. Agent 自主调用外挂工具 `search_knowledge_base(query="按月提取办理材料流程")`；
  3. 工具并发发起请求：文本知识库召回《公积金提取管理办法》文字条款，图片知识库召回《办事大厅办理流程长图》；
  4. RRF（$k=60$）融合排序后，对图片结果自动申请临时鉴权 URL，送入多模态大模型（VL）解析图中流程框图；
  5. 提炼结果返回给 Agent 继续思考，同时将包含文件标题、页码、段落 ID 与图片缩略图 URL 的完整数据挂载到 `ToolMessage.artifact`；
  6. 中间件提取 artifact 发射 `CUSTOM rag_sources`，前端在回复气泡下方渲染可折叠展开的引用文献抽屉。
  *记住这个例子 = 记住 RAG 工具作为普通插件挂载、双路并发检索与来源元数据经 ToolMessage.artifact 透传的前后端闭环。*
- **追问**：
  *面试官追问*：“为什么不把 RAG 做成 Agent 前置的强制链路，而是作为工具让模型自己调？”
  *应对*：前置强制检索只适合简单的单轮 FAQ 问答。在复杂企业业务中，用户的意图往往需要澄清，或者只需简单打招呼，强制检索不仅浪费算力而且容易引入上下文噪音。作为工具挂载时，模型可以根据对话上下文自主决定“查还是不查”、“查一次不够是否换关键词再查一次”，真正发挥 Agent 的自主规划能力。
- **素材**：`LA/fact-base.md FACT-TOOL-005`；`LA/detail-notes/01`。

---

### P2-20 可靠性细节：客户端断连、任务取消、沙箱命令失败怎么处理？ ｜ L3 深挖
- **30 秒版**：
  面对企业级分布式环境的各种异常，我们设计了三项关键韧性机制：
  1. **客户端断连检测**：外层启动独立异步协程轮询网络断开状态，断连发生时主动向流式生成器注入 `CancelledError`，促使后台任务安全中止；
  2. **取消与死锁规避**：对于中断取消请求，不在 `finally` 块中立即执行同步数据库回滚（避免 SQLite 异步死锁），而是记录延迟回滚字典，待下次会话建立时无死锁回滚；
  3. **沙箱故障自愈**：自研 `ToolErrorGuard` 拦截沙箱命令底层的崩溃异常，包装为带有详细报错信息的标准 ToolMessage，促使大模型自主反思并重试自愈。
- **深挖版**：
  1. **断连感知与生命周期拦截**：
     - 在 Web 流式输出长任务中，用户随时可能关闭浏览器标签页。传统的异步生成器可能会一直后台运行直到整个 Agent 跑完，白白浪费海量 Token。
     - 我们使用 `with_disconnect_watcher` 包装生成器，在独立的 `anyio` 任务中高频轮询 `request.is_disconnected()`。一旦检测到客户端已断开，立即向当前流生成器注入 `CancelledError`，触发全链路的优雅退出 `[LA/fact-base.md FACT-RT-007]`。
  2. **延迟回滚机制（解决 SQLite 死锁）**：
     - 在发生取消或异常中断时，若在当前异步生成器的 `finally` 块中直接调用 Checkpointer 回滚数据库，在 SQLite 底层会导致异步连接池与读写事务的死锁。
     - 解决方案：`agent_service` 在捕获取消异常时，仅在内存中记录 `_pending_rollbacks[thread_id] = target_checkpoint_id`。等到同一客户端下次发起新请求、前置握手建立成功后，再以安全干净的独立事务执行回滚，彻底根除死锁隐患 `[LA/fact-base.md FACT-RT-008]`。
  3. **沙箱底层错误防御（ToolErrorGuard）**：
     - 当沙箱内部执行 Python 代码发生语法错误、内存 OOM 或第三方包缺失时，Daytona SDK 会直接抛出底层的 RPC 异常。
     - 若直接让异常向外冒泡，整个图执行会直接崩溃报 `RUN_ERROR`。`ToolErrorGuard` 捕获该系统异常，将其转换为 `ToolMessage(status="error", content="Command execution failed: ImportError: No module named 'matplotlib'. Consider installing it or using alternative.")`。模型读到该报错后，能自主执行 `bash_command("pip install matplotlib")`，实现工业级的自主容错闭环 `[LA/fact-base.md FACT-LT-007, FACT-LT-008; LA/recap-blog.md §7]`。
- **走查示例**（场景走查）：
  以沙箱内执行脚本报错与客户端中途断连的双重异常自愈为例：
  - **场景 A（沙箱报错模型自愈）**：沙箱执行 Python 脚本清洗公积金数据，报 `No module named 'openpyxl'`；Daytona SDK 抛出底层异常；`ToolErrorGuard` 拦截该异常并包装为 `ToolMessage(status="error", content="ModuleNotFoundError: No module named 'openpyxl'")` 传回大模型；模型读到该工具报错，自主反思生成下一步动作 `bash_command("pip install openpyxl")`，安装后重试成功；
  - **场景 B（取消与延迟回滚）**：用户在长任务执行到一半时关闭网页，`with_disconnect_watcher` 感知连接中断并向协程注入 `CancelledError`；系统在 `finally` 块中只记录 `_pending_rollbacks["thread_101"]`，避免在关闭连接时同步写 SQLite 造成死锁；待用户下次访问该会话时，系统在独立干净的连接中完成回滚。
  *记住这个例子 = 记住 ToolErrorGuard 驱动大模型自主纠错，以及延迟回滚机制如何化解 SQLite 异步死锁。*
- **追问**：
  *面试官追问*：“任务发生不可抗力硬崩溃时，沙箱租约会不会泄漏？”
  *应对*：我们在服务层应用了 `asyncio.shield()` 保护资源释放动作。即使顶层协同任务被 Cancel，释放沙箱租约与通知 Internal API 的代码块也依然会被完整执行完毕，防止外部沙箱资源泄漏卡死。
- **素材**：`LA/fact-base.md FACT-RT-007, FACT-RT-008, FACT-LT-007, FACT-LT-008`；`LA/recap-blog.md §7`。

---

### 锚点 D：动作行 3 ChatBI 与 Agent Teams

### P2-21 固定 DAG 的 NL2SQL 有什么结构性问题？ ｜ L1 基础
- **30 秒版**：
  在主干上线的第一代 ChatBI 中，NL2SQL 是一个严格的**固定 6 节点 DAG 流水线**（`entry` ➔ `query_rewrite` ➔ `sql_generation` ➔ `sql_self_check` ➔ `error_correction`? ➔ `exit`）。在实际业务中暴露了四大结构性死穴：第一，**容错能力极其脆弱**，只有 1 次被动的语法纠错机会，对逻辑错误无能为力；第二，**缺乏列值探测能力（Value Blindness）**，无法预知实际数据的枚举简称；第三，**错误级联放大**，上游改写或选表一旦偏差，下游全盘崩溃；第四，**缺乏意图澄清机制**，遇到模糊提问只能靠大模型强行瞎猜。
- **深挖版**：
  1. **被动纠错与逻辑漏洞（Plausible but wrong）**：
     - 固定 DAG 中的 `sql_self_check` 节点非常简单粗暴：仅仅把生成的 SQL 送入数据库做预编译执行（Dry Run），根据返回的 `code != 0` 判断语法是否有误。
     - 如果 SQL 语法完全合法，但业务逻辑严重偏离（例如把“销售总额”统计成了“销售单数”，或者把“郑州市”过滤条件误拼成了“郑州”），数据库执行返回空集合或错误数字，系统毫无感知，直接走向 `exit` 节点返回给用户 `[LA/detail-notes/05-chatbi-agent-loop.md §1.1; LA/fact-base.md FACT-BI-001]`。
  2. **列值盲区（Value Blindness）导致的毁灭性失败**：
     - 真实用户在提问时习惯使用自然语言别名（例如“查一下技术部的报销”），但在企业数据库底层，该字段真实存储的值是 `"RD_DEPT_001"` 或 `"研发中心-技术部"`。
     - 固定 DAG 没有探索数据的机制，模型只能硬猜字段值，生成的 SQL `WHERE department = '技术部'` 导致查询结果永远为 0 行，这也是早期业务报障率最高的技术根因 `[LA/detail-notes/05-chatbi-agent-loop.md §1.1]`。
- **走查示例**（场景走查）：
  以用户查询“查一下各区县公积金提取额排名”走查固定 6 节点 DAG 的失败过程：
  1. `entry ➔ query_rewrite`：改写模块将自然语言转换为规范短语：“各区县公积金提取金额降序”；
  2. `sql_generation`：模型由于无法探查底层数据库的实际物理值，根据表结构字段盲猜生成了：
     `SELECT county, SUM(amount) FROM extract_log WHERE county = '郑东' GROUP BY county ORDER BY SUM(amount) DESC`；
  3. `sql_self_check`：流水线把该 SQL 送入数据库做语法预编译检验（Dry Run）；由于语法完全合法，数据库执行返回 `code=0`，自检节点判定“通过”；
  4. `exit`：SQL 送入真实查询，由于底层物理枚举存储的是 `'郑东新区'` 而非 `'郑东'`，实际返回数据为 **0 行**！
  5. 固定 DAG 缺乏探测和再生成回路，直接将 0 行结果抛给用户，发生典型的“语法合规但业务完全错误”事故。
  *记住这个例子 = 记住固定 DAG 因列值盲区和语法自检假通过，导致无法处理真实数据别名偏差的致命缺陷。*
- **追问**：
  *面试官追问*：“既然固定 DAG 缺陷这么明显，为什么第一代还要这么做？”
  *应对*：固定 DAG 是典型的早期交付产物：拓扑确定、延迟极低（Happy Path 只需经过 2 次大模型调用），在结构简单、数据规范的测试用例上容易快速出分。但当系统走向真实复杂的政企海量宽表业务时，确定性 DAG 的泛化短板就会迅速暴露，驱动我们启动智能体化的重设计。
- **素材**：`LA/detail-notes/05-chatbi-agent-loop.md §1.1`；`LA/fact-base.md FACT-BI-001, DESIGN-BI-001`。

---

### P2-22 ReAct Agent Loop 版怎么设计？工具有哪些？怎么退出？ ｜ L2 机制
- **30 秒版**：
  针对固定 DAG 的死穴，我们在参考分支中重设计了**三段式 ReAct Agent Loop**（`prepare_context` ➔ `reason_and_act` ⟲ `execute_tools` ➔ `finalize_output`）。我们为模型注入了 4 个闭包工具：`probe_column_values`（探查列真实枚举）、`execute_sql`（带结果自检的试执行）、`submit_final_sql`（完成收敛）与 `submit_clarification`（结构化发起反问）。同时设立了双层退出与兜底机制：设定最大迭代轮次限制（设计 5 / 代码实测 6）防死循环，并在意图严重歧义时将结构化追问回传给主 Agent，子图绝不越权直接打扰用户。
- **深挖版**：
  1. **4 大专用闭包工具契约**：
     - `probe_column_values(table, column, keyword)`：允许模型在生成正式 SQL 前，先根据关键字模糊检索数据库字段下的前 10 个物理值，彻底攻克列值盲区 `[LA/detail-notes/05-chatbi-agent-loop.md §3; LA/fact-base.md FACT-BI-004]`。
     - `execute_sql(sql)`：试运行 SQL 并返回数据样本（截断前 5 行）与元数据。模型可通过真实返回行数自行校验逻辑是否正确。
     - `submit_final_sql(sql, explanation)`：当模型确认逻辑无误时显式调用，直接跳出 ReAct 循环走向终态节点。
     - `submit_clarification(question, options)`：当检测到用户问题存在歧义时调用。
  2. **防死循环与主动收敛机制**：
     - **硬轮次截断**：通过 `DEFAULT_MAX_ITERATIONS = 6` 严格约束单次查询的最大工具调用轮数。若达到第 6 轮仍未收敛，系统强行熔断并降级回退到基线生成，避免陷入无效纠错消耗过多 Token `[LA/fact-base.md FACT-BI-003]`。
     - **子图静音与结构化回传契约**：ChatBI 作为业务子图，**没有直接与终端用户对话的权限**。如果调用 `submit_clarification`，子图将 `{question, options}` 封装进结构化数据信封回传给外层 Orchestrator 主 Agent，由主 Agent 统一决策是否发起 Ask User，保持了用户交互心智的统一 `[LA/detail-notes/05-chatbi-agent-loop.md §4; LA/fact-base.md DESIGN-BI-004]`。
- **走查示例**（场景走查）：
  以同样查询“查一下各区县公积金提取额排名”走查 ReAct Loop 版本的自愈过程：
  1. `轮次 1 (探测)`：模型面对模糊地名，不盲目写最终 SQL，而是调用 `probe_column_values(table="extract_log", column="county", keyword="郑东")`，数据库模糊返回真实枚举值 `['金水区', '中原区', '郑东新区', ...]`；
  2. `轮次 2 (试算)`：模型识别出物理全称为 `'郑东新区'`，生成准确 SQL 并调用 `execute_sql` 进行试运行，返回前 5 行真实统计数据，模型确认数据非空且聚合逻辑合理；
  3. `轮次 3 (收敛)`：模型调用 `submit_final_sql` 提交终态 SQL，ReAct 循环平稳退出；
  4. 补充场景：若用户问“查一下张三的公积金”，探测发现系统存在 3 个同名张三，模型调用 `submit_clarification(question="检测到同名用户，请选择所属部门", options=[...])` 结构化回传给主 Agent 决策。
  *记住这个例子 = 记住 probe 探查列值 ➔ execute 试算自检 ➔ submit 最终提交的三段式 ReAct 自愈全流程。*
- **追问**：
  *面试官追问*：“增加了列值探测和试执行，会不会让响应延迟大幅增加？”
  *应对*：在探索成本与结果正确性之间，企业级 BI 首要看重**正确性**。查得再快，给一个错的数字也是负价值。实测中，由于我们全量内联了 M-Schema，模型通常在第 1 轮探测列值，第 2 轮生成并试运行，第 3 轮即提交收敛，平均只需 2~3 轮迭代。相较于固定 DAG 试错失败后用户反复重问，整体端到端交互效率反而更高。
- **白板（关联 C11）**：
  手写 ChatBI ReAct 核心循环控制图：
  ```python
  # C11: ChatBI 三段式 Agent Loop 状态流转伪码
  def route_chatbi(state: ChatBIState) -> str:
      if state.get("is_finalized") or state.get("clarification_payload"):
          return "finalize_output_node"
      if state.get("loop_count", 0) >= MAX_ITERATIONS:
          return "finalize_fallback_node"
      last_msg = state["messages"][-1]
      if getattr(last_msg, "tool_calls", None):
          return "execute_tools_node"
      return "finalize_output_node"
  ```
- **素材**：`LA/detail-notes/05-chatbi-agent-loop.md §2–§4`；`LA/fact-base.md DESIGN-BI-003, FACT-BI-003, FACT-BI-004`。

---

### P2-23 M-Schema 是什么？为什么全量内联而否定动态选表？ ｜ L2 机制
- **30 秒版**：
  **M-Schema 是我们定义的一套兼顾丰富元数据与 Token 效率的半结构化表表达规范**。在早期方案中，我们曾考虑让模型先调用一个 `get_table_schema` 工具去动态挑选表，但经过对真实业务数据的严格评估，我们**果断推翻了动态选表方案，确立了全量 M-Schema 内联 System Prompt 的设计**。因为在企业单技能场景下，关联的业务表通常只有 3~4 张（总计约 2000~4000 Tokens），在当前大模型长窗口下完全可忽略；全量内联直接省去了 1 轮往返网络延迟，并且彻底根除了第一步选错表引发的级联灾难。
- **深挖版**：
  1. **M-Schema 的结构设计**：
     - 纯 DDL 往往包含大量引擎特定语法与索引干扰，而简化的表名列表又缺失关键上下文。
     - M-Schema 采用类似 YAML 的紧凑语义格式，格式化输出：表名、中文注释、核心物理列名、数据类型、主外键关联关系以及枚举列的常用前 3 个样本值。这为模型提供了充足但无冗余的推理先验 `[LA/fact-base.md DESIGN-BI-003]`。
  2. **否定动态选表工具的决策链（DELTA-BI-001）**：
     - *初期设想（DESIGN-BI-002）*：设计 5 工具架构，包含 `get_table_schema`，让模型先检索元数据再取数。
     - *否定理由（DELTA-BI-001）*：
       1. **时延开销**：多一次工具调用意味着至少增加了一次完整的 LLM 推理与 HTTP 往返（RTT），增加 2~4 秒的等待时间。
       2. **级联雪崩风险**：如果第一步动态选表模型发生幻觉挑错了表，后续的所有列值探测与 SQL 生成完全是在错误的方向上徒劳挣扎，整体成功率大幅断崖。
       3. **成本效益分析**：单业务技能关联的表数量极为收敛（3~4 张或 1 张大宽表），2000~4000 Token 占当前 32k/128k 窗口不足 5%，换取 100% 稳定的 Schema 可见性是极划算的工程权衡 `[LA/detail-notes/05 §1.2; LA/fact-base.md DELTA-BI-001]`。
- **走查示例**（数字演算 + 正反对比）：
  以某公积金贷款查询技能（绑定 3 张表：`user_info`, `loan_contract`, `repay_plan`，共计 42 个字段）为例：
  - **M-Schema 体积演算**：将表名、列名、注释、主外键关联及枚举样例压缩为半结构化文本，计算总 Token 仅为 **2400 Tokens**（在主流 32k/128k 窗口中占比不足 3%）；
  - **动态选表（反例）**：强制大模型第一轮先调用 `get_table_schema`，额外产生 1 轮 LLM 推理和网络往返，端到端延迟拉长 **2~3 秒**；更严重的是，一旦大模型初次选表发生幻觉遗漏了 `repay_plan` 表，后续无论怎么重试都无法查出还款计划，产生不可逆的级联失败；
  - **全量内联（正例）**：2400 Tokens 直接内联灌入 System Prompt，零网络往返延迟，大模型一开始就掌握全局数据关系，彻底杜绝选表偏差。
  *记住这个例子 = 记住 3~4 张表 2400 Tokens 全量内联消除选表级联错误并节省 2~3 秒网络延迟的算力账。*
- **追问**：
  *面试官追问*：“如果未来一个 Agent 接入了上百张大宽表，全量内联撑不住怎么办？”
  *应对*：架构设计必须尊重场景边界。对于 3~5 张表的局部技能，全量内联是绝对的最优解；如果未来扩展到跨部门全域数仓的上百张表，我们规划的技术路径是：**前置离线两阶段向量检索粗筛（Top-K 候选表） ➔ 选出 3~5 张候选表后再以 M-Schema 全量内联给 ReAct Agent**，依然坚决不在 Agent 循环内部做脆弱的运行时动态选表。
- **素材**：`LA/fact-base.md DESIGN-BI-002, DESIGN-BI-003, DELTA-BI-001`；`LA/detail-notes/05-chatbi-agent-loop.md §1.2`。

---

### P2-24 ChatBI 工程细节：为什么绕过 BaseTool.ainvoke？数据怎么回给主 Agent？ ｜ L3 深挖
- **30 秒版**：
  在底层工程实现中，我们故意**绕过了 LangChain 标准的 `BaseTool.ainvoke` 机制**，改用原生闭包函数执行并手动组装 `ToolMessage`。这是为了彻底根治 LangChain 内置 Runnable 会自动挂载全局 Callbacks 的问题——这会导致子图内部高频琐碎的中间事件向外层冒泡，冲垮外层 AG-UI 的流式适配器。在数据回传层面，我们设计了 `DataEnvelope` 数据信封，按 20 行阈值进行完整性分流，并支持内联展示与前端分页拉取的双通道分发。
- **深挖版**：
  1. **绕过 BaseTool 的深层根因**：
     - LangChain 提供的 `@tool` 或 `BaseTool` 在调用 `ainvoke` 时，底层强行注入了丰富的 RunnableTracer 与系统 Callback 链。
     - 在 Subgraph 嵌套执行时，这些隐式 Callback 会将子图内部私有的工具执行参数与中间状态，无差别地当作外层图事件派发到 AG-UI 流式管道中。外层前端解析器无法识别子图未注册的内部事件，直接抛出反序列化异常导致连接中断崩溃。
     - **解法**：在子图工厂中，直接把工具实现为纯 Python 异步闭包，执行完后直接实例化为 `ToolMessage(content=..., tool_call_id=...)`，并通过配置 metadata 显式抑制内部事件向外层冒泡 `[LA/detail-notes/05-chatbi-agent-loop.md §5; LA/fact-base.md FACT-BI-002]`。
  2. **DataEnvelope 完整性分流与可视化对接（DELTA-BI-003）**：
     - 查询到的真实数据由 `DataEnvelope` 承载，避免数据格式混乱。
     - **完整性判定标准**：虽然代码中保留了历史的 200 常量，但实际业务信封严格按 `MAX_RETURN_ROWS = 20` 进行切割判断 `[LA/fact-base.md FACT-BI-006]`。
     - **双通道分发**：
       - 数据 $\le 20$ 行：打标 `dataset_strategy: inline_complete`，全量数据内联塞入信封直接下发，下游前端图表组件秒级直接渲染。
       - 数据 $> 20$ 行：打标 `dataset_strategy: client_fetch`，信封内仅保留前 20 行预览及查询 Session ID，指示前端图表组件按需发起分页请求拉取全量，保护 SSE 流式传输带宽 `[LA/fact-base.md FACT-BI-006; DELTA-BI-003]`。
- **走查示例**（场景走查 / 正反对比）：
  以 ChatBI 子图内部执行及数据返回主图为例：
  - **绕过 BaseTool 走查**：若使用 LangChain 标准 `@tool`，子图内的 `probe_column_values` 工具每次执行都会向全局根 Logger 派发 `on_tool_start` 事件；外层 AG-UI 前端适配器收到该未定义内部事件后无法解析，直接抛出反序列化错误导致前端页面崩溃；改用原生异步闭包并手动配置 metadata 后，内部工具事件被严格拦截在子图私有域中；
  - **20 行阈值分流走查**：
    - 查询 A（查郑东新区网点）：返回 12 行（$\le 20$ 行），`DataEnvelope` 打标 `dataset_strategy: inline_complete`，表格明细全量内联随 SSE 下发，前端秒级渲染图表；
    - 查询 B（查全市提取流水）：返回 8000 行（$> 20$ 行），信封仅下发前 20 行预览与查询会话 ID，打标 `dataset_strategy: client_fetch`，指示前端图表组件通过专用 HTTP 分页拉取，保护流式通道带宽。
  *记住这个例子 = 记住闭包隔离防止中间事件冲垮前端，以及 20 行阈值划分内联/分页的数据下发机制。*
- **追问**：
  *面试官追问*：“这个 20 行阈值是前端决定的还是后端决定的？”
  *应对*：是算法端与前端共同协商的接口协议标准。经过真实网络环境测试，SSE 长连接传输单包超过几十 KB 的大 JSON 时容易引发客户端渲染卡顿甚至掉帧，因此我们把 20 行作为流式内联的性能红线，大数据量一律走标准 HTTP 分页通道。
- **素材**：`LA/detail-notes/05-chatbi-agent-loop.md §5`；`LA/fact-base.md FACT-BI-002, FACT-BI-004, FACT-BI-006, DELTA-BI-003`。

---

### P2-25 ChatBI ReAct 版上线了吗？ ｜ L2 机制
- **30 秒版**：
  **没有上线，我们必须保持严谨的技术诚实**。当前 `develop` 主线基线中运行的依然是固定 6 节点 DAG 版本；而具备列值探测与自检能力的 ReAct Agent Loop 版本是在**独立的参考分支（`langagent-chatbi-agent-loop-reference`）上完成了全套原型架构设计与代码编写**，由于业务排期与测试覆盖原因，当时尚未合入主干，也没有编写主干配套单元测试。因此在简历上我的动词严格写的是 **“重设计”**，绝不写“已上线”或“性能带来 X% 提升”。
- **深挖版**：
  1. **代码基线真实状态对照**：
     - 主线代码：`.scratch/langagent-develop-reference` 下的 `src/agent/graph/subgraphs/chatbi/graph.py`，清晰展示了包含 6 个节点的固定流水线 `[LA/fact-base.md FACT-BI-001]`。
     - 参考分支：`.scratch/langagent-chatbi-agent-loop-reference` 下的 `chatbi_agent_graph.py`，完整实现了包含 4 个闭包工具的三段式循环 `[LA/fact-base.md FACT-BI-003]`。
  2. **为什么没有合入主干（背后的工程权衡）**：
     - 并非方案不行，而是业务阶段取舍：当时固定 DAG 已经在简单的特定政企报表业务上平稳跑通，业务方更迫切需要交付长任务与多模态 RAG；而 ReAct 版本引入了多次动态 LLM 调用，需要数据库连接池具备更高并发支撑能力，并要求重构完整的端到端自动化测试回归套件。因此我们先确立了该架构设计作为升级参考分支，等待二期业务扩展时再合流。
- **走查示例**（走查示例）：
  走查示例：承接 P2-21 与 P2-22，重点关注主线与参考分支的代码状态：
  - 当面试官追问：“你们 ReAct 版上线后准确率提升了多少？”
  - **严守事实口径**：“面试官您问到了关键点。必须向您实事求是说明：线上跑的依然是 P2-21 的固定 DAG 版本；P2-22 的 ReAct 代码保存在我们的独立参考分支 `.scratch/langagent-chatbi-agent-loop-reference` 中，已经通过原型验证，但没有合入 `develop` 主干，也没有线上数据提升。当时由于公积金业务更急迫需要交付长任务与多模态 RAG，团队权衡后暂缓了主线合并。因此我在简历上用词严格是‘重设计’，绝不说‘已上线’。”
  *记住这个例子 = 记住主干运行固定 DAG、参考分支保留 ReAct 原型且未上线的真实边界口径。*
- **追问**：
  *面试官追问*：“如果现在让你把这个参考分支合入主干推上线，你需要补充做哪些工作？”
  *应对*：非常明确，需要补齐三项工程防线：第一是针对 4 个闭包工具编写覆盖率 $\ge 90\%$ 的严密单元测试与 Mock 沙箱测试；第二是建立基于真实历史慢 SQL 的 Benchmark 评测集，评估 ReAct 循环相较于固定 DAG 的准确率收益与 Token 成本增幅；第三是对只读数据库连接池配置精细的超时熔断与 QPS 准入隔离，防止多并发探测拖垮业务主库。
- **素材**：`LA/fact-base.md DELTA-BI-002, FACT-BI-003, FACT-BI-004`；`LA/detail-notes/05` 文档头。

---

### P2-26 Orchestrator-Worker 是什么？为什么否定自由 handoff 与黑盒调度？ ｜ L1 基础
- **30 秒版**：
  **Orchestrator-Worker 是我们在平台多智能体演进中确立的中心化主控协作架构**。其核心理念是 **“单一面向用户主控心智”**：用户在会话中永远只与 Orchestrator 一个人交流；背后的多个专长智能体以 Worker 模式运行，在能力层物理禁用 Ask User 工具，仅向主控汇报。我们**坚决否定了去中心化的自由 handoff（互相交接）与多智能体黑盒调度**，因为自由交接会导致用户不知道在跟谁说话、执行轨迹发散、上下文相互污染且根本无法进行工业级审计。我们将任务分派显式工具化，每一次委派都是一个可追踪的工具调用。
- **深挖版**：
  1. **否定自由 handoff 的架构推导（D3 卡核心）**：
     - 在 AutoGen 或部分学术开源框架中，经常采用多个 Agent 自由对话或互相交接权限（Handoff）的机制。
     - 这在企业中会引发灾难性后果：第一是**责任不可追溯**，A 推给 B，B 又推给 C，最终出错无法定责；第二是**上下文污染**，每个 Agent 把自己的私有思考塞进全局流，Token 迅速爆炸；第三是**人机心智断层**，不同 Agent 突然冒出来向用户提问，交互体验极度混乱 `[LA/detail-notes/07 §1]`。
  2. **分派工具化与 Worker 纯净性**：
     - 我们把子任务的分派彻底**封装为 Orchestrator 的显式结构化工具调用**（如 `delegate_and_wait`、`delegate_in_background` 等）。
     - **Worker 严格约束**：Teammate 被实例化为 Worker 时，运行时在工具注册层**物理剔除 `ask_user`**，绝不能跳过主控直接打扰用户；Worker 只能消费主控下发的结构化 Assignment，并在执行完毕后返回纯文本总结与结构化数据 `[LA/fact-base.md DESIGN-TM-002; LA/detail-notes/07 §1.2]`。
- **走查示例**（场景走查 / 正反对比）：
  以市民办理“跨省公积金异地转移并开具证明”的多智能体协作为例：
  - **反例（去中心化自由 Handoff）**：政策咨询 Agent 查完文件，私自将控制权交接给打证明 Agent；打证明 Agent 突然插话向用户提问：“请提供原缴存地公积金中心编号”；用户困惑“刚才不是还在咨询吗，怎么换人了？”；中途发生错误时，两个 Agent 互相推脱，执行审计链路彻底断裂；
  - **正例（Orchestrator-Worker 协调模式）**：用户从始至终只看到唯一的 Orchestrator 主控。主控先后调用两个显式分派工具：先调用 `delegate_and_wait(member="policy_agent")` 获取政策条件，再调用 `delegate_and_wait(member="cert_agent")` 生成证明文书；底层 Worker 角色在能力层物理禁用 Ask User，遇到参数缺失只能向主控请示，由主控统一向用户追问。
  *记住这个例子 = 记住单一主控心智如何彻底终结多智能体“争抢向用户发言”的交互失控乱象。*
- **追问**：
  *面试官追问*：“用户完全看不到 Worker 的工作细节吗？会不会显得很黑盒？”
  *应对*：不会。我们设计了**三层独立事件流**：主交互流只展示 Orchestrator 的回答；前端右侧栏提供常驻的 Team 状态面板与 Teammate 详情卡片，用户可以实时看到某个 Worker 正在执行哪一步、调用了什么工具，但该视图是**完全只读的**，用户无法直接向 Worker 输入或干预，兼顾了高透明度与整洁的交互心智。
- **素材**：`LA/detail-notes/07-agent-teams-orchestrator-tools.md §1–§2`；`LA/fact-base.md DESIGN-TM-002`；决策卡 D3。

---

### P2-27 deepagents 原生 tasks 机制哪里不够？ ｜ L2 机制
- **30 秒版**：
  我们使用的基线版本 `deepagents 0.6.12` 内置了一套 `async_subagents` 机制，支持通过 `task` 工具派发异步任务。但在深度评估后，我们发现它完全无法满足企业级生产要求：第一，**每次派发都无脑创建全新的临时线程**，不仅开销巨大而且丢失了跨轮次会话记忆；第二，**缺乏会话级并发准入控制**，极易瞬间打爆底层算力；第三，**暴露了底层裸露的 `task_id`**，缺乏业务语义；第四，**缺少独立的实时事件流**。因此我们在架构设计中彻底推翻了它，重构为具备持久线程、3 槽位准入与高层委派工具的显式架构。
- **深挖版**：
  1. **原生框架缺陷对比清单（DELTA-TM-001）**：
     - *线程模型断层*：原生机制下每次执行 `start_async_task`，都会生成一个完全随机的 `new_thread_id`，子代理执行完后线程直接废弃。当主代理需要向同一个专长角色发起追问或补充指令时，子代理无法复用上一次的上下文与沙箱工作区。
     - *并发准入裸奔*：框架层没有任何槽位控制，如果模型陷入发散连续调用 10 次 task，系统将并发起 10 个子代理执行，直接打爆后端 LLM QPS 与数据库连接。
     - *事件流丢失*：原生机制将后台任务结果保存在内存字典中，外部无法订阅 Worker 运行时的细粒度流式进度 `[LA/fact-base.md DELTA-TM-001]`。
  2. **平台重构替代方案（CompiledGraph 显式编排）**：
     - **一成员一持久线程**：确立了稳定映射契约 `teammate_thread_id = hash(team_thread_id + member_agent_id)`。同一个团队会话中，每个成员在其整个生命周期内只绑定唯一持久线程，后续的所有 Follow-up 与 Redirect 均复用该线程与沙箱 `[LA/fact-base.md DESIGN-TM-003]`。
     - **持久化 3 槽位调度器**：由独立服务管理 3 个并发活跃槽位，超出限制自动进入 FIFO 队列排队，明确否定脆弱的进程内信号量方案 `[LA/fact-base.md DESIGN-TM-004]`。
- **走查示例**（场景走查 / 正反对比）：
  以主控需要数据分析专员对同一批流水进行两轮递进计算为例：
  - **反例（deepagents 原生 tasks 机制）**：主控调用 `start_async_task(worker="analyst", task="计算总提取额")`，框架随机生成 `thread_111`，专员读取 20MB 数据算出总额并销毁；主控追问 `start_async_task(worker="analyst", task="把其中大于 10 万的明细列出来")`，框架又随机生成全新 `thread_222`，专员丢失前一轮全部状态，不得不再次重新下载 20MB 数据；同时连续发起 5 个任务瞬间导致沙箱容器打爆；
  - **正例（自研 CompiledGraph 编排方案）**：系统通过 `hash("team_thread_01" + "analyst")` 生成唯一的持久线程 `teammate_thread_analyst`；无论发起多少次追问，专员在同一个线程和同一沙箱内工作，数据无需重复读取；同时持久调度器严格保证 3 槽位硬限制，多余任务在 FIFO 队列有序排队。
  *记住这个例子 = 记住一成员一持久线程如何攻克原生 tasks 每次重建临时线程导致的上下文丢失死穴。*
- **追问**：
  *面试官追问*：“为什么要把并发限制定死为 3 个槽位？”
  *应对*：这是基于企业私有化硬件预算与人机认知负荷的双重权衡。在前端展示上，用户在右侧栏同时关注 3 个工人的进度已经是认知极限；在算力上，3 个 Worker 加上主控意味着最多 4 条流并发推理，刚好能被单台 8 卡或私有部署节点的吞吐安全消化，避免触发限流降级。
- **素材**：`LA/fact-base.md DELTA-TM-001, DESIGN-TM-003, DESIGN-TM-004`；`LA/detail-notes/07 §5`。

---

### P2-28 Agent Teams 细节：并发、超时、断连、权限（口头弹药） ｜ L3 深挖
- **30 秒版**：
  Agent Teams 的架构设计极其详尽，沉淀为 Master PRD 与 6 项 ADR：
  1. **并发与队列**：3 个活跃槽位硬限制，排队队列上限 5 条，支持 `interrupt_and_redirect` 抢占清空；
  2. **双层超时契约**：同步委派默认 5 分钟软等待（最多追加 3 次），到期仅解除阻塞不杀任务；Assignment 硬运行上限 2 小时；
  3. **生命周期与幂等**：利用 Dispatch Outbox 保证网络断连下的派发幂等，结合 Lease/Heartbeat 恢复僵尸任务；
  4. **权限继承**：Team 复用已有 Agent 的权限模型，全程透传用户组织上下文。
  口径上明确说明：这是已完成评审的 **`design_complete` 方案**，作为演进蓝图待实施。
- **深挖版**：
  1. **双层超时与优雅取消模型**：
     - *同步软等待*：`delegate_and_wait` 默认给 5 分钟超时窗口。若到期任务未完成，系统不会粗暴判定失败，而是唤醒 Orchestrator 并返回 `status: pending_timeout`，由主控自主决定是继续调用 `wait` 追加等待，还是先转入后台并向用户做进度汇报 `[LA/fact-base.md DESIGN-TM-006]`。
     - *硬运行上限*：单个 Assignment 硬超时设为 2 小时，防恶意无限循环。
     - *优雅取消宽限期*：当用户在界面点击删除整个团队会话时，建立隔离 Fence 拒绝新任务接入，并赋予在途任务 30 秒的优雅退出宽限期，随后强制销毁沙箱并清理 Checkpoint `[LA/fact-base.md DESIGN-TM-006, DESIGN-TM-010]`。
  2. **权限与数据安全透传（ADR 0005）**：
     - 拒绝在 Team 资产层创建任何“上帝权限”或专属凭证。
     - Team 严格复用底层 Agent 的权限体系。主控在委派任务给 Worker 时，发起请求的用户 ID、租户 ID 与组织部门上下文全程在信封中强制向下透传；底层 Worker 执行数据库查询或工具调用时，一律受调用方当前员工的实际数据权限控制，杜绝权限提升漏洞 `[LA/fact-base.md DESIGN-TM-009]`。
- **走查示例**（场景走查）：
  以多智能体高并发运行下的调度全流程走查核心参数与契约：
  1. **槽位准入**：团队中已有 3 个专员正在全力执行任务（3 个并发槽位满载）；主控再次发起委派，`TeamAssignmentScheduler` 将该任务放入容量为 5 条的 FIFO 队列中排队等待；
  2. **软等待与超时**：主控调用 `delegate_and_wait`，计时达到 5 分钟软超时（300s）时专员未完成；系统不粗暴判定失败，而是唤醒主控返回 `pending_soft_timeout`，主控自主决定向用户播报“任务正在深度运算，您可以先去办理其他业务”；
  3. **硬上限与断连恢复**：若任务因代码死锁运行达到 2 小时硬上限，系统强行终止任务并释放槽位；若网络异常中断，系统依靠 Dispatch Outbox 幂等键与 Lease 租约机制，在服务重启后安全对账恢复；
  4. **会话删除**：用户在 Web 端删除团队会话，触发 30 秒优雅退出宽限期，在途任务安全收尾后销毁沙箱。
  *记住这个例子 = 记住 3 槽位 + 5 条队列 + 5 分钟软等待 / 2 小时硬上限 / 30 秒优雅宽限期的完整数字链。*
- **追问**：
  *面试官追问*：“既然设计这么完善，为什么当时没有立即动手写代码实施？”
  *应对*：这体现了我们团队对工程优先级的克制把控。在当时的时间节点，我们完成了 Slice 1（资产 CRUD 与发布中心管理需求）的切片评审，但业务侧最核心的诉求依然是深耕单 Agent 在特定公积金业务与长任务中的准确率突破（也就是我后来全力投入的项目一）。将多 Agent 停留在高成熟度设计阶段，避免了过早引入系统复杂度与沉没成本。
- **白板（关联 C14）**：
  手写具备槽位限制与持久线程映射的 Orchestrator 分派工具结构：
  ```python
  # C14: Orchestrator 分派工具与持久线程调度伪码
  class OrchestratorDelegationTools:
      def __init__(self, team_thread_id: str, scheduler):
          self.team_thread_id = team_thread_id
          self.scheduler = scheduler
      
      async def delegate_and_wait(self, member_agent_id: str, instruction: str, timeout_sec: int = 300) -> dict:
          # 1. 映射持久 Teammate 线程
          teammate_thread_id = f"tm_{hash(self.team_thread_id + member_agent_id)}"
          
          # 2. 申请 3 槽位准入 (Outbox 事务边界内)
          assignment_id = await self.scheduler.submit_assignment(
              team_thread_id=self.team_thread_id,
              teammate_thread_id=teammate_thread_id,
              instruction=instruction
          )
          
          # 3. 软等待机制：等待结果或 5 分钟超时转交主控
          result = await self.scheduler.wait_result(assignment_id, timeout=timeout_sec)
          return result or {"status": "pending_soft_timeout", "assignment_id": assignment_id}
  ```
- **素材**：`LA/fact-base.md DESIGN-TM-001~011`；`LA/detail-notes/07` 全文；`recap-code/skeleton/workflow_agent_teams.py`。

---

### P2-29 三种编排范式（单 Agent / Workflow / Agent Teams）怎么选？ ｜ L2 机制
- **30 秒版**：
  在平台架构设计中，这三者绝非非此即彼的替代关系，而是**针对不同业务确定性维度的分层协同**：
  1. **Workflow（工作流/DAG）**：面向**高确定性、强合规的固定流程**（如固定审批、流水线清洗、特定结构报表），零幻觉、延迟极低；
  2. **单 Agent（ReAct / 工具调用）**：面向**局部开放式的灵活探索**（如单领域取数、代码编写、交互式问答），由模型自主规划工具；
  3. **Agent Teams（多智能体团队）**：面向**跨领域、多角色、需要长程分工的大型综合任务**。
  目前平台主干运行以单 Agent 和子图为主，Workflow 处于调研建议阶段（`proposed`），Agent Teams 处于设计完成阶段。
- **深挖版**：
  1. **选型决策象限矩阵**：
     - **维度一：任务确定性 vs 探索性**。如果每一步输入输出类型完全确定，坚决写成 Workflow 节点，绝不浪费大模型推理成本；若需要根据中间结果动态调整路径，选单 Agent。
     - **维度二：上下文复杂度与领域跨度**。如果任务需要精通数据库的 DBA、精通文案的分析师以及合规审核员协同，单 Agent 的上下文窗口会发生严重的注意力稀释，此时必须升级为多 Agent 团队协作 `[LA/recap-blog.md §6.1–6.2]`。
  2. **演进边界与事实口径**：
     - 在平台技术演进调研中，我们曾分析过基于 Dify Sandbox 执行 Python Code Node 的 Workflow 路线，但该结论属于探索性调研建议（`DESIGN-WF-001`），并未立项为正式生产 PRD；
     - 面试中主动交代：单 Agent 架构是目前平台最坚固的主线，通过 Subgraph-as-a-Tool 能够把确定性的图结构（如 ChatBI DAG）挂载进单 Agent 中，形成了当前阶段最实用的生产力组合 `[LA/fact-base.md DESIGN-WF-001, DESIGN-WF-002]`。
- **走查示例**（场景走查）：
  以政企公积金平台面对的三大典型业务形态走查选型匹配：
  1. **业务 1（退休提取自动审核）**：政策规则死板（满退休年龄、账户封存、无未结清贷款），要求 100% 规则合规与零幻觉 ➔ **坚决选 Workflow（确定性图拓扑）**，绝不浪费大模型推理 Token；
  2. **业务 2（领导驾驶舱灵活取数）**：用户口语化提问“看看近几年哪个区提取最多”，需要列值模糊探测与结果自检 ➔ **选 单 Agent（ChatBI ReAct Loop）**；
  3. **业务 3（公积金资金流动性年度审计报告）**：需要数仓专家查库、法规专家审核合规、文字专员排版导出 ➔ **选 Agent Teams（Orchestrator-Worker 团队多智能体）**。
  *记住这个例子 = 记住确定性审批走 Workflow、单领域探索走单 Agent、跨领域协作走 Teams 的分层选型依据。*
- **追问**：
  *面试官追问*：“当前业界很多公司都在狂推 Multi-Agent，你怎么看这个趋势？”
  *应对*：多智能体概念非常火，但在工程落地中必须极度克制。很多场景下用 Multi-Agent 往往是因为单 Agent 能力调优没做到位（如上下文管理混乱、Prompt 冗长）。多智能体引入的网络开销、状态同步延迟和调试复杂度呈指数级上升。**“能用一个强 Agent + 工具解决的问题，绝不用多 Agent；能用确定性 Workflow 固化的逻辑，绝不用 Agent”**，这是我们在多次演进踩坑中总结出的第一原则。
- **素材**：`LA/recap-blog.md §6.1–6.2, §8 Q7`；`LA/fact-base.md DESIGN-WF-001, DESIGN-WF-002`。

---

### P2-30 平台上的业务 Agent 能否用项目一的方法训练？两项目怎么打通？ ｜ L2 机制
- **30 秒版**：
  这两个项目在架构上存在着天然的**互补与演进纽带**：项目二打造的平台运行时与 Daytona 沙箱，恰好为项目一提供了**高保真的 Rollout 采样环境、工具调用抽象与多轮交互轨迹沉淀底座**。然而两者的关键差距在于：项目一的强化学习（Agentic RL）依赖于**确定性的环境重置能力、低延迟的可程序化 Reward（如数据库终态对比）以及冻结的高保真模拟器**；而平台上的真实企业任务涉及复杂的外部未解耦系统与非确定性人类反馈。目前我们在工程上两条线独立演进，未来的打通路径是利用平台沉淀的合规轨迹冷启动 SFT，再在沙箱内完成环境形式化以开展 RL。
- **深挖版**：
  1. **跨项目协同的天然优势**：
     - 项目一在设计任务型 Agent 后训练系统时，直接吸纳了项目二在沙箱隔离、统一消息契约、工具错误保护（ToolErrorGuard）等领域沉淀的运行时设计思想。
     - 平台生成的标准 AG-UI 轨迹数据，为项目一构建 Teacher 合成数据筛选提供了最贴近真实用户行为模式的样本分布。
  2. **阻碍全面打通的核心鸿沟与工程挑战**：
     - **环境可验证性（Verifiability）鸿沟**：项目一能够落地长程 GRPO 的核心前提，是公积金业务被高度收敛为了离线可程序化的沙箱与 SQLite Golden State 终态；而平台上的业务 Agent（如多模态文档问答、自由数据探索）的输出是自由度极高的开放式文本，缺乏轻量级确定性评判标准（Rule-based Reward），强行用 LLM-as-a-Judge 容易引发严重的 Reward Hacking。
     - **执行吞吐瓶颈**：强化学习需要成千上万次的高并发快速 Rollout（每秒上千 Token）；而项目二的长任务沙箱启动耗时在秒级，且依赖真实外部网络调用，无法直接接入密集的反向传播训练闭环。
  3. **演进路径规划**：
     - 第一步：平台业务 Agent 积累高质量日志 ➔ 经过分层验证漏斗清洗 ➔ 提取优秀轨迹作为项目一后训练的 Cold-Start SFT 数据。
     - 第二步：挑选具备强约束的平台子图（如 ChatBI NL2SQL），将其环境抽象为受控沙箱与固定 Schema，定义程序化奖励函数（执行正确性 + 效率惩罚），复制项目一的后训练闭环实现特定业务智能体的自进化。
- **走查示例**（场景走查）：
  以尝试将 ChatBI NL2SQL 子图接入项目一的强化学习（RL）训练闭环为例走查跨项目打通：
  1. **环境形式化**：由于项目二的 Daytona 容器沙箱启动慢（秒级），无法承受 RL 的高频 Rollout，因此必须把沙箱运行环境轻量化，形式化为一个内存中的 SQLite 测试库；
  2. **奖励函数（Reward）设计**：借鉴项目一的终态比对哲学，绝对不看生成的 SQL 字符串与标注长得像不像，而是直接执行 SQL，比对返回的数据矩阵是否与 Golden Result 逐行逐列一致（一致给 1.0，否则 0）；
  3. **违规与效率约束**：单轮循环每多调用一次 `probe_column_values` 扣减 0.05 效率分，若达到 6 轮上限仍未收敛或 SQL 语法报错直接判定 Hard Violation 给 0 分；
  4. **现状诚实定界**：两套系统目前处于工程独立状态，平台沉淀的合规问答日志可作为项目一 SFT 冷启动数据，但真正的端到端联合训练仍是未来演进方向。
  *记住这个例子 = 记住沙箱轻量化与数据库执行终态矩阵比对是平台 Agent 接入 RL 后训练的核心桥梁。*
- **追问**：
  *面试官追问*：“如果让你给 ChatBI ReAct 做 RL 训练，你的 Reward 会怎么设计？”
  *应对*：直接复用项目一的“终态验证”哲学：第一，绝对不靠看 SQL 像不像来打分，而是将生成的 SQL 送入测试沙箱数据库执行，比对真实返回的数据矩阵是否与 Golden Result 逐格一致（状态分）；第二，引入效率惩罚项（每调用一次 `probe_column_values` 或试执行扣减极小常数），促使模型学会精简高效地探索；第三，一旦发生语法报错或死循环超限，给予硬截断零分，防止模型投机。
- **素材**：跨项目自拟推演；结合 `01-p1-agentic-rl.md`、`DEC` P5/P6 核心脉络。

---

## D. 口头弹药数字表

> **使用纪律**：本表中的具体数字、架构参数和特定常量，**绝不写入简历正文**；仅在面试官针对特定机制深挖追问时，作为证明本人具备一手工程实操经验的“口头弹药”精准释放。

| 模块类别 | 核心机制 / 参数名 | 精确数值 / 架构常量 | 背后技术事实与业务出处 |
|---|---|---|---|
| **图编译缓存** | `AgentRegistry` LRU 容量 | **128** | 进程内 `OrderedDict` 最大编译图实例上限，按 MD5 哈希淘汰 `[LA/fact-base.md FACT-RT-002]` |
| **沙箱治理** | Daytona 线程池大小 | **16 workers** | `ThreadPoolExecutor` 隔离调度 Daytona SDK 同步阻塞调用 `[LA/fact-base.md FACT-LT-002]` |
| **沙箱超时** | 创建沙箱超时阈值 | **240 秒** | `create_workspace` 显式超时上限 `[LA/fact-base.md FACT-LT-002]` |
| **沙箱超时** | 启停沙箱超时阈值 | **60 秒** | `resume/start` 与 `suspend/stop` 显式超时上限 `[LA/fact-base.md FACT-LT-002]` |
| **沙箱超时** | 命令执行默认超时 | **1800 秒** (30min) | 沙箱内脚本命令执行兜底超时，防死锁跑崩 `[LA/fact-base.md FACT-LT-002]` |
| **沙箱治理** | 生产空闲回收 TTL | **10 分钟** | 后端 Nacos 动态配置的 Workspace 空闲回收等待时间 `[LA/fact-base.md ORAL-T08-LT-002]` |
| **产物与技能** | 技能压缩包体积上限 | **50 MB** | `SkillImportService` 防恶意解压与 Zip Bomb 的体积防御线 `[LA/fact-base.md FACT-SKL-005]` |
| **上下文压缩** | 触发压缩上下文阈值 | **70%** (0.7) | 上下文 Token 占用达 70% 自动触发压缩中间件 `[LA/fact-base.md FACT-CMP-001]` |
| **上下文压缩** | 压缩后保留上下文比例 | **25%** (0.25) | 压缩保留最近 25% 消息，且至少保留 6 条 `[LA/fact-base.md FACT-CMP-001]` |
| **HITL 规范** | 单次 Ask User 题目数 | **1 至 4 题** | 最小交互契约，禁止大批量表单轰炸用户 `[LA/fact-base.md DESIGN-ASK-001]` |
| **HITL 规范** | 每题候选选项数 | **2 至 4 个** | 结构化选择题边界，禁止过多长选项 `[LA/fact-base.md DESIGN-ASK-001]` |
| **HITL 规范** | 单行补充输入字数上限 | **500 字符** | Other 选项开放文本长度硬约束 `[LA/fact-base.md DESIGN-ASK-001]` |
| **ChatBI** | 单技能绑定表数量 | **3 至 4 张** | 否定动态选表、确立 M-Schema 全量内联的业务事实 `[LA/fact-base.md DESIGN-BI-003]` |
| **ChatBI** | 全量 M-Schema Token 占用 | **2000 ~ 4000 tok** | 单技能表元数据体积，完全在可内联预算内 `[LA/fact-base.md DESIGN-BI-003]` |
| **ChatBI** | ReAct 最大迭代轮数 | 设计 **5** / 代码 **6** | `DEFAULT_MAX_ITERATIONS`，超限防死循环熔断 `[LA/fact-base.md FACT-BI-003]` |
| **可视化** | 信封内联展示行数阈值 | **20 行** | `MAX_RETURN_ROWS = 20`，超过转 `client_fetch` `[LA/fact-base.md FACT-BI-006]` |
| **Agent Teams** | 团队单会话并发槽位 | **3 槽位** | `TeamAssignmentScheduler` 硬准入控制上限 `[LA/fact-base.md DESIGN-TM-004]` |
| **Agent Teams** | Follow-up 队列容量 | **5 条** | 单 Teammate 运行中接收的增量指令有界 FIFO 队列 `[LA/fact-base.md DESIGN-TM-005]` |
| **Agent Teams** | 同步委派软等待超时 | **5 分钟** (300s) | 默认软超时，最多允许追加等待 3 次 `[LA/fact-base.md DESIGN-TM-006]` |
| **Agent Teams** | 任务硬运行上限 | **2 小时** | 单 Assignment 强制终止时间，防僵尸任务 `[LA/fact-base.md DESIGN-TM-006]` |
| **Agent Teams** | 会话删除取消宽限期 | **30 秒** | 优雅取消在途任务的超时保护窗口 `[LA/fact-base.md DESIGN-TM-006]` |
| **口头细节 A** | Nacos 提示词热更新 | `PromptProxy` | 监听变更延迟求值，热更新提示词不重编图 `[LA/fact-base.md FACT-RT-011]` |
| **口头细节 B** | 工具 ID 旁路度量 | `ToolStatisticsCollector` | 废弃原地篡改，改用旁路 CustomEvent 护航配对 `[LA/fact-base.md FACT-TOOL-006]` |
| **口头细节 C** | 算法与 Java 后端边界 | Internal API | 算法层不直连数据库，全由 Java 后端治理 `[LA/fact-base.md FACT-LT-002]` |

---

## E. 红线与降级话术

### 1. 成熟度被追问的应对策略

在面试中，若面试官对某个模块的落地情况进行步步紧逼的深挖（例如“ChatBI 表现这么好，线上 PV 多少？”或“Agent Teams 落地后业务反馈如何？”），**必须主动、坦荡地进行降级**，严防把设计态吹嘘为实现态。

- **场景 1：追问 ChatBI ReAct 上线情况**
  > **降级话术**：“面试官您问到了很核心的工程权衡。这里我主动澄清一下成熟度：目前我们线上运行的稳定版本依然是固定 6 节点 DAG；ReAct 版本是我主导完成架构设计并在独立参考分支验证的原型。当时我们之所以没有立即强推全量替换，是因为当时业务的第一优先级是交付多模态问答与长任务能力；同时 ReAct 多次动态调用的特征需要更完备的只读连接池和 Benchmark 建设。因此我在简历上用的是‘重设计’而非‘已上线’。如果您感兴趣，我可以详细拆解从 DAG 切换到 ReAct 的关键技术风险点。”

- **场景 2：追问 Agent Teams 真实上线与业务数据**
  > **降级话术**：“这个必须实事求是地说明：Agent Teams 目前处于 **`design_complete`（设计已完成评审）阶段**。我们输出了非常详尽的 Master PRD、6 项架构决策记录（ADR）以及 Slice 1 资产管理切片，完成了架构推演和契约冻结。但由于后续公司战略重心向特定业务的任务型 Agent 深度后训练（即项目一）倾斜，多 Agent 运行时的具体编码落地排期延后了。因此我不会给您编造虚假的并发量或上线数字，但我可以为您完整推导我们在调度准入、幂等恢复和上下文隔离上的架构契约设计。”

- **场景 3：追问 A2UI 落地情况**
  > **降级话术**：“A2UI 是我们针对未来生成式自适应界面开展的前瞻性**技术探索与 PoC 原型**。我们在本地工作树结合瑞幸点单场景跑通了从组件树生成、不可逆中断到交互回流的完整闭环。它目前定位于探索性原型，并没有合入主干 `develop` 分支。我们评估当前阶段最扎实的基础依然是先把文件型产物和标准 AG-UI 表单交付好。”

---

### 2. 个人 vs 团队边界被追问的应对策略

当面试官提出：“听起来这个平台很庞大，你一个人到底做了哪些，团队其他人做了什么？”时，要做到**不争功、不推诿，凸显架构技术领导力与边界清晰度**。

- **标准应答模板**：
  > “非常理解您的关注。这是一个典型的算法与工程协同系统，我的角色是**算法运行时的架构主导者**，而团队工程同学负责平台后端工程化。
  > 
  > 明确由我**独立主导和编写**的核心部分包括：
  > 1. 全套架构演进方案、技术 PRD 与决策蓝图（所有的 `detail-notes` 和 ADR 均由我主导推导）；
  > 2. 算法运行时的核心代码：包括动态图工厂、图编译缓存、10 级 AG-UI 事件流中间件、Ask User 强类型协议与防串扰校验、ChatBI ReAct 分支原型，以及长任务的子图挂载中间件和上下文压缩逻辑。
  > 
  > 而由**团队协同落地**的部分包括：
  > 1. Java 后端基于 SpringCloud 的资产 CRUD 与微服务管理；
  > 2. 外部基础设施对接：如 Daytona 容器沙箱集群运维、MinIO 对象存储读写、Redis 缓存与 MySQL 数据库持久化；
  > 3. 前端界面：Web 终端基于 React 和 `@a2ui/react` 的可视化组件渲染与样式适配。
  > 
  > 我们通过 Internal API 契约和声明式 DataEnvelope 实现了极佳的职责隔离，算法侧专注于拓扑、策略与协议治理，工程侧专注于高并发网络与数据持久化。”

---

### 3. 禁词自检与话术替换表

| 禁用词汇（严禁脱口而出） | 违规原因 | 面试必须使用的直白替代话术 |
|---|---|---|
| **转·段** | decisions.md 明确禁令，黑话直译 | “从 SFT 进入强化学习阶段的判定依据 / 阶段切换判据” |
| **管·线** | decisions.md 明确禁令，黑话直译 | “执行流程 / 处理链路 / 编排拓扑 / 流水线（仅限固定 DAG）” |
| **训·服·分·离** | decisions.md 明确禁令，黑话直译 | “训练与服务分离架构 / 离线训练与在线推理服务解耦” |
| **数·据·平·面** | decisions.md 明确禁令，黑话直译 | “数据存储与处理层 / 数据流通链路 / 运行时数据流” |
| **硬·件·线** | decisions.md 第二轮修订禁令 | “在英伟达与昇腾两种硬件上部署 / 两种算力平台” |

---

## F. 素材索引

为便于在面试前 10 分钟快速溯源与复习，下表列出了支撑本项目所有 Q&A 的底层源码、设计文档与复现材料定位：

| 领域分类 | 核心材料名称 | 真实文件系统路径 / 引用位置 |
|---|---|---|
| **底稿事实** | Fact Base 权威索引 | `.scratch/interview-deck/langagent-recap/fact-base.md` |
| **架构演进** | Recap Blog 技术长文 | `.scratch/interview-deck/langagent-recap/recap-blog.md` |
| **专题一** | 回调与 10 级中间件 | `.scratch/interview-deck/langagent-recap/detail-notes/01-handler-callback-middleware.md` |
| **专题二** | 复合存储后端 | `.scratch/interview-deck/langagent-recap/detail-notes/02-composite-backend.md` |
| **专题三** | AG-UI 自定义事件契约 | `.scratch/interview-deck/langagent-recap/detail-notes/03-custom-events.md` |
| **专题四** | 上下文自动压缩中间件 | `.scratch/interview-deck/langagent-recap/detail-notes/04-summarization-middleware.md` |
| **专题五** | ChatBI Agent Loop 详解 | `.scratch/interview-deck/langagent-recap/detail-notes/05-chatbi-agent-loop.md` |
| **专题六** | HITL 挂起恢复与 AG-UI | `.scratch/interview-deck/langagent-recap/detail-notes/06-hitl-and-ag-ui.md` |
| **专题七** | Agent Teams 编排与工具 | `.scratch/interview-deck/langagent-recap/detail-notes/07-agent-teams-orchestrator-tools.md` |
| **代码骨架** | ReAct 循环与工具自检 | `.scratch/interview-deck/langagent-recap/recap-code/skeleton/runtime_agent_loop.py` |
| **代码骨架** | 长任务沙箱与产物回灌 | `.scratch/interview-deck/langagent-recap/recap-code/skeleton/long_task_sandbox_artifact.py` |
| **代码骨架** | MCP 动态模型与生命周期 | `.scratch/interview-deck/langagent-recap/recap-code/skeleton/mcp_tool_lifecycle.py` |
| **代码骨架** | HITL 契约与业务集成 | `.scratch/interview-deck/langagent-recap/recap-code/skeleton/context_hitl_business.py` |
| **代码骨架** | Agent Teams 多智能体工作流 | `.scratch/interview-deck/langagent-recap/recap-code/skeleton/workflow_agent_teams.py` |
| **架构白板** | C11~C16 对应白板归集 | 对应本仓库 `code/04_agent_loop_agui_hitl.py` 与 `code/05_orchestrator_subgraph.py` |
| **主干参考** | develop 运行基线源码 | `.scratch/langagent-develop-reference/src/agent/` |
| **分支参考** | ChatBI ReAct 参考分支 | `.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/` |
| **架构决策** | Agent Teams ADR 0001~0006 | `/Users/sunxichen/Projects/langAgent/docs/docs/adr/` |
| **设计方案** | Agent Teams Master PRD | `/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md` |
