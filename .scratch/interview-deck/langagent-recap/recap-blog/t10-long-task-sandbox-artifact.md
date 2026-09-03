# 长任务编排、Workspace 状态机、Daytona 沙箱与 Artifact Durability

> **本章定位**：作为平台面向复杂代码执行、多步数据分析与报告生成的独立计算运行时，本章深入剖析 `langAgent` 的 Long Task Agent 体系。系统阐述从服务路由接入、Workspace 状态机与独占租约治理、Daytona 容器沙箱隔离、增量文件/技能导入，到 `deepagents 0.6.12` 图装配、13 阶段流式编排、Single-Flight 产物同步调度、双层 Artifact Durability（全量扫描外化 + 显式策展 + 冷启动回灌），以及异常分层拦截与 `finally` 资源安全收尾的完整工程实现。
>
> **代码与事实基线**：
> - 运行与版本基线：`develop` Reference Worktree (`.scratch/langagent-develop-reference`)
> - 核心依赖锁定：`deepagents 0.6.12`、`daytona 0.167.0`、`langchain-daytona 0.0.3`、`langgraph 1.2.8`、`ag-ui-protocol 0.1.19`
> - 白板复现代码：[long_task_sandbox_artifact.py](../recap-code/core/long_task_sandbox_artifact.py)

---

## 1. 架构概述与平台计算运行时全景

在企业级 AI 应用平台中，对话型任务与长耗时任务在计算模型、状态隔离与产物生命周期上存在本质差异：
- **通用 Dynamic Agent**：聚焦即时人机交互与轻量知识检索，状态保存在进程内存与 LangGraph Checkpointer 中，执行环境无持久化操作系统沙箱。
- **Long Task Agent**：面向深度代码编写与试错、海量数据清洗、自动化图表绘制与专业文件生成（PDF/DOCX/HTML）。大模型需要一个隔离且功能完备的真实 Linux 操作系统（Daytona Sandbox），平台需要管理计算环境的分配、保活、回收、重连，以及临时容器中的数据持久化交付（Artifact Durability）。

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     Long Task Agent 运行时架构全景                                      │
│                                                                                                        │
│  [ 前端客户端 / 管理端 ] ──── (HTTP POST / SSE 长连接: /graphs/long-task-agent/stream)                     │
│                                                │                                                       │
│                                                ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. 服务接入与断连感知 (Router & Disconnect Watcher)                                               │  │
│  │    - LongTaskAgentRunInput 强类型校验                                                             │  │
│  │    - with_disconnect_watcher 独立协程轮询 request.is_disconnected()                              │  │
│  └─────────────────────────────────────────────┬────────────────────────────────────────────────────┘  │
│                                                │                                                       │
│                                                ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. 状态机治理与租约调度 (Workspace & Run Lease Governance)                                        │  │
│  │    - POST /internal/long-task/workspaces/{thread_id}/allocation/claim (claimed / reuse / wait)    │  │
│  │    - POST /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease (Run 级独占互斥排他)      │  │
│  │    - 后台协程: _lease_renewal (15s 自动续租) + _provider_heartbeat (60s 沙箱执行 no-op "true" 保活) │  │
│  └─────────────────────────────────────────────┬────────────────────────────────────────────────────┘  │
│                                                │                                                       │
│                                                ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. 数据与执行隔离注入 (Daytona Sandbox & Ingestion)                                              │  │
│  │    - Daytona SDK 专属线程池调度 (_daytona_thread_pool, 16 workers, 显式超时治理)                  │  │
│  │    - EnvAwareDaytonaSandbox: AES 解密 + POSIX 正则校验 + shlex.quote() 动态命令前缀注入           │  │
│  │    - SandboxFileImportService: 基于 import_state 增量 Diff 导入与 uploads_manifest.json 写入      │  │
│  │    - SkillImportService: 基于 URL/Configs 签名比对跳过重复下载，结构化业务 ID 目录隔离落盘         │  │
│  └─────────────────────────────────────────────┬────────────────────────────────────────────────────┘  │
│                                                │                                                       │
│                                                ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. 核心图装配与虚拟路由 (deepagents 0.6.12 & CompositeBackend)                                   │  │
│  │    - chinese_deep_agent.py 进程内存级 Monkey-Patch (系统提示词汉化、摘要提示词与工具描述替换)      │  │
│  │    - 上下文窗口预算计算 (max_input_tokens = context_window - max_tokens - safety_margin)         │  │
│  │    - CompositeBackend 虚拟路由 (/shared/, /memories/, /conversation_history/ -> 专用后端)        │  │
│  │    - 自定义中间件栈: ToolErrorGuardMiddleware + SubgraphToolMiddleware (拦截子图双向同步)         │  │
│  └─────────────────────────────────────────────┬────────────────────────────────────────────────────┘  │
│                                                │                                                       │
│                                                ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 5. 执行编排、事件流与 Artifact Durability (Execution & Durability)                               │  │
│  │    - STEP_FINISHED 驱动 Single-Flight + Coalesce 异步目录同步调度                                 │  │
│  │    - ArtifactService: Per-Thread 异步锁 + SHA256 比对去重 + multipart/form-data 外化至对象存储    │  │
│  │    - 沙箱重建回灌 (restore_artifacts_to_sandbox): 历史产物下载 + 中文中转 + SHA256 缓存回填       │  │
│  │    - 显式策展工具: export_artifacts (单文件高亮 + 越界自动 cp) / export_artifact_bundle (打包 zip) │  │
│  │    - 异常保活流 + finally { asyncio.shield(release_run_lease) } 独占租约安全释放                  │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 架构演进的四个阶段

长任务运行时并非一蹴而就，而是在面对资源堆积、消息丢失、产物 404 与沙箱 I/O 瓶颈的真实挑战中完成了四代演进：

1. **Phase 1 原型期（2026-04）**：
   - 算法服务本地维护 SQLite 数据库（`db/long_task.db`），自行记录 Workspace 与 Artifact 元数据；
   - 产物仅保存在沙箱 `/workspace/artifacts/`，用户下载时通过 Daytona SDK 实时读取沙箱字节流；
   - 每次 Run 触发时全量覆盖重传上传文件与技能包；
   - 尝试通过 `CompiledSubAgent` 将 Report/ChatBI 子图作为 Subagent 挂载。
2. **企业版评审与治理分析**：
   - 发现沙箱空闲回收（TTL 10min）后，前端历史消息中的产物下载全部出现 404；
   - 发现 `deepagents` 的 `SubAgentMiddleware` 会覆盖消息为 `HumanMessage(description)`，导致依赖 `tool_calls` 的业务子图解析崩溃（`KeyError`）；
   - 发现每次 run 全量重传大文件会带来数十秒沙箱 I/O 延迟，严重恶化首字时间（TTFT）。
3. **治理架构重构（V2/V3）**：
   - 确立“沙箱为纯临时无状态计算容器，后端对象存储为产物持久化 Source of Truth”原则；
   - 设计 Artifact 全量扫描外化与沙箱冷启动重建回灌（Restore）机制；
   - 提出基于 `import_state` 的增量 Diff 文件导入与技能包签名跳过机制；
   - 设计 `SubgraphToolMiddleware` 取代 `CompiledSubAgent`。
4. **`develop` 主线落地实现**：
   - 算法端彻底移除数据库读写逻辑，全面收敛为调用后端 10 个 HTTP Internal API；
   - 落地 Per-Thread 异步锁、SHA256 缓存去重、Single-Flight + Coalesce 同步调度与 `asyncio.shield` 租约释放保护。

---

## 2. 端到端生命周期：13 阶段控制流拆解

一次 Long Task 请求从 HTTP 进入到最终资源收尾经历 13 个严密阶段，构成了确定性的执行拓扑：

```
[客户端请求: /graphs/long-task-agent/stream]
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 1: 路由接入与断连轮询 (Router Entry & Disconnect Watcher)         │
│   - LongTaskAgentRunInput 强类型入参校验                                │
│   - with_disconnect_watcher 启动独立协程轮询 request.is_disconnected() │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Workspace 生命周期分配 (Workspace Allocation)                  │
│   - 调用 POST /internal/long-task/workspaces/{thread_id}/allocation/claim│
│   - mode="claimed" ──► 线程池调用 Daytona 创建沙箱 ──► 执行 mkdir ──► patch allocated
│   - mode="reuse"   ──► 查询 Daytona 状态 (started: 复用; stopped: resume)
│   - mode="wait"    ──► 客户端指数退避重试 (1s -> 2s -> 4s -> max 10s)   │
│   - 发射 AG-UI workspace_status 事件 (allocating -> active)            │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Run 级独占租约申请 (Run Lease Acquisition)                    │
│   - 调用 POST /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease
│   - 确保同一 Thread 只有一个活跃 Run；获取失败立即发射 RUN_ERROR 终止   │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 4: 后端实例构建与后台任务启动 (Backend & Background Tasks)         │
│   - 构建 EnvAwareDaytonaSandbox 实例 (封装环境变量动态注入)            │
│   - 启动 _lease_renewal 后台协程 (15s 自动续租)                         │
│   - 启动 _provider_heartbeat 后台协程 (60s 沙箱执行 true 防 auto_stop) │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 5: 沙箱重建产物回灌 (Artifact Restore)                           │
│   - 若 workspace.created=True (全新创建沙箱):                           │
│     从后端对象存储拉取历史产物字节流回灌至沙箱原路径，回填 SHA256 缓存 │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 6: 遗留产物补账扫描 (Artifact Recovery Scan)                     │
│   - 扫描沙箱 /workspace/artifacts/ 目录，补齐上次异常中断未外化的产物   │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 7: 上传文件增量 Diff 导入 (File Ingestion)                       │
│   - 读取 import_state: ids_to_import = current - imported, ids_to_delete = imported - current
│   - rm 移除文件；流式下载 (1MB Chunk) 写入 /workspace/uploads/{id}_{name} │
│   - 沙箱落盘 uploads_manifest.json；生成内联文件文本与 VL 描述           │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 8: Agent Skills 签名导入 (Skills Ingestion)                      │
│   - 计算 SHA256(skill_configs) 签名；比对一致则跳过下载                │
│   - 不一致则下载 ZIP 解压至 /workspace/agent_skills/{id}/ 目录隔离     │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 9: 持久化导入状态更新 (Import State Update)                      │
│   - 调用 PUT /internal/long-task/workspaces/{thread_id}/import-state   │
│   - 记录 workspace_id、last_imported_skill_signature 与 upload_ids     │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 10: Agent 动态图装配 (Agent Graph Assembly)                      │
│   - apply_chinese_patches() 进程内存级 Monkey-Patch                    │
│   - 计算 max_input_tokens 预算限制；构建 CompositeBackend 虚拟路由      │
│   - 组装 SubgraphToolMiddleware、ToolErrorGuardMiddleware 与工具列表   │
│   - deepagents.create_deep_agent() 组装完整图拓扑                      │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 11: 流式执行与 Single-Flight 产物同步 (Execution & Coalesce)     │
│   - agent.run() 流式消费                                               │
│   - STEP_FINISHED 触发 _trigger_sync() (Single-Flight 异步同步产物目录)│
│   - 过滤 lc_source=summarization 内部文本                              │
│   - STATE_SNAPSHOT 兜底补发最终 AI 文本                                │
│   - 经过 Sanitizer -> ActivityTranslator -> Masker 管道发射 SSE        │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 12: 正常/异常最终外化 (Terminal Final Sync)                      │
│   - RUN_FINISHED 或异常捕获时执行 _final_sync_artifacts() (30s 超时保护)│
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 13: 资源收尾与独占租约释放 (Finally Cleanup)                     │
│   - 取消后台续租与心跳 Task；刷新 Opik Tracer                           │
│   - asyncio.shield(release_run_lease()) 保证租约必释放                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Workspace 状态机与资源所有权模型

### 3.1 状态分离设计与状态机流转

系统将 **后端 DB 业务生命周期状态** 与 **Daytona Provider 底层物理运行状态** 严格分离，解耦了分布式业务状态与底层容器引擎：

```
                    【后端 DB 业务生命周期状态机】

                    ┌──────────────┐
                    │  (初始无记录) │
                    └──────┬───────┘
                           │ POST allocation/claim
                           ▼
                    ┌──────────────┐  Daytona 创建失败
                    │  allocating  ├──────────────────► ┌───────────┐
                    └──────┬───────┘                    │   error   │
                           │ 沙箱创建成功 + init 完成    └───────────┘
                           ▼                                  ▲
                    ┌──────────────┐  沙箱查询/恢复异常       │
   ┌───────────────►│  allocated   ├──────────────────────────┘
   │                └──────┬───────┘
   │                       │ Janitor 空闲 TTL (10min)
   │                       ▼
   │                ┌──────────────┐
   │                │  reclaiming  │
   │                └──────┬───────┘
   │                       │ 算法端删除沙箱成功
   │                       ▼
   │ 再次请求重新 claim ┌──────────────┐  用户删除会话  ┌───────────┐
   └────────────────┤  reclaimed   ├──────────────►│destroying │
                    └──────────────┘               └───────────┘
```

| 状态维度 | 状态值 | 权威管理方 | 含义与流转条件 |
|---|---|---|---|
| **DB 业务状态** | `allocating` | 后端 DB | 正在申请 Daytona 沙箱分配权，独占创建中。 |
| | `allocated` | 后端 DB | 已绑定有效 `workspace_id`，沙箱可用。每次 Run 刷新 `last_active_at`。 |
| | `reclaiming` | 后端 DB | 后端 Janitor 判定空闲 TTL（当前线上阈值为 10 分钟）过期，正在调度回收。 |
| | `reclaimed` | 后端 DB | 沙箱已物理删除，`workspace_id` 清空。下次请求重新进入 `allocating`。 |
| | `destroying` | 后端 DB | 用户在前端显式删除 Thread，级联清理关联资源。 |
| | `error` | 后端 DB | 沙箱创建或恢复失败，记录 `error_message` 与 `error_retryable`。 |
| **Provider 运行态** | `started` | Daytona 引擎 | 容器正在运行，可直接执行 Shell 命令。 |
| | `stopped` | Daytona 引擎 | 因闲置触发 Daytona `auto_stop` 挂起，需执行 `daytona.start(timeout=60)` 恢复。 |
| | `not_found` | Daytona 引擎 | 沙箱在底层容器服务中不存在（如宿主机故障）。 |

### 3.2 分配权准入、租约与并发控制

1. **分配权准入（Claim Allocation）**：
   - 算法端在准备环境前调用 `POST /internal/long-task/workspaces/{thread_id}/allocation/claim`；
   - 后端基于 DB 行级锁进行原子仲裁：
     - `mode="claimed"`：获得新建权，算法端创建沙箱并回调 patch `allocated`；
     - `mode="reuse"`：已有可用沙箱，算法端校验物理状态与标签后直接复用；
     - `mode="wait"`：已有并发分配请求在进行中，客户端自动进入退避重试（1s ➔ 2s ➔ 4s ➔ 最大 10s，最多 60s）。
2. **Run 级独占租约（Run Lease）**：
   - 为避免同一会话在多端或高频点击下并发写入同一个沙箱造成状态污染，算法端在执行前必须调用 `POST /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease` 获取排他租约；
   - 任务运行期间，算法端启动后台协程 `_lease_renewal`，每隔 `run_lease_renewal_interval_seconds`（默认 15s）自动续租；连续 3 次失败停止续租；
   - 任务结束时（无论是成功、异常还是断连），在 `finally` 块中通过 `asyncio.shield(workspace_service.release_run_lease(thread_id, run_id))` 确保安全释放。
3. **心跳保活（Provider Heartbeat）**：
   - Daytona 引擎配置了 `auto_stop_interval`（如 15 分钟无活动自动停机挂起）；
   - 在执行长时间大模型推理或子任务期间，沙箱可能长时间无 Shell 输入；
   - 算法端后台协程 `_provider_heartbeat` 每隔 60s 调度线程池在沙箱内执行轻量 no-op 命令（`true`），刷新 Daytona 底层活动时间戳，防止活跃任务被底层引擎强行挂起。

---

## 4. Daytona 沙箱隔离、Snapshot 路由与环境变量安全注入

### 4.1 专属线程池与显式超时治理

Daytona Python SDK（`daytona 0.167.0`）的方法均为底层同步 HTTP/gRPC 阻塞调用。若直接在 asyncio 事件循环中调用，将直接阻塞整个 Python 异步 worker。

平台在 `WorkspaceService` 中初始化了专属线程池：
```python
_daytona_thread_pool = ThreadPoolExecutor(
    max_workers=16, thread_name_prefix="daytona-io"
)
```
所有 SDK 操作均通过 `loop.run_in_executor(get_daytona_executor(), ...)` 调度。

**超时参数逐项核验**：
- `daytona.create(params, timeout=daytona_create_timeout)`：显式配置 240s 超时；
- `daytona.start(sandbox, timeout=60)`：显式配置 60s 超时；
- `daytona.stop(sandbox, timeout=60)`：显式配置 60s 超时；
- `DaytonaSandbox.execute(command, timeout=effective_timeout)`：默认超时 `1800s`（30 分钟）；
- `daytona.get()`、`daytona.delete()` 以及文件传输方法：未传显式 timeout 参数，依赖底层客户端连接超时。

### 4.2 Snapshot 镜像路由与沙箱标签

- **Snapshot 映射机制**：通过 `resolve_snapshot(sandbox_type)` 路由基础镜像。请求未指定或未命中时使用默认 Snapshot（`base-snapshot`）；指定特定类型（如 `dev`）时路由至 `dev-snapshot`。
- **沙箱打标（Labels）**：创建沙箱时注入元数据标签：
  ```python
  labels = {
      "thread_id": thread_id,
      "agent_id": agent_id,
      "sandbox_type": sandbox_type or "default",
  }
  ```
- **沙箱复用类型核验**：当以 `mode="reuse"` 复用沙箱时，`_reuse_workspace` 会核验沙箱 label 中的 `sandbox_type`。若请求类型与现有沙箱类型不一致，系统执行**物理销毁旧沙箱 ➔ 清理后端状态 ➔ 重新 claim 创建对应新 Snapshot 沙箱**，防止不同环境配置发生污染。

### 4.3 敏感环境变量解密与 Shell Export 动态注入

在大模型沙箱场景中，用户常需要将私有 API Key、数据库连接串或认证 Token 传入沙箱供代码调用。平台建立了完整的安全隔离边界：

```
[前端请求 forwardedProps.env_variable (密文)]
                      │
                      ▼
[normalize_env_variables: POSIX 正则校验 + AES/ECB 解密 + _mask_value 日志脱敏]
                      │
                      ▼
[EnvAwareDaytonaSandbox.execute(command)]
                      │
                      ▼ 动态转义拼接
export K1='V1' && export K2='V2' && <original_command>
                      │
                      ▼ 注入子 Shell 执行 (不写沙箱持久化磁盘)
[Daytona Container Process]
```

1. **密文传输与解密**：请求在 `forwardedProps.env_variable` 中传入敏感环境变量。算法端在 `normalize_env_variables()` 中通过 Nacos 下发的 `env_variable_aes_key` 调用 `aes_ecb_decrypt()` 完成解密（未配置 key 时按原样透传用于本地调试）。
2. **格式校验与容错**：键名按 POSIX 标准正则 `^[A-Za-z_][A-Za-z0-9_]*$` 校验，非法键名忽略并记录日志；单项解密失败不阻断其他变量；重复 key 以最后传入的为准。
3. **动态命令前缀注入（`EnvAwareDaytonaSandbox`）**：
   包装类 `EnvAwareDaytonaSandbox` 在每次调用 `execute(command)` 前，自动将环境变量通过 `shlex.quote()` 转义拼接为 `export K1=V1 && export K2=V2 && <command>`，避免在沙箱持久化配置文件（如 `/etc/environment`）中留存明文密钥，且沙箱即使发生 resume 重启也能正常工作。
4. **日志安全脱敏**：环境变量值通过 `_mask_value()` 处理（8 字符以内保留首 2 尾 2，中间使用 `***` 遮蔽；长文本保留首 6 尾 4），彻底杜绝敏感密钥泄漏到日志系统。

---

## 5. 文件与技能增量导入机制

### 5.1 上传文件增量 Diff 导入（`SandboxFileImportService`）

在数据分析和长任务处理中，业务数据文件（如大型 CSV/Excel）体积往往达到数十至上百 MB。若每次交互都全量重新下载上传，会产生数十秒的无意义沙箱 I/O 延迟，严重拖慢 TTFT。

平台基于后端 `ImportStateVO` 设计了增量 Diff 导入机制：

```python
# 1. 增量差集决策
workspace_changed = (workspace_id != import_state.last_imported_workspace_id)

if workspace_changed:
    ids_to_import = current_ids        # 沙箱冷启动重建，全量导入
    ids_to_delete = set()
else:
    ids_to_import = current_ids - imported_ids  # 仅导入新增文件
    ids_to_delete = imported_ids - current_ids  # 物理删除已移除文件

# 2. 物理删除
for file_id in ids_to_delete:
    backend.execute(f"rm -f /workspace/uploads/{file_id}_*")

# 3. 增量流式下载与上传
for file_id in ids_to_import:
    # 净化文件名防路径穿越
    safe_name = PurePosixPath(file_info.name).name
    sandbox_path = f"/workspace/uploads/{file_id}_{safe_name}"
    # 流式传输 (1MB Chunk) 并校验 sandbox_upload_max_file_bytes 防 OOM
    ...
```

导入完成后，服务在沙箱内写入 `/workspace/uploads/uploads_manifest.json` 元数据清单，并在系统提示词中注入 manifest 小节，告知模型可用文件的确切沙箱路径与格式。

### 5.2 技能系统签名比对与业务 ID 目录隔离

- **签名比对跳过**：`SkillImportService` 将本次请求的所有技能配置计算为唯一 SHA256 签名（`compute_skill_signature`）。若与 `import_state.last_imported_skill_signature` 一致且沙箱未重建，则直接跳过整个技能包的下载与解压。
- **业务 ID 目录隔离**：针对早期平铺解压可能导致不同 ZIP 包同名文件互相覆盖的问题，系统重构为按后台配置的稳定业务 ID 进行目录隔离落盘：
  `/workspace/agent_skills/{skill_id}/`（包含 `SKILL.md` 与脚本资产），使 Agent 能基于稳定的业务 ID 目录选择并加载技能。

---

## 6. Artifact Durability 体系：双层管理、去重、外化与跨沙箱重建回灌

### 6.1 双层管理架构：全量扫描 vs 显式策展

为兼顾“用户随时下载任意生成产物”与“对话流中高亮展示关键交付成果”，系统构建了双层管理体系：

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Artifact 双层管理体系                                   │
│                                                                                        │
│  【顶层高亮策展层 (Explicit Curation)】                                                 │
│  • Agent 主动调用 export_artifacts (单文件) 或 export_artifact_bundle (目录打包为 zip)    │
│  • 越界自动兜底: 外部路径自动 cp 到 /workspace/artifacts/ (同名冲突自动追加 UUID)        │
│  • 发射 copilotkit_emit_activity (activity_type="artifact")，前端渲染卡片与全量入口     │
│                                                                                        │
│  【底层全量持久化层 (Underlying Durability)】                                           │
│  • STEP_FINISHED / RUN_FINISHED 自动触发 ArtifactService.sync_artifacts_directory()    │
│  • 扫描 /workspace/artifacts/ 物理目录，计算 SHA256，增量 multipart 上报后端对象存储     │
│  • 沙箱冷启动重建时自动执行 restore_artifacts_to_sandbox，回灌历史产物并回填哈希缓存     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **底层全量扫描（`sync_artifacts_directory`）**：
   在单步结束（`STEP_FINISHED`）、运行结束（`RUN_FINISHED`）、异常退出与补账扫描节点，通过 Shell 命令 `find /workspace/artifacts/ -type f -printf '%s|%p\n'` 扫描物理文件。
2. **顶层显式策展（`export_artifacts` / `export_artifact_bundle`）**：
   模型完成阶段性成果后主动调用。若模型将文件写入了临时目录（如 `/workspace/project/report.html`），工具会自动 `cp` 转移至 `/workspace/artifacts/report.html`，并通过返回值 `notes` 提示模型最终路径。

### 6.2 并发控制、Hash 比对与 Single-Flight 调度

1. **Per-Thread 异步互斥锁**：
   ```python
   class ArtifactService:
       _sync_locks: dict[str, asyncio.Lock] = {}
       _sync_locks_guard = asyncio.Lock()
   ```
   通过懒创建的 Per-Thread 异步锁，保证**同一会话内的产物扫描与上传严格串行，不同会话之间完全并发且互不阻塞**。
2. **内存 SHA256 缓存比对**：
   维护 `_sha256_cache[thread_id][path] = content_sha256`。扫描沙箱物理文件时，若文件大小与 SHA256 与缓存一致，直接跳过上传，避免对未修改文件产生重复网络 I/O。
3. **Single-Flight + Coalesce 异步调度**：
   在流式执行循环中，Agent 每执行完一步（`STEP_FINISHED`）都会触发一次产物同步。为避免密集工具调用引发并发扫描风暴，`LongTaskAgentService` 采用了 Single-Flight 调度：
   - 若当前已有同步 Task 在运行，仅标记 `_sync_pending = True`；
   - 正在运行的 Task 循环检查该标记，自动合并多次触发请求并在后台完成同步；
   - 运行收尾或异常时，执行带 30s 超时保护的 `_final_sync_artifacts()` 确保兜底外化。

### 6.3 沙箱冷启动历史产物回灌（Restore）

当会话空闲 TTL 过期被 Janitor 回收后，用户再次发送请求将分配全新沙箱（`workspace.created=True`）。此时新沙箱磁盘为空，若用户要求“在上次生成的报告基础上修改”，Agent 将因找不到文件而失败。

平台实现了冷启动自动回灌（`restore_artifacts_to_sandbox`）：

```
[后端对象存储] ──(下载历史产物)──► [算法临时内存]
                                         │
                                         ▼ (非 ASCII / 中文路径处理)
                写入临时路径 /tmp/_artifact_restore/{uuid}.tmp
                                         │
                                         ▼ Shell: mv -- '/tmp/...' '/workspace/artifacts/中文报告.docx'
                [Daytona 沙箱目标路径 /workspace/artifacts/中文报告.docx]
                                         │
                                         ▼
                回填内存 _sha256_cache[thread_id][path] = sha256
                (彻底防止后续 STEP_FINISHED 触发重复外化上传)
```

**关键细节**：
- **非 ASCII / 中文路径中转**：针对 Daytona Toolbox 在处理非 ASCII 文件名 Multipart 响应时的编码异常，采用中转方案：先上传到 `/tmp/_artifact_restore/` 临时 ASCII 路径，再在沙箱内通过 `mv --` 移动到真实中文目标路径。
- **单文件失败容错**：多文件回灌过程中若个别历史文件下载失败，系统记录 Warning 并继续恢复其余文件，不阻塞主任务启动。
- **防重复外化**：回灌成功后**立即回填内存 SHA256 缓存**，确保后续同步扫描感知到该文件已外化，不会重复上传到对象存储。

---

## 7. 第三方框架下钻与自定义扩展

### 7.1 `deepagents 0.6.12` 中间件装配时序

`create_deep_agent` 内部严格按以下时序组装中间件栈：

```
Base Stack (框架内置):
  1. TodoListMiddleware
  2. SkillsMiddleware (若配置 skills)
  3. FilesystemMiddleware (内置 ls, read_file, write_file, edit_file, glob, grep, execute)
  4. SubAgentMiddleware (内置 task 工具)
  5. SummarizationMiddleware (被项目 Monkey-Patch 为 create_observed_summarization_middleware)
  6. PatchToolCallsMiddleware
  7. AsyncSubAgentMiddleware (若配置 async subagents)

User Middleware (项目自定义注入):
  8. ToolErrorGuardMiddleware (拦截 DaytonaError/Timeout 转换为 ToolMessage)
  9. SkillActivationMiddleware (拦截 read_file(SKILL.md) 发射激活事件并去重)
  10. SubgraphToolMiddleware (拦截子图入口工具并双向同步状态)
  11. FileContextInjectionMiddleware (注入上传文件内联上下文)
  12. RAGContextMiddleware (注入知识库检索上下文)

Tail Stack (框架尾部):
  13. AnthropicPromptCachingMiddleware / BedrockPromptCachingMiddleware
  14. MemoryMiddleware (挂载长期记忆文件)
  15. HumanInTheLoopMiddleware (仅显式传入 interrupt_on 时装配；与项目 ask_user 工具独立)
```

### 7.2 `DeltaChannel` 增量 Checkpoint 优化

在 `deepagents.graph.DeepAgentState` 中，`messages` 字段配置了 `DeltaChannel(_messages_delta_reducer, snapshot_frequency=50)`。这是框架源码内置的状态持久化优化：
- 原生 LangGraph 在每一步 checkpoint 保存全量消息数组，随步数增加序列化体积呈 $O(N^2)$ 爆炸；
- `DeltaChannel` 将单步 checkpoint 降为仅记录增量 delta，每 50 步创建一次全量快照，大幅减轻了 Checkpointer 的 I/O 压力。

### 7.3 `CompositeBackend` 多虚拟路径路由

通过 `CompositeBackend` 将不同的 POSIX 虚拟文件路径透明分发至不同后端：
- `/shared/` ──► `JavaUserGlobalMemoryBackend`（跨 Agent 用户画像）
- `/memories/` ──► `JavaUserAgentMemoryBackend`（当前 Agent 用户偏好）
- `/conversation_history/` ──► `ConversationHistoryBackend`（历史对话消息检索）
- 默认路由（`default`） ──► `EnvAwareDaytonaSandbox`（真实 Daytona 沙箱容器）

### 7.4 `chinese_deep_agent.py` 进程内存 Monkey-Patch

`deepagents 0.6.12` 原生硬编码了大量英文系统提示词（如 `BASE_AGENT_PROMPT`、`DEEPAGENTS_DEFAULT_SUMMARY_PROMPT`）。平台实现 `apply_chinese_patches()`，在图构建前原地替换当前 Python 进程的模块级变量与函数默认参数（`__kwdefaults__` / `__defaults__`），**所有修改仅存在于当前进程内存，绝不写入物理 `site-packages`**，确保服务重启与重新构建环境时一致生效。

---

## 8. 工程演进、失败模式与架构取舍

### 8.1 决策 1：数据存储与治理模式（算法本地 SQLite ──► 后端 Internal API 托管）

- **触发场景**：Phase 1 原型阶段，算法端在本地 SQLite（`db/long_task.db`）管理 Workspace 与 Artifact 元数据。
- **核心问题**：算法机重启导致沙箱与会话映射丢失；算法端直连数据库打破了业务系统的分层架构，事务边界与数据审计难以由业务后端掌控。
- **备选方案**：
  1. 方案 A：算法端与 Java 后端直连共享 MySQL 数据库；
  2. 方案 B：算法端剥离所有数据库连接，由 Java 后端通过 HTTP Internal API 统一治理状态与 Janitor 回收。
- **最终选择**：采纳方案 B（`FACT-LT-002`）。
- **代价与结果**：算法端需额外维护进程级缓存与重试机制，但彻底实现了解耦，数据库管理、持久化与业务治理职责全部收敛至 Java 端（已获用户确认 `GAP-05`）。

### 8.2 决策 2：子图挂载机制（`CompiledSubAgent` + `task` ──► `SubgraphToolMiddleware`）

- **触发场景**：长任务需要调用 ChatBI 取数与 Visualization 绘图等复杂子图。
- **核心问题**：早期方案将子图包装为 `CompiledSubAgent` 传入 `create_deep_agent(subagents=[...])`。但 `deepagents 0.6.12` 的 `SubAgentMiddleware` 在调度 `task` 时会将状态覆盖为 `messages=[HumanMessage(content=description)]`（`deepagents/middleware/subagents.py#L425`）。现有业务子图入口依赖 `messages[-1]` 包含 `tool_calls`，导致 Report/ChatBI 子图无法解析参数抛出 `KeyError` 崩溃。
- **备选方案**：
  1. 方案 A：修改 `deepagents` 源码以透传原始消息；
  2. 方案 B：实现自定义 `SubgraphToolMiddleware`，在工具调用层（`awrap_tool_call`）拦截子图工具并使用 `Command(update=...)` 同步状态。
- **最终选择**：采纳方案 B（`FACT-LT-009`）。
- **代价与结果**：保留了业务子图对输入消息契约的原生兼容，成功实现 `DataEnvelope` 与消息状态的双向同步。

### 8.3 决策 3：Artifact 持久化与生命周期（沙箱直连读取 ──► 双层管理 + 外化持久化 + 重建回灌）

- **触发场景**：Phase 1 产物文件仅存放在沙箱内部，前端通过 Daytona SDK 实时下载。
- **核心问题**：沙箱闲置 10 分钟被 Janitor 回收后，历史会话气泡中的产物链接全部报 404；且新建沙箱无法感知历史已生成文件。
- **备选方案**：
  1. 方案 A：永久保留沙箱不回收（成本极高，资源迅速耗尽）；
  2. 方案 B：建立全量扫描外化上传至对象存储，配合沙箱冷启动自动回灌（Restore）。
- **最终选择**：采纳方案 B（`FACT-ART-001`, `FACT-ART-002`）。
- **代价与结果**：增加了对象存储上传与冷启动回灌开销，但彻底解除了容器物理生命周期对产物可用性的束缚。

---

## 9. 异常分层拦截、容错与恢复矩阵

系统对长任务全生命周期各阶段的异常进行了精细化分层治理，防止单点故障引发雪崩或长连接悬挂：

| 故障场景 | 发生阶段 | 拦截与恢复机制 | 置信度与证据类型 | 证据来源 |
|---|---|---|---|---|
| **沙箱创建失败 (Daytona 异常)** | Workspace 初始化 | 捕获异常，补偿调用 `daytona.delete(sandbox)` 清理残留，向后端上报 `status="error"`；向前端发射 `RUN_ERROR` + `RUN_FINISHED` 正常关闭流。 | **High** (`code` + `test`) | `workspace_service.py#L312-L340`<br>`tests/test_sandbox_env.py#L320-L348` |
| **沙箱类型变更 (Snapshot 不匹配)** | Workspace 复用 | 检测到沙箱 labels 中的 `sandbox_type` 与请求不符，销毁旧沙箱，通知后端清空状态后重新 claim 创建。 | **High** (`code` + `test`) | `workspace_service.py#L368-L403`<br>`tests/test_sandbox_type.py#L216-L242` |
| **沙箱在底层丢失 (404 Not Found)** | Workspace 复用 | 捕获 Daytona 404，通知后端 patch `status="reclaimed", workspace_id=None`，递归调用 `ensure_workspace` 重新创建。 | Medium (`code`) | `workspace_service.py#L453-L473` |
| **初始化异常 (文件/技能加载失败)** | 初始化阶段 (Agent 启动前) | `LongTaskAgentService` 外层 `try-except` 捕获，发射 `RUN_ERROR` + `RUN_FINISHED`，并在 `finally` 块中通过 `asyncio.shield()` 保证释放 Run 租约。 | **High** (`code` + `test`) | `long_task_agent_service.py#L868-L914`<br>`tests/test_long_task_initialization_error.py#L27-L172` |
| **沙箱命令超时 (DaytonaTimeoutError)** | Agent 执行中 | `ToolErrorGuardMiddleware` 拦截超时异常，转换为 `ToolMessage(status="error")` 并附带调整建议，避免中断整轮流式对话。 | Medium (`code`) | `tool_error_guard_middleware.py#L37-L53` |
| **大模型超时 / 流中断** | Agent 执行中 | 捕获上游 LLM 异常，取消后台正在 pending 的 Artifact 同步任务，确保 `RUN_ERROR` 正常发送并调用 `_final_sync_artifacts` 兜底外化。 | Medium (`code` + `test`, 原型验证) | `long_task_agent_service.py#L842-L867`<br>`test_long_task_agent_error_recovery.py` (本地分支未合入) |
| **客户端主动断开连接 (Disconnect)** | 流式传输中 | `with_disconnect_watcher` 捕获 `is_disconnected()`，注入 `CancelledError`，`asyncio.shield` 保护执行最终产物同步与租约释放。 | **High** (`code` + `test`) | `long_task_agent_service.py#L830-L840`<br>`tests/test_streaming_disconnect.py` |
| **产物回灌单文件损坏** | 沙箱重建阶段 | 单个历史产物下载/回灌失败仅记录 Warning，继续回灌其余文件，不阻塞主任务启动。 | **High** (`code` + `test`) | `artifact_service.py#L244-L282`<br>`tests/test_artifact_restore.py#L140-L160` |

---

## 10. 测试基线与未决边界标定

### 10.1 `develop` 主线已合入测试覆盖（Tier 1）
- `tests/test_sandbox_env.py`：覆盖环境变量规范化、AES 密文解密、非法键过滤、重复键覆盖及 `EnvAwareDaytonaSandbox` 的 export 命令拼接。
- `tests/test_sandbox_type.py`：覆盖 Snapshot 映射、沙箱标签注入、类型不一致销毁重建及销毁失败保护。
- `tests/test_artifact_restore.py`：覆盖历史产物回灌、非 ASCII 路径中转、单文件失败容错及回灌后防重复外化。
- `tests/test_long_task_initialization_error.py`：覆盖初始化异常时的 AG-UI 终止事件序列与 Run Lease 释放。
- `tests/test_long_task_local_fixture_service.py`：覆盖本地联调模式下的文件与技能导入。
- `tests/test_long_task_subgraph_tool_middleware.py`：覆盖子图工具拦截与状态双向同步。

### 10.2 本地分支与历史测试差异（Tier 2）
- `test_long_task_agent_error_recovery.py`：本地分支原型测试，验证了 LLM 超时时取消中的后台 Artifact 任务不会吞掉 `RUN_ERROR` 事件。
- `test_workspace_service_lifecycle.py`：包含 3 个标记为 `@pytest.mark.skip` 的历史用例。由于系统从早期直连数据库架构重构为 HTTP Internal API 治理架构，旧方法被移除，生命周期测试由后端接口用例承接。

### 10.3 事实冻结与边界说明
- **GAP-04 确认**：生产环境中 Workspace 空闲回收 TTL 由后端 Nacos 配置，当前线上阈值为 10 分钟。
- **GAP-05 确认**：算法端直连数据库重构为调用 Java 后端 Internal API，动因为职责解耦与事务治理规范化。
- **GAP-06 范围标定**：非 ASCII 路径中转机制确认作为沙箱文件传输通道的稳健性兼容实现，不展开推测原始触发业务。
