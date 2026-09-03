"""
05_orchestrator_subgraph.py — Orchestrator 分派调度与子图拦截中间件白板代码

覆盖题目编号：
- C14: Orchestrator 分派工具与调度器 (delegate_and_wait, delegate_in_background, TeamAssignmentScheduler)
- C15: SubgraphToolMiddleware 拦截与白名单回写 (SubgraphToolMiddleware)

口径与架构声明：
1. Agent Teams 是设计完成稿 (design_complete)，运行时尚未实施；
2. SubgraphToolMiddleware 坚持"不改子图契约、不改第三方包"原则，以中间件拦截取代 CompiledSubAgent；
3. 严格遵循术语红线，无违规黑话。
"""

from __future__ import annotations

from collections import deque
import copy
import hashlib
import time
from typing import Any, Callable


# ==============================================================================
# 契约与数据模型 (模拟 LangGraph / deepagents 核心类型)
# ==============================================================================

class BaseMessage:
    def __init__(self, content: str = "", id: str | None = None):
        self.content = content
        self.id = id or f"msg_{hash(content) & 0xffffffff:08x}"

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(content={self.content[:30]!r})"


class ToolMessage(BaseMessage):
    def __init__(self, content: str, tool_call_id: str, status: str = "success"):
        super().__init__(content)
        self.tool_call_id = tool_call_id
        self.status = status


class Command:
    """模拟 LangGraph Command(update=...) 状态更新机制"""
    def __init__(self, update: dict[str, Any]):
        self.update = update

    def __repr__(self) -> str:
        return f"Command(update={list(self.update.keys())})"


class Assignment:
    """任务分派凭证 (VO)"""
    def __init__(
        self,
        assignment_id: str,
        team_thread_id: str,
        member_agent_id: str,
        teammate_thread_id: str,
        instruction: str,
        delegation_mode: str,  # "waiting" | "background"
        status: str = "queued",  # queued, working, succeeded, failed, soft_timeout
    ):
        self.assignment_id = assignment_id
        self.team_thread_id = team_thread_id
        self.member_agent_id = member_agent_id
        self.teammate_thread_id = teammate_thread_id
        self.instruction = instruction
        self.delegation_mode = delegation_mode
        self.status = status
        self.created_at = time.time()
        self.result: dict[str, Any] | None = None


# ==============================================================================
# C14: Orchestrator 分派工具与调度器
# 成熟度标定: design_complete (设计完成稿，运行时尚未实施)
# ==============================================================================

class PersistentTeammateManager:
    """一成员一持久线程: 相同 (team_thread, member_id) 稳定复用同一 teammate_thread"""
    def __init__(self, team_thread_id: str):
        self.team_thread_id = team_thread_id
        self._threads: dict[str, str] = {}

    def get_or_create_teammate_thread(self, member_agent_id: str) -> str:
        # 考察点: 成员持久会话 ID 确定性派生算法 (SHA-256 截取 16 位) 与线程复用
        # 手写量级: 10 行 / 2 分钟
        # 常见追问: 为什么需要一成员一持久线程？重新委派时如何保留成员上下文？
        if member_agent_id not in self._threads:
            raw = f"{self.team_thread_id}::{member_agent_id}".encode("utf-8")
            digest = hashlib.sha256(raw).hexdigest()[:16]
            self._threads[member_agent_id] = f"tm_th_{digest}"
        return self._threads[member_agent_id]


class TeamAssignmentScheduler:
    """持久任务调度器: 严格限制 3 槽位准入 (MAX_ACTIVE=3)，溢出进入持久 FIFO 队列"""
    MAX_ACTIVE_SLOTS: int = 3

    def __init__(self, team_thread_id: str):
        self.team_thread_id = team_thread_id
        self.active_slots: dict[str, Assignment] = {}
        self.fifo_queue: deque[Assignment] = deque()

    def submit_assignment(
        self,
        member_agent_id: str,
        teammate_thread_id: str,
        instruction: str,
        delegation_mode: str,
    ) -> Assignment:
        # 考察点: 3 槽位硬限制准入控制、FIFO 溢出缓冲、工作状态跃迁
        # 手写量级: 20 行 / 4 分钟
        # 常见追问: 为什么并发槽位设为 3？队列任务积压时如何处理？
        asgn_id = f"asgn_{hashlib.md5(f'{time.time()}:{instruction}'.encode()).hexdigest()[:8]}"
        asgn = Assignment(
            assignment_id=asgn_id,
            team_thread_id=self.team_thread_id,
            member_agent_id=member_agent_id,
            teammate_thread_id=teammate_thread_id,
            instruction=instruction,
            delegation_mode=delegation_mode,
        )

        # 准入判断: 当前活跃任务数未达上限 3
        if len(self.active_slots) < self.MAX_ACTIVE_SLOTS:
            asgn.status = "working"
            self.active_slots[asgn_id] = asgn
        else:
            asgn.status = "queued"
            self.fifo_queue.append(asgn)
        return asgn

    def on_teammate_finished(self, assignment_id: str, result: dict[str, Any], status: str = "succeeded") -> Assignment | None:
        """任务完成终态处理: 释放槽位并立即从 FIFO 队列唤醒下一项"""
        asgn = self.active_slots.pop(assignment_id, None)
        if asgn:
            asgn.status = status
            asgn.result = result

        # 唤醒排队项
        if self.fifo_queue and len(self.active_slots) < self.MAX_ACTIVE_SLOTS:
            next_asgn = self.fifo_queue.popleft()
            next_asgn.status = "working"
            self.active_slots[next_asgn.assignment_id] = next_asgn
            return next_asgn
        return None


class OrchestratorDelegationTools:
    """Orchestrator 专用分派工具集: 同步软等待 (5m 不判失败) 与后台异步分派"""
    SOFT_WAIT_TIMEOUT_SECONDS: float = 300.0  # 5 分钟软等待窗口

    def __init__(self, teammate_manager: PersistentTeammateManager, scheduler: TeamAssignmentScheduler):
        self.teammate_manager = teammate_manager
        self.scheduler = scheduler

    def delegate_and_wait(
        self,
        member_agent_id: str,
        instruction: str,
        simulated_execution_time: float = 1.0,
    ) -> dict[str, Any]:
        # 考察点: delegate_and_wait 工具契约、软超时轮询机制 (超时不判失败)、结果回收
        # 手写量级: 25 行 / 5 分钟
        # 常见追问: 为什么 5 分钟软等待到期不判定为失败？Worker 为什么必须物理禁用 ask_user？
        tm_thread = self.teammate_manager.get_or_create_teammate_thread(member_agent_id)
        asgn = self.scheduler.submit_assignment(member_agent_id, tm_thread, instruction, delegation_mode="waiting")

        if asgn.status == "queued":
            return {
                "status": "queued",
                "assignment_id": asgn.assignment_id,
                "message": "槽位已满 (当前上限 3)，任务已加入排队队列",
            }

        # 模拟等待执行与软超时检测 (实际生产通过轮询或状态通知恢复)
        if simulated_execution_time > self.SOFT_WAIT_TIMEOUT_SECONDS:
            asgn.status = "soft_timeout"
            # 关键设计: 软超时不判定为失败，交由 Orchestrator 自主决策 (追加等待/转后台/取消)
            return {
                "status": "soft_timeout",
                "assignment_id": asgn.assignment_id,
                "message": "Teammate 仍在执行中，已达到 5 分钟软等待上限，交由主控决策",
            }

        # 执行正常完成并回收槽位
        exec_result = {"summary": f"成员 {member_agent_id} 分析完成", "data": {"status": "ok"}}
        self.scheduler.on_teammate_finished(asgn.assignment_id, result=exec_result, status="succeeded")
        return {
            "status": "succeeded",
            "assignment_id": asgn.assignment_id,
            "summary": exec_result["summary"],
        }

    def delegate_in_background(self, member_agent_id: str, instruction: str) -> dict[str, Any]:
        # 考察点: delegate_in_background 异步工具契约、立即返回持久凭证、非阻塞交互
        # 手写量级: 15 行 / 3 分钟
        # 常见追问: 异步分派后主控如何获取结果？前端用户如何观测？
        tm_thread = self.teammate_manager.get_or_create_teammate_thread(member_agent_id)
        asgn = self.scheduler.submit_assignment(member_agent_id, tm_thread, instruction, delegation_mode="background")
        return {
            "status": asgn.status,
            "assignment_id": asgn.assignment_id,
            "teammate_thread_id": tm_thread,
            "message": "任务已接受并在后台处理" if asgn.status == "working" else "任务已入队排队",
        }


# ==============================================================================
# C15: SubgraphToolMiddleware 拦截与白名单回写
# 设计演进: 不改子图契约、不改第三方包，以中间件拦截取代 CompiledSubAgent
# ==============================================================================

class SubgraphToolMiddleware:
    """
    业务子图工具拦截中间件 (解决 CompiledSubAgent 覆写消息导致 KeyError 的缺陷)
    架构红线:
    - 不改子图契约 (子图保持输入输出 State 协议)
    - 不改第三方包 (利用框架 AgentMiddleware.awrap_tool_call 扩展点)
    - 隔离执行子图，仅提取白名单字段并封装 Command(update=...) 回写主图
    """
    def __init__(
        self,
        subgraph_registry: dict[str, Any],
        whitelist_fields: tuple[str, ...] = ("data_envelope", "visualization_result", "report_draft"),
    ):
        self._registry = subgraph_registry
        self._whitelist_fields = set(whitelist_fields)

    def wrap_tool_call(
        self,
        tool_call: dict[str, Any],
        main_state: dict[str, Any],
        next_handler: Callable[[dict[str, Any]], Any],
    ) -> Any:
        # 考察点: wrap_tool_call 拦截、隔离子图上下文执行、Command(update) 白名单字段回写
        # 手写量级: 25 行 / 5 分钟
        # 常见追问: 为什么不能直接将子图挂为普通工具？为什么要设白名单？内部私有变量泄漏如何防止？

        tool_name = tool_call.get("name", "")
        # 1. 未命中子图注册表: 透传给下一级普通工具执行器
        if tool_name not in self._registry:
            return next_handler(tool_call)

        tool_call_id = tool_call.get("id", "call_default")
        subgraph = self._registry[tool_name]

        # 2. 隔离执行子图: 拷贝完整上下文，防止子图对主图内存状态造成意外污染
        isolated_state = copy.deepcopy(main_state)
        subgraph_result = subgraph.invoke(isolated_state)

        # 3. 构造带内 ToolMessage (避免大体积 JSON 污染后续 Prompt，回写结构化结果)
        tool_msg = ToolMessage(
            content=f"子图 {tool_name} 执行成功",
            tool_call_id=tool_call_id,
            status="success",
        )

        # 4. 白名单状态回写 (仅允许预定领域字段同步回主图，隔离子图私有变量)
        state_update: dict[str, Any] = {"messages": [tool_msg]}
        for field in self._whitelist_fields:
            if field in subgraph_result:
                state_update[field] = subgraph_result[field]

        # 5. 通过 Command 机制原子更新主图状态
        return Command(update=state_update)


# ==============================================================================
# 自测断言 (__main__)
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 05_orchestrator_subgraph.py 自测 ===")

    # 1. 测试 C14: PersistentTeammateManager 线程复用
    tm_mgr = PersistentTeammateManager(team_thread_id="team_th_001")
    th_1 = tm_mgr.get_or_create_teammate_thread("agent_sql_expert")
    th_2 = tm_mgr.get_or_create_teammate_thread("agent_sql_expert")
    th_other = tm_mgr.get_or_create_teammate_thread("agent_vis_expert")
    assert th_1 == th_2, "相同 (team, member) 必须复用同一持久线程 ID"
    assert th_1 != th_other, "不同成员必须派生不同持久线程 ID"
    print("✓ C14 Teammate 线程派生与复用测试通过")

    # 2. 测试 C14: 3 槽位准入硬限制与 FIFO 排队
    scheduler = TeamAssignmentScheduler(team_thread_id="team_th_001")
    asgns = []
    # 连续提交 3 个任务 -> 全部准入进入 working
    for i in range(3):
        a = scheduler.submit_assignment(f"mem_{i}", f"th_{i}", f"task {i}", "waiting")
        asgns.append(a)
        assert a.status == "working", f"第 {i+1} 个任务应当准入，实际状态 {a.status}"
    assert len(scheduler.active_slots) == 3
    assert len(scheduler.fifo_queue) == 0

    # 提交第 4 个任务 -> 槽位已满，进入 FIFO 排队
    a4 = scheduler.submit_assignment("mem_3", "th_3", "task 3 (overflow)", "waiting")
    assert a4.status == "queued", "第 4 个任务必须排队"
    assert len(scheduler.fifo_queue) == 1

    # 完成第 1 个任务 -> 释放槽位，第 4 个任务自动被唤醒进入 working
    promoted = scheduler.on_teammate_finished(asgns[0].assignment_id, result={"done": True})
    assert promoted is not None
    assert promoted.assignment_id == a4.assignment_id
    assert promoted.status == "working"
    assert len(scheduler.active_slots) == 3
    assert len(scheduler.fifo_queue) == 0
    print("✓ C14 3 槽位准入控制与 FIFO 排队唤醒测试通过")

    # 3. 测试 C14: 软超时不判定失败
    tools = OrchestratorDelegationTools(tm_mgr, scheduler)
    # 先释放一个空位
    scheduler.on_teammate_finished(asgns[1].assignment_id, result={})
    # 发起模拟超长执行 (301 秒 > 300 秒软超时窗口)
    timeout_res = tools.delegate_and_wait("agent_sql_expert", "长查询任务", simulated_execution_time=301.0)
    assert timeout_res["status"] == "soft_timeout", "超时必须返回 soft_timeout"
    assert "交由主控决策" in timeout_res["message"]
    print("✓ C14 5 分钟软超时机制测试通过")

    # 4. 测试 C15: SubgraphToolMiddleware 拦截与白名单回写
    # 模拟编译子图 (CompiledStateGraph)
    class MockChatBISubgraph:
        def invoke(self, state: dict[str, Any]) -> dict[str, Any]:
            # 子图内部包含私有中间变量与对外产出的业务字段
            return {
                "data_envelope": {"rows": [1, 2, 3], "total": 3},  # 白名单字段
                "_subgraph_temp_cache": "private_data_secret",       # 私有变量，不应泄漏
                "status": "done",
            }

    subgraph_map = {"chatbi_tool": MockChatBISubgraph()}
    middleware = SubgraphToolMiddleware(
        subgraph_registry=subgraph_map,
        whitelist_fields=("data_envelope", "visualization_result"),
    )

    # 情况 A: 普通工具未命中子图 -> 透传 next_handler
    def mock_next_handler(tc: dict[str, Any]) -> dict[str, Any]:
        return {"handled_by": "default_tool_node", "name": tc["name"]}

    res_normal = middleware.wrap_tool_call(
        tool_call={"name": "calculator", "id": "call_calc_1"},
        main_state={"messages": []},
        next_handler=mock_next_handler,
    )
    assert res_normal["handled_by"] == "default_tool_node"

    # 情况 B: 命中子图 -> 隔离执行并返回 Command(update=...)
    res_subgraph = middleware.wrap_tool_call(
        tool_call={"name": "chatbi_tool", "id": "call_bi_001"},
        main_state={"messages": [BaseMessage("用户输入: 统计销售额")]},
        next_handler=mock_next_handler,
    )
    assert isinstance(res_subgraph, Command), "拦截子图后必须返回 Command"
    update_dict = res_subgraph.update
    # 验证 messages 包含正确的 ToolMessage
    assert "messages" in update_dict
    assert isinstance(update_dict["messages"][0], ToolMessage)
    assert update_dict["messages"][0].tool_call_id == "call_bi_001"
    # 验证白名单字段被同步
    assert "data_envelope" in update_dict
    assert update_dict["data_envelope"]["total"] == 3
    # 验证非白名单私有变量被严格隔离未回写
    assert "_subgraph_temp_cache" not in update_dict
    print("✓ C15 SubgraphToolMiddleware 拦截与白名单回写测试通过")

    print("\n=== 05_orchestrator_subgraph.py 全部断言自测通过！===")
