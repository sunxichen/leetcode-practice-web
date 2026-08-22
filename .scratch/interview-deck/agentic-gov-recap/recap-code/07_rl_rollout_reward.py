"""07_rl_rollout_reward.py — Phase 6: RL 采样、自由 Rollout 仿真与 Reward v3 终态门控

【全链路位置】
本模块位于 agentic-gov 整体流水线强化学习阶段（Phase 6）的前半程。
在 Phase 3 完成 Agent SFT（Qwen3-8B / 4B）且 Phase 4 冻结 User Simulator（Qwen3-4B）后，
本阶段负责为基于 OpenPipe ART 框架的 GRPO 训练提供环境交互与奖励信号生成：
1. 【数据采样】：构建可学习性池（Learnability Pool v2），利用方差感知混合采样器（Variance-Aware Mixture Sampler）
   对处于 p≈0.5 黄金学习区的任务进行过采样，同时维护成对对比（Contrast Pair）原子性与 Canary 监控锚点；
2. 【环境仿真】：拉起独立的 Sim Server（vLLM 用户模拟器子进程），与 Agent vLLM 推理实例协同进行多轮交互（Rollout）；
3. 【奖励评定】：执行 Reward v3 终态门控管线（Terminal-Gated Outcome），通过状态比对 R_state 与终态动作精确匹配 R_terminal
   的乘积门控，彻底解决 No-Write 任务上的 Terminal Tie 缺陷，配合 Per-Message NLI 告知与效率惩罚输出标量奖励。
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import random
import subprocess
import time
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol, cast

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against phase6/art/ & src/agentic_gov/...)
# ---------------------------------------------------------------------------
from agentic_gov.reward.complete import compare_final_state_subset, compute_r_complete, strip_runtime_policy_table
from agentic_gov.reward.config import default_reward_config, frozen_v2_bundle_sha256
from agentic_gov.reward.disclosure import compute_r_disclosure
from agentic_gov.reward.efficiency import compute_efficiency
from agentic_gov.reward.escalate import compute_r_escalate
from agentic_gov.reward.hard_violation import compute_hard_violation
from agentic_gov.reward.schemas import (
    CompleteRewardResult,
    DisclosureRewardResult,
    EfficiencyRewardResult,
    EscalateRewardResult,
    HardViolationDetail,
    RewardBreakdown,
    RewardConfig,
    RewardV3ConfigBinding,
    TerminalRewardResult,
    TerminalTelemetrySummary,
)
from agentic_gov.reward.terminal import compute_r_terminal, compute_r_terminal_from_episode
from agentic_gov.reward.v3_config_binding import (
    V3_REWARD_FORMULA_VERSION,
    resolve_v3_frozen_nli_bundle,
    validate_v3_config_binding,
)
from agentic_gov.runtime.episode_runner import (
    EpisodeResult,
    ReplayDiverged,
    SimulatorBackend,
    TerminatedBy,
    is_hard_sandbox_result,
)
from agentic_gov.runtime.reward_glue import attach_reward_breakdown
from agentic_gov.sandbox.engine import Sandbox
from agentic_gov.sandbox.errors import UnknownToolError
from agentic_gov.schemas.sandbox import DbSnapshot, SandboxError, SandboxResult
from agentic_gov.schemas.task import CanonicalTask
from agentic_gov.schemas.trajectory import AssistantAction, AssistantTurn, ToolTurn, Trajectory, UserTurn
from agentic_gov.verifier.format import ParseError, parse_analysis_action
from agentic_gov.verifier.hybrid import AdjudicatorClient
from agentic_gov.verifier.nli import NliChecker, ThresholdBundle


# ===========================================================================
# 1. Sim Server 子进程管理（解耦 Simulator 推理与 Trainer 显存）
# ===========================================================================

@dataclass
class SimServerHandle:
    """Simulator vLLM 服务端句柄，管理独立进程生命周期。"""
    base_url: str
    served_model_name: str
    process: subprocess.Popen[Any]
    log_path: str

    def terminate(self, timeout: float = 20.0) -> None:
        """优雅退出 Simulator 服务进程，超时则发送 SIGKILL 强杀进程组。"""
        if self.process.poll() is not None:
            return
        try:
            os.killpg(os.getpgid(self.process.pid), 15)  # SIGTERM
            self.process.wait(timeout=timeout)
        except Exception:
            try:
                os.killpg(os.getpgid(self.process.pid), 9)  # SIGKILL
            except ProcessLookupError:
                pass


def start_sim_server(
    *,
    vllm_python: str,
    model: str,
    log_path: str,
    lora_path: str | None = None,
    lora_name: str = "simulator_sft",
    tokenizer: str | None = None,
    host: str = "127.0.0.1",
    port: int | None = None,
    gpu_id: str = "0",
    gpu_util: float = 0.25,
    max_model_len: int = 4096,
    max_lora_rank: int = 64,
    dtype: str = "bfloat16",
    ready_timeout: float = 600.0,
) -> SimServerHandle:
    """在独立子进程与独立 Python 环境中启动 User Simulator 的 vLLM OpenAI API 服务。
    
    【执行逻辑与拓扑编排】
    1. 为什么独立：ART 训练进程与 Simulator 依赖隔离；Simulator 与 Trainer 共用 GPU0，
       通过限制 `gpu_util=0.25` 为 Trainer 预留显存，避免 vLLM 启动时抢占整卡。
    2. 动态找寻空闲端口并拼接 `vllm.entrypoints.openai.api_server` 命令；
    3. 轮询 `/health` 探针直至服务 Ready，返回 SimServerHandle。
    """
    ...


# ===========================================================================
# 2. RL 任务场景定义与方差感知混合采样器（Variance-Aware Sampler）
# ===========================================================================

@dataclass(frozen=True, slots=True)
class RLTaskScenario:
    """GRPO 训练单步输入场景，封装任务定义与边界元数据。"""
    task: dict[str, Any]
    sample_id: str
    task_id: str
    task_type: str
    source_file: str | None = None
    split: str | None = None
    persona_subgroup: str | None = None
    expected_terminal_action: str | None = None
    flow_variant: str | None = None
    pair_id: str | None = None
    pair_side: str | None = None
    naturalization_of: str | None = None
    decision_concept_primary: str | None = None


def sampling_unit_key(scenario: RLTaskScenario) -> str:
    """返回对比对（Contrast Pair）的原子单元键，确保 A/B 样本在采样时不被撕裂。"""
    if scenario.pair_id:
        if scenario.pair_id.endswith("__nat"):
            canonical = scenario.naturalization_of or scenario.pair_id.removesuffix("__nat")
            return f"naturalized:{canonical}"
        return f"canonical:{scenario.pair_id}"
    return f"task:{scenario.task_id}"


@dataclass(frozen=True, slots=True)
class ScenarioSamplerConfig:
    """方差感知采样器配置。"""
    variance_aware: bool = False
    target_fraction: float = 0.375
    baseline_mode: str = "reduced_zero_signal"  # natural | reduced_zero_signal
    bucket_weights: dict[tuple[str, str], float] = field(default_factory=dict)
    baseline_excluded_buckets: frozenset[tuple[str, str]] = frozenset()
    boundary_canary_interval_steps: int = 4
    boundary_canary_buckets: tuple[tuple[str, str], ...] = ()
    seed: int = 20260609
    learnability_pool_enabled: bool = False
    learnability_bucket_by_unit_key: dict[str, str] = field(default_factory=dict)
    learnable_fraction: float = 0.8
    easy_canary_fraction: float = 0.1
    curriculum_bridge_fraction: float = 0.1


def select_train_step_scenarios(
    scenarios: Sequence[RLTaskScenario],
    *,
    step: int,
    groups_per_step: int,
    config: ScenarioSamplerConfig,
) -> list[RLTaskScenario]:
    """为当前 GRPO 步选择训练任务组（Group）。
    
    【执行逻辑】
    1. 若未开启 variance_aware 且未开启 learnability_pool，回退至 legacy 循环轮询；
    2. 若开启 learnability_pool（80/10/10 模式）：
       - 80% 预算分配给 Learnable Core（如 loan/Finish 等 p≈0.5 高方差区）；
       - 10% 预算分配给 Easy Canary（防止饱和任务发生灾难性遗忘或策略漂移）；
       - 10% 预算分配给 Curriculum Bridge（桥接困难任务）；
    3. 若开启 variance_aware 混合采样：
       - 根据 `bucket_weights`（如 loan/Finish=0.74, purchase/Finish=0.26）过采样黄金学习区；
       - 在 `baseline_mode="reduced_zero_signal"` 下剔除已知 100% 饱和的零方差桶；
       - 周期性插入 Boundary Canary 锚点任务；
    4. 严格遵守 Pair-Atomicity：同一对比对单元要么整体入选，要么整体放弃。
    """
    if not config.variance_aware and not config.learnability_pool_enabled:
        return natural_cyclic_select(scenarios, step=step, groups_per_step=groups_per_step)

    units = _group_by_sampling_units(scenarios)
    rng = random.Random(config.seed + step)
    selected_units: list[list[RLTaskScenario]] = []
    
    # 按照配置执行加权采样与周期 Canary 填充 (省略具体循环骨架)
    ...
    return [s for unit in selected_units for s in unit][:groups_per_step]


def natural_cyclic_select(
    scenarios: Sequence[RLTaskScenario],
    *,
    step: int,
    groups_per_step: int,
) -> list[RLTaskScenario]:
    """基础顺序循环轮询选择器。"""
    if not scenarios or groups_per_step <= 0:
        return []
    start = (step * groups_per_step) % len(scenarios)
    return [scenarios[(start + idx) % len(scenarios)] for idx in range(groups_per_step)]


def _group_by_sampling_units(scenarios: Sequence[RLTaskScenario]) -> list[list[RLTaskScenario]]:
    buckets: dict[str, list[RLTaskScenario]] = defaultdict(list)
    for s in scenarios:
        buckets[sampling_unit_key(s)].append(s)
    return list(buckets.values())


# ===========================================================================
# 3. 自由 Rollout 仿真执行器（Agent 与 Simulator 多轮交互）
# ===========================================================================

@dataclass(slots=True)
class RolloutConfig:
    max_turns: int = 15
    max_completion_tokens: int = 1024
    temperature: float = 1.0
    top_p: float = 0.95
    logprobs: bool = True
    agent_request_limiter: asyncio.Semaphore | None = None
    reward_limiter: asyncio.Semaphore | None = None


@dataclass(slots=True)
class RewardClients:
    nli_checker: NliChecker
    adjudicator: AdjudicatorClient | None = None
    nli_bundle: ThresholdBundle | None = None
    reward_config: RewardConfig | None = None
    v3_config_binding: RewardV3ConfigBinding | None = None
    expected_v3_config_binding_id: str | None = None


@dataclass(slots=True)
class RolloutArtifacts:
    """Rollout 产出的完整上下文与轨迹制品。"""
    episode_result: EpisodeResult
    task: CanonicalTask
    messages_and_choices: list[Any] = field(default_factory=list)


async def rollout_spec(
    model: Any,
    scenario: RLTaskScenario | dict[str, Any],
    *,
    simulator: SimulatorBackend,
    reward_clients: RewardClients,
    config: RolloutConfig | None = None,
) -> RolloutArtifacts:
    """执行单条多轮交互 Rollout，协调 Agent 生成、沙箱工具执行与用户模拟器响应。
    
    【执行逻辑】
    1. 初始化沙箱：加载任务对应的 CanonicalTask 与初始内存数据库快照；
    2. 首轮输入：从 task.opening_message 获取群众初始诉求（不依赖 Simulator 首轮生成，消除播种偏差）；
    3. 多轮循环（最多 max_turns 轮）：
       a. Agent 生成：调用 model.openai_client() 生成带 logprobs 的 Assistant 回复；
       b. 格式解析：调用 parse_analysis_action 解析 <analysis>/<action> Envelope；
          若抛出 ParseError（如缺失 action 标签或发明非法动作），标记 terminated_by="hard_violation"、
          failure_class="format_failure"，立即终止（Hard-Zero 策略，不予重采）；
       c. 终态判定：若动作类型为 Finish / Escalate / FinishWithRefusal，记录 terminated_by 并跳出循环；
       d. 工具执行：若为 Call_API，在沙箱中执行。若遭遇 UNKNOWN_TOOL 或 TOOL_NOT_ALLOWED 等安全红线，
          判定为 hard_violation 终止；若为参数缺失等可恢复错误，将 observation 回传 Agent 允许自愈；
       e. 群众交互：若为 Ask_User，调用 SimulatorBackend.respond() 获取仿真用户输入；
    4. 奖励计算：调用 attach_reward_breakdown_async 计算完整的 Reward v3 Breakdown。
    """
    cfg = config or RolloutConfig()
    task_payload = scenario.task if isinstance(scenario, RLTaskScenario) else scenario
    task = CanonicalTask.model_validate(task_payload)
    sandbox = Sandbox(init_state=task.db_init_state, task_type=task.task_type)

    turns: list[UserTurn | AssistantTurn | ToolTurn] = []
    messages_and_choices: list[Any] = []
    history: list[dict[str, str]] = []
    turn_index = 0

    # 1. 注入初始开场白
    first_user = task.opening_message or ""
    turns.append(UserTurn(turn_index=turn_index, content=first_user))
    history.append({"role": "user", "content": first_user})
    turn_index += 1

    terminated_by: TerminatedBy = "max_turns"
    metrics: dict[str, Any] = {}

    # 2. 多轮仿真交互循环
    for _ in range(cfg.max_turns):
        # 异步调用 Agent vLLM 推理服务
        client = model.openai_client()
        completion = await client.chat.completions.create(
            model=model.get_inference_name(),
            messages=history,
            max_completion_tokens=cfg.max_completion_tokens,
            temperature=cfg.temperature,
            top_p=cfg.top_p,
            logprobs=cfg.logprobs,
        )
        choice = completion.choices[0]
        content = choice.message.content or ""
        messages_and_choices.append(choice)

        # 解析 XML Envelope
        try:
            analysis, action = parse_analysis_action(content)
        except (ParseError, ValueError) as exc:
            # 决策插叙⑥：格式失败 Hard-Zero 即时终止
            terminated_by = "hard_violation"
            metrics = {
                "hard_violation_flag": True,
                "failure_class": "format_failure",
                "error": str(exc),
                "raw_output": content,
            }
            break

        assistant_turn = AssistantTurn(
            turn_index=turn_index,
            content=content,
            analysis=analysis,
            action=action,
        )
        turns.append(assistant_turn)
        history.append({"role": "assistant", "content": content})
        turn_index += 1

        # 终态动作
        if action.action_type in {"Finish", "Escalate", "FinishWithRefusal"}:
            terminated_by = cast(TerminatedBy, action.action_type)
            metrics = {"turn_count": len(turns)}
            break

        # 工具调用
        if action.action_type == "Call_API":
            tool_name = action.tool_name or ""
            tool_args = action.tool_args or {}
            try:
                result = sandbox.execute(tool_name, tool_args)
            except UnknownToolError as exc:
                terminated_by = "hard_violation"
                metrics = {"hard_violation_flag": True, "failure_class": "unknown_tool", "error": str(exc)}
                break

            tool_turn = ToolTurn(
                turn_index=turn_index,
                tool_name=tool_name,
                request_args=tool_args,
                status=result.status,
                response=result.data,
                error_code=result.error_code,
                error_detail=result.error_detail,
            )
            turns.append(tool_turn)
            history.append({"role": "observation", "content": json.dumps(result.data, ensure_ascii=False)})
            turn_index += 1

            if is_hard_sandbox_result(result):
                terminated_by = "hard_violation"
                metrics = {"hard_violation_flag": True, "failure_class": result.error_code.value}
                break
            continue

        # 追问用户
        if action.action_type == "Ask_User":
            user_text = await simulator.respond(task, history)
            turns.append(UserTurn(turn_index=turn_index, content=user_text))
            history.append({"role": "user", "content": user_text})
            turn_index += 1
            continue

        terminated_by = "hard_violation"
        metrics = {"hard_violation_flag": True, "failure_class": "assistant_action_missing"}
        break

    trajectory = Trajectory(
        trajectory_id=f"rl_rollout_{task.task_id}",
        task_id=task.task_id,
        source="rl_rollout",
        turns=turns,
        actual_final_state=sandbox.export_state(),
    )
    episode_result = EpisodeResult(
        trajectory=trajectory,
        actual_final_state=sandbox.export_state(),
        terminated_by=terminated_by,
        metrics=metrics,
    )

    # 3. 挂载 Reward 判定
    await _attach_reward_breakdown_async(
        episode_result,
        task,
        reward_clients=reward_clients,
        reward_limiter=cfg.reward_limiter,
    )
    return RolloutArtifacts(episode_result=episode_result, task=task, messages_and_choices=messages_and_choices)


async def _attach_reward_breakdown_async(
    episode_result: EpisodeResult,
    task: CanonicalTask,
    *,
    reward_clients: RewardClients,
    reward_limiter: asyncio.Semaphore | None,
) -> None:
    """在后台线程池中异步执行可能带有阻塞式 NLI/Adjudicator 计算的 Reward 流程。"""
    async def _run() -> None:
        await asyncio.to_thread(
            attach_reward_breakdown,
            episode_result,
            task,
            nli_checker=reward_clients.nli_checker,
            adjudicator=reward_clients.adjudicator,
            nli_bundle=reward_clients.nli_bundle,
            config=reward_clients.reward_config,
            v3_config_binding=reward_clients.v3_config_binding,
            expected_v3_config_binding_id=reward_clients.expected_v3_config_binding_id,
        )

    if reward_limiter is None:
        await _run()
    else:
        async with reward_limiter:
            await _run()


# ===========================================================================
# 4. 全量 Reward 计算管线（Reward v3: Terminal-Gated Outcome）
# ===========================================================================

def compute_reward(
    episode_result: EpisodeResult,
    task: CanonicalTask,
    *,
    config: RewardConfig | None = None,
    nli_checker: NliChecker,
    adjudicator: AdjudicatorClient | None = None,
    nli_bundle: ThresholdBundle | None = None,
    v3_config_binding: RewardV3ConfigBinding | None = None,
    expected_v3_config_binding_id: str | None = None,
) -> RewardBreakdown:
    """Phase 5/6 全量奖励聚合函数。
    
    【执行逻辑】
    1. 校验配置绑定：若为 Reward v3（phase6_reward_v3_terminal_gated_outcome），
       执行 validate_v3_config_binding 校验配置 SHA-256 哈希，防止配置静默漂移；
    2. 计算子项得分：
       - compute_hard_violation: 是否触碰安全红线或格式解析失败（硬零门禁）；
       - compute_r_complete: 状态机比对（R_state），对比实际最终 DB 快照与 Golden State；
       - compute_r_disclosure: 基于 Per-Message NLI 与 LLM Adjudicator 判定告知项是否达标；
       - compute_r_terminal_from_episode: 校验实际终态动作与 Golden 期望终态动作是否精确匹配（R_terminal）；
       - compute_efficiency: 计算轮数超限惩罚 P_turns 与调用失败惩罚 P_failed_calls；
    3. 终态门控（Terminal-Gated Outcome，决策插叙⑦）：
       - 核心完成度: R_complete = R_state * R_terminal
       - 彻底解决 No-Write 任务上错误 Finish 与正确拒绝/升级同分（Terminal Tie）的致命缺陷；
    4. 总分合成：
       - if hard_violation -> R_total = 0.0
       - else -> R_total = 0.65 * R_complete + 0.35 * R_disclosure - 0.10 * P_turns - 0.10 * P_failed_calls
    5. Strict Success 严格判定：
       - success_strict = (R_state == 1) & (R_terminal == 1) & (R_disclosure == 1) & (!hard_violation) & (!format_failure)
    """
    cfg = config or default_reward_config()
    is_v3 = cfg.reward_formula_version == V3_REWARD_FORMULA_VERSION
    if is_v3:
        validate_v3_config_binding(cfg, v3_config_binding, expected_binding_id=expected_v3_config_binding_id)
        v3_nli_bundle = resolve_v3_frozen_nli_bundle(cfg, nli_bundle)
    else:
        v3_nli_bundle = None

    # 各维度判定
    hard: HardViolationDetail = compute_hard_violation(episode_result)
    complete: CompleteRewardResult = compute_r_complete(task, episode_result.actual_final_state)
    disclosure: DisclosureRewardResult = compute_r_disclosure(
        task,
        episode_result.trajectory,
        nli_checker,
        adjudicator=adjudicator,
        bundle=v3_nli_bundle if is_v3 else nli_bundle,
    )
    efficiency: EfficiencyRewardResult = compute_efficiency(episode_result, task, cfg)
    escalate: EscalateRewardResult = compute_r_escalate(task, episode_result.terminated_by)

    # 终态动作匹配（Reward v3 核心）
    terminal: TerminalRewardResult | None = (
        compute_r_terminal_from_episode(task.metadata.expected_terminal_action, episode_result)
        if is_v3
        else None
    )
    r_complete = complete.score * terminal.score if terminal is not None else complete.score

    # 计算总奖励 R_total
    if hard.hard_violation:
        r_total = 0.0
    elif is_v3:
        r_total = _compute_v3_total(r_complete, disclosure, efficiency)
    elif cfg.reward_formula_version == "phase6_reward_v2_quality_ceiling_1":
        r_total = _compute_v2_quality_ceiling_1_total(cfg, task, complete, disclosure, escalate, efficiency)
    else:  # phase5_reward_v1
        r_total = _compute_v1_total(cfg, complete, disclosure, escalate, efficiency)

    # Strict Success 判定
    if terminal is None:
        success_strict = bool(complete.score == 1.0 and disclosure.score == 1.0 and not hard.hard_violation)
    else:
        success_strict = bool(
            complete.score == 1.0
            and terminal.score == 1.0
            and r_complete == 1.0
            and disclosure.score == 1.0
            and not hard.hard_violation
            and not hard.format_failure
        )

    return RewardBreakdown(
        reward_version=cfg.reward_formula_version,
        r_total=r_total,
        success_strict=success_strict,
        r_complete=r_complete,
        r_disclosure=disclosure.score,
        r_escalate=escalate.score,
        p_turns=efficiency.p_turns,
        p_failed_calls=efficiency.p_failed_calls,
        hard_violation=hard.hard_violation,
        complete=complete,
        disclosure=disclosure,
        escalate=escalate,
        efficiency=efficiency,
        hard_violation_detail=hard,
        weights=_effective_weights(cfg, task),
        diagnostics={"task_type": task.task_type, "actual_terminal": episode_result.terminated_by},
    )


def _compute_v3_total(
    r_complete: float,
    disclosure: DisclosureRewardResult,
    efficiency: EfficiencyRewardResult,
) -> float:
    """Reward v3 统一定义公式：对称门控、无单独 Escalate 补丁项。"""
    return (
        0.65 * r_complete
        + 0.35 * disclosure.score
        - 0.10 * efficiency.p_turns
        - 0.10 * efficiency.p_failed_calls
    )


def _compute_v2_quality_ceiling_1_total(
    cfg: RewardConfig,
    task: CanonicalTask,
    complete: CompleteRewardResult,
    disclosure: DisclosureRewardResult,
    escalate: EscalateRewardResult,
    efficiency: EfficiencyRewardResult,
) -> float:
    """Reward v2 公式：将质量正向项 ceiling 归一至 1.0，但对 Escalate 采用非对称权重。"""
    if task.metadata.expected_terminal_action == "Escalate":
        return (
            0.60 * complete.score
            + 0.30 * disclosure.score
            + 0.10 * escalate.score
            + cfg.weight_turns * efficiency.p_turns
            + cfg.weight_failed_calls * efficiency.p_failed_calls
        )
    return (
        0.65 * complete.score
        + 0.35 * disclosure.score
        + cfg.weight_turns * efficiency.p_turns
        + cfg.weight_failed_calls * efficiency.p_failed_calls
    )


def _compute_v1_total(
    cfg: RewardConfig,
    complete: CompleteRewardResult,
    disclosure: DisclosureRewardResult,
    escalate: EscalateRewardResult,
    efficiency: EfficiencyRewardResult,
) -> float:
    """Reward v1 遗留公式：质量项上限压缩在 0.75-0.80。"""
    return (
        cfg.weight_complete * complete.score
        + cfg.weight_disclosure * disclosure.score
        + cfg.weight_escalate * escalate.score
        + cfg.weight_turns * efficiency.p_turns
        + cfg.weight_failed_calls * efficiency.p_failed_calls
    )


def _effective_weights(cfg: RewardConfig, task: CanonicalTask) -> dict[str, float]:
    if cfg.reward_formula_version == V3_REWARD_FORMULA_VERSION:
        return {
            "R_complete": 0.65,
            "R_disclosure": 0.35,
            "R_escalate": 0.0,
            "P_turns": -0.10,
            "P_failed_calls": -0.10,
        }
    return {"R_complete": 0.65, "R_disclosure": 0.35, "R_escalate": 0.0}
