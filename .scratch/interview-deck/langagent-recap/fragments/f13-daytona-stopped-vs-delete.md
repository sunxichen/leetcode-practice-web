# Fragment: Daytona stopped 与 delete 的区别与状态机映射 (`f13`)

> **定位说明**：针对 Follow-up #18，深度辨析 Daytona 沙箱 `stopped` 与 `delete` 两种状态的底层语义差异，并剖析二者在 langAgent Workspace 状态机中的映射机制与恢复链路。本文件作为独立研究底稿片段，与 `f06-workspace-daytona-states.md` 保持互补一致，聚焦于“区别”与“恢复分支”本身。

---

## 1. 电梯答案 (Elevator Answer)

1. **底层物理语义本质区别**：
   - **`stopped`（挂起/停机）**：沙箱处于**可逆挂起**状态。底层容器进程被暂停/终止，CPU/内存计算资源释放，但**磁盘文件系统完全持久化保留**。可通过 `daytona.start(sandbox, timeout=60)` 在秒级拉起恢复为 `started` 运行态。停机通常由沙箱创建时注入的 `auto_stop_interval`（默认 30 分钟无活动）自动触发，或由后端显式调用 `suspend` 触发；
   - **`delete`（销毁/回收）**：沙箱处于**不可逆物理删除**状态。底层容器与本地磁盘被彻底抹除。删除后再次查询该 `workspace_id` 将返回 `404 Not Found`（Daytona SDK 抛出 `DaytonaNotFoundError`，内部状态置为 `SandboxState.DESTROYED`）。无法通过 `start` 恢复。
2. **Workspace 业务状态机映射差异**：
   - **`stopped` ↔ DB 保持 `allocated`（挂起与分配解耦）**：Daytona 发生 `auto_stop` 时**不触发任何 DB 状态写操作**，避免高频竞争。下次请求到达时后端返回 `mode="reuse"`，算法端在 `_reuse_workspace` 探活命中 `SandboxState.STOPPED.value`，调用 `_resume_workspace` 执行 `daytona.start(timeout=60)` 暖唤醒，并仅 `PATCH` 刷新 `last_active_at`；
   - **`delete` / `not_found` ↔ DB 映射为 `reclaimed`（或 `destroying`）**：沙箱被 Janitor 回收（`daytona.delete()`）后 DB 置为 `reclaimed` 且 `workspace_id=NULL`。下次请求到达时后端返回 `mode="claimed"`，算法端在 `_allocate_from_claim` 执行全新创建（冷启动 `daytona.create(timeout=240)`），并由 `ArtifactService.restore_artifacts_to_sandbox` 从 OSS 文件服务将历史产物全量回灌至沙箱。
3. **容错与超时治理分支**：
   - `_resume_workspace` 设有 60s 唤醒硬超时；若底层唤醒失败抛出异常，通知后端置为 `status="error", error_code="DAYTONA_RESUME_FAILED", error_retryable=True`，允许后续请求在退避后重新分配自愈；
   - 若 DB 记录为 `allocated` 但 Daytona 底层返回 404（幽灵沙箱），算法端自动捕获并 `PATCH` 为 `status="reclaimed"`，递归重新 claim 触发冷启动重建与产物回灌自愈。

---

## 2. 详解 (Detailed Analysis)

### 2.1 Daytona `stopped` 状态深度剖析

#### 1. 语义与数据持久性
- **文件系统持久保留**：在 Daytona 架构中，`stopped` 状态仅代表容器实例停止运行（类似于 `docker stop`）。沙箱分配的虚拟磁盘卷（Volume/OverlayFS）未被卸载或删除，`/workspace/project`、`/workspace/artifacts` 等目录下的所有代码、生成产物、虚拟环境改动完全保留。
- **内存与进程释放**：容器内运行的 Python 进程、后台服务（如 LSP/Toolbox 监听进程）被终止，内存状态清空，CPU 算力占用归零。
- **可恢复性**：调用 `daytona.start(sandbox, timeout=60)`（`daytona/_sync/daytona.py#L611-L622`）可直接拉起容器，耗时通常在 2~5 秒量级（暖启动），无需重新下载镜像或 Snapshot。

#### 2. 触发机制：`auto_stop_interval` 与心跳防御
- **自动停机触发**：在创建沙箱时，算法端通过 `CreateSandboxFromSnapshotParams` 显式注入 `auto_stop_interval=settings.daytona_auto_stop_minutes`（默认 30 分钟，`workspace_service.py#L252`, `config.py#L96`）。当沙箱内持续 30 分钟无任何活动（无命令执行、无文件 I/O、无网络交互）时，Daytona Server 主动将物理沙箱置为 `stopped`。
- **主动挂起触发**：系统暴露 `POST /long-task/workspaces/{thread_id}/suspend` 接口（`long_task_agent_routers.py#L167-L172`），调用 `workspace_service.suspend_workspace` 执行 `daytona.stop(sandbox, timeout=60)`（`workspace_service.py#L701-L729`），实现 provider 级主动停机。
- **活跃任务心跳防御（Provider Heartbeat）**：为了防止长时间运行的大模型推理或多步 Agent 链被 Daytona `auto_stop` 意外停机，任务执行期间算法端后台协程 `_provider_heartbeat` 默认每 120 秒（`settings.provider_heartbeat_interval_seconds`，`config.py#L138`）通过线程池在沙箱内执行轻量级 no-op 命令 `true`（`long_task_agent_service.py#L333-L338`, `L943-L971`），持续刷新 Daytona 活跃时间戳。

#### 3. 资源与计费口径
- **算力资源**：CPU/Memory 算力在停机期间不被独占占用，释放回宿主机资源池。
- **计费口径**：*（注：以下基于 Daytona 公开平台语义与云沙箱标准模型，未在本地代码库直接核实）* `stopped` 状态下通常停止计算时长计费（Compute Unit 暂停），但仍占用沙箱存储配额或保留存储基线容量。

---

### 2.2 Daytona `delete` 状态深度剖析

#### 1. 语义与不可逆销毁
- **物理资源彻底抹除**：调用 `daytona.delete(sandbox, timeout=60)`（`daytona/_sync/daytona.py#L488-L506`, `daytona/_sync/sandbox.py#L335-L344`）会向 Daytona Server 发送删除指令，底层容器实例、工作区磁盘卷以及关联的网络命名空间被物理销毁。
- **不可逆性**：一旦执行删除，沙箱内的所有临时文件、未持久化到 OSS 的本地产物均被永久清除，无法通过任何 `start` 或 `recover` API 恢复。

#### 2. API 查询行为与 404 / `DaytonaNotFoundError`
- **查询返回 404**：当沙箱被删除后，调用 `daytona.get(workspace_id)`（`daytona/_sync/daytona.py#L510-L540`）会抛出 HTTP 404 错误。
- **SDK 异常封装**：Daytona Python SDK 将 404 错误映射为 `DaytonaNotFoundError`（`daytona/common/errors.py#L52`, `L161`）。
- **SDK 内部状态变更**：在 `Sandbox` 对象内部，若安全刷新数据时捕获到 `DaytonaNotFoundError`，会将实例状态显式置为 `self.state = SandboxState.DESTROYED`（`daytona/_sync/sandbox.py#L801-L809`）。

#### 3. 触发场景
- **Janitor 闲置超时回收**：会话 `last_active_at` 超出业务空闲 TTL（10 分钟）且无活跃 Run 时，后端 Janitor 将 DB 状态置为 `reclaiming` 并调用算法端 `POST /reclaim`，算法端执行 `daytona.delete()` 释放底层资源（`workspace_service.py#L610-L665`）。
- **沙箱类型变更（Snapshot 切换）**：当用户请求传入的 `sandbox_type` 与已有沙箱 label 不一致时，算法端主动调用 `daytona.delete(old_sandbox)` 销毁旧环境，以避免环境污染（`workspace_service.py#L367-L387`）。
- **用户主动删除会话**：用户在前端删除 Thread，触发 `destroy_workspace` 调用 `daytona.delete()` 并级联清理 DB 元数据（`workspace_service.py#L667-L699`）。
- **创建失败补偿清理**：在 `_allocate_from_claim` 中若沙箱创建或初始化阶段抛错，`try...except` 块中立即执行 `daytona.delete(sandbox)` 进行补偿清理，防止残留孤儿沙箱（`workspace_service.py#L316-L324`）。

---

### 2.3 在 Workspace 状态机中的映射与治理差异

后端 DB 业务生命周期状态（`WorkspaceStatus` 6 态）与 Daytona 物理状态（`SandboxState` 5+ 态）之间存在核心的映射分工：

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               后端 DB 业务生命周期状态                     │
                    └───────────┬─────────────────────────────────┬───────────┘
                                │                                 │
           DB 保持 allocated     │                                 │ DB 变迁为 reclaimed / destroying
                                ▼                                 ▼
┌───────────────────────────────────────────────────┐   ┌───────────────────────────────────────────────────┐
│               Daytona: stopped                    │   │               Daytona: delete / not_found         │
├───────────────────────────────────────────────────┤   ├───────────────────────────────────────────────────┤
│ • 容器挂起，磁盘保留，算力释放                       │   │ • 容器销毁，磁盘抹除，物理不存在                    │
│ • 状态机映射：allocated (挂起与分配解耦)           │   │ • 状态机映射：reclaimed / destroying              │
│ • 触发源：auto_stop_interval (30min) 或 suspend   │   │ • 触发源：Janitor (10min TTL)、类型变更、用户删除    │
│ • 下次请求：mode="reuse" ➔ _resume_workspace     │   │ • 下次请求：mode="claimed" ➔ _allocate_from_claim │
│ • 唤醒动作：daytona.start(timeout=60) (秒级暖启)   │   │ • 重建动作：daytona.create(240s) + OSS 产物回灌    │
│ • 恢复失败：status="error", error_retryable=True  │   │ • 异常自愈：404 幽灵沙箱自愈（重置 reclaimed 递归） │
└───────────────────────────────────────────────────┘   └───────────────────────────────────────────────────┘
```

#### 1. `stopped` 映射：解耦治理与暖启动恢复 (`_resume_workspace`)
- **挂起与分配解耦**：底层 Daytona 沙箱由于 `auto_stop` 进入 `stopped` 时，**DB 中的 `long_task_workspaces` 保持 `status="allocated"` 不变**（`workspace_service.py#L506-L510`）。这种设计消除了物理状态瞬变对数据库行锁与高频更新的冲击。
- **复用探活与唤醒**：新请求到达时，`POST allocation/claim` 返回 `mode="reuse"`。算法端在 `_reuse_workspace`（`workspace_service.py#L341-L478`）中查询 Daytona 实际状态：
  1. 发现 `state == SandboxState.STOPPED.value`；
  2. 调用 `_resume_workspace`，调度专属线程池执行 `daytona.start(sandbox, timeout=60)`；
  3. 执行 `sandbox.process.exec(WORKSPACE_INIT_COMMAND)` 确保基础目录就绪；
  4. 调用 `PATCH /internal/long-task/workspaces/{thread_id}/state` 刷新 `last_active_at=_now_iso()`（不改 `status`）；
  5. 耗时仅需数秒，磁盘历史文件原样可用，直接复用。

#### 2. `delete` 映射：冷启动重建与历史产物回灌 (`_allocate_from_claim` + `restore_artifacts`)
- **冷启动重建**：当会话处于 `reclaimed` 状态（物理沙箱已 delete），用户发送新请求时：
  1. `POST allocation/claim` 返回 `mode="claimed"`，DB 状态转为 `allocating`；
  2. 算法端在 `_allocate_from_claim`（`workspace_service.py#L236-L311`）调用 `daytona.create(params, timeout=240)` 创建全新物理沙箱，并执行 `WORKSPACE_INIT_COMMAND`；
  3. 调用 `PATCH` 将 DB 状态置为 `allocated` 并更新 `workspace_id`；
  4. 返回包含 `created=True` 的 `WorkspaceRecord`。
- **OSS 产物回灌（Artifact Restore）**：由于新沙箱磁盘为空，Stage 2.4 中（`long_task_agent_service.py#L353-L361`）检测到 `workspace.created == True` 且 `settings.long_task_artifact_restore_enabled == True`，调用 `ArtifactService.restore_artifacts_to_sandbox`（`artifact_service.py#L202-L260`）：
  1. 调后端 API 查询该会话的历史 `artifact_manifests` 清单；
  2. 遍历清单从 OSS 下载文件字节，在沙箱内 `mkdir -p` 创建父目录；
  3. 通过 Toolbox 上传文件至沙箱原路径，并回填内存中的 sha256 缓存，无缝恢复历史文件上下文。

#### 3. 404 幽灵沙箱自愈机制 (Ghost Sandbox Self-Healing)
- **场景**：若 DB 记录为 `allocated`（持有旧 `workspace_id`），但底层 Daytona 因宿主机漂移、集群重启或底层异常导致沙箱丢失，算法端 `daytona.get()` 捕获到 `404 / not found`（`workspace_service.py#L452-L473`）。
- **自愈动作**：
  1. 算法端不抛出崩溃，主动调用 `PATCH /internal/long-task/workspaces/{thread_id}/state`，提交 `status="reclaimed", workspace_id=None, clear_import_state=True`；
  2. 算法端递归调用 `self.ensure_workspace(...)`；
  3. 第二次仲裁命中 `reclaimed` 状态，后端返回 `mode="claimed"`，顺利流转至全新沙箱冷启动创建与 OSS 产物回灌。

---

## 3. 对照表与最小时序流 (Comparison Table & Minimal Sequence Flows)

### 3.1 核心对比总表：Daytona `stopped` vs `delete`

| 比较维度 | Daytona `stopped` (挂起/停机) | Daytona `delete` (删除/回收) | 源码核验位置 |
|---|---|---|---|
| **物理存在性** | ✅ 物理容器存在，处于停止态 | ❌ 物理容器与卷已被彻底销毁（404） | `daytona/_sync/sandbox.py#L74`, `L808` |
| **磁盘与文件系统** | ✅ **完全保留**（代码、产物、环境无损） | ❌ **完全清空**（磁盘卷释放，不可恢复） | `daytona/_sync/daytona.py#L414`, `L488` |
| **内存与算力状态** | 进程终止，内存清空，CPU/Memory 释放 | 全部物理资源释放 | `daytona/_sync/daytona.py#L625` |
| **恢复方式** | **暖启动**：`daytona.start(sandbox, timeout=60)` | **冷启动**：`daytona.create(timeout=240)` + OSS 回灌 | `workspace_service.py#L266`, `L498` |
| **典型恢复耗时** | **秒级**（约 2 ~ 5s） | **十秒至分钟级**（镜像拉起 + 产物下载） | `workspace_service.py#L259`, `L498` |
| **主要触发源** | 1. `auto_stop_interval`（30min 无活动）<br>2. 接口 `POST /suspend` | 1. Janitor 回收（10min 空闲 TTL）<br>2. 沙箱类型变更<br>3. 用户删除会话<br>4. 创建失败补偿 | `workspace_service.py#L252`, `L381`, `L643`, `L689` |
| **DB 业务状态映射** | **`allocated`**（挂起与分配解耦，不改 DB） | **`reclaimed`** 或 **`destroying`**（`workspace_id=NULL`） | `workspace_service.py#L41-L50`, `L506` |
| **下次请求 Claim 模式** | `mode="reuse"` | `mode="claimed"` | `workspace_service.py#L206`, `L211` |
| **下次请求主执行函数** | `_reuse_workspace` ➔ `_resume_workspace` | `_allocate_from_claim` ➔ `restore_artifacts_to_sandbox` | `workspace_service.py#L207`, `L428` |
| **超时与失败处理** | 超时 60s；失败置 `status="error", error_code="DAYTONA_RESUME_FAILED", error_retryable=True` | 超时 240s；创建失败补偿 delete，置 `status="error", error_code="DAYTONA_CREATE_FAILED", error_retryable=True` | `workspace_service.py#L330-L335`, `L525-L531` |
| **探活 404 反应** | 不适用（探活若为 404 判定为幽灵沙箱，自愈转 reclaimed） | 探活返回 `not_found`（`DaytonaNotFoundError`），确认为已回收态 | `workspace_service.py#L453-L473`, `L745-L748` |
| **资源与计费口径** | 释放 CPU/Memory 算力，保留存储配额 *(本地源码未直接体现计费逻辑，引公有云语义)* | 彻底释放所有算力与存储配额 | `config.py#L94-L96` |

---

### 3.2 最小时序一：Resume Stopped Sandbox (暖启动唤醒链路)

```text
[User / Web UI]            [Algorithm: WorkspaceService]            [Daytona Server]            [Backend DB]
       │                                  │                                 │                         │
       │── 1. POST /stream/run ──────────>│                                 │                         │
       │                                  │── 2. POST allocation/claim ──────────────────────────────>│
       │                                  │<─ 3. return mode="reuse", record ─────────────────────────│
       │                                  │      (DB status="allocated")    │                         │
       │                                  │                                 │                         │
       │                                  │── 4. daytona.get(workspace_id) >│                         │
       │                                  │<─ 5. return state="stopped" ────│                         │
       │                                  │                                 │                         │
       │                                  │── 6. _resume_workspace() ───────│                         │
       │                                  │   ├── daytona.start(timeout=60)>│ (唤醒容器, 磁盘保持)      │
       │                                  │   │<── OK (state="started") ────│                         │
       │                                  │   └── exec(WORKSPACE_INIT) ────>│ (检查目录结构)           │
       │                                  │                                 │                         │
       │                                  │── 7. PATCH state (last_active_at) ───────────────────────>│
       │                                  │      (DB status 保持 allocated) │                         │
       │                                  │                                 │                         │
       │                                  │── 8. 进入 Agent 推理与执行 ─────>│                         │
```

---

### 3.3 最小时序二：Delete 后的 Reclaim & Cold Rebuild (冷启动重建与 OSS 产物回灌)

```text
[Janitor / User]          [Algorithm: WorkspaceService]            [Daytona Server]            [Backend DB / OSS]
       │                                  │                                 │                         │
── Phase A: 闲置回收 (Janitor Reclaim) ──│                                 │                         │
       │── 1. POST /reclaim ─────────────>│                                 │                         │
       │                                  │── 2. daytona.delete(sandbox) ──>│ (物理销毁容器与磁盘)     │
       │                                  │<── 3. OK / 404 (幂等) ──────────│                         │
       │                                  │── 4. 清理本地进程缓存            │                         │
       │                                  │── 5. 后端更新 DB ────────────────────────────────────────>│
       │                                  │      (status="reclaimed", workspace_id=NULL)              │
       │                                  │                                 │                         │
── Phase B: 新请求冷启动重建与回灌 ──────│                                 │                         │
[User] │                                  │                                 │                         │
       │── 6. POST /stream/run ──────────>│                                 │                         │
       │                                  │── 7. POST allocation/claim ──────────────────────────────>│
       │                                  │<─ 8. return mode="claimed" ───────────────────────────────│
       │                                  │      (DB status="allocating")   │                         │
       │                                  │                                 │                         │
       │                                  │── 9. _allocate_from_claim() ────│                         │
       │                                  │   ├── daytona.create(240s) ────>│ (创建全新物理沙箱)       │
       │                                  │   └── exec(WORKSPACE_INIT) ────>│                         │
       │                                  │                                 │                         │
       │                                  │── 10. PATCH state (allocated, workspace_id) ─────────────>│
       │                                  │                                 │                         │
       │                                  │── 11. ArtifactService.restore_artifacts_to_sandbox() ────│
       │                                  │   ├── list_artifacts(thread_id) ─────────────────────────>│
       │                                  │   ├── 从 OSS 下载历史产物字节 <────────────────────────────│
       │                                  │   └── 上传写入沙箱原路径 ──────>│ (磁盘恢复历史上下文)      │
       │                                  │                                 │                         │
       │                                  │── 12. 进入 Agent 推理与执行 ────>│                         │
```

---

## 4. 证据清单与源码核验 (Evidence List & Verification)

### 4.1 Daytona SDK 封装层 (`.scratch/langagent-framework-sources/`)
- **`daytona/_sync/daytona.py`**：
  - `L414`：`CreateSandbox` 初始化入参注入 `auto_stop_interval=params.auto_stop_interval`。
  - `L443-L485`：`daytona.create()` 创建沙箱、等待 `started` 状态逻辑。
  - `L488-L506`：`daytona.delete(sandbox, timeout=60)` 执行物理沙箱删除。
  - `L510-L540`：`daytona.get(sandbox_id_or_name)` 获取沙箱实例，不存在时抛出异常。
  - `L611-L622`：`daytona.start(sandbox, timeout=60)` 启动/唤醒已停止的沙箱。
  - `L625-L636`：`daytona.stop(sandbox, timeout=60)` 停止沙箱。
- **`daytona/_sync/sandbox.py`**：
  - `L74`：`state (SandboxState)` 状态属性注释（`started`, `stopped` 等）。
  - `L310-L330`：`sandbox.stop(timeout=60, force=False)` 调用 API 停止容器并安全刷新数据。
  - `L335-L344`：`sandbox.delete(timeout=60)` 调用 API 删除物理沙箱。
  - `L348-L360`：`sandbox.wait_for_sandbox_start(timeout=60)` 轮询等待进入 `started` 状态。
  - `L801-L809`：`__refresh_data_safe()` 捕获 `DaytonaNotFoundError` 并将 `self.state` 设置为 `SandboxState.DESTROYED`。
- **`daytona/common/errors.py`**：
  - `L52`：`DaytonaNotFoundError` 异常类定义。
  - `L161`：HTTP 状态码 `404: DaytonaNotFoundError` 映射声明。
- **`langchain_daytona/sandbox.py`**：
  - `L15-L30`：`DaytonaSandbox` 封装 `daytona.Sandbox`，实现 `BaseSandbox` 后端协议。
  - `L32` 定义、代理调用在 `L50`：`execute(command, timeout)` 代理至 `self._sandbox.process.exec()`。

### 4.2 langAgent 运行时与服务层 (`.scratch/langagent-develop-reference/`)
- **`src/server/services/workspace_service.py`**：
  - `L41-L50`：`WorkspaceStatus` 业务 6 态枚举（`allocating`, `allocated`, `reclaiming`, `reclaimed`, `destroying`, `error`）。
  - `L74-L76`：`_daytona_thread_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="daytona-io")` 专属线程池配置。
  - `L119-L123`：`WORKSPACE_INIT_COMMAND` 初始化创建基础目录常量。
  - `L141-L150`：`_is_sandbox_not_started_error` 辅助判断 stop 幂等错误。
  - `L174-L235`：`ensure_workspace` 分配权仲裁入口（`claimed` / `reuse`）。
  - `L236-L340`：`_allocate_from_claim` 创建新沙箱（`timeout=240`）、初始化目录、`PATCH allocated`，以及异常时 `daytona.delete(sandbox)` 补偿与 `PATCH error`（`DAYTONA_CREATE_FAILED`, `error_retryable=True`）。
  - `L341-L478`：`_reuse_workspace` 沙箱复用逻辑（`started` 直接复用；`stopped` 调用 `_resume_workspace`；沙箱类型不一致主动 `delete` 重建；404 幽灵沙箱自动 `PATCH reclaimed` 递归自愈）。
  - `L479-L535`：`_resume_workspace` 对 stopped 沙箱执行 `daytona.start(sandbox, timeout=60)`，重新 init 目录，`PATCH last_active_at`，失败置 `DAYTONA_RESUME_FAILED`（`error_retryable=True`）。
  - `L610-L665`：`reclaim_workspace` Janitor 回收调用 `daytona.delete()`，404 视作幂等成功，清理本地缓存。
  - `L667-L699`：`destroy_workspace` 用户删除会话调用 `daytona.delete()`。
  - `L701-L729`：`suspend_workspace` Provider 级挂起调用 `daytona.stop()`。
  - `L734-L749`：`_query_provider_state` 状态查询与 `not_found` 处理。
- **`src/agent/long_task/daytona_runtime.py`**：
  - `L21-L45`：`build_daytona_backend` 将 `WorkspaceRecord` 转为 `EnvAwareDaytonaSandbox`，通过专属线程池执行 `daytona.get()`。
- **`src/server/services/long_task_agent_service.py`**：
  - `L258-L289`：Stage 1 确保 Workspace 可用。
  - `L329-L338`, `L943-L971`：后台协程 `_provider_heartbeat` 周期性执行 `true` 防御停机。
  - `L350-L361`：Stage 2.4 判断 `workspace.created == True` 时调用 `ArtifactService.restore_artifacts_to_sandbox` 回灌产物。
- **`src/server/services/artifact_service.py`**：
  - `L202-L260`：`restore_artifacts_to_sandbox` 从 OSS 文件服务拉取历史产物字节并写回沙箱原路径，更新 sha256 缓存。

### 4.3 配置与参数证据 (`src/server/config/config.py`)
- `L94-L96`：`daytona_sandbox_cpu = 2`, `daytona_sandbox_memory = 4`, `daytona_auto_stop_minutes = 30`。
- `L121`：`long_task_artifact_restore_enabled = True`。
- `L137-L138`：`run_lease_renewal_interval_seconds = 30`, `provider_heartbeat_interval_seconds = 120`。

### 4.4 Fact Base 锚点
- `fact-base.md` 条目 `FACT-LT-002` (L101)：`WorkspaceService` 六态生命周期与 Daytona 专属线程池/显式超时。
- `fact-base.md` 条目 `FACT-LT-004` (L104)：Run 级独占租约与 `_provider_heartbeat` 心跳保活机制。
- `fact-base.md` 条目 `FACT-LT-007` (L107)：`ToolErrorGuardMiddleware` 异常拦截与沙箱超时保护。

### 4.5 与 f06 的一致性自查
- **状态对应**：与 `f06` §1 & §3 表 1 严格对齐，`stopped` 对应 `allocated`，`delete`/`not_found` 对应 `reclaimed`/`destroying`。
- **治理逻辑**：与 `f06` 中的“挂起与分配解耦”、“404 幽灵沙箱自愈”、“Janitor 幂等回收”逻辑完全一致。
- **聚焦度**：未重复展开 6 态与 5+ 态全量状态机矩阵，聚焦于 `stopped` 与 `delete` 的语义、存储、恢复耗时及状态机流转差异。

### 4.6 不确定项说明 (Uncertainties)
- **Daytona 计费与多租户存储配额明细**：Daytona SaaS 云端计费策略中，`stopped` 状态下的存储计量单价与算力扣减细节未在本地源码中定义，文中相关表述源自通用云原生沙箱模型与 Daytona 官方设计规范，已在正文中显式标注“未在本地源码核实”。
