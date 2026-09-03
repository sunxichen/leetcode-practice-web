# Evidence Gaps (全局未决证据与第二轮审查问题登记册)

> **定位与用途**：本文件记录经交叉审计后确认无法从当前仓库源码、Git 历史或正式设计文档中自证的未决技术点。汇总 T02 至 T06 各专题 26 项原始未决项，作为第二轮 Grilling（Ticket 08）的唯一提问清单与事实查漏工具。
> **准入纪律与质量准则**：
> 1. 能通过细读源码、Git 历史或测试用例查清的问题属于已证实事实，已写入 `fact-base.md`，严禁作为 Gap 录入。
> 2. 每个 Gap 均提供“推荐保守表述”（Recommended Conservative Formulation），确保后续博客写作在未获答复时不被阻塞。
> 3. 提问严格保持**开放式与原子化（每个 Gap 仅包含 1 个明确提问，1 个问号，1 个中心未知）**，严禁复合提问，严禁 A/B/C 选项，严禁“如 X/Y/Z”预设列表，严禁“或者/还是”式封闭选项。
> 4. 所有路径均为明确无歧义的绝对路径或基准路径，不依赖 commit hash 锚点。

---

### GAP-01: Nacos 配置中心监听器生产实际启用状态
- **Gap ID**: `GAP-01`
- **Topic**: `Runtime & Configuration`
- **Affected Deliverable**: `recap-blog/Ch2 动态图编排与中间件流水线`
- **Available Code/Doc Baseline**:
  - `src/server/config/nacos_provider.py` 与 `NACOS_CONFIG_GUIDE.md` 实现了 Nacos 长轮询监听与提示词热更新代理机制。
  - 代码中配置了默认长轮询参数（`timeout=30.0`），但未见生产部署默认开关配置。
- **Unproven Gap / Unknown**:
  - 在生产集群部署中，Nacos 动态提示词热更新监听器（`add_listener`）是否实际常驻开启以支持运行时提示词热更新。
- **Proposed Question for User**:
  - 线上生产环境是否实际启用了 Nacos 变更监听器以支持运行时提示词热更新？
- **Recommended Conservative Formulation**:
  - “系统在架构上设计并实现了基于 Nacos 监听器的提示词热更新与 PromptProxy 代理机制；线上生产环境是否实际开启监听器属于运维部署决策。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：生产环境已启用 Nacos Prompt 变更监听器，支持线上提示词配置热更新。`

---

### GAP-02: 多 Pod / 多进程环境下 AgentRegistry LRU 编译缓存失效协同
- **Gap ID**: `GAP-02`
- **Topic**: `Runtime & Compilation Cache`
- **Affected Deliverable**: `recap-blog/Ch2 动态图编排与中间件流水线`
- **Available Code/Doc Baseline**:
  - `src/agent/factory/agent_registry.py` 实现了单进程内基于 `AgentConfig` MD5 哈希的 LRU 128 编译缓存。
  - 请求级配置变更会生成新 hash key 触发新图编译，旧图受容量限制自然淘汰。
- **Unproven Gap / Unknown**:
  - 在多 Worker / 多 Pod 分布式部署环境下，是否存在跨实例广播编译缓存主动失效的机制，还是完全依赖各实例内的本地 LRU 自动更替。
- **Proposed Question for User**:
  - 在多实例部署环境下，AgentRegistry 的图编译缓存失效是如何在不同实例间协同或处理的？
- **Recommended Conservative Formulation**:
  - “`AgentRegistry` 采用请求级配置 MD5 作为缓存 Key，各计算节点通过本地独立 LRU 缓存避免重复编译，配置变更时自然生成新 Key 并构建新实例。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：当前图编译缓存采用进程内 LRU，系统未按真实高并发场景设计，也没有多 Worker 或多 Pod 的实际部署场景。最终 blog 需额外提供多实例缓存一致性与失效策略的面试建议，但这些建议不是项目当前实现。`

---

### GAP-03: 生产集群环境下 LangGraph Checkpointer 持久化存储后端选型
- **Gap ID**: `GAP-03`
- **Topic**: `Runtime & Persistence Backend`
- **Affected Deliverable**: `recap-blog/Ch2 动态图编排与中间件流水线`
- **Available Code/Doc Baseline**:
  - `src/server/services/agent_service.py` 默认初始化使用 `SqliteSaver` 进行状态持久化。
  - 设计文档提及分布式环境可切换至 PostgreSQL Checkpointer。
- **Unproven Gap / Unknown**:
  - 生产高并发多实例集群中实际部署采用的 Checkpointer 存储后端类型。
- **Proposed Question for User**:
  - 生产集群环境下 LangGraph Checkpointer 实际部署采用的是哪种持久化存储后端？
- **Recommended Conservative Formulation**:
  - “系统默认集成 LangGraph 原生持久化机制，主线代码提供了标准的 Checkpointer 接口抽象，生产环境可根据集群拓扑挂载相应存储后端。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：当前 LangGraph Checkpointer 在线上实际使用 SQLite；切换其他后端的方案仅处于规划阶段，尚未因线上场景需要而执行。后端另行维护一套保存其业务数据的数据库，该数据库与 LangGraph Checkpointer 机制解耦。`

---

### GAP-04: 生产环境下 Daytona 沙箱与 Workspace 空闲回收 TTL 默认值配置
- **Gap ID**: `GAP-04`
- **Topic**: `Long Task & Workspace Lifecycle`
- **Affected Deliverable**: `recap-blog/Ch3 长任务编排与沙箱治理`
- **Available Code/Doc Baseline**:
  - `src/server/services/workspace_service.py` 与 `sandbox_governance_architecture.md` 定义了沙箱生命周期状态机与后台 Janitor 回收设计。
  - 算法服务中通过 `_provider_heartbeat` 发送心跳防止活跃任务被打断。
- **Unproven Gap / Unknown**:
  - 生产环境后台守护任务（Janitor）回收空闲沙箱的默认超时时间（TTL）与判定阈值设定。
- **Proposed Question for User**:
  - 生产环境中后台 Janitor 回收空闲沙箱的默认超时时间与判定阈值是如何配置的？
- **Recommended Conservative Formulation**:
  - “平台建立了完善的沙箱生命周期状态机与独占租约机制，结合活跃任务心跳保活与空闲后台治理，实现沙箱资源的受控流转。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：该 TTL 在后端 Nacos 配置，当前线上环境的 Workspace 空闲回收阈值为 10 分钟。`

---

### GAP-05: 长任务状态管理从算法端直连数据库重构为统一调用后端 Internal API 的核心动因
- **Gap ID**: `GAP-05`
- **Topic**: `Long Task & Storage Architecture Evolution`
- **Affected Deliverable**: `recap-blog/Ch3 长任务编排与沙箱治理`
- **Available Code/Doc Baseline**:
  - `long_task_agent_phase1_algo_prd.md` 早期设计算法端直接读写 SQLite/MySQL 数据库。
  - `develop` 主线中已彻底重构为调用 Java 端 HTTP Internal API（`WorkspaceService`）。
- **Unproven Gap / Unknown**:
  - 团队决定彻底剥离算法端数据库直连权限、全面收敛至 Java 后端 Internal API 治理的核心架构考量与驱动因素。
- **Proposed Question for User**:
  - 团队决定将长任务状态与沙箱管理从算法端直连数据库重构为统一调用后端 Internal API 的核心考量是什么？
- **Recommended Conservative Formulation**:
  - “长任务治理经历了从算法端本地直连向统一收敛至后端 Internal API 治理的演进，解耦了存储事务边界与算法执行逻辑。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：最初让算法端直连数据库主要是为了快速验证方案；正式上线时改由 Java 后端管理该数据库，算法端通过 Internal API 调用，因为后端更适合承担数据库管理、持久化和业务治理职责。`

---

### GAP-06: Daytona Toolbox 非 ASCII 路径中转机制的原始业务触发场景
- **Gap ID**: `GAP-06`
- **Topic**: `Artifact & Sandbox Transport Protocol`
- **Affected Deliverable**: `recap-blog/Ch3 长任务编排与沙箱治理`
- **Available Code/Doc Baseline**:
  - `src/server/services/artifact_service.py` 中实现了针对非 ASCII 路径先上传至临时 ASCII 路径再 `mv` 移动的特殊逻辑。
  - `tests/test_artifact_restore.py` 对中文文件名回灌进行了单元测试验证。
- **Unproven Gap / Unknown**:
  - 系统在沙箱中针对非 ASCII 路径设计临时 ASCII 路径中转回灌机制，最初是在处理哪类业务产物或实际场景时触发发现该限制的。
- **Proposed Question for User**:
  - 沙箱针对非 ASCII 路径设计临时中转机制最初是在处理哪类业务产物或场景时触发发现的？
- **Recommended Conservative Formulation**:
  - “针对底层沙箱文件传输通道在多字节路径上的适配问题，系统在回灌层设计了临时 ASCII 路径中转机制确保稳健写入；具体触发该设计的原始业务产物场景待第二轮确认。”
- **Resolution Status**: `OUT_OF_SCOPE`
- **Resolution Notes & User Input**: `用户表示已记不清原始触发场景，仅推测大概率与中文导入报错有关。该细节不属于 minimal recap 的必要内容，也不足以形成确定事实；正文与 recap code 不展开原始业务背景，仅保留当前实现的兼容性中转机制。`

---

### GAP-07: 长期会话上下文自动压缩中 70% 触发阈值与 25% 保留比例的调优依据
- **Gap ID**: `GAP-07`
- **Topic**: `Memory & Context Compaction Tuning`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - `src/agent/long_task/chinese_deep_agent.py` 与 `src/server/config/config.py` 将压缩触发阈值覆写为 70%、保留比例覆写为 25%。
  - `long_task_context_auto_compaction_prd.md` 记录了该参数规格。
- **Unproven Gap / Unknown**:
  - 团队将框架默认的 85% 触发阈值下调至 70%、保留比例定为 25% 的具体工程与模型长文本调优依据。
- **Proposed Question for User**:
  - 将长会话上下文压缩触发阈值定为 70%、保留比例定为 25% 的具体工程与模型调优依据是什么？
- **Recommended Conservative Formulation**:
  - “系统结合主流模型在长上下文窗口下的注意力衰减特征与中文会话密度，针对性地将压缩触发阈值与保留窗口调优为 70%/25% 的平衡组合。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：70% 触发与 25% 保留不是系统化测试或 benchmark 调优结果，而是开发人员上线时基于经验设置的参数。上线后未观察到明显不合适的情况，因此持续沿用；正文不得将其表述为经过正式效果验证。`

---

### GAP-08: 长期记忆乐观锁并发写入单次 409 重试耗尽后的业务兜底策略
- **Gap ID**: `GAP-08`
- **Topic**: `Memory & Optimistic Locking Concurrency`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - `src/agent/long_task/memory_backend.py` 实现了基于 `expected_version` 的乐观锁，遭遇 409 时自动重试 1 次（`_MAX_EDIT_RETRIES = 1`）。
  - `tests/test_long_task_memory_backend.py` 覆盖了重试成功的场景。
- **Unproven Gap / Unknown**:
  - 生产高频并发场景下若单次 409 重试再次发生冲突，系统在上层业务与用户会话中的降级与兜底策略。
- **Proposed Question for User**:
  - 当长期记忆乐观锁写入遭遇并发冲突且单次重试再次失败时，系统在上层业务与用户会话中是如何兜底处理的？
- **Recommended Conservative Formulation**:
  - “长期记忆通过版本号乐观锁控制并发更新，并在算法适配层提供单次自动重试；面对极端高频并发写入，系统以保护数据一致性为先。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：该功能处于 MVP 阶段，AI 智企面向企业内部私有化部署，当前未按 SaaS 或 To-C 高并发场景设计。409 重试耗尽暂采用简单机制，待出现真实类似问题后再评估增强。最终 blog 需额外提供面向面试追问的工程建议，但这些建议必须标注为未在项目中实现的改进方向。`

---

### GAP-09: 长期记忆由早期四层架构收敛为两层用户偏好记忆的核心考量
- **Gap ID**: `GAP-09`
- **Topic**: `Memory & Architecture Scope Evolution`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - 早期方案 `deepagents-memory-integration.md` 规划了组织级、Agent 级、用户全局级、用户应用级 4 层架构与 4 张表。
  - `long-task-memory-prd.md` 与主线代码将其收敛为 `USER_GLOBAL` 与 `USER_AGENT` 2 层及单张表。
- **Unproven Gap / Unknown**:
  - 放弃组织级与 Agent 级动态偏好记忆、收敛为两层用户记忆的核心产品考量。
- **Proposed Question for User**:
  - 团队决定将长期记忆由早期规划的四层收敛为两层用户偏好记忆的核心产品考量是什么？
- **Recommended Conservative Formulation**:
  - “长期记忆体系在演进过程中进行了务实收敛，聚焦于用户全局与用户应用两层核心个性化画像，降低了多层级偏好冲突与维护成本。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：组织级与 Agent 级记忆被删减，主要因为产品功能上需求有限且不适合作为首期记忆层。AI 智企主要由企业员工以个人身份使用，组织集体记忆的沉淀场景少、噪音风险高；同时组织级记忆可能造成跨用户敏感信息暴露。Agent 级记忆也不合适，因为单个 Agent 可按权限服务多个角色用户，若把用户 A 的敏感对话写入 Agent 级记忆，用户 B 使用同一 Agent 时可能产生越权读取风险。以上为产品与安全风险判断，不代表已发生真实数据泄露事故。`

---

### GAP-10: 上下文压缩流式通道仅发射单一 context.usage_updated 事件的技术权衡
- **Gap ID**: `GAP-10`
- **Topic**: `Compaction & Event Streaming Protocol`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - PRD 规划了 4 个上下文生命周期事件（started/finished/failed/usage_updated）。
  - `develop` 源码 `observed_summarization_middleware.py` 仅发射 `context.usage_updated`。
- **Unproven Gap / Unknown**:
  - 决定在流式事件通道中仅暴露单一用量估算事件、将其他压缩过程收敛为内部日志的技术权衡与前端交互设计考量。
- **Proposed Question for User**:
  - 上下文压缩在流式事件通道中最终选择仅发射单一用量更新事件的核心考量是什么？
- **Recommended Conservative Formulation**:
  - “在流式协议实现中，系统重点保障了前端对上下文用量的持续感知，将较为繁复的内部压缩阶段收敛于服务端可观测日志中。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：这属于团队成员实现与设计之间的差异。博客与 recap code 以用户的四事件设计为核心，同时明确 develop 当前实现只公开 context.usage_updated，不能把设计态事件写成已实现事实。`

---

### GAP-11: 技能导入协议从扁平 URL 列表升级为按业务 ID 隔离配置的核心驱动
- **Gap ID**: `GAP-11`
- **Topic**: `Skill System & Ingestion Protocol Evolution`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - `src/server/services/skill_import_service.py` 实现了 `skill_configs` 导入与业务 ID 目录隔离，同时兼容旧版 URL 列表。
  - `tests/test_long_task_skill_selection.py` 验证了解压与隔离逻辑。
- **Unproven Gap / Unknown**:
  - 推动技能包在沙箱内部由平铺解压演进为结构化 ID 目录隔离落盘所解决的核心业务冲突问题。
- **Proposed Question for User**:
  - 技能系统从扁平 URL 列表升级为按业务 ID 目录隔离的结构化配置主要解决了哪些实际冲突问题？
- **Recommended Conservative Formulation**:
  - “技能系统演进引入了结构化配置与目录隔离机制，有效避免了多技能并发引入时的命名冲突与文件覆盖，提升了沙箱环境的隔离安全性。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：该改造是在上线运行一段时间后，实际发现不同 ZIP 内同名目录或文件会导致覆盖、混淆或归属难判的问题后推动的。另一个考虑是让业务 ID 成为技能目录下更稳定、可见的区分，使 Agent 按后台配置的 ID 选择技能，不受压缩包名称影响。未记录具体客户或敏感业务信息。`

---

### GAP-12: Ask User 面对前端重复提交或多端并发恢复（Resume）时的竞态控制
- **Gap ID**: `GAP-12`
- **Topic**: `Human-in-the-loop & Concurrency Race Condition`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - `src/agent/ask_user/contracts.py` 生成确定性 `stable_request_id` 并通过 LangGraph Checkpointer 维护暂停态。
  - `tests/` 目录下未包含独立的 Ask User 单元测试用例。
- **Unproven Gap / Unknown**:
  - 在生产环境中面临前端重复点击或多端同时恢复（Resume）时，系统的并发与防重放控制机制。
- **Proposed Question for User**:
  - Ask User 机制在面对前端重复提交或多端并发恢复（Resume）请求时是如何进行并发与防重放控制的？
- **Recommended Conservative Formulation**:
  - “系统通过确定性 Request ID 与 LangGraph 状态机实现了人机协同中断恢复，状态流转契约完备，生产高并发重放控制依赖状态机幂等保护。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户同意保守表述：当前没有独立业务级重复提交防护，重复 Resume 依赖 LangGraph 状态推进与通用错误路径。`

---

### GAP-13: Ask User 规划的独立业务表与分布式 CAS 方案推进状态
- **Gap ID**: `GAP-13`
- **Topic**: `Human-in-the-loop & Distributed State Machine Evolution`
- **Affected Deliverable**: `recap-blog/Ch4 长期记忆、技能系统与 HITL`
- **Available Code/Doc Baseline**:
  - `ASK_USER_开发设计.md` 提出了基于独立业务表与 CAS 拦截 409 的 Phase 3+ 演进设想。
  - `develop` 主线代码当前未包含该业务表或 CAS 逻辑。
- **Unproven Gap / Unknown**:
  - 独立业务表与分布式 CAS 方案在项目实际迭代中的规划与推进状态。
- **Proposed Question for User**:
  - Ask User 设计文档中规划的独立业务表与分布式 CAS 方案目前处于何种规划与推进状态？
- **Recommended Conservative Formulation**:
  - “架构设计中探索了基于独立业务表与 CAS 的分布式进阶方案，当前主线依托状态图的原生中断恢复机制满足交互诉求。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：独立业务表与分布式 CAS 属于后期设计，当前未落地；正文不得将其描述为现有 Ask User 能力。`

---

### GAP-14: ChatBI Agent Loop 独立分支与主线代码的合并进展与落地状态
- **Gap ID**: `GAP-14`
- **Topic**: `ChatBI & Agent Loop Rollout Status`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - `develop` 主线运行 6 节点固定 DAG（Happy Path 5 节点 + 单次纠错）。
  - `langagent-chatbi-agent-loop-reference` 实现了具备 4 工具的三段式动态 ReAct 循环（无配套测试）。
- **Unproven Gap / Unknown**:
  - ChatBI Agent Loop 独立分支目前在团队内部的实际合并上线进展与落地状态。
- **Proposed Question for User**:
  - ChatBI Agent Loop 架构目前在主线代码中的合并进展与实际落地状态如何？
- **Recommended Conservative Formulation**:
  - “团队在独立分支中完成了 ChatBI Agent Loop 架构的重构探索与参考实现，主线代码目前仍采用固定流水线 DAG，分支实现的合并上线状态待第二轮核实。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户采纳保守表述：ChatBI Agent Loop 仅按独立参考分支实现处理，未确认合入 develop，且未上线。`

---

### GAP-15: ChatBI 主线代码保持固定流水线 DAG 的工程考量与权衡
- **Gap ID**: `GAP-15`
- **Topic**: `ChatBI & Fixed DAG Trade-offs`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - `develop` 主线稳定运行固定 6 命名节点 DAG 流水线。
- **Unproven Gap / Unknown**:
  - 主线代码选择保持固定流水线 DAG 架构的工程权衡（如稳定性、延迟可控性与算力成本）。
- **Proposed Question for User**:
  - 主线代码保持固定流水线 DAG 而未直接采用 Agent Loop 架构主要出于哪些工程权衡与考量？
- **Recommended Conservative Formulation**:
  - “主线代码保持固定流水线 DAG 流水线，在确定性场景下具备稳定的工程表现与较低的调用延迟。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：当时尚未系统开展效果测试，因此 Agent Loop 没有上线。该信息解释了未发布状态，但不等同于对固定 DAG 性能或质量优势的实证结论。`

---

### GAP-16: A2UI 协议在完成瑞幸 PoC 验证后在平台基础能力矩阵中的演进定位
- **Gap ID**: `GAP-16`
- **Topic**: `A2UI & Platform Capability Positioning`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - 未提交工作树完整实现了 A2UI 子图、校验重试、Activity 派发与 HITL 闭环。
  - 用户口述确认 A2UI 为早期探索的基础能力。
- **Unproven Gap / Unknown**:
  - A2UI 协议在完成 PoC 验证后，在平台整体产品与基础能力矩阵中的演进定位规划。
- **Proposed Question for User**:
  - A2UI 协议在完成瑞幸在线下单 PoC 验证后，在平台整体产品与基础能力矩阵中的演进定位是如何规划的？
- **Recommended Conservative Formulation**:
  - “A2UI 作为生成式 UI 交互的实证原型，验证了组件化动态组装与 MCP 工具协同的可行性，为平台拓展富交互界面提供了技术积累。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：A2UI 后续计划加入产品，用于解决生成式 UI 相关需求，尤其面向政务和企业场景中的组件展示、信息收集与反馈交互。该规划不等同于已合入 develop 或已上线。`

---

### GAP-17: A2UI 协议与 Canvas 文件产物预览工作区在产品形态与架构分工上的边界划分
- **Gap ID**: `GAP-17`
- **Topic**: `A2UI & Canvas Workspace Boundaries`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - A2UI 聚焦动态组件化 UI 组装与直接交互；Canvas MVP 聚焦文件型产物（如表格、图表、代码文件）的持久预览。
- **Unproven Gap / Unknown**:
  - 平台交互层中 A2UI 生成式界面与 Canvas 文件产物工作区在业务形态与交互定位上的明确边界划分。
- **Proposed Question for User**:
  - A2UI 协议与 Canvas 文件产物预览工作区在产品形态与架构分工上的边界是如何划分的？
- **Recommended Conservative Formulation**:
  - “A2UI 与 Canvas 预览工作区分别面向即时组件化交互与文件型产物持久沉淀两个不同产品维度，共同构成多元人机交互界面。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户采纳保守分工：A2UI 负责会话中的即时生成式 UI 交互，Canvas 负责文件型产物的持久化预览与编辑；二者互补，不扩展到未确认的集成细节。`

---

### GAP-18: 可视化子图派发的 client_fetch 策略在业务前端图表组件中的实际对接状态
- **Gap ID**: `GAP-18`
- **Topic**: `Visualization & Frontend Integration Status`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - `src/agent/nodes/visualization_nodes/nodes.py` 根据 `envelope.data_complete` 状态（ChatBI 在数据行数 > 20 时置为 False）规范下发 `dataset_strategy: client_fetch` 与明文 SQL。
  - 算法仓库内未包含消费该策略的前端图表组件源码或测试。
- **Unproven Gap / Unknown**:
  - 业务前端图表组件基于 `client_fetch` 策略调用后端分页接口的实际集成联调状态。
- **Proposed Question for User**:
  - 可视化子图派发的 client_fetch 策略目前在业务前端图表组件中的实际对接与联调状态如何？
- **Recommended Conservative Formulation**:
  - “服务端构建了清晰的双通道数据信封与图表分发策略（`inline_complete` / `client_fetch`），确立了大数据量下服务端免受传输压力的契约规范。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：`client_fetch` 策略已完成与业务前端的对接，前端已完整实现相关机制。该确认只覆盖集成实现状态，不推断大数据渲染性能或线上效果。`

---

### GAP-19: 业务前端图表组件消费 client_fetch 策略时的大数据渲染性能与上限表现
- **Gap ID**: `GAP-19`
- **Topic**: `Visualization & Large Dataset Rendering Limits`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`
- **Available Code/Doc Baseline**:
  - 服务端契约支持大数据量通过分页查询拉取。
- **Unproven Gap / Unknown**:
  - 业务前端图表组件在消费该策略并拉取海量数据时的实际渲染性能与展示上限表现。
- **Proposed Question for User**:
  - 业务前端图表组件在消费 client_fetch 策略并拉取海量数据时的渲染性能与展示上限表现如何？
- **Recommended Conservative Formulation**:
  - “系统在架构上支持大数据量分页拉取渲染，前端在大数据量下的交互流畅度与展示上限取决于前端渲染组件的性能调优。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：项目尚未真实遇到大数据量场景，因此没有稳定的性能指标，也没有进行专项性能测试。正文只描述 `client_fetch` 的分页机制，不写具体吞吐、延迟或展示上限。`

---

### GAP-20: Dify Workflow / Chatflow 集成架构设计与运行契约
- **Gap ID**: `GAP-20`
- **Topic**: `Workflow & Dify Integration Architecture`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 用户口述确认：Agent Teams 与 Dify Workflow/Chatflow 集成是项目最新的演进重点，且设计方案足够明确。
  - `/Users/sunxichen/Projects/langAgent/docs/.scratch/workflow-feature/research/` 存在选型与桥接探索笔记。
- **Unproven Gap / Unknown**:
  - 平台针对 Dify Workflow / Chatflow 集成所确立的实际技术架构方案与运行契约具体内容。
- **Proposed Question for User**:
  - 平台针对 Dify Workflow / Chatflow 集成所确立的实际技术架构与运行契约具体是如何设计的？
- **Recommended Conservative Formulation**:
  - “平台确立了将 Agent Teams 与 Dify Workflow/Chatflow 集成作为核心演进方向的设计意图；正文按架构设计契约展开，并明确其设计与交付边界。”
- **Resolution Status**: `ACCEPTED_UNKNOWN`（本轮移出范围，待材料补充）
- **Resolution Notes & User Input**: `用户明确表示 Workflow/Chatflow 的 PRD、SPEC 等材料将在数日后补充；Ticket 08 本轮跳过该主题，不冻结其技术架构、运行契约或交付状态。`

---

### GAP-21: Dify Workflow / Chatflow 官方 PRD 与权威设计物料存放路径
- **Gap ID**: `GAP-21`
- **Topic**: `Workflow & Design Material Location`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - 用户口述确认 Dify Workflow/Chatflow 设计方案清晰。
  - `docs/docs/` 主文档目录下未检索到官方归档的工作流设计规范。
- **Unproven Gap / Unknown**:
  - 记录 Dify Workflow / Chatflow 集成方案的官方 PRD、SPEC 或权威设计物料的具体存放路径。
- **Proposed Question for User**:
  - 记录 Dify Workflow / Chatflow 集成方案的官方 PRD 或权威设计文档目前存放在哪些具体路径中？
- **Recommended Conservative Formulation**:
  - “已检查材料中包含前期技术调研笔记，权威设计物料位置待进一步核实。”
- **Resolution Status**: `ACCEPTED_UNKNOWN`（本轮移出范围，待材料补充）
- **Resolution Notes & User Input**: `随 Workflow/Chatflow 主题延期处理；待用户补充权威 PRD/SPEC 后重新核验。`

---

### GAP-22: Dify Workflow / Chatflow 集成在实际工程层面的代码实现、测试覆盖与发布上线状态
- **Gap ID**: `GAP-22`
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
- **Resolution Status**: `ACCEPTED_UNKNOWN`（本轮移出范围，待材料补充）
- **Resolution Notes & User Input**: `随 Workflow/Chatflow 主题延期处理；本轮不对代码实现、测试覆盖或上线状态作结论。`

---

### GAP-23: Dify Workflow / Chatflow 集成实际研发代码所在的代码仓库与分支位置
- **Gap ID**: `GAP-23`
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
- **Resolution Status**: `ACCEPTED_UNKNOWN`（本轮移出范围，待材料补充）
- **Resolution Notes & User Input**: `随 Workflow/Chatflow 主题延期处理；代码仓库与分支位置留待材料补充后核验。`

---

### GAP-24: Workflow 工作流体系与现有 Claw Agent 及 Agent Teams 的定位分工与协作边界
- **Gap ID**: `GAP-24`
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
- **Resolution Status**: `ACCEPTED_UNKNOWN`（本轮移出范围，待材料补充）
- **Resolution Notes & User Input**: `随 Workflow/Chatflow 主题延期处理；本轮不冻结其与 Claw Agent / Agent Teams 的产品边界。`

---

### GAP-25: Agent Teams 各系统端实际代码实现、测试覆盖与发布上线状态
- **Gap ID**: `GAP-25`
- **Topic**: `Agent Teams & Implementation Status`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - Master PRD（`Ready for implementation`）与 ADR 0001-0006 完整定义了设计契约；Slice 1 PRD（`ready-for-agent`）定义了资产管理闭环。
  - 对检查的 `develop` 源码基线（全量 `src/` 与 `tests/`）未发现 Teams 运行时与持久调度器实现代码。
- **Unproven Gap / Unknown**:
  - Agent Teams MVP 目前在各系统端的实际代码实现、测试覆盖与生产发布上线状态；Slice 1 资产功能是否已实际交付。
- **Proposed Question for User**:
  - Agent Teams 目前在各系统端的实际代码实现、测试覆盖与发布上线状态如何？
- **Recommended Conservative Formulation**:
  - “Agent Teams MVP 已建立涵盖总纲 PRD、切片需求（Slice 1）与 6 项架构决策记录（ADR）在内的完整设计体系，确立了一成员一持久实例、三槽位准入控制、三层流以及跟随最新有效配置等核心契约，为多智能体演进奠定了方案基础。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `用户确认：Agent Teams 方案已完成，属于待实施阶段；当前尚未开始开发。因此正文可表述为设计完成但尚无工程实现，不推断测试或上线状态。`

---

### GAP-26: Agent Teams 各端开发代码所在的代码仓库与分支位置
- **Gap ID**: `GAP-26`
- **Topic**: `Agent Teams & Code Repository Location`
- **Affected Deliverable**: `recap-blog/Ch6 Workflow 与 Agent Teams 架构演进`
- **Available Code/Doc Baseline**:
  - `develop` 源码基线未发现 Teams 运行时与持久调度器实现代码。
- **Unproven Gap / Unknown**:
  - Agent Teams 相关的各端开发代码（包括调度器、管理端、客户端与运行时）目前所维护的具体代码仓库或分支路径。
- **Proposed Question for User**:
  - Agent Teams 相关的各端开发代码目前存放在哪些具体的代码仓库或分支中？
- **Recommended Conservative Formulation**:
  - “已检查的主线参考分支未包含 Teams 运行时代码，相关分支与代码仓库待第二轮核实。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `基于用户确认 Agent Teams 当前尚未开始开发，本阶段不存在可供定位的各端研发代码仓库或分支；后续若启动开发，代码位置需在材料补充时重新登记。`

---

### GAP-27: DataEnvelope 200 阈值常量未接入与 20 行实际行为的设计/实现漂移
- **Gap ID**: `GAP-27`
- **Topic**: `DataEnvelope Threshold Wiring Drift`
- **Affected Deliverable**: `recap-blog/Ch5 业务子图、A2UI 与 ChatBI`, `recap-code/core/context_hitl_business.py`
- **Available Code/Doc Baseline**:
  - `src/agent/graph/subgraphs/chatbi/nodes/exit_node.py` 顶层声明了常量 `DETAIL_QUERY_THRESHOLD = 200`，但在 `_build_data_envelope_from_sql_response` 中实际依据 `MAX_RETURN_ROWS = 20` 判断 `is_detail = row_count > MAX_RETURN_ROWS` 并置 `data_complete = not is_detail`。
  - `chatbi-agent-loop` 参考分支中同样按 `MAX_RETURN_ROWS = 20` 构造信封。
  - `src/agent/nodes/visualization_nodes/nodes.py` 只消费 `envelope.data_complete`，不自行判断 200 阈值。
- **Unproven Gap / Unknown**:
  - 当前 20 行行为（超过 20 行即 `data_complete=False` 并提供 `query_sql`）属于开发团队有意收敛的实现，还是属于未将 `DETAIL_QUERY_THRESHOLD=200` 常量接入 `_build_data_envelope_from_sql_response` 的未接线缺陷。
- **Proposed Question for User**:
  - ChatBI 数据信封当前超过 20 行就标记 data_complete=False，而文件中定义的 DETAIL_QUERY_THRESHOLD=200 未被使用，这是有意统一为 20 行还是历史未接线？
- **Recommended Conservative Formulation**:
  - “正文与代码以可核验的 20 行当前实现行为为准（超过 20 行置 `data_complete=False` 并截断 `full_data`），200 仅作为源码中保留的未接线设计常量记载，不外推未证实的原因。”
- **Resolution Status**: `CONFIRMED`
- **Resolution Notes & User Input**: `独立代码审查发现该设计与实现漂移，初按保守原则记录为 OPEN Gap；2026-08-27 经用户确认：20 行阈值为团队有意收敛的现行实现，DETAIL_QUERY_THRESHOLD=200 是早期设计阶段遗留的未接线常量，非待修缺陷。正文与白板代码按 20 行真实运行行为表述，200 记为已确认的历史设计残留。`

---

## Ticket 08 Freeze Confirmation

- **Status**: `FROZEN`
- **Confirmed by user**: `是`
- **Confirmation**: `用户确认当前 fact base 已冻结，后续可基于已确认事实、accepted unknown 与 out-of-scope 边界开展写作。`
- **Scope guard**: `Workflow/Chatflow GAP-20～GAP-24 仍等待后续材料；不得将 accepted unknown 写成已实现或已上线事实。`
