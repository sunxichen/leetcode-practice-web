# Fragment: Workspace 状态机与底层 Daytona Sandbox 状态逐态对应 (`f06`)

> **定位说明**：针对 Follow-up #6，解答“Workspace 状态机与底层 Daytona sandbox 状态逐态对应”。本文件作为独立研究底稿片段，供后续整合至 `recap-blog.md` §2.3。

---

## 1. 电梯答案 (Elevator Answer)

1. **双层状态解耦架构**：系统将 **后端 DB 业务生命周期状态（6 态）** 与 **Daytona Provider 底层物理容器状态（5+ 态）** 严格解耦。DB 状态代表“用户会话（`thread_id`）与计算沙箱槽位的逻辑绑定生命周期”，Daytona 状态代表“云端沙箱容器的物理运行现状”。
2. **六态逐态对应**：
   - `allocating` ↔ Daytona 无实例 / 正在拉起（`pending_build` / `starting`）；
   - `allocated` ↔ Daytona 实例正常存在，处于 `started`（活跃运行）或 `stopped`（空闲挂起）；
   - `reclaiming` ↔ Daytona 实例正在被调用 `daytona.delete(sandbox)` 销毁；
   - `reclaimed` ↔ Daytona 实例物理不存在（`not_found` / 404），DB 保留会话元数据；
   - `destroying` ↔ Daytona 实例正在物理删除，DB 关联元数据正在级联清空；
   - `error` ↔ Daytona 实例创建失败（`build_failed`/`error`）、恢复失败或处于未知异常态（`archived`）。
3. **自愈与治理核心原则**：
   - **挂起与分配解耦**：Daytona 的 `auto_stop`（转为 `stopped`）**不修改 DB 的 `allocated` 状态**，仅在下次请求复用时由算法端执行 `_resume_workspace`（`daytona.start(timeout=60)`）并在内存与 DB 刷新 `last_active_at`；
   - **404 幽灵沙箱自愈**：复用探活遭遇 Daytona `not_found` 时，算法端主动将 DB 状态重置为 `reclaimed`（清空 `workspace_id` 与导入缓存），递归触发重新 claim，冷启动新建沙箱并回灌历史产物；
   - **Janitor 幂等回收**：后端 Janitor 发起 `POST /reclaim` 时若沙箱已不存在（404），算法端按幂等成功处理，保障批量治理链路稳定。

---

## 2. 详解 (Detailed Analysis)

### 2.1 双层解耦设计哲学与职责划分

在长任务沙箱治理体系中，算法执行端与持久化存储端遵循清晰的契约边界：
- **后端 DB 状态机** (`src/server/services/workspace_service.py#L41-L50`, `sandbox_governance_backend_team_dev.md#L122-L132`)：通过 `long_task_workspaces` 表持久化管理，行级锁仲裁分配权（Claim）与 Run 独占租约（Lease）。
- **Daytona 物理状态** (`daytona 0.167.0`, `workspace_service.py#L134-L150`)：由云端 Daytona Server 维护，通过专属线程池（16 workers）执行同步阻塞 SDK 调用。

```
                     【后端 DB 业务生命周期状态机】

                     ┌──────────────┐
                     │  (初始无记录) │
                     └──────┬───────┘
                            │ POST allocation/claim (mode="claimed")
                            ▼
                     ┌──────────────┐  Daytona 创建失败 / 超时
                     │  allocating  ├─────────────────────────► ┌───────────┐
                     └──────┬───────┘                           │   error   │
                            │ Daytona 创建成功 + init 目录完成    └─────┬─────┘
                            ▼                                         ▲
                     ┌──────────────┐  沙箱探活非预期 / resume 失败     │
    ┌───────────────►│  allocated   ├─────────────────────────────────┘
    │                └──────┬───────┘
    │                       │ Janitor 空闲 TTL 超时 (10min)
    │                       ▼
    │                ┌──────────────┐
    │                │  reclaiming  │
    │                └──────┬───────┘
    │                       │ 算法端 daytona.delete() 成功 (含 404 幂等)
    │                       ▼
    │ 新请求重新 claim ┌──────────────┐  用户删除会话  ┌───────────┐
    └────────────────┤  reclaimed   ├──────────────►│destroying │
                     └──────────────┘               └───────────┘
```

---

### 2.2 六大 Workspace 状态逐态深度剖析

#### 1. `allocating`（分配 / 创建中）
- **Daytona 侧实际状况**：沙箱物理上尚不存在，或处于 `pending_build` / `starting` 中。
- **进入条件**：
  - 会话首次发起请求，调用 `POST /internal/long-task/workspaces/{thread_id}/allocation/claim`，后端 DB 插入记录并返回 `mode="claimed"` (`workspace_service.py#L206-L209`)；
  - 已处于 `reclaimed` 的会话收到新请求，后端原子更新为 `allocating` 并返回 `mode="claimed"`；
  - 旧有 `allocating` 记录超时（超过 5 分钟 allocating TTL），允许新请求接管重新 claim。
- **退出条件**：
  - **成功**：`daytona.create(params, timeout=240)` 成功，且在沙箱内执行 `process.exec(WORKSPACE_INIT_COMMAND)` 创建基础目录完成，算法端调用 `PATCH /internal/long-task/workspaces/{thread_id}/state` 将状态置为 `allocated` (`workspace_service.py#L264-L286`)。
  - **失败**：创建超时或抛出异常，算法端执行补偿清理（若已生成 sandbox 则 `daytona.delete(sandbox)`），并 `PATCH` 状态为 `error`（携带 `error_code="DAYTONA_CREATE_FAILED", error_retryable=True`）(`workspace_service.py#L312-L338`)。

---

#### 2. `allocated`（已分配绑定）
- **Daytona 侧实际状况**：物理沙箱已存在，可能处于 `started`（正在运行）或 `stopped`（空闲达到 `auto_stop_interval` 挂起）。
- **进入条件**：
  - 沙箱从 `allocating` 成功创建并初始化；
  - `mode="reuse"` 下探活成功或 `_resume_workspace` 成功，刷新 `last_active_at`。
- **退出条件**：
  - **正常业务回收**：长期无活跃任务，`last_active_at` 超过空闲 TTL（10 分钟），后端 Janitor 标记为 `reclaiming`；
  - **用户主动销毁**：用户在前端删除会话，触发 `destroying`；
  - **探活异常**：复用探活发现沙箱处于 `archived` 或未知异常态，流转至 `error`。
- **关键设计**：Daytona 底层 `auto_stop` 将物理容器置为 `stopped` 时，**DB 状态保持 `allocated` 不变**，避免了高频写 DB 带来的锁竞争 (`workspace_service.py#L506-L510`)。

---

#### 3. `reclaiming`（业务回收中）
- **Daytona 侧实际状况**：物理沙箱处于 `started` 或 `stopped`，正在被调用 `daytona.delete(sandbox)` 销毁。
- **进入条件**：后端 Janitor 定时扫描发现 `last_active_at` 超时且 `active_run_id` 为空，将 DB 状态更新为 `reclaiming`，并向算法端发起 `POST /long-task/workspaces/{thread_id}/reclaim` (`long_task_agent_routers.py#L120-L133`, `workspace_service.py#L610-L665`)。
- **退出条件**：
  - 算法端调用 `daytona.delete()` 成功（若沙箱已不存在返回 404，亦视为幂等成功）；
  - 算法端清理本地进程内缓存 `backend_api_client.remove_workspace_cache(thread_id)`；
  - 后端将 DB 状态更新为 `reclaimed`，将 `workspace_id` 置 `NULL`，并清空导入缓存（`last_imported_workspace_id=NULL`, `imported_upload_ids=NULL`）。

---

#### 4. `reclaimed`（已回收 / 待复用）
- **Daytona 侧实际状况**：沙箱在 Daytona 侧已物理删除（`not_found`），无计算资源占用。
- **进入条件**：`reclaiming` 流程顺利完成并落库。
- **退出条件**：用户在该会话再次发送输入，请求到达 `POST allocation/claim`，后端检测到 `status="reclaimed"`，将其重置为 `allocating` 并返回 `mode="claimed"`，引导算法端进入冷启动重建流程并触发历史 Artifact 回灌 (`long_task_agent_service.py#L263-L270`, `L350`)。

---

#### 5. `destroying`（永久销毁中）
- **Daytona 侧实际状况**：物理沙箱正在被调用 `daytona.delete(sandbox)` 销毁或已不存在。
- **进入条件**：用户在前端显式删除会话，后端调用算法端 `DELETE /long-task/workspaces/{thread_id}` (`long_task_agent_routers.py#L144-L165`, `workspace_service.py#L667-L699`)。
- **退出条件**：算法端删除沙箱并清理进程内缓存，后端物理/逻辑删除 DB 中的 `long_task_workspaces` 绑定行、导入缓存和 `artifact_manifests` 索引。

---

#### 6. `error`（异常故障态）
- **Daytona 侧实际状况**：物理沙箱创建失败（`build_failed`/`error`）、启动失败、处于未知异常态（如 `archived`），或底层通信断连。
- **进入条件**：
  - `_allocate_from_claim` 中 `daytona.create()` 超时（240s）或底层抛错；
  - `_resume_workspace` 中 `daytona.start()` 超时（60s）或启动失败；
  - 复用探活发现沙箱返回了非 `started`/`stopped` 的异常状态 (`workspace_service.py#L430-L445`)。
- **退出条件**：
  - **自动自愈重试**：若标记为 `error_retryable=True`，在重试退避时间（`retry_after_at`）到达且分配尝试次数 `allocation_attempts < 3` 时，后端 `allocation/claim` 允许将其重置为 `allocating` 重新创建；
  - **不可重试错误**：若为不可重试错误（如 `DAYTONA_STATE_UNKNOWN`），`allocation/claim` 拒绝分配并直接返回错误，需重新开启新会话。

---

### 2.3 核心自愈机制与状态治理行为源码级剖析

#### 机制 1：404 幽灵沙箱自愈 (Ghost Sandbox Self-Healing)
- **源码位置**：`src/server/services/workspace_service.py#L452-L473`
- **触发场景**：后端 DB 记录为 `status="allocated"` 且持有 `workspace_id`，但 Daytona 集群发生运维重启或底层清理，导致 `daytona.get(workspace_id)` 抛出 `404 / not found`。
- **自愈行为**：
  1. 算法端捕获 `not found / 404` 异常；
  2. 调用 `PATCH /internal/long-task/workspaces/{thread_id}/state`，提交 `status="reclaimed", workspace_id=None, clear_import_state=True`；
  3. 算法端递归调用 `self.ensure_workspace(...)`；
  4. 第二次 `allocation/claim` 命中 `reclaimed` 状态，后端返回 `mode="claimed"`，顺利重建新沙箱并在后续阶段自动拉取 OSS 产物完成回灌。

#### 机制 2：沙箱类型变更热重建 (Sandbox Type Change Rebuild)
- **源码位置**：`src/server/services/workspace_service.py#L367-L403`
- **触发场景**：用户在多轮会话中切换了 Agent 模式（例如从默认 Python 环境切换到包含特化依赖的 Snapshot），请求传入的 `sandbox_type` 与已有沙箱 label 中的 `sandbox_type` 不一致。
- **治理行为**：
  1. 算法端主动调用 `daytona.delete(old_sandbox)` 销毁旧环境；
  2. 通知后端 `PATCH ... status="reclaimed", clear_import_state=True`；
  3. 递归调用 `ensure_workspace` 申请全新 Snapshot 的沙箱，防止跨类型沙箱环境污染。

#### 机制 3：Janitor 幂等业务回收 (Idempotent Reclaim)
- **源码位置**：`src/server/services/workspace_service.py#L649-L656`
- **触发场景**：Janitor 定时任务触发回收，但在调用算法端 `POST /reclaim` 之前，沙箱已被外部或销毁逻辑物理删除。
- **治理行为**：算法端捕获 `not found / 404` 后不抛出 500 异常，而是作为幂等成功记录日志并清除进程内缓存，保障 Janitor 批处理任务不被单点中断。

#### 机制 4：Daytona 停止态与业务分配态解耦 (Decoupled Auto-Stop & Resume)
- **源码位置**：`src/server/services/workspace_service.py#L423-L428`, `L479-L535`
- **触发场景**：任务执行完毕后空闲达到 `daytona_auto_stop_minutes`，Daytona 物理沙箱变为 `stopped`。
- **治理行为**：
  1. DB 保持 `status="allocated"` 不变；
  2. 下次用户请求进入 `ensure_workspace`，`allocation/claim` 返回 `mode="reuse"`；
  3. 算法端探活发现 `state == SandboxState.STOPPED.value`，执行 `_resume_workspace`；
  4. 专属线程池调用 `daytona.start(sandbox, timeout=60)`，重新执行 `WORKSPACE_INIT_COMMAND`；
  5. 仅 `PATCH` 刷新 `last_active_at`，不修改 DB `status`。

---

## 3. 示例与逐态对照表 (Examples & Comparison Table)

### 表 1：Workspace 业务状态与 Daytona 物理状态逐态映射全景表

| Workspace 状态 (`WorkspaceStatus`) | Daytona 侧真实物理状态 (`SandboxState`) | 状态进入条件 (Trigger In) | 状态退出条件 (Trigger Out) | 状态不一致自愈与治理行为 (Governance & Healing) | 涉及 Internal API / SDK 方法 |
|---|---|---|---|---|---|
| **`allocating`** | 物理上不存在，或处于 `pending_build` / `starting` | • 首次会话 `allocation/claim` 获得分配权<br>• `reclaimed` 重建<br>• `allocating` 超时被新请求接管 | • Daytona 创建成功且 init 完成 ➔ `allocated`<br>• 创建异常/超时 ➔ `error` | • 创建失败时算法端补偿调用 `daytona.delete()`<br>• 后端为 `allocating` 设 5min TTL，超时允许接管 | `POST allocation/claim`<br>`daytona.create(timeout=240)`<br>`process.exec(init)`<br>`PATCH state (allocated/error)` |
| **`allocated`** | 处于 **`started`**（活跃）或 **`stopped`**（空闲挂起） | • `allocating` 创建并 init 成功<br>• `mode="reuse"` 复用或 resume 成功 | • Janitor 空闲 TTL 超时 ➔ `reclaiming`<br>• 用户删除会话 ➔ `destroying`<br>• 探活未知异常 ➔ `error` | • **解耦治理**：底层 `auto_stop` 变为 `stopped` 不改 DB 状态<br>• 复用发现 `stopped` 触发 `daytona.start()` 自愈唤醒<br>• 探活发现 404 触发重置为 `reclaimed` 并递归重建 | `POST allocation/claim (reuse)`<br>`daytona.get()`<br>`daytona.start(timeout=60)`<br>`PATCH state (last_active_at)` |
| **`reclaiming`** | 处于 `started` / `stopped`，正在被执行物理删除 | • 后端 Janitor 扫描发现空闲超时（`last_active_at` 超期且无活跃 run），主动发起到算法端的回收调用 | • Daytona 沙箱删除成功（或 404 幂等确认）➔ `reclaimed`<br>• 删除异常 ➔ 告警重试 | • **幂等删除**：若沙箱物理上已被删除（404），视为回收成功<br>• 清除算法端进程内缓存，防止旧引用残留 | `POST /workspaces/{thread_id}/reclaim`<br>`daytona.delete()`<br>`UPDATE status='reclaimed'` |
| **`reclaimed`** | **物理上已不存在** (`not_found` / 404) | • Janitor 业务回收成功完成落库 | • 用户发送新 prompt，新请求重新发起 `allocation/claim` ➔ `allocating` | • **冷启动重建与产物回灌**：再次分配时以全新沙箱启动，并从 OSS 将历史产物回灌至沙箱，重建文件索引 | `POST allocation/claim`<br>`UPDATE status='allocating'`<br>`ArtifactService.restore_artifacts_to_sandbox` |
| **`destroying`** | 正在执行物理删除，或已物理不存在 | • 用户在前端主动删除会话 / Thread | • 沙箱删除完成且 DB 级联清理完成 ➔ 记录物理清除 | • 优先调用 `daytona.delete()` 清理底层容器；若 Daytona 报错仍继续清理 DB 元数据，保证用户端删除不卡死 | `DELETE /workspaces/{thread_id}`<br>`daytona.delete()`<br>`DELETE FROM long_task_workspaces` |
| **`error`** | 创建失败 (`build_failed`)、启动失败、处于未知异常态 (`archived`) 或不可达 | • `daytona.create()` 超时/报错<br>• `_resume_workspace` 启动失败<br>• 复用探活遇到非预期状态 | • 可重试错误退避时间到达且重试次数 `< 3` ➔ `allocating`<br>• 不可重试错误需重建会话 | • **结构化错误恢复**：落库结构化 `error_code` 与 `error_retryable` 标识<br>• 自动重试时重置为 `allocating` 重新分配沙箱 | `PATCH state (error)`<br>`POST allocation/claim (retry)` |

---

### 表 2：Daytona 物理状态变更引发的系统自愈决策矩阵

| 场景 | 触发时机 | 观测到的 Daytona 物理状态 | DB 记录状态 | 系统自愈与处理行为 |
|---|---|---|---|---|
| **常规会话复用** | 用户在活跃会话连续发消息 | `SandboxState.STARTED` | `allocated` | 确认 init 目录，刷新 `last_active_at`，直接进入执行（零额外开销）。 |
| **空闲唤醒复用** | 用户间隔数小时后继续发消息 | `SandboxState.STOPPED` | `allocated` | 线程池调用 `daytona.start(timeout=60)` 唤醒容器，重新执行 init 命令，刷新 `last_active_at`。 |
| **沙箱集群漂移/丢失** | Daytona 宿主机异常或沙箱被运维清除 | `404 Not Found` | `allocated` | 算法端捕获 404，`PATCH` 为 `reclaimed` 并清空 `workspace_id` 与导入缓存，递归调用 `ensure_workspace` 触发全新创建并回灌产物。 |
| **环境依赖切换** | 请求携带了新的 `sandbox_type` | 现有沙箱标签与请求不符 | `allocated` | 算法端物理删除旧沙箱，`PATCH` 为 `reclaimed`，递归重新 claim 创建新 Snapshot 沙箱。 |
| **沙箱进入损坏态** | 底层容器损坏或被归档 | `SandboxState.ARCHIVED` / Unknown | `allocated` | 算法端记录警告，`PATCH` 状态为 `error`（`DAYTONA_STATE_UNKNOWN`），抛出运行时异常阻止污染。 |

---

## 4. 证据清单 (Evidence List)

### 4.1 项目源码证据 (Project Sources)
- `.scratch/langagent-develop-reference/src/server/services/workspace_service.py`：
  - `L41-L50`：`WorkspaceStatus` 枚举定义（`allocating`, `allocated`, `reclaiming`, `reclaimed`, `destroying`, `error`）。
  - `L74-L76`：`_daytona_thread_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="daytona-io")` 专属线程池配置。
  - `L174-L235`：`ensure_workspace` 分配权仲裁（`claimed` / `reuse` / `wait`）与 404 容错自愈入口。
  - `L236-L340`：`_allocate_from_claim` 沙箱创建、超时（240s）、init 目录初始化与失败补偿清理（`status="error"`）。
  - `L341-L478`：`_reuse_workspace` 沙箱探活（`started` / `stopped` / `not_found`）、沙箱类型变更销毁重建与 404 幽灵沙箱自愈重置。
  - `L479-L535`：`_resume_workspace` 针对 stopped 沙箱的 `daytona.start(timeout=60)` 唤醒机制。
  - `L537-L585`：`acquire_run_lease`、`release_run_lease`、`renew_run_lease` Run 级独占租约治理。
  - `L610-L665`：`reclaim_workspace` 业务回收与 404 幂等处理。
  - `L667-L699`：`destroy_workspace` 会话销毁逻辑。
  - `L701-L729`：`suspend_workspace` Provider 级 stop 挂起（不改 DB status）。
  - `L734-L749`：`_query_provider_state` 底层探活与状态字符串转换。

- `.scratch/langagent-develop-reference/src/server/services/long_task_agent_service.py`：
  - `L258-L289`：Stage 1 Workspace 状态流转与 SSE 事件发射。
  - `L294-L313`：Stage 1.5 Run 租约抢占与互斥阻断。
  - `L329-L338`：后台协程 `_lease_renewal`（默认 30s 续租，`settings.run_lease_renewal_interval_seconds`）与 `_provider_heartbeat`（默认 120s `true` 保活，`settings.provider_heartbeat_interval_seconds`；默认值见 `src/server/config/config.py` L137-L138）。
  - `L900-L914`：`finally` 块中 `asyncio.shield` 确保租约必定释放。
  - `L916-L971`：续租失败上限与心跳保活执行逻辑。

- `.scratch/langagent-develop-reference/src/server/routes/long_task_agent_routers.py`：
  - `L99-L117`：`GET /long-task/workspaces/{thread_id}` 查询状态（含 `provider_state`）。
  - `L119-L142`：`POST /long-task/workspaces/{thread_id}/reclaim` Janitor 回收路由。
  - `L144-L165`：`DELETE /long-task/workspaces/{thread_id}` 销毁路由。
  - `L167-L172`：`POST /long-task/workspaces/{thread_id}/suspend` 挂起路由。

- `.scratch/langagent-develop-reference/src/server/schema/backend_api_schema.py`：
  - `L14-L55`：`ClaimAllocationRequest`、`WorkspaceRecordVO`、`ClaimAllocationResult`、`PatchWorkspaceStateRequest` 数据模型。
  - `L170-L180`：`ReclaimRequest` 模型定义。

### 4.2 架构与后端设计文档证据 (Architecture Docs)
- `/Users/sunxichen/Projects/langAgent/sandbox_governance_backend_team_dev.md`：
  - `L41-L65`：后端 DB `long_task_workspaces` 表结构与状态字段定义。
  - `L122-L132`：DB 状态语义与 Janitor 行为规范。
  - `L363-L407`：`POST allocation/claim` 仲裁流转算法与重试规则。
- `/Users/sunxichen/Projects/langAgent/sandbox_governance_architecture.md`：
  - `L20-L40`：双层状态机解耦架构图与状态定义。

### 4.3 测试用例证据 (Test Sources)
- `.scratch/langagent-develop-reference/tests/test_workspace_service_lifecycle.py#L60-L151`：旧架构生命周期测试用例（包含 resume stopped sandbox、处理 archived 异常态以及 suspend 幂等性的历史验证逻辑）。

### 4.4 Fact Base 锚点
- `fact-base.md` 条目 `FACT-LT-002` (L101)：`WorkspaceService` 六态生命周期与 Daytona 专属线程池/显式超时。
- `fact-base.md` 条目 `FACT-LT-004` (L104)：Run 级独占租约与心跳保活机制。
- `fact-base.md` 条目 `FACT-LT-007` (L107)：`ToolErrorGuardMiddleware` 异常拦截与沙箱超时保护。
