"""08_art_grpo.py — Phase 6: 基于 OpenPipe ART 框架的 GRPO 强化学习训练与底层机制拆解

【全链路位置】
本模块位于 agentic-gov 整体流水线的终局核心（Phase 6）。
上游接收：
1. SFT 训练产出的 Agent 基座（Qwen3-4B LoRA r=128，或 8B 候选）；
2. 冻结的用户模拟器（Frozen User Simulator，Qwen3-4B LoRA r=64）；
3. 沙箱环境引擎（Domain-agnostic Sandbox Engine）与可学性任务池（Learnability Pool v2）；
4. Phase 5 锁定的同源判定器（Reward v3 终态门控、mDeBERTa Per-Message NLI 与 LLM Judge）。

本文件采用【双层立体结构】实现：
- 上半部分【项目侧编排】：`phase6/art/train_grpo.py` 的主训练循环——任务采样、多轮 Rollout、打分、零方差动态过滤与梯度更新；
- 下半部分【ART 框架黑盒拆解】：OpenPipe ART 底层内部机制——`gather_trajectory_groups` 异步调度、`PackedTensors` 拼包与注意力隔离、Token 级 CISPO 损失函数、组内优势归一化、相对 KL 散度调节与策略损失分母地板（Loss Norm Floor）。
"""

from __future__ import annotations

import asyncio
import math
import os
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

import torch
import torch.nn as nn

# ---------------------------------------------------------------------------
# 真实源码引用路径 (verified against phase6/art/ & ~/Projects/ART/src/art/...)
# ---------------------------------------------------------------------------
from agentic_gov.schemas.task import CanonicalTask
from phase6.art.learnability_pool_v2 import V2Route, derive_f2_gradient_surface
from phase6.art.loss_norm_floor import DEFAULT_LOSS_NORM_N, policy_denominator, stock_denominator
from phase6.art.rl_task_pool import RLTaskScenario
from phase6.art.rollout import RewardClients, RolloutConfig, rollout
from phase6.art.scenario_sampler import ScenarioSamplerConfig, select_train_step_scenarios
from phase6.art.tier0_stability import GradGuardConfig, LRScheduleConfig, TrainFuseConfig, TrainFuseState


# ===========================================================================
# 第一部分：项目侧编排（Project-Side GRPO Orchestration）
# ===========================================================================

@dataclass(frozen=True, slots=True)
class GRPOTrainConfig:
    """Phase 6 GRPO 训练超参数与策略配置。
    
    【核心字段设计】
    - group_size_k: 每组采样的轨迹条数 K=8（无 Critic 网络，依靠 K 条轨迹均值方差计算优势）；
    - dynamic_filter_epsilon: 零方差过滤门槛（过滤全对或全错的死区组）；
    - kl_penalty_coef: 相对 KL 散度惩罚系数（默认 0.04，防范 Reward Hacking）；
    - rollout_weights_mode: 设为 "merged" 时在后台将 LoRA 合并入基座，彻底绕过慢速 LoRA Kernel。
    """
    dataset_root: Path = Path("phase3/datasets/stream1_v1.0")
    train_steps: int = 15
    groups_per_step: int = 8
    group_size_k: int = 8
    learning_rate: float = 1e-5
    lr_schedule: str = "constant"
    dynamic_filter_epsilon: float = 1e-12
    kl_penalty_coef: float = 0.04
    rollout_weights_mode: str = "merged"  # "merged" 模式绕过 6x Triton LoRA 性能悬崖
    train_fuse: TrainFuseConfig = field(default_factory=TrainFuseConfig)
    grad_guard: GradGuardConfig = field(default_factory=GradGuardConfig)
    f2_desat_surface_enabled: bool = True
    learnability_pool_enabled: bool = True


def reward_variance(rewards: Sequence[float]) -> float:
    r"""计算单个 TrajectoryGroup 内 K 条轨迹奖励的总体方差（Population Variance）。
    
    【执行逻辑】
    Var(R) = (1/K) * \sum (R_i - \bar{R})^2
    若 rewards 为空或长度小于 2，方差恒为 0.0。
    """
    if len(rewards) < 2:
        return 0.0
    mean = sum(rewards) / len(rewards)
    return sum((r - mean) ** 2 for r in rewards) / len(rewards)


def should_keep_group(rewards: Sequence[float], *, epsilon: float = 1e-12) -> bool:
    r"""判定当前 TrajectoryGroup 是否具有非零方差（是否有学习信号）。
    
    【算法机理】
    GRPO 的梯度来源于相对组内均值的偏差 A_i = (R_i - \bar{R}) / \sigma_R。
    当且仅当组内所有轨迹得分完全相同时（如全对拿 1.0，或全部违规拿 0.0），方差塌缩为 0。
    保留此类组只会产生全 0 优势，浪费算力，因此必须动态丢弃。
    """
    return reward_variance(rewards) > epsilon


def filter_zero_variance_groups(groups: Sequence[Any], *, epsilon: float = 1e-12) -> list[Any]:
    """过滤 ART 的 TrajectoryGroup 列表，剔除无梯度方差的无效组。
    
    【执行逻辑】
    遍历本 Step 收集到的 N 个 TrajectoryGroup，提取各组的 reward 序列：
    若 should_keep_group 返回 True 则保留，否则从梯度更新路径中剔除。
    """
    kept: list[Any] = []
    for group in groups:
        trajectories = list(getattr(group, "trajectories", []) or [])
        rewards = [float(getattr(traj, "reward", 0.0)) for traj in trajectories]
        if should_keep_group(rewards, epsilon=epsilon):
            kept.append(group)
    return kept


async def collect_train_groups(
    *,
    model: Any,
    scenarios: Sequence[RLTaskScenario],
    simulator: Any,
    reward_clients: RewardClients,
    rollout_config: RolloutConfig,
    group_size_k: int,
    step: int | None = None,
    split: str = "train",
) -> list[Any]:
    """调度并发协程，通过 ART 的 gather_trajectory_groups 收集各场景的多轮轨迹组。
    
    【执行逻辑】
    1. 针对本批次的每一个 scenario，构造一个包含 group_size_k (K=8) 个异步 rollout 协程的 TrajectoryGroup；
    2. 调用 art.gather_trajectory_groups 并发等待所有组完成交互与 Reward 打分；
    3. 支持最大异常容忍（max_exceptions），网络抖动不中断整个 Step。
    """
    import art  # type: ignore[import-not-found]

    groups = await art.gather_trajectory_groups(
        (
            art.TrajectoryGroup(
                rollout(
                    model,
                    scenario,
                    simulator=simulator,
                    reward_clients=reward_clients,
                    config=rollout_config,
                )
                for _ in range(group_size_k)
            )
            for scenario in scenarios
        ),
        max_exceptions=float(os.getenv("PHASE6_GATHER_MAX_EXCEPTIONS", "0")),
    )
    return cast(list[Any], groups)


def log_and_guard_simulator_monitoring(
    groups: Sequence[Any],
    step: int,
    split: str = "train",
    leak_warn_threshold: float = 0.05,
    wandb_run: Any | None = None,
) -> dict[str, float]:
    """只读监控旁路：评估模拟器泄露并在首轮泄露时执行 Fail-Closed 熔断。
    
    【执行逻辑】
    1. 提取 Rollout 阶段挂载的私有 Payload；
    2. CPU 正则扫描计算 leak_rate 与 opening_leak；
    3. 若首轮 opening_leak > 0，立即抛出 RuntimeError 熔断停训（Fail-Closed）；
    4. 若中途 mid_dialogue 泄露，仅记录指标至 W&B，绝不修改 Reward 或反向惩罚 Policy。
    """
    from agentic_gov.runtime.simulator_leak_monitor import monitor_rollout_leaks

    trajectories = [traj for g in groups for traj in getattr(g, "trajectories", [])]
    leak_pairs = [
        (getattr(t, "_phase6_episode_trajectory"), getattr(t, "_phase6_task"))
        for t in trajectories
        if hasattr(t, "_phase6_episode_trajectory") and hasattr(t, "_phase6_task")
    ]
    if trajectories and not leak_pairs:
        raise RuntimeError("Rollout payload missing; leak monitor bypassed!")

    report = monitor_rollout_leaks(leak_pairs, warn_threshold=leak_warn_threshold)
    leak_metrics = {
        f"{split}/simulator/leak_rate": report.leak_rate,
        f"{split}/simulator/leak_events": float(report.n_leaking),
        f"{split}/simulator/leak_opening_events": float(report.by_timing.get("opening", 0)),
    }

    if leak_metrics[f"{split}/simulator/leak_opening_events"] > 0:
        raise RuntimeError("simulator opening leak detected; stopping Phase 6 training")

    if wandb_run is not None:
        wandb_run.log({"training_step": float(step), **leak_metrics}, commit=False)

    return leak_metrics


async def train_grpo(
    *,
    model_config: Any,
    backend_config: Any,
    train_config: GRPOTrainConfig,
    simulator: Any,
    reward_clients: RewardClients,
    rollout_config: RolloutConfig | None = None,
) -> dict[str, Any]:
    """Phase 6 GRPO 强化学习主训练循环（运行于 CUDA Server 端）。
    
    【执行流程】
    1. 注册模型与后端：向 LocalBackend（Unsloth + vLLM）注册 TrainableModel，获取推理 API 凭证；
    2. Step 迭代循环：
       a. 场景采样：select_train_step_scenarios 抽取 N 个任务；
       b. 并发采样：collect_train_groups 采集 N*K 条多轮轨迹；
       c. 监控与熔断评估：TrainFuse 检查是否有连续退化或异常违规；
       d. 零方差过滤：filter_zero_variance_groups 剔除无方差组（Canary 组被剥离出梯度路径）；
       e. 梯度反向传播：backend.train 执行 CISPO Loss + KL Penalty 更新；
       f. 权重推送与归档：向 vLLM 推送 Merged 权重，并调用 model.log 写入 Parquet 轨迹文件。
    """
    rollout_cfg = rollout_config or RolloutConfig()
    from phase6.art.model_config import close_backend, register_model_with_backend

    model, backend = await register_model_with_backend(model_config, backend_config)
    fuse_state = TrainFuseState(train_config.train_fuse)
    
    try:
        start_step = await model.get_step()
        scenarios: list[RLTaskScenario] = [...]  # 从 Learnability Pool v2 加载场景池
        
        for step in range(start_step, train_config.train_steps):
            # 1. 采样当前 Step 任务场景 (含方差感知与 Canary 保护)
            batch = select_train_step_scenarios(
                scenarios,
                step=step,
                groups_per_step=train_config.groups_per_step,
            )
            
            # 2. 异步并发收集 K=8 轨迹组
            groups = await collect_train_groups(
                model=model,
                scenarios=batch,
                simulator=simulator,
                reward_clients=reward_clients,
                rollout_config=rollout_cfg,
                group_size_k=train_config.group_size_k,
                step=step,
            )

            # 2.5 只读 Simulator 泄露监控与 Fail-Closed 熔断 (只读探针，不污染 Reward)
            log_and_guard_simulator_monitoring(groups, step=step)
            
            # 3. 剥离 10% Canary 监控任务 (0% 梯度贡献)，对真实训练组做零方差过滤
            canary_flags = [getattr(s, "is_canary", False) for s in batch]
            gradient_groups = [g for g, is_canary in zip(groups, canary_flags) if not is_canary]
            train_groups = filter_zero_variance_groups(
                gradient_groups,
                epsilon=train_config.dynamic_filter_epsilon,
            )
            
            if not train_groups:
                # 若整批全无方差，跳过反向传播，仅记录指标与日志
                await model.log(groups, step=step, split="train")
                continue
            
            # 4. 后端梯度优化 (Token 级 CISPO Loss + Advantage KL 调整)
            result = await backend.train(
                model,
                train_groups,
                learning_rate=train_config.learning_rate,
                kl_penalty_coef=train_config.kl_penalty_coef,
            )
            
            # 5. 记录训练指标并流式归档 Parquet 轨迹文件
            metrics = dict(getattr(result, "metrics", {}) or {})
            await model.log(train_groups, metrics=metrics, step=result.step, split="train")
            
            # 6. 后熔断与梯度守卫校验 (Grad Guard)
            post_fuse_decision = fuse_state.evaluate(metrics, step=result.step, phase="post")
            if post_fuse_decision.triggered:
                raise RuntimeError(f"TrainFuse 触发安全熔断: {post_fuse_decision}")
                
        return {"status": "completed", "steps": train_config.train_steps}
    finally:
        await close_backend(backend)


# ===========================================================================
# 第二部分：ART 框架内部黑盒拆解（ART Framework Internals）
# ===========================================================================

@dataclass
class TokenizedResult:
    """单条可训练 Trajectory 经 ChatML 模板渲染与分词后的张量中间表示。
    
    【核心属性】
    - token_ids: 完整对话序列的 Token ID 列表；
    - assistant_mask: 掩码列表（仅 Agent 生成的动作与分析 Token 为 1，其余为 0）；
    - logprobs: Rollout 时由 vLLM 生成的 old_logprob 列表（非 Assistant 区域为 NaN）；
    - advantage: 该轨迹在组内计算得到的标量优势值 A_k；
    - weight: 轨迹样本权重（通常为 1 / assistant_tokens_count）。
    """
    token_ids: list[int]
    assistant_mask: list[int]
    logprobs: list[float]
    advantage: float
    weight: float
    group_id: int
    parent_id: int


def tokenize_trajectory_groups(
    groups: Sequence[Any],
    *,
    scale_rewards: bool = True,
    drop_zero_advantage_trajectories: bool = True,
) -> list[TokenizedResult]:
    """【ART 预处理】计算组内相对优势，并采用哨兵 Token 替换法完成对齐分词。
    
    【执行逻辑】
    1. 组内相对优势归一化：
       mean = sum(R) / K, std = sqrt(sum((R - mean)^2) / K)
       A_k = (R_k - mean) / (std + 1e-6)
    2. 哨兵替换（Sentinel Replacement）：
       先将 Assistant 轮次替换为唯一哨兵 <SENTINEL> 进行 jinja 模板渲染，
       再将 vLLM 采样的真实 token 与 logprobs 原位填回，杜绝 BPE 重新分词边界错位。
    """
    tokenized_results: list[TokenizedResult] = []
    
    for group_idx, group in enumerate(groups):
        trajectories = list(getattr(group, "trajectories", []))
        if not trajectories:
            continue
        
        # 1. 计算 GRPO 组均值与标准差
        rewards = [float(getattr(t, "reward", 0.0)) for t in trajectories]
        reward_mean = sum(rewards) / len(rewards)
        reward_std = math.sqrt(sum((r - reward_mean) ** 2 for r in rewards) / len(rewards))
        
        for traj in trajectories:
            reward = float(getattr(traj, "reward", 0.0))
            advantage = reward - reward_mean
            if scale_rewards:
                advantage /= (reward_std + 1e-6)
            
            if advantage == 0.0 and drop_zero_advantage_trajectories:
                continue  # 优势为 0 时跳过（无梯度信号）
                
            # 2. 模拟哨兵 Token 原位替换并提取 assistant_mask 与 old_logprobs
            tokens = [1, 151644, ...]  # ChatML 渲染后的 Token IDs
            assistant_mask = [0, 0, 1, 1, 1, 0]
            logprobs = [float("nan"), float("nan"), -0.25, -0.89, -0.12, float("nan")]
            
            tokenized_results.append(
                TokenizedResult(
                    token_ids=tokens,
                    assistant_mask=assistant_mask,
                    logprobs=logprobs,
                    advantage=advantage,
                    weight=1.0 / max(sum(assistant_mask), 1),
                    group_id=group_idx + 1,
                    parent_id=group_idx + 1,
                )
            )
    return tokenized_results


def packed_tensors_from_tokenized_results(
    results: Sequence[TokenizedResult],
    *,
    packed_sequence_length: int = 4096,
) -> dict[str, torch.Tensor]:
    """【ART 拼包】将多条变长轨迹贪心打包（Bin-Packing）并构造双 ID 注意力隔离掩码。
    
    【设计机理】
    通过 group_ids 与 parent_ids 构造 2D Causal Attention Mask：
    Mask[q, k] = (k <= q) & ((group_ids[q] == group_ids[k]) | (parent_ids[q] == group_ids[k]))
    确保同一行张量内并存的多条轨迹互不可见，杜绝跨样本注意力污染。
    """
    batch_size = 2  # 打包后的物理行数
    seq_len = packed_sequence_length
    
    return {
        "tokens": torch.zeros((batch_size, seq_len), dtype=torch.long),
        "assistant_mask": torch.zeros((batch_size, seq_len), dtype=torch.bool),
        "logprobs": torch.full((batch_size, seq_len), float("nan"), dtype=torch.float32),
        "advantages": torch.zeros((batch_size, seq_len), dtype=torch.float32),
        "weights": torch.zeros((batch_size, seq_len), dtype=torch.float32),
        "group_ids": torch.zeros((batch_size, seq_len), dtype=torch.long),
        "parent_ids": torch.zeros((batch_size, seq_len), dtype=torch.long),
    }


def calculate_logprobs(
    model: nn.Module,
    input_ids: torch.Tensor,
    next_input_ids: torch.Tensor,
    *,
    reference_logprobs: bool = False,
) -> torch.Tensor:
    """【前向推理】计算当前策略或参考策略的 Token 级对数概率。
    
    【零显存参考策略实现】
    当 reference_logprobs=True 时，调用 model.disable_adapter() 临时禁用 LoRA 矩阵，
    直接在前向网络中计算无适配器的基座模型概率，无需常驻第二个模型，实现 0 MB 额外显存开销！
    """
    if reference_logprobs:
        # 使用 PEFT disable_adapter 上下文管理器临时置零 LoRA A/B 矩阵
        with getattr(model, "disable_adapter", lambda: nullcontext())():
            with torch.no_grad():
                logits = model(input_ids).logits
    else:
        logits = model(input_ids).logits
        
    log_probs_all = torch.log_softmax(logits, dim=-1)
    # 提取目标 next_token 的 logprob
    token_logprobs = log_probs_all.gather(dim=-1, index=next_input_ids.unsqueeze(-1)).squeeze(-1)
    return token_logprobs


def shift_tensor(tensor: torch.Tensor, pad: int | float | bool) -> torch.Tensor:
    """将张量向左平移 1 个位置，用于 Causal Next-Token 预测对齐。"""
    return torch.nn.functional.pad(tensor[:, 1:], (0, 1), value=pad)


def loss_fn(
    inputs: dict[str, torch.Tensor],
    new_logprobs: torch.Tensor,
    ref_logprobs: torch.Tensor | None,
    *,
    kl_penalty_coef: float = 0.04,
    epsilon: float = 1.0,
    epsilon_high: float = 4.0,
    n_norm: float = DEFAULT_LOSS_NORM_N,  # 分母地板 N_norm=2560 (Phase 6 关键优化)
) -> dict[str, torch.Tensor]:
    """【ART 核心损失函数】Token-Level CISPO 损失 + 优势级相对 KL 惩罚 + 损失分母地板。
    
    【三大算法要点】
    1. Token-Level CISPO Loss:
       prob_ratio = exp(new_logprobs - old_logprobs)
       policy_loss = - clip(prob_ratio.detach(), 1 - epsilon, 1 + epsilon_high) * advantages * new_logprobs
       Ratio 被 detach() 仅作为权重系数，梯度完全走 REINFORCE 路径，避免 PPO 裁剪导致的梯度死区。
    2. Advantage-Level 相对 KL 惩罚:
       kl_per_token = (new_logprobs - ref_logprobs).detach() * mask
       avg_kl = masked_mean(kl_per_token)
       kl_penalty = kl_penalty_coef * (avg_kl - kl_per_token) * mask
       advantages = advantages + kl_penalty
       惩罚偏离超过均值的 token，奖励低于均值的 token，保留探索预算。
    3. Policy Loss 归一化分母地板:
       denominator = max(assistant_mask.sum(), N_norm)
       杜绝短序列/即时终止样本因分母极小引发的梯度爆炸（将 Grad Norm 尖峰从 18.4 压制至 1.59）。
    """
    assistant_mask = shift_tensor(inputs["assistant_mask"], False).to(new_logprobs.dtype)
    old_logprobs = shift_tensor(inputs["logprobs"], float("nan"))
    advantages = shift_tensor(inputs["advantages"], 0.0)
    weights = shift_tensor(inputs["weights"], 0.0)
    
    # 若存在缺失的 old_logprobs，假设其在当前策略下采样 (ratio=1)
    old_logprobs = torch.where(torch.isnan(old_logprobs), new_logprobs.detach(), old_logprobs)
    
    # 1. 计算重要性采样比率
    logprob_diff = new_logprobs - old_logprobs
    prob_ratio = torch.exp(logprob_diff)
    
    # 2. 优势级相对 KL 散度调整
    kl_metric: torch.Tensor | None = None
    if kl_penalty_coef > 0.0 and ref_logprobs is not None:
        kl_per_token = (new_logprobs.detach() - ref_logprobs.detach()) * assistant_mask
        avg_kl = (kl_per_token.sum()) / (assistant_mask.sum() + 1e-18)
        # 相对惩罚: 偏离大于均值获得负惩罚，小于均值获得正奖励
        kl_penalty = kl_penalty_coef * (avg_kl - kl_per_token) * assistant_mask
        advantages = advantages + kl_penalty
        kl_metric = avg_kl
        
    # 3. 计算 Token-Level CISPO 损失
    clipped_ratio = torch.clip(prob_ratio.detach(), 1.0 - epsilon, 1.0 + epsilon_high)
    token_policy_loss = -(clipped_ratio * advantages * new_logprobs) * weights * assistant_mask
    
    # 4. 应用损失分母地板 N_norm 进行归一化
    stock_denom = float(assistant_mask.sum().item()) + 1e-18
    floored_denom = max(stock_denom, float(n_norm))
    reduced_policy_loss = token_policy_loss.sum() / floored_denom
    
    return {
        "policy_loss": reduced_policy_loss,
        "kl_policy_ref": kl_metric if kl_metric is not None else torch.tensor(0.0),
        "prob_ratio_mean": prob_ratio[assistant_mask.bool()].mean(),
    }


def compute_loss_scales(mask_sum: float, n_norm: float = 2560.0) -> tuple[float, float]:
    """返回 (policy_scale, entropy_scale)，明确两者在分母地板上的尺度解耦。
    
    【设计考量】
    Policy Loss 在短序列时除以 N_norm=2560 进行平滑衰减，避免梯度暴冲；
    Entropy Loss 与 KL 散度严格保持原生 stock_denom (scale=1.0)，防止探索熵被过度压缩。
    """
    stock = float(mask_sum) + 1e-18
    floored_policy = max(stock, float(n_norm))
    policy_scale = stock / floored_policy  # 当 mask_sum < 2560 时 < 1.0
    entropy_scale = 1.0                    # 恒为 1.0，严禁缩放探索熵
    return policy_scale, entropy_scale


class LocalBackend:
    """ART LocalBackend 训练引擎核心伪代码架构。
    
    【执行职责】
    协同管理 GPU0 的 Unsloth 训练器与 GPU1 的 vLLM 推理实例，在每步训练后保存 LoRA Checkpoint
    并将合并后的权重（Merged Weights）通过 NCCL 快速推送到推理端。
    """
    def __init__(self, path: str = ".art"):
        self.path = path
        
    async def train(
        self,
        model: Any,
        trajectory_groups: Sequence[Any],
        *,
        learning_rate: float = 1e-5,
        kl_penalty_coef: float = 0.04,
        loss_fn_name: str = "cispo",
    ) -> Any:
        """执行单 Step 的打包、前向计算与梯度反向传播。"""
        # 1. 组内优势归一化与分词
        tokenized_results = tokenize_trajectory_groups(trajectory_groups)
        
        # 2. 拼包打包成固定长度张量
        packed = packed_tensors_from_tokenized_results(tokenized_results)
        
        # 3. 前向计算当前 logprobs 与参考 logprobs (PEFT disable_adapter)
        # 4. 调用 loss_fn 计算 CISPO Loss + KL Penalty
        # 5. 反向传播更新 LoRA 适配器权重并保存 Checkpoint
        # 6. 向 vLLM 推送 Merged Weights
        
        @dataclass
        class LocalTrainResult:
            step: int
            metrics: dict[str, float]
            checkpoint_path: str
            
        return LocalTrainResult(
            step=1,
            metrics={"loss/train": 0.042, "loss/kl_policy_ref": 0.12},
            checkpoint_path=f"{self.path}/models/agent/checkpoints/0001",
        )
