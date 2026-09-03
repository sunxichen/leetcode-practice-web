"""
workflow_agent_teams.py - 确定性工作流与 Agent Teams 协作白板骨架代码 (Skeleton)

定位说明:
- 本文件为 15 分钟白板默写骨架，保留高阶演进设计契约、核心调度控制流与成熟度标注。
- 完整机制与差异对照参照: recap-code/evolution/workflow_agent_teams.py。
- 成熟度标定: [设计契约 / design_complete] (已通过 Master PRD 与 ADR 0001~0006 架构评审)。

【白板手写与记忆分级】:
1. 必须能默写: TeamAssignmentScheduler 3 槽位准入控制 (MAX_ACTIVE_TEAMMATE_RUNS=3) 与持久 FIFO 队列;
               PersistentTeammateManager 一成员一持久线程懒加载与 interrupt_and_redirect 原槽位替换;
               OrchestratorDelegationTools.delegate_and_wait() 5 分钟软等待窗口 (超时不判失败);
               TeammateWorkerRunner Worker Mode 禁用 ask_user 与 2h 平台硬上限。
2. 需要能解释: WorkflowHumanInputNode 挂起与 Command(resume=...) 表单恢复;
               WorkflowToolAdapter 将 DAG 封装为 Agent 可调用工具与超时信封包装。
3. 追问时展开: TeamStreamAndReadModelRouter 主流/状态流/详情流三层流与前端状态平滑映射;
               TeamThreadDeletionFence 级联删除保护与 30s 宽限期。
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass, field
import hashlib
import time
from typing import Any, Dict, List, Literal, Optional


# --- 1. 确定性工作流契约与 Human-Input (原型验证 / 设计契约) ---
@dataclass
class WorkflowNode:
    node_id: str; node_type: str; config: Dict[str, Any]

class WorkflowHumanInputNode:
    """工作流人机协同节点: 首次进入调用 interrupt 挂起; 收到 resume 指令动态校验表单输出"""
    def __init__(self, node: WorkflowNode): self.node = node

    async def execute(self, state: Dict[str, Any], resume_value: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if resume_value is None:
            # 挂起图执行并持久化快照: return {"__interrupt__": suspend_payload}
            return {"__interrupt__": {"node_id": self.node.node_id, "actions": self.node.config.get("user_actions", ["submit"])}}
        action = resume_value.get("action")
        if action not in self.node.config.get("user_actions", ["submit"]): raise ValueError(f"非法 action: {action}")
        return {"node_outputs": {self.node.node_id: {"action": action, "inputs": resume_value.get("inputs", {})}}}

class WorkflowToolAdapter:
    """Workflow-as-Tool 适配器: 将确定性 DAG 封装为标准 Tool 供 ReAct Agent 调度"""
    def __init__(self, workflow_id: str, engine_client: Any):
        self.name = f"workflow_{workflow_id}"
        self.client = engine_client

    async def ainvoke(self, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        try:
            async with asyncio.timeout(600):  # Run 级超时
                return await self.client.run_workflow(tool_input)
        except TimeoutError:
            return {"status": "timed_out", "error": "工作流执行超时"}


# --- 2. Agent Teams 核心资产与调度器 (设计契约: ADR 0001, 0002, 0004) ---
@dataclass
class TeamMemberVO:
    member_agent_id: str; member_name: str; team_role_description: str

@dataclass
class AssignmentVO:
    assignment_id: str; team_thread_id: str; member_agent_id: str; teammate_thread_id: str
    task_instruction: str; delegation_type: Literal["waiting", "background"]
    status: Literal["queued", "working", "succeeded", "failed", "timed_out", "cancelled"] = "queued"
    teammate_run_id: Optional[str] = None

class TeamAssignmentScheduler:
    """持久调度器: 单 Team Thread 严格控制 3 槽位硬限制，溢出进入持久 FIFO 队列 (queued)"""
    MAX_ACTIVE_TEAMMATE_RUNS: int = 3

    def __init__(self, team_thread_id: str):
        self.team_thread_id = team_thread_id
        self._lock = asyncio.Lock()

    async def submit_assignment(self, member_agent_id: str, teammate_thread_id: str, instruction: str,
                                delegation_type: Literal["waiting", "background"]) -> AssignmentVO:
        async with self._lock:
            asgn = AssignmentVO(f"asgn_{time.time()}", self.team_thread_id, member_agent_id, teammate_thread_id, instruction, delegation_type)
            # 准入判断: active_runs < 3 且目标 Teammate 未在执行 -> working 并写入 Outbox; 否则 -> queued
            active_count, is_busy = 0, False  # 真实查询 DB
            if active_count < self.MAX_ACTIVE_TEAMMATE_RUNS and not is_busy:
                asgn.status = "working"
                asgn.teammate_run_id = f"run_{time.time()}"
                # await _enqueue_dispatch_outbox(asgn)
            else:
                asgn.status = "queued"
            return asgn

    async def replace_assignment_in_slot(self, member_agent_id: str, teammate_thread_id: str, instruction: str) -> AssignmentVO:
        """[ADR 0002] 原槽位原子替换 Assignment，不额外占槽"""
        async with self._lock:
            # 取消当前 working 任务 -> 在同一 slot 创建新 Assignment (status='working')
            return AssignmentVO(f"asgn_{time.time()}", self.team_thread_id, member_agent_id, teammate_thread_id, instruction, "waiting", status="working")

    async def on_teammate_run_finished(self, assignment_id: str, final_status: str) -> Optional[AssignmentVO]:
        """终态原子释放 Slot 并唤醒下一条 queued 项"""
        async with self._lock:
            # update assignment status -> pop next queued assignment -> set status='working'
            return None


# --- 3. 持久 Teammate 实例与 Follow-up 队列 (设计契约: ADR 0002) ---
class PersistentTeammateManager:
    """一成员一持久线程 (team_thread_id + member_id 派生) + Follow-up 有界队列 (上限 5 条)"""
    def __init__(self, team_thread_id: str, scheduler: TeamAssignmentScheduler):
        self.team_thread_id = team_thread_id
        self.scheduler = scheduler
        self._member_threads: Dict[str, str] = {}
        self._follow_ups: Dict[str, deque] = {}

    def get_or_create_teammate_thread(self, member_agent_id: str) -> str:
        if member_agent_id not in self._member_threads:
            digest = hashlib.sha256(f"{self.team_thread_id}::{member_agent_id}".encode()).hexdigest()[:16]
            self._member_threads[member_agent_id] = f"tm_th_{digest}"
            self._follow_ups[member_agent_id] = deque(maxlen=5)
        return self._member_threads[member_agent_id]

    async def interrupt_and_redirect(self, member_agent_id: str, new_instruction: str) -> AssignmentVO:
        """中断当前执行 -> 清空未执行 Follow-up -> 原槽位原子替换新任务"""
        th_id = self.get_or_create_teammate_thread(member_agent_id)
        if member_agent_id in self._follow_ups: self._follow_ups[member_agent_id].clear()
        return await self.scheduler.replace_assignment_in_slot(member_agent_id, th_id, new_instruction)


# --- 4. Orchestrator 运行时委派工具集与双层超时 (设计契约: PRD §8.1, §9.1) ---
class OrchestratorDelegationTools:
    SOFT_WAIT_TIMEOUT_SECONDS: float = 300.0       # 软等待 5 分钟 (超时不判失败)
    HARD_ASSIGNMENT_TIMEOUT_SECONDS: float = 7200.0  # 平台硬上限 2 小时

    def __init__(self, manager: PersistentTeammateManager, scheduler: TeamAssignmentScheduler):
        self.manager = manager
        self.scheduler = scheduler

    async def delegate_and_wait(self, member_agent_id: str, instruction: str) -> Dict[str, Any]:
        th_id = self.manager.get_or_create_teammate_thread(member_agent_id)
        asgn = await self.scheduler.submit_assignment(member_agent_id, th_id, instruction, "waiting")
        try:
            async with asyncio.timeout(self.SOFT_WAIT_TIMEOUT_SECONDS):
                # ... 等待 Teammate 执行完成
                return {"status": "succeeded", "summary": "分析完成"}
        except TimeoutError:
            # 软等待到期: 不判失败，交由 Orchestrator 决策 (追加等待 / 转后台 / redirect / 取消)
            return {"status": "soft_timeout", "assignment_id": asgn.assignment_id, "message": "Teammate 仍在执行，已等待 5 分钟"}

    async def delegate_in_background(self, member_agent_id: str, instruction: str) -> Dict[str, Any]:
        th_id = self.manager.get_or_create_teammate_thread(member_agent_id)
        asgn = await self.scheduler.submit_assignment(member_agent_id, th_id, instruction, "background")
        return {"status": asgn.status, "assignment_id": asgn.assignment_id}


# --- 5. Teammate Worker Mode 运行器 (设计契约: ADR 0001, PRD §8.3) ---
class TeammateWorkerRunner:
    """Worker Mode: 动态加载配置、Tool Registry 显式禁用 ask_user、施加 2h 平台硬上限"""
    async def run_worker_assignment(self, assignment: AssignmentVO, config: Dict[str, Any]) -> Dict[str, Any]:
        tools = [t for t in config.get("tools", []) if getattr(t, "name", "") != "ask_user"]
        try:
            async with asyncio.timeout(7200.0):
                # ... agent.ainvoke(...)
                return {"status": "succeeded", "summary": "执行完成"}
        except TimeoutError:
            return {"status": "timed_out", "reason": "超过 2 小时平台硬上限"}
