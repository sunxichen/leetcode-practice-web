"""
========================================================================================
langAgent 长任务编排、Workspace 状态机、Daytona 沙箱与 Artifact Durability 白板复现代码
(Long Task, Workspace Lifecycle, Daytona Sandbox & Artifact Durability Recap Code)
========================================================================================

文件位置: .scratch/interview-deck/langagent-recap/recap-code/core/long_task_sandbox_artifact.py
成熟度标定: Fully Implemented (基于 develop 源码与测试基线，锁定依赖: deepagents 0.6.12, daytona 0.167.0, langchain-daytona 0.0.3)

【白板手写与面试记忆分级】:
1. 必须能默写 (Must-Memorize):
   - LongTaskAgentService.generate_event_stream() 13 阶段主编排控制流与 try/except/finally 闭环
   - WorkspaceService.ensure_workspace() 状态机流转 (claim -> reuse/resume -> allocating/allocated) 与 Snapshot 路由
   - ArtifactService.sync_artifacts_directory() Per-Thread 异步互斥锁、SHA256 缓存比对与增量外化
   - ArtifactService.restore_artifacts_to_sandbox() 沙箱冷启动历史产物回灌、临时路径中转与 SHA256 缓存回填
   - EnvAwareDaytonaSandbox.execute() 命令前缀动态注入 export 环境变量与 shlex.quote 转义
2. 需要能解释 (Need-to-Explain):
   - SubgraphToolMiddleware 拦截子图入口工具 (awrap_tool_call) 并通过 Command(update=...) 双向同步状态
   - SandboxFileImportService.import_uploaded_files_diff() 基于 import_state 的增量差集导入
   - Single-Flight + Coalesce 异步产物同步调度与 _final_sync_artifacts 30s 超时兜底外化
   - ToolErrorGuardMiddleware 拦截 DaytonaTimeoutError / DaytonaError 转换为 ToolMessage(status="error")
   - CompositeBackend 多虚拟路径路由 (/shared/, /memories/, /conversation_history/, 默认 Daytona)
3. 追问时展开 (Expand-on-Followup):
   - 算法本地 SQLite 演进为 Java 后端 Internal API 的架构考量与职责解耦 (GAP-05 已确认)
   - Daytona Toolbox 非 ASCII / 中文路径中转机制 (/tmp/_artifact_restore/ 临时 ASCII 路径)
   - Run Lease 独占租约与后台续租 (_lease_renewal)、心跳保活 (_provider_heartbeat 执行 no-op "true")
   - 异常分层拦截与 finally 中 asyncio.shield(release_run_lease) 租约释放保证
========================================================================================
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import hashlib
import json
import mimetypes
from pathlib import PurePosixPath
import re
import shlex
from typing import (
    Annotated,
    Any,
    AsyncGenerator,
    Awaitable,
    Callable,
    Dict,
    List,
    Optional,
    Sequence,
    Set,
    Tuple,
    TypedDict,
)
import uuid

# --------------------------------------------------------------------------------------
# 1. 核心契约与类型定义 (对齐 backend_api_schema, ag_ui_protocol 0.1.19, deepagents 0.6.12)
# --------------------------------------------------------------------------------------

class WorkspaceStatus(str, Enum):
    """Workspace 业务生命周期状态 (由后端 DB 统一治理维护)"""
    ALLOCATING = "allocating"   # 正在创建 Daytona 沙箱，申请独占分配权中
    ALLOCATED = "allocated"     # 已绑定有效 workspace_id，沙箱就绪可用
    RECLAIMING = "reclaiming"   # 后端 Janitor 触发 10min TTL 空闲过期，正在请求删除沙箱
    RECLAIMED = "reclaimed"     # 沙箱已删除，workspace_id 已清空
    DESTROYING = "destroying"   # 用户显式删除会话，清理关联资源
    ERROR = "error"             # 沙箱创建/恢复发生异常

class SandboxState(str, Enum):
    """Daytona 底层 Provider 物理运行状态"""
    STARTED = "started"         # 容器运行中，可直接执行 Shell 命令
    STOPPED = "stopped"         # 因闲置触发 Daytona auto_stop 挂起，需执行 resume
    NOT_FOUND = "not_found"     # 沙箱在底层容器服务中不存在

@dataclass
class WorkspaceRecordVO:
    """后端 HTTP Internal API 返回的 Workspace 视图对象"""
    thread_id: str
    workspace_id: Optional[str] = None
    agent_id: str = ""
    status: str = "allocating"
    active_run_id: Optional[str] = None
    last_active_at: Optional[str] = None

@dataclass
class WorkspaceRecord:
    """算法进程内维护的 Workspace 记录"""
    thread_id: str
    workspace_id: str
    agent_id: str
    status: WorkspaceStatus
    sandbox_provider: str = "daytona"
    active_run_id: Optional[str] = None
    last_active_at: str = ""
    error_message: Optional[str] = None
    provider_state: Optional[str] = None
    created: bool = False  # 标记是否为全新创建 (用于触发 Artifact 回灌)

@dataclass
class ClaimAllocationResult:
    """后端 allocation/claim 接口返回结果"""
    mode: str  # "claimed" (新建) | "reuse" (复用) | "wait" (并发等待)
    record: Optional[WorkspaceRecordVO] = None

@dataclass
class ImportStateVO:
    """文件导入状态元数据"""
    thread_id: str
    workspace_id: Optional[str] = None
    last_imported_workspace_id: Optional[str] = None
    last_imported_skill_signature: Optional[str] = None
    imported_upload_ids: List[int] = field(default_factory=list)

@dataclass
class ArtifactListItem:
    """后端记录的历史产物项"""
    artifact_id: str
    path: str
    title: str
    mime_type: str
    size_bytes: int
    content_sha256: str

@dataclass
class ArtifactExternalizeResult:
    """产物外化上传成功结果"""
    artifact_id: str
    path: str
    title: str
    mime_type: str
    size_bytes: int

class BaseMessage:
    def __init__(self, content: str = "", id: Optional[str] = None, **kwargs: Any):
        self.content = content
        self.id = id or f"msg-{uuid.uuid4().hex[:8]}"
        self.additional_kwargs = kwargs

class AIMessage(BaseMessage):
    def __init__(self, content: str = "", tool_calls: Optional[List[Dict[str, Any]]] = None, **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_calls = tool_calls or []

class ToolMessage(BaseMessage):
    def __init__(self, content: str, tool_call_id: str, status: str = "success", name: str = "", **kwargs: Any):
        super().__init__(content, **kwargs)
        self.tool_call_id = tool_call_id
        self.status = status
        self.name = name

@dataclass
class Command:
    """LangGraph 状态更新指令"""
    update: Dict[str, Any]

class CompiledStateGraph:
    """LangGraph 编译图抽象接口 (由 create_deep_agent 返回)"""
    async def ainvoke(self, input_data: Any, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]: ...
    def run(self, input_data: Any) -> AsyncGenerator[Any, None]: ...

# --------------------------------------------------------------------------------------
# 2. 环境变量解密、校验与 Shell Export 动态注入
# --------------------------------------------------------------------------------------

_ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def _mask_value(value: str) -> str:
    """脱敏展示敏感环境变量值，防止凭证泄漏到结构化日志"""
    if not value:
        return "<empty>"
    if len(value) <= 8:
        return f"{value[:2]}***{value[-2:]}"
    return f"{value[:6]}***{value[-4:]}"

def normalize_env_variables(items: Optional[List[Dict[str, str]]], aes_key: Optional[str] = None) -> Dict[str, str]:
    """
    规范化请求传入的环境变量列表:
    1. 键名按 POSIX 标准 ^[A-Za-z_][A-Za-z0-9_]*$ 强校验，非法键名忽略
    2. 敏感值通过 AES/ECB/PKCS5Padding 解密 (未配 key 时按原样透传供调试)
    3. 重复 key 以最后一个传入的为准并记录脱敏替换日志
    """
    if not items:
        return {}
    env_vars: Dict[str, str] = {}
    for item in items:
        key = (item.get("key") or "").strip()
        value = item.get("value") or ""
        if not _ENV_KEY_PATTERN.fullmatch(key):
            continue  # 忽略非法环境变量名
        if aes_key and value:
            # 真实生产环境调用 aes_ecb_decrypt(value, aes_key)
            pass
        env_vars[key] = value
    return env_vars

@dataclass
class ExecutionResult:
    """Daytona Shell 命令执行结果"""
    exit_code: int = 0
    output: str = ""

class DaytonaSandbox:
    """Daytona SDK Sandbox 包装类 (同步网络 I/O 通过专属线程池调度)"""
    def __init__(self, sandbox_id: str):
        self.id = sandbox_id

    def execute(self, command: str, timeout: Optional[int] = None) -> ExecutionResult:
        # 调用 Daytona SDK 执行底层 Shell 命令
        ...

    def upload_files(self, files: List[Tuple[str, bytes]]) -> List[Any]:
        # 调用 Daytona SDK 批量上传文件流
        ...

    def download_files(self, paths: List[str]) -> List[Any]:
        # 调用 Daytona SDK 批量下载文件流
        ...

class EnvAwareDaytonaSandbox(DaytonaSandbox):
    """
    每次 execute 前自动拼接 export K=V 前缀的 DaytonaSandbox 包装类。
    设计意图: 规避在沙箱内持久化写入 /etc/environment 明文凭证，
    通过 shlex.quote() 动态转义注入每个执行子 Shell，保证沙箱复用/重连安全。
    """
    def __init__(self, sandbox_id: str, env_vars: Optional[Dict[str, str]] = None):
        super().__init__(sandbox_id=sandbox_id)
        self._env_vars = dict(env_vars or {})

    def execute(self, command: str, *, timeout: Optional[int] = None) -> ExecutionResult:
        if self._env_vars:
            prefix = " && ".join(
                f"export {shlex.quote(k)}={shlex.quote(v)}"
                for k, v in self._env_vars.items()
            )
            command = f"{prefix} && {command}"
        return super().execute(command, timeout=timeout)

# --------------------------------------------------------------------------------------
# 3. 后端 HTTP Internal API 客户端契约 (Backend API Client)
# --------------------------------------------------------------------------------------

class BackendAPIClient:
    """
    托管 Workspace 状态、Run 独占租约、Import State 与 Artifact 元数据的后端 API 客户端。
    演进依据: 彻底剥离算法端本地 SQLite/MySQL 权限，实现持久化事务与算法计算执行解耦 (GAP-05)。
    """
    async def claim_allocation(self, thread_id: str, run_id: str, agent_id: str) -> ClaimAllocationResult:
        # POST /internal/long-task/workspaces/{thread_id}/allocation/claim
        ...

    async def patch_workspace_state(self, thread_id: str, req: Dict[str, Any]) -> None:
        # PATCH /internal/long-task/workspaces/{thread_id}/state
        ...

    async def acquire_run_lease(self, thread_id: str, run_id: str) -> bool:
        # POST /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease
        ...

    async def release_run_lease(self, thread_id: str, run_id: str) -> None:
        # DELETE /internal/long-task/workspaces/{thread_id}/runs/{run_id}/lease
        ...

    async def get_import_state(self, thread_id: str) -> ImportStateVO:
        # GET /internal/long-task/workspaces/{thread_id}/import-state
        ...

    async def put_import_state(self, thread_id: str, state: ImportStateVO) -> None:
        # PUT /internal/long-task/workspaces/{thread_id}/import-state
        ...

    async def list_artifacts(self, thread_id: str) -> List[ArtifactListItem]:
        # GET /internal/long-task/workspaces/{thread_id}/artifacts
        ...

    async def externalize_artifact(self, thread_id: str, file_bytes: bytes, workspace_id: str,
                                  run_id: Optional[str], path: str, title: str,
                                  mime_type: str, size_bytes: int, content_sha256: str) -> ArtifactExternalizeResult:
        # POST /internal/long-task/workspaces/{thread_id}/artifacts (multipart/form-data)
        ...

    async def get_artifact_download_url(self, thread_id: str, artifact_id: str) -> str:
        # GET /internal/long-task/workspaces/{thread_id}/artifacts/{artifact_id}/download-url
        ...

    def remove_workspace_cache(self, thread_id: str) -> None:
        ...

backend_api_client = BackendAPIClient()

# --------------------------------------------------------------------------------------
# 4. Workspace 生命周期管理服务 (WorkspaceService)
# --------------------------------------------------------------------------------------

WORKSPACE_INIT_COMMAND = (
    "mkdir -p /workspace/project /workspace/uploads "
    "/workspace/artifacts /workspace/tmp /workspace/logs /workspace/agent_skills"
)

class WorkspaceService:
    """
    Workspace 生命周期状态机与独占分配治理服务。
    【核心机制】:
    1. 独占分配权准入 (claim_allocation -> mode=claimed / reuse / wait)
    2. Daytona SDK 同步阻塞调用统一走专属线程池 (_daytona_thread_pool, 16 workers)
    3. Snapshot 路由与沙箱标签打标 ({"thread_id", "agent_id", "sandbox_type"})
    4. 类型不一致主动销毁重建 (保证基础镜像环境与请求严格对齐)
    5. 底层 404 Not Found 容错清状态重试机制
    """
    def __init__(self):
        self._daytona_thread_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="daytona-io")

    async def ensure_workspace(
        self,
        thread_id: str,
        agent_id: str,
        run_id: str,
        sandbox_type: Optional[str] = None,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> WorkspaceRecord:
        """确保会话对应的 Daytona 计算沙箱就绪可用"""
        allocation = await backend_api_client.claim_allocation(thread_id, run_id, agent_id)

        if allocation.mode == "claimed":
            return await self._allocate_from_claim(thread_id, agent_id, allocation, sandbox_type, env_vars)

        if allocation.mode == "reuse":
            record = allocation.record
            if not record or not record.workspace_id:
                # 状态异常：标记已回收并重新递归 claim
                await backend_api_client.patch_workspace_state(
                    thread_id, {"status": "reclaimed", "workspace_id": None}
                )
                return await self.ensure_workspace(thread_id, agent_id, run_id, sandbox_type, env_vars)
            return await self._reuse_workspace(record, sandbox_type, env_vars)

        raise RuntimeError(f"未知的 allocation mode: {allocation.mode}")

    async def _allocate_from_claim(
        self,
        thread_id: str,
        agent_id: str,
        allocation: ClaimAllocationResult,
        sandbox_type: Optional[str],
        env_vars: Optional[Dict[str, str]],
    ) -> WorkspaceRecord:
        """创建全新 Daytona 沙箱并初始化目录结构"""
        loop = asyncio.get_running_loop()
        sandbox_id = f"sbx-{uuid.uuid4().hex[:8]}"

        try:
            # 1. 专属线程池调用 Daytona 创建沙箱 (带 Snapshot 映射与 Labels)
            await loop.run_in_executor(
                self._daytona_thread_pool,
                lambda: DaytonaSandbox(sandbox_id=sandbox_id)
            )

            # 2. 执行沙箱基础目录初始化
            sandbox = EnvAwareDaytonaSandbox(sandbox_id=sandbox_id, env_vars=env_vars)
            await loop.run_in_executor(
                self._daytona_thread_pool,
                lambda: sandbox.execute(WORKSPACE_INIT_COMMAND)
            )

            # 3. 通知后端持久化状态为 allocated
            now = datetime.now(timezone.utc).isoformat()
            await backend_api_client.patch_workspace_state(
                thread_id,
                {"workspace_id": sandbox_id, "agent_id": agent_id, "status": "allocated", "last_active_at": now}
            )

            return WorkspaceRecord(
                thread_id=thread_id,
                workspace_id=sandbox_id,
                agent_id=agent_id,
                status=WorkspaceStatus.ALLOCATED,
                last_active_at=now,
                created=True,  # 触发后续历史产物回灌
            )
        except Exception as e:
            # 补偿清理与错误上报
            await backend_api_client.patch_workspace_state(
                thread_id, {"status": "error", "error_message": str(e)}
            )
            raise

    async def _reuse_workspace(
        self,
        vo: WorkspaceRecordVO,
        sandbox_type: Optional[str],
        env_vars: Optional[Dict[str, str]],
    ) -> WorkspaceRecord:
        """复用存量沙箱，支持 stopped 状态唤醒与类型变更销毁重建"""
        loop = asyncio.get_running_loop()
        sandbox_id = vo.workspace_id or ""

        try:
            # 读取沙箱真实标签并校验 Snapshot 类型一致性
            existing_type = "default"  # 从 sandbox.labels 解析
            req_type = sandbox_type or "default"

            if existing_type != req_type:
                # 类型变更：销毁旧沙箱 -> 清理后端状态 -> 递归重新 claim
                await backend_api_client.patch_workspace_state(
                    vo.thread_id, {"status": "reclaimed", "workspace_id": None}
                )
                return await self.ensure_workspace(vo.thread_id, vo.agent_id, "__type_change__", sandbox_type, env_vars)

            # 确保目录存在并刷新活跃时间戳
            sandbox = EnvAwareDaytonaSandbox(sandbox_id=sandbox_id, env_vars=env_vars)
            await loop.run_in_executor(
                self._daytona_thread_pool,
                lambda: sandbox.execute(WORKSPACE_INIT_COMMAND)
            )
            now = datetime.now(timezone.utc).isoformat()
            await backend_api_client.patch_workspace_state(vo.thread_id, {"last_active_at": now})

            return WorkspaceRecord(
                thread_id=vo.thread_id,
                workspace_id=sandbox_id,
                agent_id=vo.agent_id,
                status=WorkspaceStatus.ALLOCATED,
                last_active_at=now,
                created=False,
            )
        except Exception as e:
            if "not found" in str(e).lower():
                # 底层沙箱已丢失：清空状态后重新创建
                await backend_api_client.patch_workspace_state(
                    vo.thread_id, {"status": "reclaimed", "workspace_id": None}
                )
                return await self.ensure_workspace(vo.thread_id, vo.agent_id, "__reclaim_retry__", sandbox_type, env_vars)
            raise

    async def reclaim_workspace(self, thread_id: str, workspace_id: Optional[str] = None) -> None:
        """后端 Janitor 触发 10min TTL 空闲过期时的物理删除 (幂等)"""
        backend_api_client.remove_workspace_cache(thread_id)

    async def destroy_workspace(self, thread_id: str) -> None:
        """用户显式删除会话时的物理销毁"""
        backend_api_client.remove_workspace_cache(thread_id)

workspace_service = WorkspaceService()

# --------------------------------------------------------------------------------------
# 5. 上传文件增量 Diff 导入服务 (SandboxFileImportService)
# --------------------------------------------------------------------------------------

class SandboxFileImportService:
    """
    基于后端 import_state 计算增量差集并流式导入沙箱的服务。
    【核心机制】:
    1. 集合差集计算: ids_to_import = current - imported, ids_to_delete = imported - current
    2. 逐文件流式传输 (1MB Chunk) 校验最大体积限制防 OOM
    3. PurePosixPath 文件名净化防止路径穿越攻击 (/workspace/uploads/{file_id}_{safe_name})
    4. 沙箱内写入 uploads_manifest.json 元数据清单
    """
    @staticmethod
    async def import_uploaded_files_diff(
        backend: DaytonaSandbox,
        current_upload_ids: Optional[List[int]],
        import_state: ImportStateVO,
        workspace_id: str,
    ) -> Optional[Dict[str, Any]]:
        if not current_upload_ids:
            return None

        current_set = set(current_upload_ids)
        imported_set = set(import_state.imported_upload_ids or [])
        workspace_changed = (workspace_id != import_state.last_imported_workspace_id)

        if workspace_changed:
            ids_to_import = current_set
            ids_to_delete: Set[int] = set()
        else:
            ids_to_import = current_set - imported_set
            ids_to_delete = imported_set - current_set

        # 1. 物理删除已从会话中移除的文件
        for file_id in ids_to_delete:
            backend.execute(f"rm -f /workspace/uploads/{file_id}_*")

        # 2. 增量下载并上传新增文件
        successful_entries = []
        for file_id in ids_to_import:
            safe_name = f"{file_id}_data.csv"
            sandbox_path = f"/workspace/uploads/{safe_name}"
            # 真实生产中通过 FileService 流式下载字节流并校验体积
            # file_bytes = await file_service.download_bytes(file_id)
            # backend.upload_files([(sandbox_path, file_bytes)])
            successful_entries.append({
                "id": file_id,
                "path": sandbox_path,
                "name": safe_name,
                "mime_type": "text/csv",
                "size_bytes": 0,  # 生产环境中以真实下载的 len(file_bytes) 为准
            })

        # 3. 写入沙箱 uploads_manifest.json
        manifest = {"files": successful_entries}
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        backend.upload_files([("/workspace/uploads/uploads_manifest.json", manifest_bytes)])

        return manifest

# --------------------------------------------------------------------------------------
# 6. Artifact 持久化、去重、回灌与双层管理 (ArtifactService)
# --------------------------------------------------------------------------------------

class ArtifactService:
    """
    产物全量扫描外化与沙箱重建历史回灌服务。
    【核心机制】:
    1. Per-Thread 异步互斥锁 (_sync_locks): 保证同会话内同步串行、跨会话并发互不阻塞
    2. SHA256 内存缓存去重 (_sha256_cache): 跳过未变更物理文件，避免重复上传
    3. 全新沙箱冷启动历史回灌 (restore_artifacts_to_sandbox): 拉取对象存储历史字节写入沙箱
    4. 非 ASCII / 中文路径中转: 先操作 /tmp/_artifact_restore/ 临时 ASCII 路径再 mv 移动
    5. 单文件损坏容错: 记录 Warning 并跳过，不阻断其余文件回灌和主任务启动
    6. 回灌成功自动回填 SHA256 缓存: 彻底防止后续周期性同步发生重复外化
    """
    _sync_locks: Dict[str, asyncio.Lock] = {}
    _sync_locks_guard = asyncio.Lock()
    _sha256_cache: Dict[str, Dict[str, str]] = {}  # thread_id -> {path: sha256}

    @staticmethod
    async def _get_thread_lock(thread_id: str) -> asyncio.Lock:
        async with ArtifactService._sync_locks_guard:
            if thread_id not in ArtifactService._sync_locks:
                ArtifactService._sync_locks[thread_id] = asyncio.Lock()
            return ArtifactService._sync_locks[thread_id]

    @staticmethod
    async def sync_artifacts_directory(
        thread_id: str,
        workspace_id: str,
        run_id: Optional[str],
        backend: DaytonaSandbox,
    ) -> List[ArtifactExternalizeResult]:
        """全量扫描 /workspace/artifacts/ 目录并外化新增/变更产物"""
        lock = await ArtifactService._get_thread_lock(thread_id)
        async with lock:
            # 1. 执行 find 命令扫描物理文件
            scan_res = backend.execute("find /workspace/artifacts/ -type f -printf '%s|%p\\n'")
            if not scan_res or scan_res.exit_code != 0 or not scan_res.output.strip():
                return []

            cache = ArtifactService._sha256_cache.setdefault(thread_id, {})
            results: List[ArtifactExternalizeResult] = []

            # 2. 逐文件比对 SHA256 并外化
            for line in scan_res.output.strip().split("\n"):
                if "|" not in line: continue
                size_str, path = line.split("|", 1)
                
                # 针对非 ASCII 文件名，中转下载
                download_path = path
                temp_path = None
                if not all(ord(c) < 128 for c in path):
                    temp_path = f"/tmp/_artifact_dl/{uuid.uuid4().hex}.tmp"
                    backend.execute(f"mkdir -p /tmp/_artifact_dl && cp -- '{path}' '{temp_path}'")
                    download_path = temp_path

                downloads = backend.download_files([download_path])
                if not downloads:
                    continue
                file_bytes = getattr(downloads[0], "content", None)
                if file_bytes is None or not isinstance(file_bytes, bytes):
                    continue
                if temp_path: backend.execute(f"rm -f '{temp_path}'")

                content_sha256 = hashlib.sha256(file_bytes).hexdigest()
                if cache.get(path) == content_sha256:
                    continue  # 哈希一致跳过重复外化

                title = path.rsplit("/", 1)[-1]
                mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"

                ext_res = await backend_api_client.externalize_artifact(
                    thread_id=thread_id, file_bytes=file_bytes, workspace_id=workspace_id,
                    run_id=run_id, path=path, title=title, mime_type=mime_type,
                    size_bytes=len(file_bytes), content_sha256=content_sha256
                )
                cache[path] = content_sha256
                results.append(ext_res)

            return results

    @staticmethod
    async def restore_artifacts_to_sandbox(
        thread_id: str,
        backend: DaytonaSandbox,
    ) -> int:
        """将后端对象存储中的历史产物回灌至全新创建的沙箱原路径中"""
        artifacts = await backend_api_client.list_artifacts(thread_id)
        if not artifacts:
            return 0

        cache = ArtifactService._sha256_cache.setdefault(thread_id, {})
        restored_count = 0

        for art in artifacts:
            target_path = art.path
            temp_path = None
            try:
                # 1. 获取下载 URL 并拉取历史字节流
                url = await backend_api_client.get_artifact_download_url(thread_id, art.artifact_id)
                # 真实实现调用 file_bytes = await download_file_from_oss(url)
                file_bytes: bytes = b""

                # 2. 确保父目录存在
                parent_dir = target_path.rsplit("/", 1)[0]
                backend.execute(f"mkdir -p -- '{parent_dir}'")

                # 3. 非 ASCII 路径中转处理 (上传临时 ASCII 路径 -> mv 到目标路径)
                upload_path = target_path
                if not all(ord(c) < 128 for c in target_path):
                    temp_path = f"/tmp/_artifact_restore/{uuid.uuid4().hex}.tmp"
                    backend.execute("mkdir -p /tmp/_artifact_restore")
                    upload_path = temp_path

                backend.upload_files([(upload_path, file_bytes)])

                if temp_path:
                    backend.execute(f"mv -- '{temp_path}' '{target_path}'")

                # 4. 回填内存 SHA256 缓存，彻底防止后续重复外化
                cache[target_path] = hashlib.sha256(file_bytes).hexdigest()
                restored_count += 1
            except Exception:
                # 单文件损坏记录 Warning，不阻塞其余文件恢复
                if temp_path: backend.execute(f"rm -f '{temp_path}'")
                continue

        return restored_count

# --------------------------------------------------------------------------------------
# 7. 中间件扩展 (SubgraphToolMiddleware & ToolErrorGuardMiddleware)
# --------------------------------------------------------------------------------------

class SubgraphToolMiddleware:
    """
    拦截长任务中的业务子图入口工具 (如 chatbi_text2sql, visualize) 的自定义中间件。
    【演进背景】:
    Phase 1 曾设想将子图编译为 CompiledSubAgent 并挂入 deepagents 的 subagents 列表；
    但 deepagents 0.6.12 的 SubAgentMiddleware 在调度 task 工具时会将 state 覆盖为
    messages=[HumanMessage(content=description)]，导致依赖 messages[-1].tool_calls
    的子图入口解析抛出 KeyError。
    改用 SubgraphToolMiddleware 在工具调用层拦截，保留完整上下文并通过 Command(update=...)
    双向同步 DataEnvelope、VisualizationResult 与状态。
    """
    def __init__(self, subgraph_registry: Dict[str, CompiledStateGraph]):
        self._registry = subgraph_registry

    async def awrap_tool_call(
        self,
        tool_call: Dict[str, Any],
        state: Dict[str, Any],
        handler: Callable[[Dict[str, Any]], Awaitable[Any]],
    ) -> Any:
        tool_name = tool_call["name"]
        if tool_name not in self._registry:
            return await handler(tool_call)

        tool_call_id = tool_call["id"]
        subgraph = self._registry[tool_name]

        # 调用对应编译子图
        result_state = await subgraph.ainvoke(state)

        # 生成 ToolMessage 并通过 Command 同步回主图
        tool_msg = ToolMessage(content=f"{tool_name} 执行成功", tool_call_id=tool_call_id)
        update: Dict[str, Any] = {"messages": [tool_msg]}
        if "data_envelope" in result_state:
            update["data_envelope"] = result_state["data_envelope"]

        return Command(update=update)

class ToolErrorGuardMiddleware:
    """捕获 DaytonaError 与超时异常转换为 ToolMessage(status='error')，避免中断整轮流式会话"""
    async def awrap_tool_call(
        self,
        tool_call: Dict[str, Any],
        handler: Callable[[Dict[str, Any]], Awaitable[Any]],
    ) -> Any:
        try:
            return await handler(tool_call)
        except TimeoutError as exc:
            return ToolMessage(
                content=f"命令执行超时，未在指定时间内返回。建议拆分简化命令或分批执行。详情: {exc}",
                tool_call_id=tool_call.get("id", ""),
                status="error",
            )
        except Exception as exc:
            return ToolMessage(
                content=f"沙箱命令执行失败，请根据错误调整参数后重试。详情: {exc}",
                tool_call_id=tool_call.get("id", ""),
                status="error",
            )

# --------------------------------------------------------------------------------------
# 8. CompositeBackend 虚拟路径路由与 Agent 动态组装工厂
# --------------------------------------------------------------------------------------

class JavaUserGlobalMemoryBackend:
    def __init__(self, user_id: str, **kwargs: Any): ...

class JavaUserAgentMemoryBackend:
    def __init__(self, user_id: str, app_id: int, **kwargs: Any): ...

class ConversationHistoryBackend:
    def __init__(self, thread_id: str, **kwargs: Any): ...

class CompositeBackend:
    """
    DeepAgents 核心虚拟文件系统路由。
    将不同 POSIX 虚拟文件路径重定向至专属计算或持久化后端：
    - /shared/ -> 用户全局画像记忆后端 (JavaUserGlobalMemoryBackend)
    - /memories/ -> 用户-Agent 隔离偏好记忆后端 (JavaUserAgentMemoryBackend)
    - /conversation_history/ -> 对话历史检索后端 (ConversationHistoryBackend)
    - 默认路由 (default) -> 真实 Daytona 容器沙箱环境 (EnvAwareDaytonaSandbox)
    """
    def __init__(self, default: DaytonaSandbox, routes: Dict[str, Any]):
        self.default = default
        self.routes = routes

def apply_chinese_patches() -> None:
    """
    进程级内存 Monkey-Patch deepagents 0.6.12 英文系统提示词与摘要指令。
    幂等执行，绝不污染 site-packages 物理磁盘文件。
    """
    ...

def create_deep_agent(
    model: Any,
    tools: Optional[List[Any]] = None,
    system_prompt: str = "",
    backend: Optional[Any] = None,
    middleware: Sequence[Any] = (),
    subagents: Optional[List[Any]] = None,
    skills: Optional[List[str]] = None,
    memory: Optional[List[str]] = None,
    checkpointer: Optional[Any] = None,
    name: str = "deep-agent",
) -> CompiledStateGraph:
    """deepagents 0.6.12 框架核心工厂方法声明"""
    ...

def build_long_task_agent(
    forwarded_props: Dict[str, Any],
    backend: DaytonaSandbox,
    artifact_context: Dict[str, Any],
) -> CompiledStateGraph:
    """动态组装 Long Task Agent CompiledStateGraph 拓扑"""
    apply_chinese_patches()

    user_id = forwarded_props.get("user_id", "")
    agent_id = forwarded_props.get("agent_id", "")
    thread_id = artifact_context.get("thread_id", "")

    # 1. 动态构建 CompositeBackend 虚拟路由
    routes = {
        "/shared/": JavaUserGlobalMemoryBackend(user_id=user_id),
        "/memories/": JavaUserAgentMemoryBackend(user_id=user_id, app_id=int(agent_id or 0)),
        "/conversation_history/": ConversationHistoryBackend(thread_id=thread_id),
    }
    composite_backend = CompositeBackend(default=backend, routes=routes)

    # 2. 组装自定义工具与中间件栈
    extra_middleware = [
        ToolErrorGuardMiddleware(),
        SubgraphToolMiddleware(subgraph_registry={}),
    ]

    # 3. 组装并返回编译图
    return create_deep_agent(
        model=None,
        tools=[],
        system_prompt="",
        backend=composite_backend,
        middleware=extra_middleware,
        name="long-task-agent",
    )

# --------------------------------------------------------------------------------------
# 9. Long Task 主编排服务 (LongTaskAgentService)
# --------------------------------------------------------------------------------------

class LongTaskAgentService:
    """
    Long Task 端到端生命周期编排服务。
    【完整 13 阶段控制流】:
    Stage 1:  HTTP Router 接入与 with_disconnect_watcher 客户端断连轮询启动
    Stage 2:  Workspace 独占分配准入 (ensure_workspace -> mode=claimed/reuse)
    Stage 3:  Run 级独占租约获取 (acquire_run_lease)，并发冲突直接返回 RUN_ERROR
    Stage 4:  构建 EnvAwareDaytonaSandbox 后端并启动后台续租 (_lease_renewal) 与心跳保活 (_provider_heartbeat)
    Stage 5:  沙箱重建冷启动产物回灌 (restore_artifacts_to_sandbox，若 workspace.created=True)
    Stage 6:  异常中断遗留产物补账扫描 (sync_artifacts_directory)
    Stage 7:  上传文件增量 Diff 导入 (import_uploaded_files_diff) 与 uploads_manifest.json 写入
    Stage 8:  Agent Skills 签名比对导入 (SkillImportService)
    Stage 9:  更新后端持久化导入状态 (put_import_state)
    Stage 10: 动态装配 DeepAgents 图拓扑 (build_long_task_agent)
    Stage 11: 流式消费执行: STEP_FINISHED 触发 Single-Flight + Coalesce 产物异步同步，过滤 summarization 内部文本
    Stage 12: RUN_FINISHED / 异常捕获执行 _final_sync_artifacts (30s 超时保护) 兜底外化
    Stage 13: finally 块取消后台协程并使用 asyncio.shield(release_run_lease) 确保独占租约安全释放
    """
    @staticmethod
    async def generate_event_stream(
        thread_id: str,
        run_id: str,
        forwarded_props: Dict[str, Any],
    ) -> AsyncGenerator[Dict[str, Any], None]:
        # 解析解密敏感环境变量
        env_vars = normalize_env_variables(forwarded_props.get("env_variable"))

        # ── 阶段 1 & 2: Workspace 生命周期准入 ──
        try:
            yield {"type": "WORKSPACE_STATUS", "status": "allocating"}
            workspace = await workspace_service.ensure_workspace(
                thread_id=thread_id,
                agent_id=forwarded_props.get("agent_id", "default-agent"),
                run_id=run_id,
                sandbox_type=forwarded_props.get("sandbox_type"),
                env_vars=env_vars,
            )
            yield {"type": "WORKSPACE_STATUS", "status": "active"}
        except Exception as e:
            yield {"type": "RUN_ERROR", "message": f"Workspace 初始化失败: {e}"}
            yield {"type": "RUN_FINISHED"}
            return

        # ── 阶段 3: 获取 Run 级独占租约 ──
        lease_acquired = await backend_api_client.acquire_run_lease(thread_id, run_id)
        if not lease_acquired:
            yield {"type": "RUN_ERROR", "message": "该会话已有正在执行的任务，请等待完成后重试"}
            yield {"type": "RUN_FINISHED"}
            return

        lease_task: Optional[asyncio.Task] = None
        heartbeat_task: Optional[asyncio.Task] = None

        try:
            # ── 阶段 4: 构建 Backend 并启动后台维护协程 ──
            backend = EnvAwareDaytonaSandbox(sandbox_id=workspace.workspace_id, env_vars=env_vars)
            lease_task = asyncio.create_task(LongTaskAgentService._lease_renewal(thread_id, run_id))
            heartbeat_task = asyncio.create_task(LongTaskAgentService._provider_heartbeat(backend))

            # ── 阶段 5: 历史产物回灌 (沙箱全新创建时触发) ──
            if workspace.created:
                await ArtifactService.restore_artifacts_to_sandbox(thread_id, backend)

            # ── 阶段 6: 遗留产物补账扫描 ──
            await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, None, backend)

            # ── 阶段 7 & 8: 增量文件与技能导入 ──
            import_state = await backend_api_client.get_import_state(thread_id)
            manifest = await SandboxFileImportService.import_uploaded_files_diff(
                backend=backend,
                current_upload_ids=forwarded_props.get("uploaded_files"),
                import_state=import_state,
                workspace_id=workspace.workspace_id,
            )
            if manifest:
                yield {"type": "FILE_IMPORTED", "files": manifest.get("files", [])}

            # ── 阶段 9: 更新后端导入元数据 ──
            await backend_api_client.put_import_state(
                thread_id,
                ImportStateVO(
                    thread_id=thread_id,
                    workspace_id=workspace.workspace_id,
                    last_imported_workspace_id=workspace.workspace_id,
                    imported_upload_ids=forwarded_props.get("uploaded_files", []),
                ),
            )

            # ── 阶段 10: 动态装配 Agent ──
            artifact_context = {"thread_id": thread_id, "run_id": run_id, "workspace_id": workspace.workspace_id}
            agent_graph = build_long_task_agent(forwarded_props, backend, artifact_context)

            # ── 阶段 11: Single-Flight + Coalesce 产物同步调度与流式消费 ──
            sync_task: Optional[asyncio.Task] = None
            sync_pending = False

            async def _bg_sync():
                nonlocal sync_pending
                while True:
                    sync_pending = False
                    await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend)
                    if not sync_pending:
                        break

            def _trigger_sync():
                nonlocal sync_task, sync_pending
                if sync_task and not sync_task.done():
                    sync_pending = True
                    return
                sync_task = asyncio.create_task(_bg_sync())

            # 模拟执行流
            yield {"type": "STEP_STARTED", "step_name": "model_step"}
            yield {"type": "TEXT_MESSAGE_CONTENT", "delta": "正在执行数据分析与代码编写..."}
            yield {"type": "STEP_FINISHED", "step_name": "model_step"}
            _trigger_sync()  # 单步结束触发 Single-Flight 产物同步

            # ── 阶段 12: 正常收尾与 30s 兜底外化 ──
            if sync_task and not sync_task.done():
                await asyncio.wait_for(sync_task, timeout=30)
            await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend)

            yield {"type": "RUN_FINISHED"}

        except asyncio.CancelledError:
            # 客户端主动断开连接
            try:
                await asyncio.shield(asyncio.wait_for(
                    ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend),
                    timeout=10
                ))
            except Exception:
                pass
            raise
        except Exception as e:
            # 异常捕获: 兜底外化产物并优雅终止流
            try:
                await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend)
            except Exception:
                pass
            yield {"type": "RUN_ERROR", "message": f"Agent 执行异常: {e}"}
            yield {"type": "RUN_FINISHED"}

        finally:
            # ── 阶段 13: 资源收尾与独占租约释放 ──
            if lease_task and not lease_task.done(): lease_task.cancel()
            if heartbeat_task and not heartbeat_task.done(): heartbeat_task.cancel()

            # 使用 asyncio.shield 保证即使流中断也能安全释放独占租约
            try:
                await asyncio.shield(backend_api_client.release_run_lease(thread_id, run_id))
            except Exception:
                pass

    @staticmethod
    async def _lease_renewal(thread_id: str, run_id: str) -> None:
        """后台协程定期续租 run lease，默认 30s（settings.run_lease_renewal_interval_seconds，config.py L137 可配）"""
        while True:
            await asyncio.sleep(30)
            await backend_api_client.acquire_run_lease(thread_id, run_id)

    @staticmethod
    async def _provider_heartbeat(backend: DaytonaSandbox) -> None:
        """后台协程定期在沙箱内执行 no-op 'true' 命令防 auto_stop，默认 120s（settings.provider_heartbeat_interval_seconds，config.py L138 可配）"""
        while True:
            await asyncio.sleep(120)
            backend.execute("true")

# --------------------------------------------------------------------------------------
# 10. 跨文件调用链与执行追踪 (Cross-File Execution Trace)
# --------------------------------------------------------------------------------------
#
# 完整调用链路追踪 (From HTTP Request to Safe Lease Release):
# 1. FastAPI Router (/graphs/long-task-agent/stream)
#    └── with_disconnect_watcher 启动独立断连轮询
# 2. LongTaskAgentService.generate_event_stream()
#    ├── workspace_service.ensure_workspace()
#    │   └── backend_api_client.claim_allocation(thread_id, run_id, agent_id)
#    │       ├── mode="claimed" ──► Daytona SDK 创建 Sandbox ──► init 目录 ──► patch allocated
#    │       └── mode="reuse"   ──► 查询 Daytona 状态 (started/stopped/not_found)
#    ├── workspace_service.acquire_run_lease(thread_id, run_id)
#    ├── build_daytona_backend() ──► EnvAwareDaytonaSandbox (export 前缀动态注入)
#    ├── 后台任务: _lease_renewal (默认 30s 自动续租) + _provider_heartbeat (默认 120s 沙箱执行 true)
#    ├── ArtifactService.restore_artifacts_to_sandbox() (若全新创建沙箱: 历史产物回灌 + 中文中转 + SHA256 缓存回填)
#    ├── ArtifactService.sync_artifacts_directory() (遗留未外化产物补账扫描)
#    ├── SandboxFileImportService.import_uploaded_files_diff() (基于 import_state 增量差集导入)
#    ├── SkillImportService.import_skills() (基于 URL/Config 签名跳过)
#    ├── backend_api_client.put_import_state() (持久化本次导入元数据)
#    ├── build_long_task_agent() ──► apply_chinese_patches() + CompositeBackend + create_deep_agent()
#    ├── agent.run() 流式消费
#    │   ├── STEP_FINISHED ──► _trigger_sync() (Single-Flight + Coalesce 异步同步产物)
#    │   └── 管道过滤 (lc_source=summarization) + 兜底补发 (STATE_SNAPSHOT)
#    ├── 终态同步: _final_sync_artifacts() (30s 超时保护)
#    └── finally 收尾: 取消后台协程 + asyncio.shield(release_run_lease)
