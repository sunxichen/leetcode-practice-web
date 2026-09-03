# Evidence Gaps Fragment: Ticket 03 (Long Task, Sandbox & Artifact)

> **所属 Ticket**：Ticket 03 (`issues/03-audit-long-task-sandbox-and-artifact.md`)  
> **审计领域**：Domain 3 (Long Task 编排、Workspace 与 Daytona 沙箱) & Domain 4 (产物持久化与 Artifact Durability)  
> **用途**：收集源码、测试与现有文档无法自证的架构历史、线上环境参数与技术决策背景，作为第二轮 Grilling（Ticket 08）的输入。

---

## 1. 未决事实与第二轮 Grilling 清单

### GAP-LT-001: 生产环境 Janitor 触发 Workspace 自动回收的默认空闲 TTL
- **Gap ID**: `GAP-LT-001`
- **Topic**: `Long Task & Sandbox`
- **Affected Deliverable**: `recap-blog/Ch3 Workspace 生命周期与沙箱治理`
- **Available Code/Doc Baseline**:
  - `src/server/services/workspace_service.py#L610-L665` 实现了 `reclaim_workspace` 接口供后端 Janitor 调用。
  - `src/server/config/config.py` 配置了 `daytona_auto_stop_minutes`（默认 15 分钟）。
  - `sandbox_governance_architecture.md#L9-L35` 说明了后端根据会话活跃 TTL 决定回收并调用算法端的策略。
- **Unproven Gap / Unknown**:
  - 生产集群中后端 Janitor 判定会话空闲回收的真实默认配置（如 30 分钟、2 小时或按租户配置）。
- **Proposed Question for User**:
  - 线上环境中后端 Janitor 触发 Workspace 自动回收（Reclaim）的空闲 TTL 默认配置是多少？
- **Recommended Conservative Formulation**:
  - 系统在架构上将沙箱设计为纯临时计算资源，由后端根据可配置的会话空闲 TTL 策略自动调度回收；算法端仅负责执行物理删除与按需冷启动重建。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-LT-002: 从“共享 MySQL 直连”重构至“HTTP Internal API 治理”的核心驱动背景
- **Gap ID**: `GAP-LT-002`
- **Topic**: `Long Task & Sandbox`
- **Affected Deliverable**: `recap-blog/Ch3 架构决策插叙`
- **Available Code/Doc Baseline**:
  - `sandbox_governance_architecture.md#L11` 记录了早期设想：“共享 MySQL：后端管 schema，算法端读写”。
  - `src/server/services/workspace_service.py#L4-L8` 和 `src/server/clients/backend_api_client.py#L1-L40` 证明了当前实现完全基于 HTTP Internal API 治理，不再直连数据库。
  - `tests/test_workspace_service_lifecycle.py#L60-L152` 中的 3 个测试因旧 DB 直连方法被移除而被标记为 `@pytest.mark.skip`。
- **Unproven Gap / Unknown**:
  - 推动这一重构的直接触发因素是什么（如团队职责解耦、跨语言数据库连接池开销、多环境部署隔离还是安全审计要求）。
- **Proposed Question for User**:
  - Workspace 治理从早期的“算法端直连 MySQL 表”重构为“后端 HTTP Internal API 统一托管”，最核心的工程驱动力是团队职责解耦、数据库连接隔离还是安全审计规范？
- **Recommended Conservative Formulation**:
  - 在平台微服务化演进中，系统将沙箱生命周期状态机从算法端直连数据库重构为后端专用 Internal API 统一治理，实现了计算执行与状态持久化的解耦。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`

---

### GAP-ART-001: 非 ASCII / 中文产物路径 Daytona Toolbox Multipart 损坏的业务触发场景
- **Gap ID**: `GAP-ART-001`
- **Topic**: `Artifact Durability`
- **Affected Deliverable**: `recap-blog/Ch3 产物持久化与非 Happy Path 恢复`
- **Available Code/Doc Baseline**:
  - `src/server/services/artifact_service.py#L132-L145` 与 `#L259-L273` 明确实现了对非 ASCII 路径的探测（`_is_ascii`），并在下载/上传时使用 `/tmp/_artifact_dl/` 和 `/tmp/_artifact_restore/` 临时 ASCII 路径中转，再通过 Shell `cp` / `mv` 移动。
  - `tests/test_artifact_restore.py#L110-L137` 包含中文路径回灌的专项回归测试。
- **Unproven Gap / Unknown**:
  - 该底层兼容性问题最初是在生成或导出何种具体业务产物（如中文命名的 HTML 报告、带中文列名的导出 CSV）时定位到的。
- **Proposed Question for User**:
  - 沙箱产物同步中对非 ASCII / 中文路径设计临时 ASCII 文件中转，最初是在导出何种具体业务文件时发现的 Daytona Toolbox 编码缺陷？
- **Recommended Conservative Formulation**:
  - 针对沙箱底层工具箱在处理非 ASCII 文件名 Multipart 传输时的已知编码兼容性边界，算法端通过临时 ASCII 文件中转配合沙箱内原子文件移动，实现了对中文产物路径的透明兜底。
- **Resolution Status**: `OPEN`
- **Resolution Notes & User Input**: `(待第二轮 Grilling 填写)`
