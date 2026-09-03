# Ticket 02 Evidence Gaps Fragment: 平台 Runtime、工具与协议

> **说明**：本文件为 Ticket 02 专题审计中发现的无法从当前仓库源码/文档自证的未知项片段（Evidence Gaps Fragment）。将在 Ticket 07 中汇总并作为 Ticket 08（第二轮 Grilling）的输入。
> **准入纪律**：
> 1. 能通过细读源码、Git 历史或测试用例查清的问题（如 MCP 超时未生效、混合多工具调用丢失等代码缺陷）属于已证实事实，已直接写入 Brief 与 Facts，**严禁作为 Gap 录入**。
> 2. 每个 Gap 必须提供“推荐保守表述”，确保后续写作不被阻塞。

---

### GAP-RT-001: Nacos 配置中心动态热更新机制的实际落地范围
- **Gap ID**: `GAP-RT-001`
- **Topic**: `Runtime & Configuration`
- **Affected Deliverable**: `recap-blog/Ch2 平台底座与运行时`
- **Available Code/Doc Baseline**:
  - `docs/NACOS_CONFIG_GUIDE.md` 描述了从 Nacos 拉取 prompt 和配置的设计规范。
  - `src/server/config/nacos_provider.py` 与 `src/server/config/system_prompts.py` 实现了基于 Nacos 变更监听器与 `PromptProxy` 的进程内动态取值。
- **Unproven Gap / Unknown**:
  - 源码证明了 `nacos_provider.py` 具备监听器注册与 `PromptProxy` 动态解析能力，但线上生产部署环境是否默认开启 `NACOS_ENABLED` 并保持监听器长连接运行，无法由当前仓库自证。
- **Proposed Question for User**:
  - 线上生产环境中，Nacos 的配置变更监听器是否已正式启用以支持运行中提示词动态更新，还是主要依赖初始化拉取与发版加载？
- **Recommended Conservative Formulation**:
  - “系统支持通过 Nacos 集中化管理 System Prompt 与 Agent 参数配置，服务端实现了变更监听与 PromptProxy 动态取值机制，使提示词调整无需硬编码在业务源码中。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-RT-002: 多进程部署下 AgentRegistry 编译图缓存的一致性模型
- **Gap ID**: `GAP-RT-002`
- **Topic**: `Runtime & Graph Cache`
- **Affected Deliverable**: `recap-blog/Ch2 动态图编译与缓存`
- **Available Code/Doc Baseline**:
  - `src/agent/factory/agent_registry.py` 使用进程内 `OrderedDict` 实现了容量为 128 的 LRU 缓存。
- **Unproven Gap / Unknown**:
  - 在生产环境多 Worker（如 Uvicorn 多进程）或多 Pod 部署下，各进程各自独立维护本地内存 LRU 缓存。当某一个进程触发 `invalidate(agent_id)` 时，是否存在跨进程广播通知机制，还是依赖各进程自然淘汰？
- **Proposed Question for User**:
  - 在多 Worker / 多 Pod 生产部署时，`AgentRegistry` 的图编译缓存是否有跨进程失效机制？实际的多进程/多节点缓存策略与失效机制是什么？
- **Recommended Conservative Formulation**:
  - “`AgentRegistry` 采用进程级内存 LRU 缓存机制（上限 128 个），同一工作进程内相同配置的请求复用已编译的 `CompiledStateGraph` 实例，以减少重复编译开销。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-RT-003: 生产环境 Checkpointer 存储后端选型与跨节点迁移
- **Gap ID**: `GAP-RT-003`
- **Topic**: `Runtime & Persistence`
- **Affected Deliverable**: `recap-blog/Ch2 LangGraph 状态机与 Checkpoint`
- **Available Code/Doc Baseline**:
  - `src/server/utils/checkpointer.py` 中默认使用 SQLite Checkpointer 进行本地持久化。
- **Unproven Gap / Unknown**:
  - 本地测试和单机部署使用 SQLite 文件存储 checkpointer，但在多 Pod 生产集群中是否已切换至 PostgresCheckpointer 或外置数据库？代码仓库中缺少生产集群多机共享 Checkpoint 的配置声明。
- **Proposed Question for User**:
  - 生产集群中 LangGraph 的 Checkpointer 持久化采用何种存储后端，多节点间如何共享和迁移会话状态？
- **Recommended Conservative Formulation**:
  - “系统基于 LangGraph 标准 Checkpointer 接口管理状态快照，测试与单机环境采用基于 SQLite 的存储实现，以 `thread_id` 为边界隔离并持久化多轮对话状态。”
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`
