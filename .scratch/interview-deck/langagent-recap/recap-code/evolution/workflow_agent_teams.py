"""
workflow_agent_teams.py - 平台编排演进：确定性工作流 (Workflow/Chatflow) 与 多智能体协作 (Agent Teams) 白板核心控制流

定位与成熟度说明：
- 本文件用于面试与架构复现白板场景，还原平台向高阶确定性编排与多智能体协作演进的核心设计契约与控制流。
- 各组件严格标注成熟度：
  * [设计契约: DESIGN-TM-001～011, ADR 0001～0006]：已完成 Master PRD 与 6 项 ADR 架构评审，为平台待实施标准契约。
  * [原型验证: LangFlowMVP / Dify 调研]：基于外部原型与探索性调研报告核验的运行语义，非 develop 主线代码。
  * [框架基线: deepagents 0.6.12]：锁定依赖源码核验（middleware/async_subagents.py），用于与 Teams 设计做演进差异对照 (DELTA-TM-001)。
- 代码为语法合法的白板伪代码，保留核心控制流、状态机转换、异常分支与关键数据流，不做端到端运行依赖。
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import time
from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Sequence, Tuple, Union
import uuid
from pydantic import BaseModel, Field


# ============================================================================
# 1. 状态与成熟度枚举定义
# ============================================================================

MaturityLevel = Literal[
    "设计契约",      # Master PRD / ADR 已批准，待实施
    "原型验证",      # 分支或外部原型已验证语义
    "已合入主线",    # develop 基线已合入
    "框架原生基线",  # 第三方锁定框架源码原生行为
]

AssignmentStatus = Literal[
    "queued",     # 槽位已满或 Teammate 忙碌，在持久 FIFO 队列排队中（前端映射为“工作中”）
    "working",    # 已占用调度槽位，底层 Teammate 正在执行中（前端映射为“工作中”）
    "succeeded",  # 正常执行完成，产出结果与产物（前端映射为“已完成”）
    "failed",     # 模型、工具或沙箱执行异常（前端映射为“执行异常”）
    "timed_out",  # 超过 2h 平台硬运行上限，被强制终止（前端映射为“执行异常”）
    "cancelled",  # 用户或 Orchestrator 显式取消，或会话删除级联终止（前端映射为“已停止”）
]


# ============================================================================
# 2. 确定性工作流 (Workflow / Chatflow) 运行时契约与 Human-Input 桥接
# ============================================================================

class WorkflowNodeType:
    """[设计契约 / 原型验证] 工作流节点类型定义"""
    START = "start"
    END = "end"
    LLM = "llm"
    CODE = "code"
    HTTP = "http_request"
    KNOWLEDGE = "knowledge_retrieval"
    TOOL = "tool"
    HUMAN_INPUT = "human_input"
    ITERATION = "iteration"


@dataclass
class WorkflowNode:
    """[设计契约 / 原型验证] 工作流拓扑节点"""
    node_id: str
    node_type: str
    title: str
    config: Dict[str, Any]
    inputs: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowEdge:
    """[设计契约 / 原型验证] 工作流拓扑边与条件路由"""
    source_node: str
    target_node: str
    source_handle: Optional[str] = None  # 用于条件分支路由 (如 'approve' / 'reject')


@dataclass
class WorkflowDSL:
    """[设计契约 / 原型验证] 结构化工作流定义"""
    workflow_id: str
    version: str
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    mode: Literal["workflow", "chatflow"] = "workflow"


@dataclass
class WorkflowSuspendPayload:
    """[原型验证: LangFlowMVP] Human-Input 中断挂起载荷"""
    node_id: str
    node_type: str = "human_input"
    form_elements: List[Dict[str, Any]] = field(default_factory=list)  # 表单 Schema
    user_actions: List[str] = field(default_factory=list)              # 允许的操作 ['approve', 'reject']
    thread_id: str = ""
    dsl_snapshot: Optional[Dict[str, Any]] = None                      # 挂起时的 DSL 快照（防版本漂移）


class WorkflowHumanInputNode:
    """
    [原型验证: LangFlowMVP / 设计契约]
    工作流人机协同中断与恢复节点：
    - 首次执行：解析表单字段与允许动作，调用 LangGraph interrupt() 挂起图执行并持久化快照；
    - 恢复执行：接收 Command(resume={action, inputs})，动态 Pydantic 校验表单并沿对应分支边流转。
    """
    def __init__(self, node: WorkflowNode):
        self.node = node

    async def execute(self, state: Dict[str, Any], resume_value: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        node_id = self.node.node_id
        
        # 1. 首次进入节点：构建 SuspendPayload 并挂起中断
        if resume_value is None:
            suspend_payload = WorkflowSuspendPayload(
                node_id=node_id,
                form_elements=self.node.config.get("form_elements", []),
                user_actions=self.node.config.get("user_actions", ["submit"]),
                thread_id=state.get("thread_id", ""),
                dsl_snapshot=state.get("dsl_snapshot"),
            )
            # 在 LangGraph 运行时抛出 GraphInterrupt，由 Checkpointer 保存快照并返回
            # 白板还原：raise GraphInterrupt(suspend_payload)
            return {"__interrupt__": suspend_payload}

        # 2. 收到恢复指令：解析并校验用户提交的数据
        action = resume_value.get("action")
        user_inputs = resume_value.get("inputs", {})

        allowed_actions = self.node.config.get("user_actions", ["submit"])
        if action not in allowed_actions:
            raise ValueError(f"Invalid resume action: {action}. Allowed: {allowed_actions}")

        # 3. 动态表单校验与类型强制转换 (Pydantic 动态模型)
        validated_outputs = self._validate_and_coerce_inputs(user_inputs)

        # 4. 写入节点输出，供下游条件边 (Conditional Edges) 路由
        return {
            "node_outputs": {
                node_id: {
                    "action": action,
                    "inputs": validated_outputs,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            }
        }

    def _validate_and_coerce_inputs(self, raw_inputs: Dict[str, Any]) -> Dict[str, Any]:
        """动态构建 Pydantic 模型并校验表单输入"""
        # 白板简写：根据 form_elements 字段类型执行类型转换与必填校验
        return raw_inputs


class WorkflowToolAdapter:
    """
    [设计契约: DESIGN-WF-002]
    Workflow-as-Tool 适配器：
    - 将确定性 Workflow DAG 封装为标准 LangChain Tool 供 ReAct Agent 调用；
    - 运行时拦截执行请求，桥接输入参数并驱动工作流引擎；
    - 支持流式事件转译与 Human-Input 挂起传递。
    """
    def __init__(self, workflow_dsl: WorkflowDSL, engine_client: Any):
        self.dsl = workflow_dsl
        self.client = engine_client
        self.name = f"workflow_{workflow_dsl.workflow_id}"
        self.description = f"执行确定性业务流程: {workflow_dsl.workflow_id}"

    async def ainvoke(self, tool_input: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """执行工作流并返回结构化数据信封或挂起凭证"""
        run_params = {
            "workflow_id": self.dsl.workflow_id,
            "version": self.dsl.version,
            "inputs": tool_input,
            "thread_id": context.get("thread_id", str(uuid.uuid4())),
        }
        
        # 驱动工作流引擎执行 (设计建议：入口设置 Run 级超时控制与异常分支)
        try:
            async with asyncio.timeout(600):  # 示例值（设计建议配置 Run 级超时，待实施时确定具体阈值）
                result = await self.client.run_workflow(run_params)
                
            if result.get("status") == "suspended":
                # 若工作流触发了 Human-Input，向外层 Agent 抛出挂起凭证
                return {
                    "status": "suspended",
                    "suspend_payload": result.get("suspend_payload"),
                    "message": "工作流需要人工输入/审批，已挂起等待。",
                }
                
            return {
                "status": "succeeded",
                "outputs": result.get("outputs", {}),
            }
        except TimeoutError:
            # 关键异常分支：Run 级全局超时中断
            return {
                "status": "timed_out",
                "error": f"工作流 {self.dsl.workflow_id} 执行超时（超过配置阈值）",
                "workflow_id": self.dsl.workflow_id,
            }
        except Exception as e:
            # 关键异常分支：引擎底层报错包装为失败信封
            return {
                "status": "failed",
                "error": f"工作流引擎执行异常: {e}",
                "workflow_id": self.dsl.workflow_id,
            }


# ============================================================================
# 3. Agent Teams 资产模型与配置生命周期 (ADR 0001 & ADR 0003)
# ============================================================================

@dataclass
class TeamMemberVO:
    """
    [设计契约: DESIGN-TM-001, ADR 0001]
    Team 对已有 Claw Agent 的引用模型：
    - 仅保存稳定的 member_agent_id 引用与当前 Team 中的必填团队职责说明；
    - 不保存 Agent 的固定版本快照。
    """
    member_agent_id: str
    member_name: str
    team_role_description: str  # 必填团队职责说明，指导 Orchestrator 委派时机


@dataclass
class TeamAssetVO:
    """
    [设计契约: DESIGN-TM-001, ADR 0003]
    Agent Team 独立组合资产模型：
    - 包含 1 个 Orchestrator 与 1～10 个已有 Type 7 Claw Agent；
    - 会话绑定稳定 team_id，每个新 Run 动态读取最新有效 Team 定义。
    """
    team_id: str
    team_name: str
    team_description: str
    orchestrator_agent_id: str
    members: List[TeamMemberVO]
    collaboration_notes: Optional[str] = None  # 可选 Team 级 SOP 协作规则


@dataclass
class AssignmentVO:
    """
    [设计契约: DESIGN-TM-001, ADR 0002]
    Orchestrator 派发给 Teammate 的业务工作项：
    - assignment_id 为业务工作项唯一标识；
    - teammate_run_id 为底层真实执行 Run ID（重试可产生新 attempt）。
    """
    assignment_id: str
    team_thread_id: str
    member_agent_id: str
    teammate_thread_id: str
    task_instruction: str
    delegation_type: Literal["waiting", "background"]
    status: AssignmentStatus = "queued"
    teammate_run_id: Optional[str] = None
    config_hash: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result_summary: Optional[str] = None
    error_message: Optional[str] = None


# ============================================================================
# 4. 持久调度器：三槽位准入控制与 FIFO 队列 (ADR 0004)
# ============================================================================

class TeamAssignmentScheduler:
    """
    [设计契约: DESIGN-TM-004, ADR 0004]
    aibot-service 持久调度器：
    - 准入控制：单个 Team Thread 最多允许 3 个 active Teammate Run 并发执行；
    - 队列治理：超出槽位限制的 Assignment 进入持久化 FIFO 队列 (queued)；
    - 状态映射：用户界面将内部 queued 与 working 统一映射为“工作中”；
    - 释放机制：Run 终态原子释放槽位，并唤醒下一条就绪队列项；
    - 幂等派发：基于 Dispatch Outbox 与 Lease/Heartbeat 机制保障重启后自动对账恢复。
    """
    MAX_ACTIVE_TEAMMATE_RUNS: int = 3  # 单 Team Thread 3 槽位硬限制

    def __init__(self, team_thread_id: str, db_session: Any):
        self.team_thread_id = team_thread_id
        self.db = db_session
        self._lock = asyncio.Lock()  # 生产环境对应数据库行级锁或 Redis 分布式锁

    async def submit_assignment(
        self,
        member_agent_id: str,
        teammate_thread_id: str,
        instruction: str,
        delegation_type: Literal["waiting", "background"],
    ) -> AssignmentVO:
        """提交新的工作项并执行原子准入判断"""
        async with self._lock:
            assignment = AssignmentVO(
                assignment_id=f"asgn_{uuid.uuid4().hex[:12]}",
                team_thread_id=self.team_thread_id,
                member_agent_id=member_agent_id,
                teammate_thread_id=teammate_thread_id,
                task_instruction=instruction,
                delegation_type=delegation_type,
                status="queued",
            )

            # 1. 查询当前会话活跃槽位数 (working 状态的 Run)
            active_count = await self._count_active_runs_in_tx()
            teammate_busy = await self._is_teammate_working_in_tx(member_agent_id)

            # 2. 准入判断：槽位未满且目标 Teammate 未在执行
            if active_count < self.MAX_ACTIVE_TEAMMATE_RUNS and not teammate_busy:
                # 占用槽位，状态置为 working
                assignment.status = "working"
                assignment.started_at = time.time()
                assignment.teammate_run_id = f"run_{uuid.uuid4().hex[:12]}"
                
                # 写入持久化存储与 Dispatch Outbox 事务
                await self._save_assignment_in_tx(assignment)
                await self._enqueue_dispatch_outbox_in_tx(assignment)
            else:
                # 槽位已满或目标成员正忙，写入持久 FIFO 队列 (queued)
                assignment.status = "queued"
                await self._save_assignment_in_tx(assignment)

            return assignment

    async def replace_assignment_in_slot(
        self,
        member_agent_id: str,
        teammate_thread_id: str,
        instruction: str,
    ) -> AssignmentVO:
        """
        [ADR 0002, ADR 0004] 在当前 Teammate 已占用的 Slot 内原子替换 Assignment：
        - 不触发新槽位并发判断（复用当前 slot，不额外占槽）；
        - 状态直接置为 working 并生成新的 teammate_run_id；
        - 写入持久化存储与 Dispatch Outbox。
        """
        async with self._lock:
            # 1. 事务内标记原 working Assignment 为 cancelled_by_redirect
            await self._cancel_current_working_assignment_in_tx(member_agent_id, reason="cancelled_by_redirect")

            # 2. 在原槽位原子创建替换 Assignment (status='working')
            replacement = AssignmentVO(
                assignment_id=f"asgn_{uuid.uuid4().hex[:12]}",
                team_thread_id=self.team_thread_id,
                member_agent_id=member_agent_id,
                teammate_thread_id=teammate_thread_id,
                task_instruction=instruction,
                delegation_type="waiting",
                status="working",
                teammate_run_id=f"run_{uuid.uuid4().hex[:12]}",
                started_at=time.time(),
            )
            await self._save_assignment_in_tx(replacement)
            await self._enqueue_dispatch_outbox_in_tx(replacement)
            return replacement

    async def on_teammate_run_finished(
        self,
        assignment_id: str,
        final_status: Literal["succeeded", "failed", "timed_out", "cancelled"],
        summary: Optional[str] = None,
        error_msg: Optional[str] = None,
    ) -> Optional[AssignmentVO]:
        """Teammate Run 达到终态：原子释放 Slot 并触发下一就绪任务出队"""
        async with self._lock:
            # 1. 更新当前任务终态并持久化
            assignment = await self._get_assignment_in_tx(assignment_id)
            if not assignment or assignment.status not in ("working", "queued"):
                return None

            assignment.status = final_status
            assignment.completed_at = time.time()
            assignment.result_summary = summary
            assignment.error_message = error_msg
            await self._save_assignment_in_tx(assignment)

            # 2. 原子释放槽位，并扫描持久队列中的下一条可运行项
            next_assignment = await self._pop_next_eligible_queued_assignment_in_tx()
            if next_assignment:
                next_assignment.status = "working"
                next_assignment.started_at = time.time()
                next_assignment.teammate_run_id = f"run_{uuid.uuid4().hex[:12]}"
                
                await self._save_assignment_in_tx(next_assignment)
                await self._enqueue_dispatch_outbox_in_tx(next_assignment)
                return next_assignment

            return None

    # --- 事务与持久化内部辅助 (白板伪代码) ---
    async def _count_active_runs_in_tx(self) -> int:
        return 0  # 真实实现：SELECT count(*) FROM assignments WHERE team_thread_id = ... AND status = 'working'

    async def _is_teammate_working_in_tx(self, member_agent_id: str) -> bool:
        return False  # 真实实现：SELECT count(*) > 0 FROM assignments WHERE ... AND member_agent_id = ... AND status = 'working'

    async def _cancel_current_working_assignment_in_tx(self, member_agent_id: str, reason: str) -> None:
        pass  # 真实实现：UPDATE assignments SET status = 'cancelled', error_message = reason WHERE ...

    async def _save_assignment_in_tx(self, assignment: AssignmentVO) -> None:
        pass  # 真实实现：INSERT / UPDATE assignments ...

    async def _enqueue_dispatch_outbox_in_tx(self, assignment: AssignmentVO) -> None:
        pass  # 真实实现：INSERT INTO dispatch_outbox (idempotency_key, assignment_id, ...)

    async def _get_assignment_in_tx(self, assignment_id: str) -> Optional[AssignmentVO]:
        return None

    async def _pop_next_eligible_queued_assignment_in_tx(self) -> Optional[AssignmentVO]:
        return None  # 真实实现：SELECT * FROM assignments WHERE status = 'queued' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED


# ============================================================================
# 5. 持久 Teammate 实例管理与 Follow-up / Redirect 路由 (ADR 0002)
# ============================================================================

class PersistentTeammateManager:
    """
    [设计契约: DESIGN-TM-003, DESIGN-TM-005, ADR 0002]
    持久 Teammate 实例与有界路由管理：
    - 一成员一持久实例：首次委派时懒创建持久线程 (team_thread_id + member_agent_id -> teammate_thread_id)；
    - Follow-up 有界队列：正忙时追加进入 FIFO（上限 5 条），超限拒绝；
    - Interrupt and Redirect：向当前 active Run 发送中断信号，清空待执行队列，在同一持久线程和槽位上原子替换 Assignment。
    """
    MAX_FOLLOW_UP_QUEUE_SIZE: int = 5  # Follow-up 有界队列上限

    def __init__(self, team_thread_id: str, scheduler: TeamAssignmentScheduler):
        self.team_thread_id = team_thread_id
        self.scheduler = scheduler
        # 内存/持久化映射：member_agent_id -> teammate_thread_id
        self._member_threads: Dict[str, str] = {}
        # 成员专属有界 Follow-up 队列：member_agent_id -> deque[instruction]
        self._follow_up_queues: Dict[str, deque[str]] = {}

    def get_or_create_teammate_thread(self, member_agent_id: str) -> str:
        """[ADR 0002] 懒加载获取或创建唯一的持久 Teammate 线程"""
        if member_agent_id not in self._member_threads:
            # 确定性派生持久线程 ID 与沙箱映射
            thread_key = f"{self.team_thread_id}::{member_agent_id}"
            digest = hashlib.sha256(thread_key.encode("utf-8")).hexdigest()[:16]
            self._member_threads[member_agent_id] = f"tm_thread_{digest}"
            self._follow_up_queues[member_agent_id] = deque(maxlen=self.MAX_FOLLOW_UP_QUEUE_SIZE)
        return self._member_threads[member_agent_id]

    async def enqueue_follow_up(self, member_agent_id: str, follow_up_instruction: str) -> Dict[str, Any]:
        """追加 Follow-up 指令至有界 FIFO 队列"""
        teammate_thread_id = self.get_or_create_teammate_thread(member_agent_id)
        q = self._follow_up_queues[member_agent_id]

        if len(q) >= self.MAX_FOLLOW_UP_QUEUE_SIZE:
            # 超过 5 条，拒绝入队，要求 Orchestrator 等待、取消或 Redirect
            return {
                "status": "rejected",
                "error": f"Teammate {member_agent_id} Follow-up 队列已满 (上限 5 条)，请等待或发起 Redirect",
            }

        q.append(follow_up_instruction)
        return {
            "status": "queued",
            "queue_position": len(q),
            "teammate_thread_id": teammate_thread_id,
        }

    async def interrupt_and_redirect(
        self,
        member_agent_id: str,
        new_instruction: str,
    ) -> AssignmentVO:
        """
        [ADR 0002] 中断当前任务并重新定向：
        1. 向当前 working 的 Teammate Run 发送中断信号 (interrupt)；
        2. 清空该成员所有尚未执行的 Follow-up 队列；
        3. 在同一 Teammate 持久线程与当前槽位上原子创建替换 Assignment (不额外占槽)。
        """
        teammate_thread_id = self.get_or_create_teammate_thread(member_agent_id)

        # 1. 向当前运行中的 Teammate Run 发送中断信号 (Agent Protocol multitask_strategy='interrupt')
        await self._send_interrupt_signal(member_agent_id)

        # 2. 清空当前成员所有尚未执行的 Follow-up 队列
        if member_agent_id in self._follow_up_queues:
            self._follow_up_queues[member_agent_id].clear()

        # 3. 调度器在原槽位内原子替换工作项 (保持 slot 占用，不落入 queued 队列)
        replacement_assignment = await self.scheduler.replace_assignment_in_slot(
            member_agent_id=member_agent_id,
            teammate_thread_id=teammate_thread_id,
            instruction=new_instruction,
        )
        return replacement_assignment

    async def _send_interrupt_signal(self, member_agent_id: str) -> None:
        """向底层运行中的 Teammate Run 发送中断信号 (白板伪代码)"""
        pass


# ============================================================================
# 6. Orchestrator 面向角色的委派工具集与双层超时控制 (PRD §8.1, §9.1)
# ============================================================================

class OrchestratorDelegationTools:
    """
    [设计契约: DESIGN-TM-002, DESIGN-TM-006]
    Orchestrator 运行时委派工具契约：
    - delegate_and_wait：同步等待委派，带 5m 软等待窗口（到期不判失败，可选择追加/转后台/Redirect/取消）；
    - delegate_in_background：后台异步委派，立即返回任务回执；
    - send_follow_up：追加有界 Follow-up 指令；
    - interrupt_and_redirect：中断当前方向并清空队列替换；
    - cancel_team_work：用户主会话显式停止团队工作；
    - list_team_tasks / check_team_task：跨 Run 查询持久任务状态（无主动唤醒）。
    """
    SOFT_WAIT_TIMEOUT_SECONDS: float = 300.0  # 软等待窗口 5 分钟
    MAX_SOFT_WAIT_RETRIES: int = 3           # 最大追加等待 3 次
    HARD_ASSIGNMENT_TIMEOUT_SECONDS: float = 7200.0  # 硬运行上限 2 小时

    def __init__(self, teammate_manager: PersistentTeammateManager, scheduler: TeamAssignmentScheduler):
        self.manager = teammate_manager
        self.scheduler = scheduler

    async def delegate_and_wait(
        self,
        member_agent_id: str,
        instruction: str,
        wait_retry_attempt: int = 0,
    ) -> Dict[str, Any]:
        """
        [DESIGN-TM-006] 同步软等待委派：
        - 提交 Assignment 并启动 5 分钟软等待；
        - 到期不判定任务失败，Orchestrator 显式决策下一步走向。
        """
        teammate_thread_id = self.manager.get_or_create_teammate_thread(member_agent_id)
        
        assignment = await self.scheduler.submit_assignment(
            member_agent_id=member_agent_id,
            teammate_thread_id=teammate_thread_id,
            instruction=instruction,
            delegation_type="waiting",
        )

        try:
            # 启动软等待窗口 (5 分钟)
            async with asyncio.timeout(self.SOFT_WAIT_TIMEOUT_SECONDS):
                result = await self._join_teammate_run(assignment)
                return {
                    "status": "succeeded",
                    "assignment_id": assignment.assignment_id,
                    "summary": result.get("summary"),
                }
        except TimeoutError:
            # 软等待到期：任务仍在后台继续执行，不判定为失败
            return {
                "status": "soft_timeout",
                "assignment_id": assignment.assignment_id,
                "current_retry_attempt": wait_retry_attempt,
                "max_retry_attempts": self.MAX_SOFT_WAIT_RETRIES,
                "message": (
                    f"Teammate {member_agent_id} 正在深入执行中（已等待 5 分钟）。"
                    "Orchestrator 可选择：1. 继续追加等待；2. 转为后台执行并先向用户回复阶段性结论；"
                    "3. 调用 interrupt_and_redirect 要求快速收尾；4. 调用 cancel_team_work 取消。"
                ),
            }

    async def delegate_in_background(self, member_agent_id: str, instruction: str) -> Dict[str, Any]:
        """后台异步委派：立即返回 Assignment 凭据，不阻塞当前主对话"""
        teammate_thread_id = self.manager.get_or_create_teammate_thread(member_agent_id)
        assignment = await self.scheduler.submit_assignment(
            member_agent_id=member_agent_id,
            teammate_thread_id=teammate_thread_id,
            instruction=instruction,
            delegation_type="background",
        )
        return {
            "status": assignment.status,  # "working" 或 "queued"
            "assignment_id": assignment.assignment_id,
            "teammate_thread_id": teammate_thread_id,
            "message": f"任务已成功委派给 {member_agent_id}，正在后台执行中。",
        }

    async def send_follow_up(self, member_agent_id: str, follow_up_instruction: str) -> Dict[str, Any]:
        """[ADR 0002] 向指定 Teammate 追加 Follow-up 指令"""
        return await self.manager.enqueue_follow_up(member_agent_id, follow_up_instruction)

    async def interrupt_and_redirect(self, member_agent_id: str, new_instruction: str) -> Dict[str, Any]:
        """[ADR 0002] 中断当前任务并重新定向"""
        assignment = await self.manager.interrupt_and_redirect(member_agent_id, new_instruction)
        return {
            "status": "redirected",
            "new_assignment_id": assignment.assignment_id,
            "message": f"已成功中断 {member_agent_id} 的前序任务，并在原槽位启动新方向任务。",
        }

    async def cancel_team_work(self, member_agent_id: Optional[str] = None) -> Dict[str, Any]:
        """[PRD §8.1] 用户主会话显式停止指定或全部团队工作"""
        # 取消 working/queued 工作，不删除 Team 会话或历史
        return {
            "status": "cancelled",
            "message": f"已成功停止 {'全部团队工作' if not member_agent_id else f'{member_agent_id} 的工作'}。",
        }

    async def list_team_tasks(self) -> List[Dict[str, Any]]:
        """[PRD §8.1] 跨 Run 查询当前 Team Thread 的持久运行记录 (无主动唤醒)"""
        return []

    async def check_team_task(self, assignment_id: str) -> Dict[str, Any]:
        """[PRD §8.1] 查询单个任务的持久状态与可用结果"""
        return {"assignment_id": assignment_id, "status": "working"}

    async def _join_teammate_run(self, assignment: AssignmentVO) -> Dict[str, Any]:
        """等待 Teammate 执行完成并获取纯文本总结"""
        # 白板简写：轮询或监听 Team Event 终态信号
        return {"summary": "分析任务已完成，产出报表文件 report.csv"}


# ============================================================================
# 7. Teammate Worker Mode 运行器与三层流解耦 (PRD §8.3, §13)
# ============================================================================

class TeammateWorkerRunner:
    """
    [设计契约: DESIGN-TM-003, ADR 0001]
    Teammate Worker 运行模式：
    - 动态解析该 Agent 最新有效的人设、模型、MCP 工具、知识库与 Skills；
    - 在能力层（Tool Registry）显式禁用 Ask User / HITL 交互工具；
    - 记录规范化 config_hash，清理旧 Checkpoint 污染字段；
    - 执行完成向 Orchestrator 返回结构化状态与纯文本总结。
    """
    def __init__(self, agent_factory: Any, event_bridge: Any):
        self.factory = agent_factory
        self.bridge = event_bridge

    async def run_worker_assignment(
        self,
        assignment: AssignmentVO,
        effective_agent_config: Dict[str, Any],
    ) -> Dict[str, Any]:
        # 1. 计算当前生效配置的 config_hash
        config_str = str(sorted(effective_agent_config.items()))
        config_hash = hashlib.sha256(config_str.encode("utf-8")).hexdigest()[:16]
        assignment.config_hash = config_hash

        # 2. 构建 Worker Agent 实例 (严格禁用 ask_user 等交互工具)
        worker_tools = self._filter_tools_disable_hitl(effective_agent_config.get("tools", []))
        
        # 3. 驱动底层 Agent Loop 执行
        try:
            # 施加 2h 平台硬上限 (Hard Runtime Limit)
            async with asyncio.timeout(7200.0):
                # 白板还原：compiled_agent.ainvoke(input={"messages": [HumanMessage(content=assignment.task_instruction)]})
                worker_result_summary = "完成指标统计，数据分布符合预期。"
                return {
                    "status": "succeeded",
                    "summary": worker_result_summary,
                    "config_hash": config_hash,
                }
        except TimeoutError:
            # 达到平台硬上限，强制中断并标记 timed_out
            return {
                "status": "timed_out",
                "reason": "Hard timeout exceeded (2 hours)",
                "config_hash": config_hash,
            }
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "config_hash": config_hash,
            }

    def _filter_tools_disable_hitl(self, tools: List[Any]) -> List[Any]:
        """能力层禁用 Ask User 工具"""
        return [t for t in tools if getattr(t, "name", "") != "ask_user"]


class TeamStreamAndReadModelRouter:
    """
    [设计契约: DESIGN-TM-007]
    三层流架构与前端隔离读模型：
    1. 主流 (Mainstream AG-UI SSE)：Orchestrator 主对话；
    2. 状态流 (Status SSE)：常驻轻量推送 TEAMMATE_UPSERT 成员卡片四态变更；
    3. 详情流 (Detail SSE & Timeline REST)：按需点击加载只读 Timeline 历史（默认 30 条游标分页）。
    """
    def route_orchestrator_event(self, agui_event: Dict[str, Any]) -> None:
        """主流推送：仅承载 Orchestrator 与用户的对话事件"""
        pass

    def route_status_event(self, teammate_id: str, status: AssignmentStatus) -> Dict[str, Any]:
        """状态流推送：推送轻量成员卡片变更"""
        # 前端状态平滑映射：queued 与 working 统一映射为“工作中”
        ui_status_map = {
            "queued": "working",
            "working": "working",
            "succeeded": "succeeded",
            "failed": "error",
            "timed_out": "error",
            "cancelled": "cancelled",
        }
        return {
            "event": "TEAMMATE_UPSERT",
            "data": {
                "teammate_id": teammate_id,
                "ui_status": ui_status_map.get(status, "idle"),
                "timestamp": time.time(),
            }
        }

    def fetch_timeline_history(
        self,
        teammate_thread_id: str,
        before_sequence: Optional[int] = None,
        limit: int = 30,
    ) -> List[Dict[str, Any]]:
        """详情流 REST 分页：默认每次 30 条拉取只读执行流"""
        return []


# ============================================================================
# 8. 会话删除 Fence 与级联资源清理 (ADR 0006, PRD §11)
# ============================================================================

class TeamThreadDeletionFence:
    """
    [设计契约: DESIGN-TM-010, ADR 0006]
    会话级联删除保护与清理 Fence：
    1. 原子建立 Fence，将状态置为 deleting，拒绝任何新 Run 与晚到事件；
    2. 清空所有排队中的 Assignment / Follow-up 队列；
    3. 向正在运行中的 Orchestrator 与 working Teammate 发出优雅取消信号（30s 宽限期）；
    4. 确认退出后清理 Checkpoint 与 Workspace 沙箱。
    """
    GRACE_PERIOD_SECONDS: float = 30.0

    async def execute_cascade_deletion(self, team_thread_id: str) -> None:
        # 1. 建立原子 Fence 拒绝新任务
        # update team_threads set status = 'deleting' where thread_id = ...
        
        # 2. 清空队列
        # delete from queued_assignments where team_thread_id = ...

        # 3. 广播优雅取消信号，等待 30 秒宽限期
        # broadcast cancel signal to all active runs
        await asyncio.sleep(0.1)  # 优雅宽限期等待

        # 4. 级联销毁底层 Checkpoint 与 Workspace
        # cleanup_checkpoints(team_thread_id)
        # workspace_service.destroy_workspaces_for_thread(team_thread_id)


# ============================================================================
# 9. 框架中间件源码核验对比 (DELTA-TM-001)
# ============================================================================

def contrast_deepagents_async_subagents_vs_agent_teams() -> Dict[str, Any]:
    """
    [框架基线核验: deepagents 0.6.12 async_subagents.py vs. Agent Teams ADR 0002/0004]
    四大核心演进差异对比：
    """
    return {
        "thread_lifecycle": {
            "deepagents_0.6.12": "start_async_task 每次调用显式创建全新线程 (await client.threads.create())",
            "agent_teams_design": "一成员一持久线程 (team_thread_id + member_agent_id -> teammate_thread_id)，复用沙箱",
        },
        "concurrency_control": {
            "deepagents_0.6.12": "框架未定义任何会话级并发限制，所有任务直接启动",
            "agent_teams_design": "持久调度器 (TeamAssignmentScheduler) 严格控制 3 槽位硬限制与持久 FIFO 队列",
        },
        "tool_contracts": {
            "deepagents_0.6.12": "暴露底层技术工具: start/check/update/cancel/list_async_tasks (基于 task_id)",
            "agent_teams_design": "封装角色导向的高层委派: delegate_and_wait, delegate_in_background, send_follow_up, interrupt_and_redirect",
        },
        "stream_and_events": {
            "deepagents_0.6.12": "仅提供轮询与更新控制面，无独立 Worker 实时事件流",
            "agent_teams_design": "自研 Team Event 桥接层，输出主流/状态流/详情流三层流与隔离读模型",
        },
    }


# ============================================================================
# 10. 白板核心控制流还原：Agent Teams 全生命周期 Execution Trace
# ============================================================================

async def whiteboard_agent_teams_full_lifecycle_trace():
    """
    [白板复现核心 Trace]
    展示一次完整的 Agent Teams 交互与调度全链路：
    1. 用户在 Team 会话发起复合分析请求；
    2. Orchestrator 启动并解析最新 Agent 配置；
    3. Orchestrator 调用 delegate_and_wait 委派分析专家 (占用 Slot 1)；
    4. Teammate 以 Worker Mode 启动并在沙箱中执行；
    5. 5 分钟软等待到期，Orchestrator 转换为后台执行并回复用户当前进度；
    6. 用户后续询问进度，Orchestrator 通过 list_team_tasks 查询持久结果并收尾。
    """
    team_thread_id = "team_th_98765"
    scheduler = TeamAssignmentScheduler(team_thread_id, db_session=None)
    teammate_mgr = PersistentTeammateManager(team_thread_id, scheduler)
    delegation_tools = OrchestratorDelegationTools(teammate_mgr, scheduler)

    # 步骤 1: Orchestrator 接收用户指令并同步委派 (Slot 1 占用)
    # Orchestrator 调用 delegate_and_wait
    delegation_result = await delegation_tools.delegate_and_wait(
        member_agent_id="agent_analyst_01",
        instruction="请分析 Q3 财报异常波动原因并导出分析图表",
    )

    # 步骤 2: 若软等待到期 (soft_timeout)，Orchestrator 决定转入后台并不阻塞主对话
    if delegation_result.get("status") == "soft_timeout":
        # 向用户回复阶段性答复
        orchestrator_reply = "数据分析专家已在后台启动深度计算，稍后您可随时向我询问分析进度。"

    # 步骤 3: 用户后续再次进入会话询问“分析做完了吗？”
    # 新 Orchestrator Run 启动，调用 check/list 工具读取持久运行记录
    # 最终汇总结果并向用户呈现完整结论与产物链接
    return orchestrator_reply
