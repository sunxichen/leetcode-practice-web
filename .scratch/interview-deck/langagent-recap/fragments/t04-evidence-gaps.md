# Evidence Gaps Fragment: Memory, Compaction, Skill System, and Ask User (Ticket 04)

> **本文件记录 Ticket 04 审计中发现的需要进一步交叉核验或在第二轮 Grilling 中向用户确认的原子化证据鸿沟 (Evidence Gaps)，重点涵盖设计意图与当前实现的演进偏差原因。**

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-MEM-001` |
| **Topic** | Memory & Compaction |
| **Affected Deliverable** | Blog §5 长期记忆与上下文治理 |
| **Available Code/Doc Baseline** | `chinese_deep_agent.py#L290-L319`（70% 触发阈值、保留后 25% cutoff）、`src/server/config/config.py#L124-L133`（`context_compaction_keep_fraction = 0.25`）、`observed_summarization_middleware.py#L68-L78`（6 条消息防抖）、`CHINESE_SUMMARY_PROMPT`（四段式摘要）。 |
| **Unproven Gap / Unknown** | 将触发阈值定为 70%、截断保留 25% 的实际业务调优依据，以及在长链路任务中是否曾出现过因摘要遗忘关键中间上下文导致任务失败的真实案例。 |
| **Proposed Question for User** | 压缩参数选择 70% 触发与 25% 保留的核心考量是什么？在生产或评测的长任务中，是否出现过压缩导致关键中间产物或上下文细节遗忘的实际案例？ |
| **Recommended Conservative Formulation** | 系统通过 70% 动态预算阈值、保留后 25% 截断与四段式中文结构化摘要（会话意图/摘要/产物/下一步）控制上下文长度，并将历史消息与媒体外化持久化，但具体长轮次下的信息保留度与极端场景表现取决于业务任务复杂度。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-MEM-002` |
| **Topic** | Memory & Compaction |
| **Affected Deliverable** | Blog §5 长期记忆与上下文治理 |
| **Available Code/Doc Baseline** | `src/agent/long_task/memory_backend.py#L117-L150`（乐观锁 `expected_version`、409 冲突重试 1 次 `_MAX_EDIT_RETRIES = 1`）。 |
| **Unproven Gap / Unknown** | 长期记忆在并发交互场景下，单次 409 重试机制是否曾出现过重试耗尽导致写入失败的情况，以及出现时的业务兜底处置方式。 |
| **Proposed Question for User** | 长期记忆后端在实际运行中，单次 409 重试是否出现过耗尽失败的情况？若出现，前端或业务层当时是如何处理该异常的？ |
| **Recommended Conservative Formulation** | 长期记忆基于 `expected_version` 实现了单次 409 冲突重试机制以应对常规并发修改，在重试耗尽时向上抛出异常由外层捕获。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-MEM-003` |
| **Topic** | Memory & Compaction |
| **Affected Deliverable** | Blog §5 长期记忆与上下文治理 / 架构演进分析 |
| **Available Code/Doc Baseline** | `docs/docs/deepagents-memory-integration.md#L189-L360` 规划了组织级与 Agent 级 4 层记忆；而 `docs/long-task-memory-prd.md#L8-L27` 明确将范围收敛为 2 层（仅 `USER_GLOBAL` 与 `USER_AGENT`），并将 4 张物理表简化为单张 `agent_memory` 表。 |
| **Unproven Gap / Unknown** | 方案从 4 层记忆收敛至 2 层用户记忆的具体业务背景与考量（代码与文档仅证实范围发生变化，未记载裁剪的具体驱动因素）。 |
| **Proposed Question for User** | 长期记忆方案从早期规划的组织级与 Agent 级 4 层收敛为 2 层用户记忆，当时主要出于哪些考量？后续是否有计划重启组织级或 Agent 级共享记忆？ |
| **Recommended Conservative Formulation** | 长期记忆在方案演进中将范围聚焦于用户维度的两层记忆（全局画像与 Agent 专属偏好），并采用单表统一存储，组织级策略与跨用户知识沉淀未纳入当前运行基线。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-CMP-001` |
| **Topic** | Memory & Compaction |
| **Affected Deliverable** | Blog §5 长期记忆与上下文治理 / 协议契约分析 |
| **Available Code/Doc Baseline** | `prd/long_task_context_auto_compaction_prd.md#L95-L98` 规划了 `context.compaction_started`、`context.compaction_finished`、`context.compaction_failed`、`context.usage_updated` 4 个 CUSTOM 事件；而在 `observed_summarization_middleware.py` 中，started/finished/failed 仅在中间件内部记录日志，develop 当前代码发射的 CUSTOM 事件为 `context.usage_updated`。 |
| **Unproven Gap / Unknown** | 上下文压缩事件契约由规划的 4 个事件收敛为 develop 当前代码发射单一 `context.usage_updated` 事件的具体技术或产品决策原因。 |
| **Proposed Question for User** | 上下文压缩规划的 started/finished/failed 事件在 develop 当前代码中仅作为内部日志、未作为独立 CUSTOM 事件发射，当时是出于何种考虑？ |
| **Recommended Conservative Formulation** | 上下文压缩在实现中通过内部日志记录压缩生命周期，在 develop 当前代码中主要发射 `context.usage_updated` CUSTOM 事件同步上下文占用百分比。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-SKL-001` |
| **Topic** | Skill System |
| **Affected Deliverable** | Blog §6 技能体系演进 |
| **Available Code/Doc Baseline** | `src/server/services/skill_import_service.py#L96-L356`（兼容 `skill_configs` 结构化对象与旧版 `skill_oss_urls` 字符串列表，沙箱目录从平铺变为按业务 ID 隔离）。 |
| **Unproven Gap / Unknown** | 推动技能体系从 URL 列表演进为按业务 ID 隔离的 `skill_configs` 的核心驱动因素组合（如避免不同 ZIP 内同名目录覆盖、多技能共存隔离、支持显式选技等）。 |
| **Proposed Question for User** | 技能导入从平铺解压的 `skill_oss_urls` 演进为按业务 ID 隔离的 `skill_configs`，当时主要解决了哪些实际问题（如 ZIP 内同名目录覆盖、多技能共存隔离、还是为了支持显式选技）？ |
| **Recommended Conservative Formulation** | 技能体系从早期的 URL 列表演进为具备唯一 ID 的 `skill_configs` 结构化配置，在沙箱目录中按业务 ID 实现命名空间隔离，并同时支持模型自动发现与用户显式置顶选技。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-ASK-001` |
| **Topic** | Human-in-the-loop (Ask User) |
| **Affected Deliverable** | Blog §7 人机协同与中断恢复 |
| **Available Code/Doc Baseline** | `contracts.py`、`tool.py`、`ask_user_interrupt_translator.py`、`ask_user_tool_args_masker.py` 均已在 develop 主线实现；支持 `status="cancelled"` 与参数掩码；但未发现独立数据库表 CAS，且 `tests/` 目录下无独立单元测试。 |
| **Unproven Gap / Unknown** | Ask User 功能在生产环境的实际部署与使用成熟度，以及在实际运行中是否曾遇到过多端或网络重试引发的重复 resume 竞态问题。 |
| **Proposed Question for User** | Ask User 功能当前的生产上线成熟度如何？在实际使用中是否遇到过多端或网络重试引发的重复提交竞态问题？ |
| **Recommended Conservative Formulation** | Ask User 具备基于 LangGraph `interrupt` / `Command(resume)` 的强类型契约、敏感词过滤、流式参数掩码与确定性 Request ID 关联状态机，但在项目层未发现独立业务表 CAS 机制。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |

---

| 字段 | 内容 |
|---|---|
| **Gap ID** | `GAP-ASK-002` |
| **Topic** | Human-in-the-loop (Ask User) |
| **Affected Deliverable** | Blog §7 人机协同与中断恢复 / 架构演进分析 |
| **Available Code/Doc Baseline** | 设计文档 `ASK_USER_开发设计.md#L31-L40,L326-L336` 规划了 Phase 3+ 独立数据库表 `AskUserRequest` 与跨多算法实例原子 CAS 提交（返回业务 409 `ASK_USER_ALREADY_RESOLVED`，对应 `DESIGN-ASK-003`）；当前代码未发现独立数据库表与业务 409 契约。 |
| **Unproven Gap / Unknown** | Phase 3+ 规划的独立 `AskUserRequest` 业务表与分布式 CAS 状态机未在 develop 基线实现的原因及后续排期。 |
| **Proposed Question for User** | 架构设计文档中规划的 Phase 3+ 独立 `AskUserRequest` 业务表与跨实例原子 CAS 提交（DESIGN-ASK-003）当前未在代码中体现，后续是否有排期实现，还是依赖接入层路由控制？ |
| **Recommended Conservative Formulation** | Ask User 当前基于 LangGraph Checkpointer 的 `interrupt` 状态机实现中断挂起与恢复，跨实例排他 CAS 业务表方案属于设计文档中的 Phase 3+ 演进规划（DESIGN-ASK-003）。 |
| **Resolution Status** | `OPEN` |
| **Resolution Notes & User Input** | (待第二轮 Grilling 填写) |
