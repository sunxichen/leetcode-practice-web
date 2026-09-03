# Topic Brief: Long Task 编排、Workspace 状态机、Daytona 沙箱与 Artifact Durability

> **审计领域**：Domain 3 (Long Task 编排、Workspace 与 Daytona 沙箱) & Domain 4 (产物持久化与 Artifact Durability)  
> **对应 Ticket**：Ticket 03 (`issues/03-audit-long-task-sandbox-and-artifact.md`)  
> **主要源码基线**：`.scratch/langagent-develop-reference @ 4cebb661e88e02f5119fd013236c1402dc3d2cf8` (Tier 1)  
> **框架锁定版本**：`deepagents 0.6.12`、`daytona 0.167.0`、`langchain-daytona 0.0.3` (`.scratch/langagent-framework-sources/`)  
> **设计与 PRD 文档基线**：`/Users/sunxichen/Projects/langAgent`（只读，含 `long_task_agent_phase1_algo_prd.md`、`long_task_agent_phase1_final_plan.md`、`long_task_agent_implementation_plan.md`、`long_task_agent_backend_api_contract.md`、`long_task_agent_enterprise_review_and_design.md`、`sandbox_governance_*.md`、`canvas_mvp_file_artifact_prd.md`、`long_task_subgraph_middleware_prd_and_solution.md`）

---

## 1. 架构概述与设计演进全景

Long Task Agent 是平台面向复杂数据分析、文档处理、代码试错与专业报告生成等耗时任务的独立计算运行时。与轻量无状态的通用 Dynamic Agent 相比，Long Task Agent 为大模型提供隔离的真实操作系统计算环境（Daytona Sandbox），并处理计算环境生命周期、增量文件同步与产物持久化（Artifact Durability）。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     架构演进四阶段历程                                            │
│                                                                                                  │
│ 1. Phase 1 原型期 (2026-04) ──► 2. 企业版评审与治理分析 ──► 3. 治理架构重构 V2/V3 ──► 4. develop 主线实现  │
│    • 算法端 SQLite (long_task.db)    • 发现资源堆积与回收缺陷     • 沙箱定性为纯临时计算环境      • 后端 Internal API 托管   │
│    • Sandbox 直连实时下载产物         • 发现 CompiledSubAgent 缺陷 • 提出 Artifact 外化与回灌     • SubgraphToolMiddleware   │
│    • 每次 Run 全量覆盖重传           • 排除资产图谱复杂模型       • 增量 Diff + 签名匹配跳过      • Single-Flight 异步同步   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 设计意图 vs 当前实现 vs 演进偏差 (Design Intent vs Implementation Delta)

基于对 `/Users/sunxichen/Projects/langAgent` 下 12 份设计文档、PRD 与治理方案的阅读与源码交叉核验，系统在 5 大机制上的设计意图、当前实现与演进差异如下：

### 2.1 数据存储与治理模式：算法本地 SQLite ──► 后端 HTTP Internal API 托管
- **原始设计意图 (`DESIGN-LT-001`, `deprecated`)**：
  - 在 Phase 1（`long_task_agent_backend_api_contract.md#L20-L34` 与 `long_task_agent_phase1_algo_prd.md#L140-L154`）中，设计由算法端自身维护表结构与数据库，应用启动时执行 `init_long_task_db()` 在本地 SQLite（`db/long_task.db`）创建 `long_task_workspaces` 与 `artifact_manifests` 表。
  - 早期治理方案草案（`sandbox_governance_architecture.md#L11`）曾设想“共享 MySQL：后端管 Schema，算法端直连读写”。
- **当前代码实现 (`FACT-LT-002`, `implemented`)**：
  - `develop` 主线中算法端移除了数据库读写逻辑，统一通过 `src/server/clients/backend_api_client.py` 调用后端 10 个 HTTP Internal API（`/internal/long-task/*`）托管 Workspace 状态、Run 租约与 Artifact 元数据。算法端在内存中维护 `_workspace_cache`。
- **演进差异与依据 (Delta Analysis)**：
  - *差异分析*：从“算法端本地/共享数据库存储”调整为“后端 Internal API 统一治理”。
  - *文档依据*：`sandbox_governance_algorithm_team_dev.md#L4-L5` 明确陈述“算法端不再直接连接、查询或写入数据库，所有持久化状态、表结构、Artifact 元数据、Janitor 策略均由后端负责，算法端只通过后端 Internal API 对接”，以实现职责边界解耦。（关于更底层的运维触发原因保持为 `GAP-LT-002`）。

---

### 2.2 子图挂载机制：`CompiledSubAgent` + `task` ──► `SubgraphToolMiddleware`
- **原始设计意图 (`DESIGN-LT-002`, `deprecated`)**：
  - 在初期方案（`long_task_agent_implementation_plan.md#L48-L102` 与 `long_task_agent_phase1_algo_prd.md#L74-L82`）中，计划将 `report_subgraph`、`visualization_subgraph`、`chatbi_subgraph` 编译后包装为 `CompiledSubAgent` 传入 `create_deep_agent(subagents=[...])`，让主 Agent 通过内置 `task` 工具统一调度。
- **当前代码实现 (`FACT-LT-010`, `implemented`)**：
  - `develop` 主线废弃了业务子图的 `CompiledSubAgent` 注册，实现并挂载了自定义 `SubgraphToolMiddleware`（`src/agent/long_task/subgraph_tool_middleware.py`）。
  - 将 `manage_report`、`visualize`、`chatbi_text2sql` 作为普通工具暴露给 LLM，中间件通过 `awrap_tool_call` 拦截，将包含 `AIMessage + tool_calls` 的完整状态传给对应子图执行，并通过 `Command(update={...})` 同步 `DataEnvelope` 与消息状态。
- **演进差异与依据 (Delta Analysis)**：
  - *差异分析*：从“Subagent 派生子智能体模型”切换为“中间件拦截 Schema-only 工具模型”。
  - *文档依据*：`long_task_subgraph_middleware_prd_and_solution.md#L8-L28` 指出 `deepagents 0.6.12` 的 `SubAgentMiddleware` 在调度 `task` 时会将状态覆盖为 `messages=[HumanMessage(content=description)]`（`deepagents/middleware/subagents.py#L425`）。现有业务子图入口依赖 `messages[-1]` 中包含对应的 `tool_calls`，导致 Report/ChatBI 子图无法解析参数抛出 `KeyError`。自定义中间件保证了子图输入契约一致。

---

### 2.3 文件导入机制：每次 Run 全量覆盖重传 ──► 增量 Diff 与签名跳过
- **原始设计意图 (`DESIGN-LT-003`, `deprecated`)**：
  - Phase 1 阶段（`sandbox_governance_plan.md#L14, L41-L42`）中，`SandboxFileImportService` 与 `SkillImportService` 在每次 run 触发时无条件从外部 OSS 下载文件并覆盖上传至沙箱 `/workspace/uploads/` 与 `/workspace/agent_skills/`。
- **当前代码实现 (`FACT-LT-006`, `implemented`)**：
  - `develop` 主线中，`SandboxFileImportService.import_uploaded_files_diff()` 从后端读取 `import_state.imported_upload_ids`，与当前请求的 `current_upload_ids` 计算集合差集（`ids_to_import = current - imported`, `ids_to_delete = imported - current`），仅下载新增文件并在沙箱内 `rm` 已删除文件；`SkillImportService` 基于 URL 集合 SHA256 签名比对跳过重复下载。
- **演进差异与依据 (Delta Analysis)**：
  - *差异分析*：从“全量覆盖导入”优化为“增量差集同步与签名跳过”。
  - *文档依据*：`sandbox_governance_architecture.md#L125-L144` 明确指出：业务数据文件体积较大（数十至上百 MB），全量重传会产生数秒到十几秒的沙箱 I/O 延迟，拖慢首字响应时间（TTFT）；基于 `imported_upload_ids` 集合差集进行增量传输可避免重复 I/O。

---

### 2.4 Artifact 持久化与生命周期：沙箱直连读取 ──► 双层管理 + 外化持久化 + 重建回灌
- **原始设计意图 (`DESIGN-ART-001`, `deprecated`)**：
  - Phase 1 阶段（`long_task_agent_phase1_algo_prd.md#L84-L94`）中，产物文件仅存放在沙箱 `/workspace/artifacts/` 目录，下载时通过 `ArtifactService.download_artifact` 直接调用 Daytona SDK 实时从运行中沙箱读取字节流。
- **当前代码实现 (`FACT-ART-001`, `FACT-ART-002`, `implemented`)**：
  - `develop` 主线实现双层管理体系：
    1. 底层全量层：`ArtifactService.sync_artifacts_directory()` 在单步结束与会话收尾时扫描沙箱目录，计算 SHA256 并将新增/变更产物以 multipart 形式外化上传至后端对象存储。
    2. 顶层高亮层：`export_artifacts` 与 `export_artifact_bundle` 作为显式策展工具，负责卡片发射与打包。
    3. 沙箱重建回灌：当旧沙箱回收后新沙箱创建（`created=True`），`restore_artifacts_to_sandbox` 自动从对象存储拉取历史产物回灌至沙箱，并回填内存 SHA256 缓存防止重复外化。
- **演进差异与依据 (Delta Analysis)**：
  - *差异分析*：产物存储的 Source of Truth 从“临时容器文件系统”迁移为“后端持久化对象存储”，并配套实现了自动同步与冷启动回灌。
  - *文档依据*：`sandbox_governance_plan.md#L16, L43` 指出原始设计中“artifact 本体只存在 sandbox 内，reclaim = 历史产物下载 404，这是硬约束”。通过外化上传与沙箱重建回灌，解除了沙箱回收对历史产物可用性的阻碍。

---

### 2.5 产物产品形态与展示：资产图谱 ──► Canvas MVP 文件型工作区
- **原始设计意图 (`DESIGN-ART-002`, `design_complete`)**：
  - 在《Canvas MVP：文件型 Artifact 预览器 PRD》（`canvas_mvp_file_artifact_prd.md#L18-L39, L84-L116`）中，明确排除了高复杂度的资产图谱模型（`chart_id`、`envelope_id`、`:::chart{}` 指令），收敛定义为**文件型 Artifact 预览器**（生成什么文件就预览什么文件：HTML、Markdown、Plotly、CSV、代码等），采用 Agent 显式推荐（`export_artifacts`）与平台目录扫描结合模式。
- **当前代码实现 (`FACT-ART-003`, `FACT-ART-004`, `implemented`)**：
  - `develop` 主线对齐了文件型 Artifact 契约：产物写入 `/workspace/artifacts/`；`export_artifacts` 发射 `copilotkit_emit_activity`（`activity_type="artifact"`）；`LongTaskAgentService` 维护 `all_files_activity_event` 作为全量入口；聊天流不包含大型 HTML/表格正文。

---

## 3. Long Task 端到端生命周期控制流

一次 Long Task 请求从 HTTP 接入到资源收尾的执行时序如下：

```
Client (SSE / POST)
   │
   ▼ [Stage 1: Router Entry & Stream Disconnect Watcher]
FastAPI Router (/graphs/long-task-agent/stream)
   │ ├── LongTaskAgentRunInput 校验 (Pydantic)
   │ └── with_disconnect_watcher 启动客户端断连轮询 (request.is_disconnected())
   ▼
LongTaskAgentService.generate_event_stream()
   │
   ├──► [Stage 2: Workspace Allocation]
   │    workspace_service.ensure_workspace()
   │    ├── backend_api_client.claim_allocation(thread_id, run_id, agent_id)
   │    │   ├── mode="claimed" ──► Daytona SDK 创建 Sandbox (带 Snapshot/Labels) ──► init 目录 ──► patch allocated
   │    │   ├── mode="reuse"   ──► 查询 Daytona 运行态 (started: 复用; stopped: resume; not_found: 清状态重试)
   │    │   │                  └── 校验 sandbox_type 标签 (若不一致则销毁旧沙箱并重建)
   │    │   └── mode="wait"    ──► 客户端指数退避重试 (1s -> 2s -> 4s -> max 10s, 最多 60s)
   │    └── 发射 AG-UI workspace_status_event (allocating -> active)
   │
   ├──► [Stage 3: Run Lease Acquisition]
   │    workspace_service.acquire_run_lease(thread_id, run_id)
   │    └── 保证同一 Thread 同时只有一个活跃 Run；获取失败直接返回 RUN_ERROR
   │
   ├──► [Stage 4: Backend Construction & Background Tasks]
   │    ├── build_daytona_backend() ──► EnvAwareDaytonaSandbox 包装实例
   │    ├── 启动 _lease_renewal (后台定时续租)
   │    └── 启动 _provider_heartbeat (后台定时执行 no-op "true" 命令防止 Daytona auto_stop)
   │
   ├──► [Stage 5: Artifact Restore (沙箱重建场景)]
   │    └── 若 workspace.created=True 且启用 restore: 从对象存储批量回灌历史产物并回填 sha256 缓存
   │
   ├──► [Stage 6: Artifact Recovery Scan]
   │    └── 同步扫描 /workspace/artifacts/ 目录，补齐上次 Run 异常中断遗留的未外部化产物
   │
   ├──► [Stage 7: File Ingestion (增量 Diff 导入)]
   │    └── SandboxFileImportService.import_uploaded_files_diff()
   │        ├── 基于 import_state 计算差集 (新增上传、删除移除)
   │        ├── 流式下载 (带最大体积校验防 OOM) ──► 写入 /workspace/uploads/{id}_{safe_name}
   │        └── 生成 uploads_manifest.json；同步生成内联文件文本与 VL 描述
   │
   ├──► [Stage 8: Skills Ingestion (签名匹配跳过)]
   │    └── SkillImportService.import_skills()
   │        └── 比较 skill_configs 签名；一致则跳过下载，不一致则下载 ZIP 解压至 /workspace/agent_skills/
   │
   ├──► [Stage 9: Import State Update]
   │    └── backend_api_client.put_import_state() 持久化本次导入的 workspace_id、signature 与 file_ids
   │
   ├──► [Stage 10: Agent Graph Dynamic Assembly]
   │    └── build_long_task_agent()
   │        ├── apply_chinese_patches() 动态 Monkey-Patch deepagents 英文提示词
   │        ├── 计算 max_input_tokens 预算限制
   │        ├── 组装 Tools (ask_user, dynamic_mcp, search_knowledge_base, export_artifacts, export_artifact_bundle)
   │        ├── 组装 Subgraph Middleware (visualize, chatbi_text2sql)
   │        ├── 构建 CompositeBackend (/shared/, /memories/, /conversation_history/ -> 专用 Backend; 默认 -> Daytona)
   │        └── create_deep_agent() 组装完整 Middleware 链并包装 LangGraphAGUIAgent
   │
   ├──► [Stage 11: Agent Execution & Single-Flight Artifact Coalesce]
   │    └── agent.run() 流式消费
   │        ├── STEP_FINISHED 触发 _trigger_sync() (Single-Flight + Coalesce 异步同步产物目录)
   │        ├── 首次检测到产物发射 All files 入口卡片 (all_files_activity_event)
   │        ├── 过滤 summarization 内部文本 (lc_source=summarization)
   │        ├── 状态快照兜底补发最终 AI 文本 (STATE_SNAPSHOT -> _get_final_assistant_text)
   │        └── 经过 Sanitizer -> ActivityTranslator -> Masker -> InterruptTranslator 管道发射 SSE
   │
   ├──► [Stage 12: Terminal Final Sync]
   │    └── RUN_FINISHED 或异常捕获时执行 _final_sync_artifacts() (30s 超时保护)
   │
   └──► [Stage 13: Finally Cleanup & Run Lease Release]
        ├── 取消后台续租与心跳 Task
        ├── 刷新 Opik Tracer
        └── asyncio.shield(release_run_lease()) 保证即使连接断开也能释放独占租约
```

---

## 4. Workspace 状态机与资源所有权模型

### 4.1 状态分离设计
系统将 **后端 DB 业务生命周期状态** 与 **Daytona Provider 物理运行状态** 进行解耦：

| 状态维度 | 状态值 | 权威管理方 | 含义与流转说明 |
|---|---|---|---|
| **DB 业务状态** | `allocating` | 后端 DB | 正在创建 Daytona 沙箱，申请独占分配权中 |
| | `allocated` | 后端 DB | 已绑定有效 `workspace_id`，处于可用状态 |
| | `reclaiming` | 后端 DB | 后端 Janitor 触发 TTL 过期，正在调用算法端删除沙箱 |
| | `reclaimed` | 后端 DB | 沙箱已删除，`workspace_id` 已清空，等待下次请求重新分配 |
| | `destroying` | 后端 DB | 用户删除 Thread，正在清理关联资源 |
| | `error` | 后端 DB | 沙箱创建/恢复发生异常，记录错误码与重试标识 |
| **Provider 运行态** | `started` | Daytona 引擎 | 沙箱容器正在运行，可直接执行 Shell 命令 |
| | `stopped` | Daytona 引擎 | 沙箱因闲置触发 Daytona auto_stop 挂起，可执行 resume 恢复 |
| | `not_found` | Daytona 引擎 | 沙箱在底层容器服务中不存在 |

### 4.2 资源所有权与接口分工
- **分配权准入（Claim Allocation）**：算法端在构建环境前调用 `POST /internal/long-task/workspaces/{thread_id}/allocation/claim`。后端返回 `claimed`（创建新沙箱）、`reuse`（复用已有沙箱）或 `wait`（已有分配任务进行中，需客户端退避重试）。
- **Run 级独占租约（Run Lease）**：通过 `POST /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease` 获得执行租约，避免并发请求交错执行；任务运行期间后台协程每隔 `run_lease_renewal_interval_seconds` 自动续租。
- **业务回收（Reclaim）**：后端 Janitor 判定会话空闲 TTL 后，调用算法端 `POST /long-task/workspaces/{thread_id}/reclaim`。算法端负责执行 Daytona 沙箱物理删除（沙箱不存在时幂等返回成功），DB 状态更新与导入缓存清理全权由后端负责。
- **用户销毁（Destroy）**：用户删除会话时触发 `DELETE /long-task/workspaces/{thread_id}`，算法端物理销毁沙箱并清除本地进程缓存。

---

## 5. Daytona 沙箱后端、执行隔离与环境变量注入

### 5.1 专属线程池与显式超时配置
- **线程池调度**：Daytona Python SDK（`daytona 0.167.0`）方法为同步阻塞调用。算法端使用专属线程池 `_daytona_thread_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="daytona-io")`，通过 `loop.run_in_executor` 调度 SDK 调用。
- **超时参数逐项核验**：
  - `daytona.create(params, timeout=create_timeout)`：显式配置 `daytona_create_timeout`（默认 240s，`workspace_service.py#L266`）。
  - `daytona.start(sandbox, timeout=60)`：显式配置 60s 超时（`workspace_service.py#L498`）。
  - `daytona.stop(sandbox, timeout=60)`：显式配置 60s 超时（`workspace_service.py#L720`）。
  - `DaytonaSandbox.execute(command, timeout=effective_timeout)`：未指定时使用默认 `_default_timeout = 30 * 60`（1800s，`langchain_daytona/sandbox.py#L25, L49-L50`）。
  - `daytona.get(workspace_id)`、`daytona.delete(sandbox)`、`sandbox.process.exec(WORKSPACE_INIT_COMMAND)` 以及文件上传/下载接口：未在调用处传递显式 timeout 参数，依赖 Daytona 客户端默认网络超时。

### 5.2 Standard 与 Snapshot 沙箱类型路由
- **Snapshot 映射机制**：通过 `resolve_snapshot(sandbox_type)` 解析基础镜像。若请求未携带 `sandbox_type` 或映射未命中，使用默认的 `daytona_sandbox_snapshot`（如 `base-snapshot`）；若指定了特定类型（如 `dev`），使用 `daytona_sandbox_type_snapshots` 中配置的 Snapshot（如 `dev-snapshot`）。
- **沙箱打标（Labels）**：创建沙箱时注入 labels：`{"thread_id": thread_id, "agent_id": agent_id, "sandbox_type": sandbox_type or "default"}`。
- **复用类型一致性校验**：当以 `mode="reuse"` 复用沙箱时，`_reuse_workspace` 会核验沙箱 label 中的 `sandbox_type`。若请求类型与现有沙箱类型不一致，系统执行**销毁旧沙箱 → 清理后端状态 → 重新 claim 创建对应新 Snapshot 沙箱**。

### 5.3 请求密文环境变量解密与 Shell Export 动态注入
- **密文解密**：请求在 `forwardedProps.env_variable` 中传入敏感环境变量列表。算法端在 `normalize_env_variables()` 中使用配置的 `env_variable_aes_key` 调用 `aes_ecb_decrypt()` 完成解密（未配置 key 时按原样透传用于本地调试）。
- **校验与容错**：键名按 POSIX 标准正则 `^[A-Za-z_][A-Za-z0-9_]*$` 校验，非法键名跳过并记录日志；解密失败的单项被忽略，不阻断其他变量注入；重复 key 以最后传入的为准。
- **动态前缀注入（EnvAwareDaytonaSandbox）**：
  包装类 `EnvAwareDaytonaSandbox(DaytonaSandbox)` 在每次调用 `execute(command)` 前，自动将环境变量通过 `shlex.quote()` 转义拼接为 `export K1=V1 && export K2=V2 && <original_command>`，避免在沙箱持久化配置文件中留存明文密钥。
- **日志脱敏**：环境变量值通过 `_mask_value()` 处理（8 字符以内保留首 2 尾 2，中间使用 `***` 遮蔽；长文本保留首 6 尾 4），避免敏感内容进入日志。

---

## 6. 文件导入与 Artifact Durability 机制

### 6.1 上传文件增量 Diff 导入 (`SandboxFileImportService`)
- **增量 Diff 决策**：
  1. 算法端从后端读取上次 `import_state`（包含 `imported_upload_ids` 与 `last_imported_workspace_id`）。
  2. 若 `workspace_id != last_imported_workspace_id`（沙箱重建），则全量导入当前 `current_upload_ids`。
  3. 若 `workspace_id` 一致，计算差集：`ids_to_import = current - imported`（新增文件），`ids_to_delete = imported - current`（已移除文件）。
- **路径与流式下载**：
  - 文件名经 `PurePosixPath(file_info.name).name` 净化，沙箱落盘路径为 `/workspace/uploads/{file_id}_{safe_name}`。
  - 流式下载按 1MB Chunk 迭代，并校验 `sandbox_upload_max_file_bytes`；上传后在沙箱生成 `/workspace/uploads/uploads_manifest.json`。

### 6.2 产物双层管理：全量扫描 vs 显式策展
- **底层全量层**：`ArtifactService.sync_artifacts_directory()` 在管线生命周期节点（`STEP_FINISHED`, `RUN_FINISHED`, 异常退出, 补账扫描）通过 `find /workspace/artifacts/ -type f` 扫描物理文件，计算 sha256 并通过 `multipart/form-data` 上报后端。
- **顶层高亮层**：Agent 自主调用 `export_artifacts`（单文件）或 `export_artifact_bundle`（目录打包为 `.zip`），发射 `copilotkit_emit_activity`（`activity_type="artifact"`）在前端渲染下载卡片。
- **越界自动复制**：当 Agent 将产物写在 `/workspace/artifacts/` 外部时，`_ensure_in_artifacts()` 会自动 `cp` 至 `/workspace/artifacts/`（同名冲突自动追加 UUID 后缀），并在返回值 `notes` 中告知 Agent 最终路径。

### 6.3 并发控制、Hash 比对与沙箱重建回灌 (Restore)
- **Per-Thread 异步互斥锁**：`ArtifactService._sync_locks[thread_id]` 保证**同一 Thread 内的同步任务严格串行执行，不同 Thread 之间可并发执行且互不阻塞**。
- **SHA256 缓存比对**：内存维护 `_sha256_cache[thread_id][path] = content_sha256`。扫描沙箱时若文件路径与 Hash 未变更，直接跳过上传。
- **沙箱重建历史回灌 (`restore_artifacts_to_sandbox`)**：
  当创建全新沙箱时（`created=True`），算法端从后端拉取该 Thread 的历史 Artifact 列表，从对象存储下载字节流写入沙箱原路径；回灌成功后**自动回填内存 SHA256 缓存**，确保后续同步不会触发重复外化。
- **非 ASCII / 中文路径中转**：针对 Daytona Toolbox 在处理非 ASCII 文件名 Multipart 响应时的编码异常，下载与上传时采用中转方式：先操作 `/tmp/_artifact_dl/` 或 `/tmp/_artifact_restore/` 临时 ASCII 路径，再在沙箱内通过 Shell `cp --` / `mv --` 移动到真实中文目标路径。
- **单文件失败容错**：多文件回灌过程中若个别历史文件下载失败，系统记录 Warning 并继续恢复其余文件。

---

## 7. 第三方框架边界与项目 Wrapper 下钻

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              langAgent 业务与编排层                                     │
│  • LongTaskAgentService (流式编排、Run Lease、心跳、断连)                               │
│  • WorkspaceService (状态机、Snapshot 映射、API 治理)                                   │
│  • ArtifactService (目录扫描、Hash 去重、并发锁、回灌)                                   │
│  • chinese_deep_agent.py (内存级 Monkey-Patch、系统提示词汉化)                           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
┌─────────────────────────────────────────────┐ ┌─────────────────────────────────────────┐
│     deepagents 0.6.12 (编排核心与协议)       │ │ daytona 0.167.0 & langchain-daytona 0.0.3│
│ • create_deep_agent() 组装完整 Agent 图     │ │ • Daytona API Client (沙箱 CRUD)       │
│ • CompositeBackend (虚拟文件多路径路由)      │ │ • DaytonaSandbox (实现 SandboxBackend) │
│ • 核心 Middleware 栈装配时序                │ │ • EnvAwareDaytonaSandbox (项目包装类)  │
│ • DeltaChannel 消息增量持久化减负 (框架内置)│ │ • _daytona_thread_pool (专属线程池调度)│
└─────────────────────────────────────────────┘ └─────────────────────────────────────────┘
```

### 7.1 `deepagents 0.6.12` 装配时序与项目扩展
`create_deep_agent` 装配的 Middleware 顺序：
1. `TodoListMiddleware`
2. `SkillsMiddleware`（若配置了 skills）
3. `FilesystemMiddleware`（内置文件工具 `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute`）
4. `SubAgentMiddleware`（内置 `task` 工具）
5. `SummarizationMiddleware`（原生长上下文压缩，被项目 Monkey-Patch 为 `create_observed_summarization_middleware`）
6. `PatchToolCallsMiddleware`
7. `AsyncSubAgentMiddleware`
8. **User Middleware（项目注入）**：
   - `ToolErrorGuardMiddleware`：拦截 DaytonaError/DaytonaTimeoutError 转换为 ToolMessage。
   - `SkillActivationMiddleware`：拦截 `read_file(SKILL.md)` 发射激活事件并去重。
   - `SubgraphToolMiddleware`：拦截子图入口工具并调度子图（ChatBI / Visualization）。
   - `FileContextInjectionMiddleware`：注入上传文件内联上下文。
   - `RAGContextMiddleware`：注入知识库上下文。
9. **Tail Stack**：
   - `AnthropicPromptCachingMiddleware` / `BedrockPromptCachingMiddleware`
   - `MemoryMiddleware`（挂载长期记忆文件）
   - `HumanInTheLoopMiddleware`（**注意：框架仅在显式传入 `interrupt_on` 时装配该中间件，与项目自定义的 `ask_user` 工具彼此独立**）

### 7.2 框架内置优化与虚拟路由
- **DeltaChannel 消息增量持久化**：`DeepAgentState` 在 `messages` 字段上配置 `DeltaChannel(_messages_delta_reducer, snapshot_frequency=50)`，属于框架源码内置机制（`deepagents/graph.py#L65-L70`），将每步全量消息数组保存降为增量 delta 记录。
- **CompositeBackend 虚拟路由**：
  - `/shared/` ──► `JavaUserGlobalMemoryBackend`
  - `/memories/` ──► `JavaUserAgentMemoryBackend`
  - `/conversation_history/` ──► `ConversationHistoryBackend`
  - 默认路由（`default`） ──► `EnvAwareDaytonaSandbox`

---

## 8. 异常分层拦截、容错与恢复矩阵

| 故障场景 | 发生阶段 | 拦截与恢复机制 | 置信度与证据类型 | 证据来源 |
|---|---|---|---|---|
| **沙箱创建失败 (Daytona 异常)** | Workspace 初始化 | 捕获异常，补偿调用 `daytona.delete(sandbox)` 清理残留，向后端上报 `status="error"`；向前端发射 `RUN_ERROR` + `RUN_FINISHED` 正常关闭流。 | **High** (`code` + `test`) | `workspace_service.py#L312-L340`<br>`tests/test_sandbox_env.py#L320-L348` |
| **沙箱类型变更 (Snapshot 不匹配)** | Workspace 复用 | 检测到沙箱 labels 中的 `sandbox_type` 与请求不符，销毁旧沙箱，通知后端清空状态后重新 claim 创建。 | **High** (`code` + `test`) | `workspace_service.py#L368-L403`<br>`tests/test_sandbox_type.py#L216-L242` |
| **沙箱在底层丢失 (404 Not Found)** | Workspace 复用 | 捕获 Daytona 404，通知后端 patch `status="reclaimed", workspace_id=None`，递归调用 `ensure_workspace` 重新创建。 | Medium (`code`) | `workspace_service.py#L453-L473` |
| **初始化异常 (文件/技能加载失败)** | 初始化阶段 (Agent 启动前) | `LongTaskAgentService` 外层 `try-except` 捕获，发射 `RUN_ERROR` + `RUN_FINISHED`，并在 `finally` 块中通过 `asyncio.shield()` 保证释放 Run 租约。 | **High** (`code` + `test`) | `long_task_agent_service.py#L868-L914`<br>`tests/test_long_task_initialization_error.py#L27-L172` |
| **沙箱命令超时 (DaytonaTimeoutError)** | Agent 执行中 | `ToolErrorGuardMiddleware` 拦截超时异常，转换为 `ToolMessage(status="error")` 并附带调整建议，避免中断整轮流式对话。 | Medium (`code`) | `tool_error_guard_middleware.py#L37-L53` |
| **大模型超时 / 流中断** | Agent 执行中 | 捕获上游 LLM 异常，取消后台正在 pending 的 Artifact 同步任务，确保 `RUN_ERROR` 正常发送并调用 `_final_sync_artifacts` 兜底外化。 | Medium (`code` + `test`, 本地分支) | `src/server/services/long_task_agent_service.py#L842-L867`<br>`tests/test_long_task_agent_error_recovery.py#L15-L118` (本地分支未提交) |
| **客户端主动断开连接 (Disconnect)** | 流式传输中 | `with_disconnect_watcher` 捕获 `is_disconnected()`，注入 `CancelledError`，`asyncio.shield` 保护执行最终产物同步与租约释放。 | **High** (`code` + `test`) | `long_task_agent_service.py#L830-L840`<br>`tests/test_streaming_disconnect.py` |
| **产物回灌单文件损坏** | 沙箱重建阶段 | 单个历史产物下载/回灌失败仅记录 Warning，继续回灌其余文件，不阻塞主任务启动。 | **High** (`code` + `test`) | `artifact_service.py#L244-L282`<br>`tests/test_artifact_restore.py#L140-L160` |

---

## 9. 测试基线与未决边界说明

### 9.1 develop 主线已合入测试覆盖（Tier 1）
- `tests/test_sandbox_env.py`：覆盖环境变量规范化、AES 密文解密、非法键过滤、重复键覆盖及 `EnvAwareDaytonaSandbox` 的 export 命令拼接。
- `tests/test_sandbox_type.py`：覆盖 Snapshot 映射、沙箱标签注入、类型不一致销毁重建及销毁失败保护。
- `tests/test_artifact_restore.py`：覆盖历史产物回灌、非 ASCII 路径中转、单文件失败容错及回灌后防重复外化。
- `tests/test_long_task_initialization_error.py`：覆盖初始化异常时的 AG-UI 终止事件序列与 Run Lease 释放。
- `tests/test_long_task_local_fixture_service.py`：覆盖本地联调模式下的文件与技能导入。
- `tests/test_long_task_subgraph_tool_middleware.py`：覆盖子图工具拦截与状态双向同步。
- `tests/test_file_service_object_keys.py`：覆盖对象存储 Object Key 规范与内容抽取。

### 9.2 本地分支与历史测试差异（Tier 2）
- `/Users/sunxichen/Projects/langAgent/tests/test_long_task_agent_error_recovery.py`：本地分支原型测试，验证了 LLM 超时时取消中的后台 Artifact 任务不会吞掉 `RUN_ERROR` 事件。
- `tests/test_workspace_service_lifecycle.py`：包含 3 个标记为 `@pytest.mark.skip` 的历史用例。由于系统从早期直连数据库架构重构为 HTTP Internal API 治理架构，旧方法被移除，生命周期测试由后端接口用例承接。
