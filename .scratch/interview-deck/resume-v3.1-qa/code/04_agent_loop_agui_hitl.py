"""
04_agent_loop_agui_hitl.py — Agent Loop、AG-UI 事件流、HITL 中断恢复与上下文压缩白板代码

覆盖题目编号：
- C11: ReAct Agent Loop 主循环 (run_react_agent_loop)
- C12: AG-UI 事件流处理与异常补发 (process_agui_event_stream)
- C13: HITL interrupt / Command(resume) 最小骨架 (hitl_interrupt, hitl_resume, AskUserWorkflow)
- C16: 上下文压缩触发与安全边界截断 (truncate_and_summarize_context)
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import math
from typing import Any, Callable


# ==============================================================================
# 极简消息契约 (纯标准库模拟 LangGraph / LangChain 消息协议)
# ==============================================================================

class BaseMessage:
    def __init__(self, content: str = "", id: str | None = None, **kwargs: Any):
        self.content = content
        self.id = id or f"msg_{hash(content) & 0xffffffff:08x}"
        self.extra = kwargs

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(id={self.id!r}, content={self.content[:30]!r})"


class SystemMessage(BaseMessage): pass
class HumanMessage(BaseMessage): pass


class AIMessage(BaseMessage):
    def __init__(
        self,
        content: str = "",
        tool_calls: list[dict[str, Any]] | None = None,
        id: str | None = None,
        **kwargs: Any,
    ):
        super().__init__(content, id, **kwargs)
        self.tool_calls = tool_calls or []


class ToolMessage(BaseMessage):
    def __init__(
        self,
        content: str,
        tool_call_id: str,
        id: str | None = None,
        status: str = "success",
        **kwargs: Any,
    ):
        super().__init__(content, id, **kwargs)
        self.tool_call_id = tool_call_id
        self.status = status


# ==============================================================================
# C11: ReAct Agent Loop 主循环
# ==============================================================================

def run_react_agent_loop(
    llm: Callable[[list[BaseMessage]], AIMessage],
    tools: dict[str, Callable[..., Any]],
    messages: list[BaseMessage],
    max_iterations: int = 6,
) -> dict[str, Any]:
    # 考察点: ReAct 循环终止条件、并发工具执行、ToolMessage tool_call_id 配对、执行异常回封装
    # 手写量级: 30 行 / 6 分钟
    # 常见追问: 工具并发调用怎么做？tool_call_id 为什么必须配对？超限后如何降级？与 LangGraph 图的映射？

    trajectory = list(messages)
    iterations = 0

    while iterations < max_iterations:
        iterations += 1
        # 1. 调用模型获取当前步决策
        ai_msg = llm(trajectory)
        trajectory.append(ai_msg)

        # 2. 终止判定: 无工具调用即为最终回答
        if not ai_msg.tool_calls:
            return {
                "status": "success",
                "final_response": ai_msg.content,
                "iterations": iterations,
                "messages": trajectory,
            }

        # 3. 遍历并执行所有工具调用 (多工具调用支持)
        for call in ai_msg.tool_calls:
            call_id = call["id"]
            name = call["name"]
            args = call.get("args", {})

            if name not in tools:
                # 工具不存在: 将错误作为 ToolMessage 喂回模型供其纠错
                err_content = f"Error: 未知工具 {name}"
                trajectory.append(ToolMessage(content=err_content, tool_call_id=call_id, status="error"))
                continue

            try:
                # 执行工具调用
                tool_fn = tools[name]
                raw_result = tool_fn(**args)
                trajectory.append(ToolMessage(content=str(raw_result), tool_call_id=call_id, status="success"))
            except Exception as exc:
                # 异常安全兜底: 异常信息封装回模型，绝不中断 ReAct 主循环
                trajectory.append(ToolMessage(content=f"Error: {exc}", tool_call_id=call_id, status="error"))

    # 4. 达到最大迭代次数降级退出
    fallback_content = "已达到最大步数限制，未能完成任务，请缩小指令范围。"
    trajectory.append(AIMessage(content=fallback_content))
    return {
        "status": "max_iterations_reached",
        "final_response": fallback_content,
        "iterations": iterations,
        "messages": trajectory,
    }


# ==============================================================================
# C12: AG-UI 事件流处理与异常补发
# ==============================================================================

def process_agui_event_stream(
    raw_events: list[dict[str, Any]],
    middlewares: list[Callable[[dict[str, Any]], list[dict[str, Any]]]] | None = None,
) -> list[dict[str, Any]]:
    # 考察点: LangGraph 细粒度事件到 AG-UI 协议映射、中间件链式扩展、异常必须补发 RUN_FINISHED 闭环
    # 手写量级: 40 行 / 8 分钟
    # 常见追问: 为什么异常时必须发 RUN_FINISHED？中间件如何处理事件过滤与丰富？interrupt 事件如何向下透出？

    out_events: list[dict[str, Any]] = []
    run_started = False
    run_finished = False
    current_step: str | None = None

    try:
        for raw in raw_events:
            event_type = raw.get("type", "")
            mapped: list[dict[str, Any]] = []

            # 1. 核心事件映射矩阵
            if event_type == "run_start":
                run_started = True
                mapped.append({"type": "RUN_STARTED", "run_id": raw.get("run_id")})

            elif event_type == "on_chain_start":
                current_step = raw.get("node_name", "agent")
                mapped.append({"type": "STEP_STARTED", "step_name": current_step})

            elif event_type == "on_chain_end":
                mapped.append({"type": "STEP_FINISHED", "step_name": current_step or "agent"})
                current_step = None

            elif event_type == "on_chat_model_stream":
                if "delta_text" in raw:
                    mapped.append({"type": "TEXT_MESSAGE_CONTENT", "delta": raw["delta_text"]})
                elif "delta_tool" in raw:
                    mapped.append({"type": "TOOL_CALL_ARGS", "delta": raw["delta_tool"]})

            elif event_type == "on_tool_start":
                mapped.append({"type": "TOOL_CALL_START", "tool_name": raw.get("name"), "id": raw.get("id")})

            elif event_type == "on_tool_end":
                mapped.append({"type": "TOOL_CALL_RESULT", "output": raw.get("output"), "id": raw.get("id")})

            elif event_type == "on_custom_event":
                mapped.append({"type": "CUSTOM", "name": raw.get("name"), "value": raw.get("value")})

            elif event_type == "on_interrupt":
                # 中断透出契约: 发送 CUSTOM on_interrupt 并立即闭合本轮流，不挂死前端
                mapped.append({"type": "CUSTOM", "name": "on_interrupt", "value": raw.get("payload")})
                mapped.append({"type": "RUN_FINISHED", "run_id": raw.get("run_id")})
                run_finished = True

            elif event_type == "run_finish":
                mapped.append({"type": "RUN_FINISHED", "run_id": raw.get("run_id")})
                run_finished = True

            # 2. 中间件链 (Middleware Chain): 逐级过滤或改写事件
            current_batch = mapped
            if middlewares:
                for mw in middlewares:
                    next_batch = []
                    for ev in current_batch:
                        next_batch.extend(mw(ev))
                    current_batch = next_batch

            out_events.extend(current_batch)
            if run_finished:
                break

    except Exception as exc:
        # 3. 异常兜底流: 确保前端 SSE 连接确定性闭合，绝不悬挂
        if current_step:
            out_events.append({"type": "STEP_FINISHED", "step_name": current_step})
        out_events.append({"type": "RUN_ERROR", "message": str(exc)})
        if not run_finished:
            out_events.append({"type": "RUN_FINISHED", "run_id": "error_closed"})

    return out_events


# ==============================================================================
# C13: HITL interrupt / Command(resume) 最小骨架
# ==============================================================================

class MockCheckpointer:
    """模拟 LangGraph Checkpointer 持久化快照存储"""
    def __init__(self):
        self._storage: dict[str, dict[str, Any]] = {}

    def save(self, thread_id: str, state: dict[str, Any]) -> None:
        self._storage[thread_id] = copy.deepcopy(state)

    def load(self, thread_id: str) -> dict[str, Any] | None:
        state = self._storage.get(thread_id)
        return copy.deepcopy(state) if state else None


def generate_request_id(thread_id: str, run_id: str, tool_call_id: str) -> str:
    """生成确定性、防篡改的 Request ID (au_v1_{sha256[:16]})"""
    raw = f"{thread_id}:{run_id}:{tool_call_id}".encode("utf-8")
    return "au_v1_" + hashlib.sha256(raw).hexdigest()[:16]


def hitl_node(
    state: dict[str, Any],
    thread_id: str,
    run_id: str,
    tool_call_id: str,
    checkpointer: MockCheckpointer,
    resume_command: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # 考察点: 节点内 interrupt 挂起、Checkpointer 状态冻结、Command(resume) 恢复与恒定时间校验
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 为什么 checkpointer 是硬依赖？重放时如何避免再次触发中断？hmac.compare_digest 的安全意义？

    expected_req_id = generate_request_id(thread_id, run_id, tool_call_id)

    # 1. 首次进入: 无 resume_command，触发中断并持久化挂起
    if resume_command is None:
        suspend_payload = {
            "request_id": expected_req_id,
            "questions": state.get("questions", []),
            "prompt": "需要用户人工审批或澄清",
        }
        state["_pending_interrupt"] = suspend_payload
        # 冻结当前状态至 Checkpointer
        checkpointer.save(thread_id, state)
        # 抛出挂起标记 (LangGraph 原生通过 raise GraphInterrupt 实现)
        return {"__interrupt__": suspend_payload}

    # 2. 外部恢复: 收到 Command(resume=...)，执行恒定时间校验防时序攻击
    given_req_id = resume_command.get("request_id", "")
    if not hmac.compare_digest(given_req_id, expected_req_id):
        raise ValueError(f"Request ID 不匹配: 收到 {given_req_id}, 期望 {expected_req_id}")

    # 3. 校验通过，清理挂起标记，合入用户交互输入
    state.pop("_pending_interrupt", None)
    state["user_feedback"] = resume_command.get("user_feedback")
    checkpointer.save(thread_id, state)
    return state


# ==============================================================================
# C16: 上下文压缩触发与安全边界截断
# ==============================================================================

def estimate_tokens(messages: list[BaseMessage]) -> int:
    """字符粗略估算 Token: chars // 4 + 3 tokens 边界开销"""
    total = 0
    for m in messages:
        total += len(m.content) // 4 + 3
    return max(total, 1)


def truncate_and_summarize_context(
    messages: list[BaseMessage],
    max_tokens: int = 4000,
    usage_threshold: float = 0.7,
    preserve_ratio: float = 0.25,
    min_messages: int = 6,
) -> list[BaseMessage]:
    # 考察点: 70% 阈值防抖触发、保留末尾 25%、保护 ToolMessage 与发起 AIMessage 成对不被拆散
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 为什么不能直接按 Token 截断？孤立的 ToolMessage 会报什么错？底层原状态是否会被删除？

    total_tokens = estimate_tokens(messages)
    # 1. 触发门禁: 消息数达标且 Token 占比超过阈值 (70%)
    if len(messages) < min_messages or (total_tokens / max_tokens) < usage_threshold:
        return messages  # 未触达压缩门限，原样返回

    # 2. 确定初始截断点: 保留后 25% 消息
    preserve_count = max(1, int(len(messages) * preserve_ratio))
    cutoff_index = len(messages) - preserve_count

    # 3. 安全边界调整: 确保不将 AIMessage(tool_calls) 与 ToolMessage(tool_call_id) 切割在两侧
    # 若 cutoff_index 恰好落入 ToolMessage，必须向前回溯寻找其发起的源头 AIMessage
    while cutoff_index > 0 and isinstance(messages[cutoff_index], ToolMessage):
        cutoff_index -= 1
    # 若前移后恰好定位在对应的 AIMessage，将其一并归入保留侧或划出侧，保证成对完整
    if cutoff_index > 0 and isinstance(messages[cutoff_index], AIMessage) and messages[cutoff_index].tool_calls:
        # 该 AIMessage 和紧随其后的 ToolMessages 整体保留
        pass

    messages_to_summarize = messages[:cutoff_index]
    preserved_messages = messages[cutoff_index:]

    # 4. 生成只读投影摘要消息 (原 messages 列表在 Checkpoint 中保持 Append-Only，不被物理擦除)
    summary_text = (
        f"[系统上下文摘要: 已压缩前期 {len(messages_to_summarize)} 条对话。"
        f"关键事实: 用户任务已进入执行阶段，后续步骤请基于最新上下文推进。]"
    )
    summary_msg = HumanMessage(content=summary_text, id="msg_summary_projection")

    # 5. 拼装有效上下文载荷 (Effective Messages) 供当前轮模型推理
    return [summary_msg] + preserved_messages


# ==============================================================================
# 自测断言 (__main__)
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 04_agent_loop_agui_hitl.py 自测 ===")

    # 1. 测试 C11: ReAct Agent Loop
    # 模拟工具
    def mock_query_db(sql: str) -> str:
        return f"查询成功: 找到 1 条记录, sql={sql}"

    tools_map = {"query_db": mock_query_db}

    # 模拟两轮决策的 LLM: 第一轮调用 query_db，第二轮输出最终回答
    step = 0
    def mock_react_llm(history: list[BaseMessage]) -> AIMessage:
        global step
        step += 1
        if step == 1:
            return AIMessage(
                content="我需要先查询数据库。",
                tool_calls=[{"id": "call_001", "name": "query_db", "args": {"sql": "SELECT 1"}}],
            )
        else:
            return AIMessage(content="根据数据库查询，结果为 1。")

    react_res = run_react_agent_loop(
        llm=mock_react_llm,
        tools=tools_map,
        messages=[HumanMessage(content="帮我查一下数据")],
        max_iterations=4,
    )
    assert react_res["status"] == "success", f"ReAct 应执行成功，实际为 {react_res['status']}"
    assert react_res["iterations"] == 2
    assert "根据数据库查询" in react_res["final_response"]
    # 验证轨迹中存在正确的 ToolMessage 且 tool_call_id 配对
    tool_msgs = [m for m in react_res["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert tool_msgs[0].tool_call_id == "call_001"
    print("✓ C11 ReAct Agent Loop 测试通过")

    # 2. 测试 C12: AG-UI 事件流处理与异常补发
    sample_raw_events = [
        {"type": "run_start", "run_id": "r101"},
        {"type": "on_chain_start", "node_name": "agent"},
        {"type": "on_chat_model_stream", "delta_text": "你好"},
        {"type": "on_tool_start", "name": "search", "id": "t1"},
        {"type": "on_tool_end", "output": "ok", "id": "t1"},
        {"type": "on_chain_end"},
        {"type": "run_finish", "run_id": "r101"},
    ]
    processed = process_agui_event_stream(sample_raw_events)
    event_types = [e["type"] for e in processed]
    assert event_types == [
        "RUN_STARTED", "STEP_STARTED", "TEXT_MESSAGE_CONTENT",
        "TOOL_CALL_START", "TOOL_CALL_RESULT", "STEP_FINISHED", "RUN_FINISHED"
    ]

    # 测试异常抛出时补发 RUN_ERROR 与 RUN_FINISHED
    def crashing_middleware(ev: dict[str, Any]) -> list[dict[str, Any]]:
        if ev["type"] == "TEXT_MESSAGE_CONTENT":
            raise RuntimeError("流式传输中断异常")
        return [ev]

    error_stream = process_agui_event_stream(sample_raw_events, middlewares=[crashing_middleware])
    err_types = [e["type"] for e in error_stream]
    assert "RUN_ERROR" in err_types, "发生异常时必须发射 RUN_ERROR"
    assert err_types[-1] == "RUN_FINISHED", "末尾必须补发 RUN_FINISHED 闭合前端连接"
    print("✓ C12 AG-UI 事件流处理与异常补发测试通过")

    # 3. 测试 C13: HITL interrupt 与 Command(resume)
    checkpointer = MockCheckpointer()
    th_id = "thread_demo_01"
    init_state = {"questions": ["是否确认转账 100 元？"]}

    # 首次进入，挂起并保存
    suspend_res = hitl_node(
        state=init_state,
        thread_id=th_id,
        run_id="run_01",
        tool_call_id="call_ask_01",
        checkpointer=checkpointer,
        resume_command=None,
    )
    assert "__interrupt__" in suspend_res
    req_id = suspend_res["__interrupt__"]["request_id"]
    assert req_id.startswith("au_v1_")

    # 检查 Checkpointer 中已冻结状态
    saved_state = checkpointer.load(th_id)
    assert saved_state is not None
    assert "_pending_interrupt" in saved_state

    # 模拟使用错误 request_id 恢复 -> 抛出校验异常
    try:
        hitl_node(
            state=saved_state,
            thread_id=th_id,
            run_id="run_01",
            tool_call_id="call_ask_01",
            checkpointer=checkpointer,
            resume_command={"request_id": "wrong_req_id", "user_feedback": "同意"},
        )
        assert False, "非法 request_id 必须抛出异常"
    except ValueError:
        pass

    # 使用合法 request_id 恢复
    resumed_state = hitl_node(
        state=saved_state,
        thread_id=th_id,
        run_id="run_01",
        tool_call_id="call_ask_01",
        checkpointer=checkpointer,
        resume_command={"request_id": req_id, "user_feedback": "同意执行"},
    )
    assert resumed_state["user_feedback"] == "同意执行"
    assert "_pending_interrupt" not in resumed_state
    print("✓ C13 HITL interrupt 与 Command(resume) 测试通过")

    # 4. 测试 C16: 上下文压缩触发与安全截断边界
    # 构造历史：包含一段长文本 + AI 调用工具 + Tool 返回
    history = [
        HumanMessage(content="A" * 8000),  # 大文本撑爆 token
        AIMessage(content="正在分析中..."),
        HumanMessage(content="请继续"),
        AIMessage(
            content="调用工具",
            tool_calls=[{"id": "c1", "name": "calc", "args": {}}],
        ),
        ToolMessage(content="42", tool_call_id="c1"),
        HumanMessage(content="最终结论是什么？"),
    ]
    # 触发压缩 (len=6, token 很大)
    compacted = truncate_and_summarize_context(
        messages=history,
        max_tokens=2000,
        usage_threshold=0.7,
        preserve_ratio=0.3,
        min_messages=5,
    )
    # 压缩后首条必须为摘要消息
    assert isinstance(compacted[0], HumanMessage)
    assert "上下文摘要" in compacted[0].content
    # 安全边界检查: AIMessage(tool_calls) 与 ToolMessage 绝不能被割裂
    ai_calls = [i for i, m in enumerate(compacted) if isinstance(m, AIMessage) and m.tool_calls]
    tool_calls = [i for i, m in enumerate(compacted) if isinstance(m, ToolMessage)]
    if ai_calls or tool_calls:
        assert len(ai_calls) == len(tool_calls), "工具调用与响应消息必须成对保留，不得孤立"
        assert ai_calls[0] < tool_calls[0], "AIMessage 必须先于 ToolMessage"
    print("✓ C16 上下文压缩触发与安全边界截断测试通过")

    print("\n=== 04_agent_loop_agui_hitl.py 全部断言自测通过！===")
