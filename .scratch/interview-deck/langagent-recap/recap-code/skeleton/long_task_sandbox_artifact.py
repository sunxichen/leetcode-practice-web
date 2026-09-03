"""
long_task_sandbox_artifact.py - 长任务编排、沙箱治理与产物持久化白板骨架代码 (Skeleton)

定位说明:
- 本文件为 15 分钟白板默写骨架，仅保留真实类名/函数名、核心控制流与关键机制注释。
- 完整机制与防御性细节参照: recap-code/core/long_task_sandbox_artifact.py。

【白板手写与记忆分级】:
1. 必须能默写: LongTaskAgentService.generate_event_stream() 13 阶段主编排与 try/finally 租约释放;
               WorkspaceService.ensure_workspace() 状态机流转 (claim -> reuse/allocate);
               ArtifactService.sync_artifacts_directory() Per-Thread 互斥锁与 SHA256 增量外化;
               ArtifactService.restore_artifacts_to_sandbox() 冷启动回灌与 SHA256 缓存回填;
               EnvAwareDaytonaSandbox.execute() 动态 export 环境变量前缀注入。
2. 需要能解释: SubgraphToolMiddleware 拦截子图入口并用 Command(update=...) 双向同步;
               SandboxFileImportService.import_uploaded_files_diff() 增量差集导入;
               Single-Flight + Coalesce 产物异步同步调度与 30s 兜底外化。
3. 追问时展开: 非 ASCII 路径中转机制 (/tmp/_artifact_restore/);
               finally 中 asyncio.shield(release_run_lease) 租约释放保证。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import mimetypes
import shlex
from typing import Any, AsyncGenerator, Dict, List, Optional, Set, Tuple


# --- 1. 契约与沙箱环境 (src/agent/long_task/sandbox_env.py) ---
class WorkspaceStatus(str, Enum):
    ALLOCATING = "allocating"
    ALLOCATED = "allocated"
    RECLAIMED = "reclaimed"
    ERROR = "error"

@dataclass
class WorkspaceRecord:
    thread_id: str
    workspace_id: str
    status: WorkspaceStatus
    created: bool = False  # 是否为新创建 (用于触发产物回灌)

class EnvAwareDaytonaSandbox:
    """动态注入 export K=V 前缀的 Daytona 沙箱包装 (规避 /etc/environment 明文持久化)"""
    def __init__(self, sandbox_id: str, env_vars: Optional[Dict[str, str]] = None):
        self.id = sandbox_id
        self._env_vars = env_vars or {}

    def execute(self, command: str) -> Any:
        if self._env_vars:
            prefix = " && ".join(f"export {shlex.quote(k)}={shlex.quote(v)}" for k, v in self._env_vars.items())
            command = f"{prefix} && {command}"
        # ... 底层调用 Daytona SDK 执行 Shell 命令
        return type("ExecutionResult", (), {"exit_code": 0, "output": ""})()

    def upload_files(self, files: List[Tuple[str, bytes]]) -> None: ...
    def download_files(self, paths: List[str]) -> List[Any]: ...


# --- 2. 后端 Internal API 客户端 (src/server/clients/backend_api_client.py) ---
class BackendAPIClient:
    """剥离算法本地 DB 权限，通过 Java Internal API 治理状态 (GAP-05)"""
    async def claim_allocation(self, thread_id: str, run_id: str, agent_id: str) -> Any: ...
    async def patch_workspace_state(self, thread_id: str, req: Dict[str, Any]) -> None: ...
    async def acquire_run_lease(self, thread_id: str, run_id: str) -> bool: ...
    async def release_run_lease(self, thread_id: str, run_id: str) -> None: ...
    async def get_import_state(self, thread_id: str) -> Any: ...
    async def put_import_state(self, thread_id: str, state: Any) -> None: ...
    async def list_artifacts(self, thread_id: str) -> List[Any]: ...
    async def externalize_artifact(self, **kwargs: Any) -> Any: ...
    async def get_artifact_download_url(self, thread_id: str, artifact_id: str) -> str: ...

backend_api_client = BackendAPIClient()


# --- 3. Workspace 状态机治理服务 (src/server/services/workspace_service.py) ---
class WorkspaceService:
    async def ensure_workspace(self, thread_id: str, agent_id: str, run_id: str, env_vars: Optional[Dict[str, str]] = None) -> WorkspaceRecord:
        """独占分配准入: claimed (创建新沙箱 + init 目录 + patch state) vs reuse (复用/唤醒)"""
        alloc = await backend_api_client.claim_allocation(thread_id, run_id, agent_id)
        if alloc.mode == "claimed":
            sandbox_id = f"sbx-{thread_id[:8]}"
            sandbox = EnvAwareDaytonaSandbox(sandbox_id, env_vars)
            sandbox.execute("mkdir -p /workspace/project /workspace/uploads /workspace/artifacts")
            await backend_api_client.patch_workspace_state(thread_id, {"workspace_id": sandbox_id, "status": "allocated"})
            return WorkspaceRecord(thread_id, sandbox_id, WorkspaceStatus.ALLOCATED, created=True)
        return WorkspaceRecord(thread_id, alloc.record.workspace_id, WorkspaceStatus.ALLOCATED, created=False)

workspace_service = WorkspaceService()


# --- 4. 产物全量外化与冷启动回灌服务 (src/server/services/artifact_service.py) ---
class ArtifactService:
    _sync_locks: Dict[str, asyncio.Lock] = {}
    _sha256_cache: Dict[str, Dict[str, str]] = {}  # thread_id -> {path: sha256}

    @classmethod
    async def sync_artifacts_directory(cls, thread_id: str, workspace_id: str, run_id: Optional[str], backend: EnvAwareDaytonaSandbox) -> List[Any]:
        """Per-Thread 互斥锁扫描 /workspace/artifacts/ 并通过 SHA256 增量外化"""
        lock = cls._sync_locks.setdefault(thread_id, asyncio.Lock())
        async with lock:
            res = backend.execute("find /workspace/artifacts/ -type f -printf '%s|%p\\n'")
            cache = cls._sha256_cache.setdefault(thread_id, {})
            results = []
            for line in (res.output.strip().split("\n") if res.output.strip() else []):
                if "|" not in line: continue
                _, path = line.split("|", 1)
                downloads = backend.download_files([path])
                if not downloads or not getattr(downloads[0], "content", None): continue
                file_bytes = downloads[0].content
                sha = hashlib.sha256(file_bytes).hexdigest()
                if cache.get(path) == sha: continue  # 哈希未变跳过
                ext_res = await backend_api_client.externalize_artifact(
                    thread_id=thread_id, file_bytes=file_bytes, workspace_id=workspace_id,
                    run_id=run_id, path=path, title=path.rsplit("/", 1)[-1], content_sha256=sha
                )
                cache[path] = sha
                results.append(ext_res)
            return results

    @classmethod
    async def restore_artifacts_to_sandbox(cls, thread_id: str, backend: EnvAwareDaytonaSandbox) -> int:
        """全新沙箱冷启动时从对象存储回灌历史产物，并回填 SHA256 缓存防止二次外化"""
        artifacts = await backend_api_client.list_artifacts(thread_id)
        cache = cls._sha256_cache.setdefault(thread_id, {})
        for art in artifacts:
            url = await backend_api_client.get_artifact_download_url(thread_id, art.artifact_id)
            # ... 下载历史字节流 file_bytes 并写入沙箱原路径
            file_bytes = b""
            backend.upload_files([(art.path, file_bytes)])
            cache[art.path] = art.content_sha256  # 回填缓存
        return len(artifacts)


# --- 5. 13 阶段长任务编排主服务 (src/server/services/long_task_agent_service.py) ---
class LongTaskAgentService:
    @staticmethod
    async def generate_event_stream(thread_id: str, run_id: str, props: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        # Stage 1-2: Workspace 状态机准入
        workspace = await workspace_service.ensure_workspace(thread_id, props.get("agent_id", "default"), run_id)
        # Stage 3: 获取 Run 级独占租约 (防并发冲突)
        if not await backend_api_client.acquire_run_lease(thread_id, run_id):
            yield {"type": "RUN_ERROR", "message": "会话已有任务执行中"}; return

        lease_task = asyncio.create_task(LongTaskAgentService._lease_renewal(thread_id, run_id))
        backend = EnvAwareDaytonaSandbox(workspace.workspace_id)
        heartbeat_task = asyncio.create_task(LongTaskAgentService._provider_heartbeat(backend))
        sync_task: Optional[asyncio.Task] = None

        try:
            # Stage 4-6: 沙箱冷启动回灌 + 遗留产物补账
            if workspace.created:
                await ArtifactService.restore_artifacts_to_sandbox(thread_id, backend)
            await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, None, backend)

            # Stage 7-9: 增量差集文件导入 (import_uploaded_files_diff) 与技能导入，更新 put_import_state
            # ... import_uploaded_files_diff & put_import_state

            # Stage 10-11: 动态编译 Agent 并流式执行; STEP_FINISHED 触发 Single-Flight 产物同步
            yield {"type": "STEP_STARTED", "step_name": "agent_execution"}
            # ... agent.run() 执行，产出 delta
            yield {"type": "STEP_FINISHED", "step_name": "agent_execution"}
            sync_task = asyncio.create_task(ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend))

            # Stage 12: 正常收尾与 30s 兜底外化
            if sync_task and not sync_task.done():
                await asyncio.wait_for(sync_task, timeout=30)
            yield {"type": "RUN_FINISHED"}
        except Exception as e:
            await ArtifactService.sync_artifacts_directory(thread_id, workspace.workspace_id, run_id, backend)
            yield {"type": "RUN_ERROR", "message": str(e)}; yield {"type": "RUN_FINISHED"}
        finally:
            # Stage 13: 取消后台维护任务 + asyncio.shield 安全释放独占租约
            if lease_task and not lease_task.done(): lease_task.cancel()
            if heartbeat_task and not heartbeat_task.done(): heartbeat_task.cancel()
            try:
                await asyncio.shield(backend_api_client.release_run_lease(thread_id, run_id))
            except Exception: pass

    @staticmethod
    async def _lease_renewal(thread_id: str, run_id: str) -> None:
        """后台续租，默认 30s (settings.run_lease_renewal_interval_seconds, config.py:137)"""
        while True:
            await asyncio.sleep(30)
            await backend_api_client.acquire_run_lease(thread_id, run_id)

    @staticmethod
    async def _provider_heartbeat(backend: EnvAwareDaytonaSandbox) -> None:
        """后台 no-op 'true' 保活防 auto_stop，默认 120s (settings.provider_heartbeat_interval_seconds, config.py:138)"""
        while True:
            await asyncio.sleep(120)
            backend.execute("true")
