"""03_sft_synthesis.py — Phase 2: SFT 数据合成、双角色编排与守卫机制（SFT Trajectory Synthesis & Orchestration）

【全链路位置】
本模块位于 agentic-gov 全链路数据生产的核心枢纽（Phase 2 前半程）。
在 Phase 1 完成 CanonicalTask 任务设计与 Sandbox 沙箱引擎后，本模块负责驱动 Agent Teacher 与 User Teacher
双角色大模型进行多轮对话协同合成。
它通过强约束的 `<analysis>/<action>` Envelope 契约输出显式思维链（CoT）与业务动作，并依托 Orchestrator 实现
单轮实时修复（Current-Turn Repair）、格式反馈重试（Parse Feedback）以及语义状态机守卫（Semantic Guard）。
合成出的原始轨迹将直接输入后续的 Verifier Funnel 质量漏斗（Phase 2 后半程）与 SFT 训练集构建（Phase 3/4）。
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against src/agentic_gov/...)
# ---------------------------------------------------------------------------
from agentic_gov.schemas.task import CanonicalTask
from agentic_gov.schemas.api_spec import ApiSpec
from agentic_gov.schemas.policy import PolicyCard
from agentic_gov.schemas.sandbox import SandboxResult
from agentic_gov.schemas.trajectory import (
    AssistantAction,
    AssistantTurn,
    SynthesisMetadata,
    ToolTurn,
    Trajectory,
    Turn,
    UserTurn,
)
from agentic_gov.sandbox.engine import Sandbox
from agentic_gov.synthesis.errors import (
    ParseError,
    PolicyMismatchError,
    SynthesisMode,
    TeacherClientError,
)
from agentic_gov.synthesis.llm_client import (
    AbstractTeacher,
    StubTeacher,
    TeacherCall,
    TeacherResponse,
    call_with_retry,
)
from agentic_gov.verifier.format import (
    FORMAT_PARSER_VERSION,
    parse_analysis_action,
    is_action_only,
)
from agentic_gov.synthesis.prompt_renderer import (
    AGENT_TEMPLATE_VERSION,
    USER_TEMPLATE_VERSION,
    render_agent_prompt,
    render_user_prompt,
    _serialize_turns,
    _serialize_turns_for_user_view,
    _user_visible_assistant_text,
)

# ---------------------------------------------------------------------------
# 常量与守卫定义
# ---------------------------------------------------------------------------
DEFAULT_MAX_TURNS = 30
DEFAULT_PARSE_RETRIES = 3            # 全任务级别的最大重试次数（需重建沙箱）
DEFAULT_TURN_PARSE_RETRIES = 2       # 当前轮单轮格式重试预算（不废弃前序轮次）
DEFAULT_SEMANTIC_RETRIES = 2         # 语义违规拦截后的单轮重试预算

# 严格受控的写操作工具集：一旦成功执行，禁止在同任务中重复调用（防重复提取/重复还款）
_WRITE_TOOLS = frozenset(
    {
        "submit_rent_withdrawal",
        "submit_purchase_withdrawal",
        "submit_prepayment_request",
    }
)

# 敏感身份索要关键词：用于提交成功后的状态回退防护（防止办结后再次索要身份证）
_IDENTITY_KEYWORDS = frozenset({"身份证", "证件号", "身份", "id_number", "证件号码", "身份号"})


# ---------------------------------------------------------------------------
# 数据结构与配置
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SynthesisConfig:
    """轨迹合成全局配置，包含模板版本与各级重试预算。"""
    max_turns: int = DEFAULT_MAX_TURNS
    parse_max_retries: int = DEFAULT_PARSE_RETRIES
    turn_parse_max_retries: int = DEFAULT_TURN_PARSE_RETRIES
    semantic_max_retries: int = DEFAULT_SEMANTIC_RETRIES
    api_max_retries: int = 3
    agent_max_tokens: int = 1600
    user_max_tokens: int = 300
    agent_thinking_enabled: bool = False
    user_thinking_enabled: bool = False
    concurrency: int = 8
    agent_template_version: str = AGENT_TEMPLATE_VERSION
    user_template_version: str = USER_TEMPLATE_VERSION
    agent_system_prompt: str = "你是一位政务办事助手。严格按照 prompt 中的 <analysis>/<action> 格式输出。"
    user_system_prompt: str = "你在扮演真实办事群众。直接输出一句话，不要解释、不要标记。"
    sandbox_version: str | None = None
    mode: SynthesisMode = SynthesisMode.LLM_REQUIRED

    def config_hash(self) -> str:
        """生成配置的确定性哈希，作为 Compound Checkpoint Key 的一部分。"""
        payload = json.dumps(
            {
                "max_turns": self.max_turns,
                "agent_template_version": self.agent_template_version,
                "user_template_version": self.user_template_version,
                "mode": self.mode.value,
            },
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:16]


@dataclass
class SandboxBuildResult:
    """沙箱工厂构建产物，包含沙箱实例、可见 API 规范与政务政策卡。"""
    sandbox: Sandbox
    api_specs: dict[str, ApiSpec]
    policy_card: PolicyCard


@dataclass
class SynthesisOutcome:
    """单任务合成结果信封。"""
    task_id: str
    status: str  # "ok" | "overlong" | "parse_failed" | "api_failed" | "policy_mismatch" | "semantic_failed"
    trajectory: Trajectory | None = None
    error: str | None = None
    parse_retry_count: int = 0
    api_retry_count: int = 0
    error_category: str | None = None
    retryable: bool = False
    task_type: str | None = None


@dataclass
class _AttemptMeta:
    """单次尝试内部的可变计数器，跟踪修复与重试触发指标。"""
    turn_repair_attempt_count: int = 0
    turn_repair_success_count: int = 0
    turn_retry_count: int = 0
    semantic_retry_count: int = 0


# ---------------------------------------------------------------------------
# 核心解析与辅助函数
# ---------------------------------------------------------------------------
def _freeze_args(args: dict[str, Any] | None) -> frozenset[tuple[str, Any]]:
    """将工具调用参数转换为不可变 frozenset，用于写入幂等性检测。"""
    if args is None:
        return frozenset()
    return frozenset(sorted(args.items()))


def _is_identity_request(body: str) -> bool:
    """启发式检测：判定 Ask_User 文本是否包含索要身份证号等敏感信息。"""
    lower = body.lower()
    return any(kw in lower for kw in _IDENTITY_KEYWORDS)


# ---------------------------------------------------------------------------
# 单次尝试执行流（包含当前轮修复与语义守卫）
# ---------------------------------------------------------------------------
def _run_one_attempt(
    *,
    task: CanonicalTask,
    sandbox: Sandbox,
    api_specs: dict[str, ApiSpec],
    agent_teacher: AbstractTeacher,
    user_teacher: AbstractTeacher,
    config: SynthesisConfig,
    synthesis_config_hash: str | None = None,
    sampling_plan_hash: str | None = None,
    checkpoint_key: str | None = None,
    parse_feedback: str | None = None,
    attempt_meta: _AttemptMeta | None = None,
) -> tuple[Trajectory | None, str, int]:
    """执行单次端到端多轮合成交互。
    
    【核心执行逻辑】：
    1. 初始化多轮交互历史，首轮注入由 TaskFactory 构造的真实办事用户开场白（Opening Turn）。
    2. 进入多轮循环（最大 max_turns 轮）：
       a. 【当前轮解析与修复子循环（Turn-Level Loop）】：
          - 渲染 Agent Prompt（带政策卡、工具定义、历史交互与可能的 parse_feedback）；
          - 调用 Agent Teacher LLM 生成响应；
          - 调用 parse_analysis_action 进行严格 XML Envelope 解析；
          - [修复分支 A - Action-Only 补全]：若模型漏写 <analysis> 但输出了合法的 <action>，
            触发轻量级修复调用要求补全思维链，并比对补全后的 Action 保持字节级一致；
          - [修复分支 B - Parse Feedback 重试]：若格式解析失败（如漏写 </action> 闭合标签），
            在当前轮注入结构化错误反馈并重试生成，避免废弃前序轮次上下文；
       b. 【实时语义状态机守卫（Semantic Guards）】：
          - [重复写操作守卫]：拦截对 submit_* 等写库工具的重复调用；
          - [提交后状态回退守卫]：若已成功提交办结，拦截再次向用户索要身份证等反常动作；
       c. 【动作分发与环境推进】：
          - 若为 Call_API：在内存沙箱中执行工具调用，记录 ToolTurn 观测结果；
          - 若为 Ask_User：序列化用户可见视图（剥离 Agent 内部思考与 API 参数），调用 User Teacher 生成自然语言回复；
          - 若为终局动作（Finish / Escalate / FinishWithRefusal）：正常结束多轮循环；
    3. 导出沙箱最终数据库状态，封装不可变 Trajectory 实例与审计元数据。
    """
    meta = attempt_meta or _AttemptMeta()
    turns: list[Turn] = [UserTurn(turn_index=0, content=task.opening_message)]
    api_retries_total = 0
    status = "ok"
    parse_fb = parse_feedback

    # 状态机守卫跟踪变量
    successful_writes: set[tuple[str, frozenset[tuple[str, Any]]]] = set()
    has_successful_submit = False
    identity_verified = False

    for _ in range(config.max_turns):
        analysis_text: str | None = None
        action: AssistantAction | None = None
        raw_response: str = ""
        turn_succeeded = False

        # --- 当前轮解析与修复子循环 (Current-Turn Repair Loop) ---
        for turn_parse_idx in range(config.turn_parse_max_retries + 1):
            # 渲染 Agent 端 Prompt（注入 API 规范、业务规则与上轮错误反馈）
            agent_prompt = render_agent_prompt(
                task=task,
                api_specs=api_specs,
                turns=turns,
                template_version=config.agent_template_version,
                parse_feedback=parse_fb,
            )

            # 调用 Agent Teacher 模型
            response, api_retries = call_with_retry(
                agent_teacher,
                TeacherCall(
                    role="agent",
                    prompt=agent_prompt,
                    system_prompt=config.agent_system_prompt,
                    max_tokens=config.agent_max_tokens,
                    thinking_enabled=config.agent_thinking_enabled,
                ),
                max_retries=config.api_max_retries,
            )
            api_retries_total += api_retries
            raw_response = response.text

            try:
                # 严格解析 <analysis> 与 <action>
                analysis_text, action = parse_analysis_action(raw_response)
                parse_fb = None
                turn_succeeded = True
                break
            except ParseError as exc:
                # [修复策略 1: Action-Only Envelope 修复]
                # 现象：模型直接输出了 <action> 动作块，但漏掉了前置的 <analysis> 思维链
                ao_ok, ao_action = is_action_only(raw_response)
                if ao_ok and ao_action is not None:
                    meta.turn_repair_attempt_count += 1
                    repair_prompt = (
                        "你的上一次输出缺少 <analysis> 块。"
                        "请重新输出完整的 <analysis>/<action> 格式，"
                        "保持 <action> 完全不变，只需补充 <analysis>：\n\n"
                        f"{raw_response}"
                    )
                    try:
                        repair_resp, repair_retries = call_with_retry(
                            agent_teacher,
                            TeacherCall(
                                role="agent",
                                prompt=repair_prompt,
                                system_prompt=config.agent_system_prompt,
                                max_tokens=config.agent_max_tokens,
                            ),
                            max_retries=config.api_max_retries,
                        )
                        api_retries_total += repair_retries
                        repaired_analysis, repaired_action = parse_analysis_action(repair_resp.text)
                        
                        # 强校验：修复后的 action 必须与原 action 严格一致，防止模型趁机篡改业务动作
                        if (
                            repaired_action.action_type == ao_action.action_type
                            and repaired_action.tool_name == ao_action.tool_name
                            and repaired_action.tool_args == ao_action.tool_args
                            and repaired_action.body == ao_action.body
                        ):
                            meta.turn_repair_success_count += 1
                            analysis_text = repaired_analysis
                            action = repaired_action
                            raw_response = repair_resp.text
                            parse_fb = None
                            turn_succeeded = True
                            break
                    except (TeacherClientError, ParseError):
                        pass  # 修复失败则退化进入当前轮重试逻辑

                # [修复策略 2: Current-Turn Retry with Targeted Feedback]
                # 针对高频的“漏写 </action> 闭合标签”等问题注入精准中文提示
                if turn_parse_idx < config.turn_parse_max_retries:
                    meta.turn_retry_count += 1
                    if "missing <action" in str(exc) and "<action" in raw_response and "</action>" not in raw_response:
                        parse_fb = (
                            "parse_error: 你的上一轮输出包含 <action ...> 开标签，但缺少匹配的 </action> 闭合标签。"
                            "请重新生成完整 envelope，并确保 <action ...> body 后面紧跟 </action> 闭合。"
                        )
                    else:
                        parse_fb = f"parse_error: {exc}"
                    continue

                # 当前轮重试预算耗尽，向上抛出 ParseError
                raise

        if not turn_succeeded or analysis_text is None or action is None:
            raise ParseError("unexpected: no parsed result after turn-level retries")

        # --- 语义守卫 1: 重复写操作防护 (Duplicate Write Guard) ---
        if action.action_type == "Call_API" and action.tool_name in _WRITE_TOOLS:
            write_key = (action.tool_name, _freeze_args(action.tool_args))
            if write_key in successful_writes:
                meta.semantic_retry_count += 1
                if meta.semantic_retry_count <= config.semantic_max_retries:
                    parse_fb = f"该写入操作({action.tool_name})已成功执行，禁止重复提交，请 Finish 或解释结果。"
                    continue
                return None, "semantic_failed", api_retries_total

        # --- 语义守卫 2: 提交后状态回退防护 (Post-Submit Regression Guard) ---
        if (
            action.action_type == "Ask_User"
            and has_successful_submit
            and identity_verified
            and _is_identity_request(action.body)
        ):
            meta.semantic_retry_count += 1
            if meta.semantic_retry_count <= config.semantic_max_retries:
                parse_fb = "已成功提交申请后不得重新索取身份信息，请 Finish 或解释结果。"
                continue
            return None, "semantic_failed", api_retries_total

        # 构建并追加 Assistant Turn
        assistant_turn = AssistantTurn(
            turn_index=len(turns),
            content=raw_response,
            analysis=analysis_text,
            action=action,
        )
        turns.append(assistant_turn)
        parse_fb = None

        # 终局动作：结束对话
        if action.action_type in {"Finish", "Escalate", "FinishWithRefusal"}:
            break

        # API 调用动作：执行沙箱并追加 ToolTurn
        if action.action_type == "Call_API":
            tool_name = action.tool_name or ""
            tool_args = action.tool_args or {}
            sandbox_result = sandbox.execute(tool_name, tool_args)
            
            tool_turn = ToolTurn(
                turn_index=len(turns),
                tool_name=tool_name,
                request_args=tool_args,
                status=sandbox_result.status,
                response=sandbox_result.data,
                error_code=sandbox_result.error_code,
                error_detail=sandbox_result.error_detail,
            )
            turns.append(tool_turn)

            # 维护状态机指标
            if sandbox_result.status == "ok":
                if tool_name in _WRITE_TOOLS:
                    successful_writes.add((tool_name, _freeze_args(tool_args)))
                if tool_name.startswith("submit_"):
                    has_successful_submit = True
                if tool_name == "verify_identity":
                    identity_verified = True
            continue

        # 向用户提问动作：驱动 User Teacher 模拟用户回复
        if action.action_type == "Ask_User":
            # 序列化为 User 视角（严格剥离 Agent 思维链与 API 调用细节）
            user_prompt = render_user_prompt(
                task=task,
                turns=turns,
                template_version=config.user_template_version,
            )
            user_resp, user_api_retries = call_with_retry(
                user_teacher,
                TeacherCall(
                    role="user",
                    prompt=user_prompt,
                    system_prompt=config.user_system_prompt,
                    max_tokens=config.user_max_tokens,
                    thinking_enabled=config.user_thinking_enabled,
                ),
                max_retries=config.api_max_retries,
            )
            api_retries_total += user_api_retries
            turns.append(UserTurn(turn_index=len(turns), content=user_resp.text.strip()))
            continue
    else:
        status = "overlong"

    # 导出沙箱最终数据库状态
    actual_final_state = sandbox.export_state()
    trajectory = Trajectory(
        trajectory_id=f"traj_{task.task_id}",
        task_id=task.task_id,
        source="sft_gen",
        turns=turns,
        actual_final_state=actual_final_state,
        synthesis_metadata=SynthesisMetadata(
            teacher_agent_model=agent_teacher.model_id,
            teacher_user_model=user_teacher.model_id,
            teacher_agent_prompt_version=config.agent_template_version,
            teacher_user_prompt_version=config.user_template_version,
            synthesis_timestamp=_dt.datetime.now(tz=_dt.UTC).isoformat(),
            synthesis_config_hash=synthesis_config_hash,
            sampling_plan_hash=sampling_plan_hash,
            checkpoint_key=checkpoint_key,
            sandbox_version=config.sandbox_version,
            status=status,
            turn_count=len(turns),
            turn_repair_attempt_count=meta.turn_repair_attempt_count,
            turn_repair_success_count=meta.turn_repair_success_count,
            turn_retry_count=meta.turn_retry_count,
            semantic_retry_count=meta.semantic_retry_count,
        ),
    )
    return trajectory, status, api_retries_total


# ---------------------------------------------------------------------------
# 全任务顶层合成入口（外层任务级重试与沙箱重建）
# ---------------------------------------------------------------------------
def synthesize_trajectory(
    *,
    task: CanonicalTask,
    sandbox_builder: Callable[[], SandboxBuildResult],
    agent_teacher: AbstractTeacher,
    user_teacher: AbstractTeacher,
    config: SynthesisConfig | None = None,
    synthesis_config_hash: str | None = None,
    sampling_plan_hash: str | None = None,
    checkpoint_key: str | None = None,
) -> SynthesisOutcome:
    """单任务轨迹合成顶层入口。
    
    【核心设计考量】：
    若当前轮重试用尽导致整轮合成失败，外层循环提供任务级重试（parse_max_retries）。
    每次重试必须重新调用 sandbox_builder() 重建全新的沙箱环境，以彻底清除前序失败尝试中对数据库造成的中间写污染。
    """
    cfg = config or SynthesisConfig()
    api_retries_total = 0
    attempt_meta = _AttemptMeta()
    last_error: str | None = None

    for attempt in range(cfg.parse_max_retries + 1):
        # 重建沙箱与环境依赖
        build = sandbox_builder()
        
        # 政策卡版本强校验
        if (
            task.policy_id != build.policy_card.policy_id
            or task.policy_version != build.policy_card.policy_version
        ):
            return SynthesisOutcome(
                task_id=task.task_id,
                status="policy_mismatch",
                error=f"policy mismatch: task=({task.policy_id}, {task.policy_version}) vs sandbox=({build.policy_card.policy_id}, {build.policy_card.policy_version})",
                task_type=task.task_type,
            )

        try:
            trajectory, status, api_retries = _run_one_attempt(
                task=task,
                sandbox=build.sandbox,
                api_specs=build.api_specs,
                agent_teacher=agent_teacher,
                user_teacher=user_teacher,
                config=cfg,
                synthesis_config_hash=synthesis_config_hash,
                sampling_plan_hash=sampling_plan_hash,
                checkpoint_key=checkpoint_key,
                parse_feedback=last_error,
                attempt_meta=attempt_meta,
            )
            api_retries_total += api_retries

            if status == "semantic_failed":
                return SynthesisOutcome(
                    task_id=task.task_id,
                    status="semantic_failed",
                    error="semantic guard retries exhausted",
                    task_type=task.task_type,
                )

            return SynthesisOutcome(
                task_id=task.task_id,
                status=status,
                trajectory=trajectory,
                parse_retry_count=attempt,
                api_retry_count=api_retries_total,
                task_type=task.task_type,
            )
        except ParseError as exc:
            last_error = str(exc)
            if attempt == cfg.parse_max_retries:
                return SynthesisOutcome(
                    task_id=task.task_id,
                    status="parse_failed",
                    error=f"parse_failed after {attempt} retries: {exc}",
                    parse_retry_count=attempt,
                    api_retry_count=api_retries_total,
                    task_type=task.task_type,
                )
        except TeacherClientError as exc:
            return SynthesisOutcome(
                task_id=task.task_id,
                status="api_failed",
                error=f"teacher client error: {exc}",
                error_category=exc.category,
                retryable=exc.retryable,
                task_type=task.task_type,
            )

    return SynthesisOutcome(
        task_id=task.task_id,
        status="parse_failed",
        error=last_error,
        task_type=task.task_type,
    )
