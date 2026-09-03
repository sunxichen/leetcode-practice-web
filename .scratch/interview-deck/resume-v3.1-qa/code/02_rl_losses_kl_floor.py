"""
02_rl_losses_kl_floor.py — RL 目标函数、KL 惩罚与损失分母地板白板手写代码

覆盖题目编号：
- C04: Token-level PPO / GRPO / CISPO loss 带 mask + 分母地板 (ppo_clip_loss, grpo_token_loss, cispo_token_loss)
- C05: Advantage 级 KL + disable_adapter 参考 logprob (advantage_kl_penalty, DisableAdapterContext)
- C21: DPO loss 离线偏好损失 (dpo_loss)
- C28: GAE 广义优势估计 (compute_gae)
"""

from __future__ import annotations

import math
from typing import Any


# ==============================================================================
# C04: Token-Level PPO-Clip / GRPO / CISPO Loss 带 Mask 与分母地板
# ==============================================================================

def ppo_clip_loss(
    new_logp: list[list[float]],
    old_logp: list[list[float]],
    advantages: list[float],
    mask: list[list[int]],
    eps: float = 0.2,
    n_norm: float | None = None,
) -> float:
    # 考察点: Token-level PPO-Clip 悲观截断、重要性采样比率、梯度死区机制与分母归一化
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 为什么比值过大会陷入梯度死区？分母为什么不能除以张量固定长度 B*T？分母地板 N_norm 解决什么？

    loss_sum = 0.0
    mask_sum = 0
    B = len(new_logp)
    T = len(new_logp[0]) if B > 0 else 0

    for b in range(B):
        adv = advantages[b]  # [B] 优势广播至序列
        for t in range(T):
            if mask[b][t]:
                # 1. 重要性采样比率: r_t = exp(new_logp - old_logp)
                ratio = math.exp(new_logp[b][t] - old_logp[b][t])  # ratio = exp(new - old)
                # 2. 剪裁与未剪裁目标
                surr1 = ratio * adv  # surr1 = ratio * A
                surr2 = min(max(ratio, 1.0 - eps), 1.0 + eps) * adv  # surr2 = clip(ratio, 1-eps, 1+eps) * A
                # 3. 悲观剪裁目标 (min 截断；当 ratio > 1+eps 且 A > 0 时梯度为 0 形成死区)
                token_obj = min(surr1, surr2)  # obj = min(surr1, surr2)
                loss_sum += -token_obj  # 策略损失为最大化目标的负值
                mask_sum += 1

    # 4. 分母归一化与分母地板
    effective_denom = max(mask_sum, n_norm) if n_norm is not None else max(mask_sum, 1)  # max(mask_sum, N_norm)
    return loss_sum / effective_denom


def grpo_token_loss(
    new_logp: list[list[float]],
    old_logp: list[list[float]],
    ref_logp: list[list[float]],
    advantages: list[float],
    mask: list[list[int]],
    eps: float = 0.2,
    beta_kl: float = 0.04,
) -> float:
    # 考察点: GRPO 组相对策略优化、Token 级比值截断 + Sample-Level 归一化 + Schulman KL 惩罚
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: GRPO 序列级归一化(per-sequence)与 DAPO/CISPO token 级归一化的区别？KL 放 loss 还是 reward？

    B = len(new_logp)
    T = len(new_logp[0]) if B > 0 else 0
    seq_losses: list[float] = []

    for b in range(B):
        adv = advantages[b]
        seq_obj = 0.0
        seq_len = 0
        for t in range(T):
            if mask[b][t]:
                ratio = math.exp(new_logp[b][t] - old_logp[b][t])  # ratio = exp(new - old)
                surr1 = ratio * adv
                surr2 = min(max(ratio, 1.0 - eps), 1.0 + eps) * adv
                surr = min(surr1, surr2)  # PPO 悲观截断

                # Schulman KL 散度无偏估计: D_KL ≈ exp(ref - new) - (ref - new) - 1
                diff = ref_logp[b][t] - new_logp[b][t]  # diff = ref - new
                kl = math.exp(diff) - diff - 1.0  # kl = exp(diff) - diff - 1

                token_obj = surr - beta_kl * kl  # token_obj = surr - beta * kl
                seq_obj += token_obj
                seq_len += 1
        # GRPO 原论文 Sample-Level 归一化: 先序列内求均值 (1/|y_i|)，再求 Batch 序列均值
        seq_losses.append(-seq_obj / max(seq_len, 1))  # seq_loss = -(1/|y|) * sum_t token_obj

    return sum(seq_losses) / max(B, 1)  # mean over batch sequences


def cispo_token_loss(
    new_logp: list[list[float]],
    old_logp: list[list[float]],
    advantages: list[float],
    mask: list[list[int]],
    eps_low: float = 1.0,
    eps_high: float = 4.0,
    n_norm: float = 2560.0,
) -> float:
    # 考察点: CISPO Detached Clipped Ratio 作为权重、梯度不截断无死区、全局 Token 归一化分母地板
    # 手写量级: 25 行 / 5 分钟
    # 常见追问: 为什么 CISPO 梯度不截断？ratio.detach() 的数学含义？非对称上界 [0, 5] 的考量？

    # 核心特征：ratio 仅作为权重系数并 detach()，梯度完全走加权 REINFORCE 路径:
    # ∂/∂θ [ clip(ratio).detach() * A * logp ] = clip(ratio) * A * ∂logp/∂θ (方向始终保留，无死区)
    loss_sum = 0.0
    mask_sum = 0
    B = len(new_logp)
    T = len(new_logp[0]) if B > 0 else 0

    for b in range(B):
        adv = advantages[b]
        for t in range(T):
            if mask[b][t]:
                # 1. 计算重要性采样比率
                ratio = math.exp(new_logp[b][t] - old_logp[b][t])  # ratio = exp(new - old)
                # 2. 剪裁 ratio 并 detach() (作为只读乘数，不传导自身梯度的微分)
                clipped_weight = min(max(ratio, 1.0 - eps_low), 1.0 + eps_high)  # clip(ratio, 0, 5)
                # 3. 损失为加权似然: - clipped_ratio.detach() * A * logp
                token_loss = - (clipped_weight * adv * new_logp[b][t])  # loss = - weight.detach() * A * logp
                loss_sum += token_loss
                mask_sum += 1

    # 4. 损失分母地板 N_norm: 抑制超短序列/即时终止样本引发的梯度尖峰
    effective_denom = max(mask_sum, n_norm)  # floored_denom = max(mask_sum, N_norm)
    return loss_sum / effective_denom


# ==============================================================================
# C05: Advantage 级相对 KL + 零显存 disable_adapter 参考概率
# ==============================================================================

def advantage_kl_penalty(
    advantages: list[float],
    new_logp: list[list[float]],
    ref_logp: list[list[float]],
    mask: list[list[int]],
    kl_coef: float = 0.04,
) -> tuple[list[list[float]], float]:
    # 考察点: Advantage 级相对 KL 散度调整、偏离均值相对惩罚保留探索预算、优势广播
    # 手写量级: 20 行 / 4 分钟
    # 常见追问: 优势级 KL 相对惩罚与 Loss 级 β·KL 的数学区别？为什么相对 KL 保留探索预算？

    B = len(new_logp)
    T = len(new_logp[0]) if B > 0 else 0
    kl_per_token: list[list[float]] = [[0.0] * T for _ in range(B)]
    total_kl = 0.0
    total_tokens = 0

    # 1. 逐 Token 计算与参考模型的对数差值并施加 mask
    for b in range(B):
        for t in range(T):
            if mask[b][t]:
                kl = new_logp[b][t] - ref_logp[b][t]  # kl = new_logp - ref_logp
                kl_per_token[b][t] = kl
                total_kl += kl
                total_tokens += 1

    avg_kl = total_kl / max(total_tokens, 1)  # avg_kl = sum(kl * mask) / sum(mask)

    # 2. 相对惩罚: 偏离大于均值者受罚 (kl > avg_kl)，低于均值探索者受奖 (kl < avg_kl)
    # A_adjusted = A + kl_coef * (avg_kl - kl)
    adjusted_advantages: list[list[float]] = [[0.0] * T for _ in range(B)]
    for b in range(B):
        base_adv = advantages[b]
        for t in range(T):
            if mask[b][t]:
                penalty = kl_coef * (avg_kl - kl_per_token[b][t])  # penalty = c * (mean_kl - kl_t)
                adjusted_advantages[b][t] = base_adv + penalty  # A_t = A + penalty
            else:
                adjusted_advantages[b][t] = 0.0

    return adjusted_advantages, avg_kl


class DisableAdapterContext:
    # 考察点: 零显存参考策略概率获取、PEFT disable_adapter 上下文管理器机制与原理
    # 手写量级: 15 行 / 3 分钟
    # 常见追问: 为什么不需要常驻 ref model？显存节省多少？LoRA A/B 矩阵如何被临时旁路？

    def __init__(self, model: Any) -> None:
        self.model = model
        self.prev_state = getattr(model, "adapter_enabled", True)

    def __enter__(self) -> None:
        # 临时将 LoRA 增量设为禁用，前向推理只走 Frozen Base Weights: y = W_0 * x
        self.model.adapter_enabled = False

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        # 退出上下文后立即恢复 LoRA 适配器: y = (W_0 + BA) * x
        self.model.adapter_enabled = self.prev_state


def get_ref_logprobs_zero_ram(model: Any, input_ids: list[int]) -> list[float]:
    """零额外显存获取 ref_logprob：无需常驻第二个基座，单卡节省 16GB+ 显存。"""
    # 运行原理解析：
    # with model.disable_adapter():
    #     ref_logits = model(input_ids)  # 临时置零 LoRA A/B 矩阵
    #     ref_logprobs = log_softmax(ref_logits)
    with DisableAdapterContext(model):
        return model.forward_logprobs(input_ids)  # 走无 LoRA 基座前向


# ==============================================================================
# C21: DPO Loss 离线偏好对齐损失
# ==============================================================================

def dpo_loss(
    chosen_logp: list[float],
    rejected_logp: list[float],
    ref_chosen_logp: list[float],
    ref_rejected_logp: list[float],
    chosen_mask: list[int],
    rejected_mask: list[int],
    beta: float = 0.1,
) -> tuple[float, float, float]:
    # 考察点: DPO 离线成对偏好损失、Bradley-Terry 隐式奖励闭式反解、无在线 Rollout/Ratio
    # 手写量级: 15 行 / 3 分钟
    # 常见追问: DPO 和 PPO/RLHF 的数学联系？β 超参的物理含义？DPO 为什么不需要 Critic 和显式 Reward？

    # 1. 累加胜出 (chosen) 与失败 (rejected) 序列在策略模型与参考模型下的对数似然
    pi_c = sum(lp * m for lp, m in zip(chosen_logp, chosen_mask))  # sum(log pi(y_w))
    ref_c = sum(lp * m for lp, m in zip(ref_chosen_logp, chosen_mask))  # sum(log ref(y_w))
    pi_r = sum(lp * m for lp, m in zip(rejected_logp, rejected_mask))  # sum(log pi(y_l))
    ref_r = sum(lp * m for lp, m in zip(ref_rejected_logp, rejected_mask))  # sum(log ref(y_l))

    # 2. 计算隐式奖励差值: r_implicit = beta * (log pi - log ref)
    # logit = beta * [(pi_c - ref_c) - (pi_r - ref_r)]
    margin_chosen = pi_c - ref_c  # log(pi/ref) for chosen
    margin_rejected = pi_r - ref_r  # log(pi/ref) for rejected
    logit = beta * (margin_chosen - margin_rejected)  # logit = beta * (margin_w - margin_l)

    # 3. Bradley-Terry 负对数几率目标: -log(sigmoid(logit)) = log(1 + exp(-logit))
    if logit >= 0.0:
        loss = math.log(1.0 + math.exp(-logit))  # 数值稳定正数分支
    else:
        loss = -logit + math.log(1.0 + math.exp(logit))  # 数值稳定负数防溢出

    implicit_r_chosen = beta * margin_chosen
    implicit_r_rejected = beta * margin_rejected
    return loss, implicit_r_chosen, implicit_r_rejected


# ==============================================================================
# C28: GAE (广义优势估计) 反向递推
# ==============================================================================

def compute_gae(
    step_rewards: list[float],
    values: list[float],
    mask: list[int],
    gamma: float = 1.0,
    lam: float = 0.95,
) -> list[float]:
    # 考察点: GAE (广义优势估计) TD 残差反向递推、偏差-方差权衡、LLM 任务中 γ=1 设定
    # 手写量级: 12 行 / 3 分钟
    # 常见追问: λ=0 和 λ=1 分别退化成什么？为什么大模型单回合 RL 中经常设 γ=1.0？

    # step_rewards: [T] 各步奖励 (末步通常为终态 Reward)
    # values: [T+1] Critic 估计的 V(s_t)，末尾 values[T] 为终止态估计 (通常为 0.0)
    # mask: [T] 动作掩码 (1=有效步骤, 0=Padding)
    T = len(step_rewards)
    advantages = [0.0] * T
    last_gae = 0.0

    # 从最后一步逆序向后反向累加
    for t in reversed(range(T)):
        # 1. TD 残差 delta_t = r_t + gamma * V(s_{t+1}) * mask_t - V(s_t)
        delta = step_rewards[t] + gamma * values[t + 1] * mask[t] - values[t]  # delta = r + gamma*V_next - V
        # 2. GAE 优势累积 A_t = delta_t + gamma * lambda * A_{t+1} * mask_t
        last_gae = delta + gamma * lam * last_gae * mask[t]  # A_t = delta + gamma*lambda*A_next
        advantages[t] = last_gae

    return advantages


# ==============================================================================
# 自测验证入口
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 02_rl_losses_kl_floor.py 单元测试 ===")

    # 1. 验证 C04 PPO-Clip / GRPO / CISPO 损失与分母地板
    # 构造合成 Batch: B=2, T=3
    # 样本 0: positive advantage = 1.0; 样本 1: negative advantage = -1.0
    new_lp = [[-0.2, -0.5, -0.1], [-1.2, -0.8, -0.9]]
    old_lp = [[-0.5, -0.5, -0.3], [-1.0, -0.8, -0.7]]
    ref_lp = [[-0.3, -0.4, -0.2], [-1.1, -0.8, -0.8]]
    advs = [1.0, -1.0]
    mask = [[1, 1, 1], [1, 1, 0]]  # 样本 0 长 3, 样本 1 长 2, 总有效 token = 5

    # 验证 PPO loss
    loss_ppo = ppo_clip_loss(new_lp, old_lp, advs, mask, eps=0.2)
    assert isinstance(loss_ppo, float)

    # 验证 GRPO loss
    loss_grpo = grpo_token_loss(new_lp, old_lp, ref_lp, advs, mask, eps=0.2, beta_kl=0.04)
    assert isinstance(loss_grpo, float)

    # 验证 CISPO loss 与 分母地板 N_norm
    loss_cispo_small_floor = cispo_token_loss(new_lp, old_lp, advs, mask, n_norm=5.0)
    loss_cispo_large_floor = cispo_token_loss(new_lp, old_lp, advs, mask, n_norm=2560.0)
    # 分母从 5 扩大到 2560 时，loss 应当精确缩小 5 / 2560 倍
    ratio_expected = 5.0 / 2560.0
    assert math.isclose(loss_cispo_large_floor / loss_cispo_small_floor, ratio_expected, rel_tol=1e-4)

    # 验证 CISPO ratio 作权重梯度不截断特性：当 ratio > 1+eps 时梯度不为 0
    # 模拟突破 PPO 上界的探索 token (ratio = exp(1.61) ≈ 5.0)
    explore_new = [[math.log(5.0)]]
    explore_old = [[0.0]]
    explore_adv = [1.0]
    explore_mask = [[1]]
    # PPO 会将 ratio 截断到 1.2，损失导数死区
    # CISPO 权重为 min(5.0, 5.0) = 5.0, token_loss = -5.0 * 1.0 * log(5.0)
    cispo_out = cispo_token_loss(explore_new, explore_old, explore_adv, explore_mask, n_norm=1.0)
    assert math.isclose(cispo_out, -5.0 * 1.0 * math.log(5.0), rel_tol=1e-4)

    # 2. 验证 C05 Advantage 级 KL 与 disable_adapter 机制
    adj_advs, mean_kl = advantage_kl_penalty(advs, new_lp, ref_lp, mask, kl_coef=0.04)
    assert len(adj_advs) == 2 and len(adj_advs[0]) == 3
    # 偏离均值更大的 token (新策略比参考策略过分自信) 会受到更大惩罚
    token0_kl = new_lp[0][0] - ref_lp[0][0]
    token1_kl = new_lp[0][1] - ref_lp[0][1]
    if token0_kl > token1_kl:
        assert adj_advs[0][0] < adj_advs[0][1]  # 惩罚更大，调整后优势更低

    # 验证 Mock disable_adapter 上下文
    class MockModel:
        adapter_enabled = True
        def forward_logprobs(self, ids: list[int]) -> list[float]:
            # 开启 adapter 时返回有偏值，关闭时返回基座值
            return [-0.5] if self.adapter_enabled else [-0.3]

    dummy_model = MockModel()
    with DisableAdapterContext(dummy_model):
        assert dummy_model.adapter_enabled is False
    assert dummy_model.adapter_enabled is True
    ref_out = get_ref_logprobs_zero_ram(dummy_model, [1, 2, 3])
    assert ref_out == [-0.3]

    # 3. 验证 C21 DPO Loss
    # 完美偏好对: 策略对 chosen 的对数概率高于 rejected，且相对 ref 提升更显著
    c_lp = [-0.1, -0.2]
    r_lp = [-1.5, -2.0]
    ref_c_lp = [-0.3, -0.4]
    ref_r_lp = [-1.4, -1.8]
    c_m = [1, 1]
    r_m = [1, 1]
    loss_win, rew_c, rew_r = dpo_loss(c_lp, r_lp, ref_c_lp, ref_r_lp, c_m, r_m, beta=0.1)
    assert rew_c > rew_r, "胜出项隐式奖励必须高于失败项"
    assert loss_win < math.log(2.0), "偏好正确时 loss 必须小于随机 baseline log(2)"

    # 对称平衡点: 策略对 chosen 与 rejected 无偏差 -> loss == log(2)
    loss_tie, _, _ = dpo_loss(c_lp, c_lp, ref_c_lp, ref_c_lp, c_m, c_m, beta=0.1)
    assert math.isclose(loss_tie, math.log(2.0), rel_tol=1e-5)

    # 4. 验证 C28 GAE
    # 3 步 MDP: 奖励前两步为 0，最后一步获得 1.0; gamma=1.0, lambda=0.95
    step_r = [0.0, 0.0, 1.0]
    v_preds = [0.2, 0.4, 0.8, 0.0]  # V(s_0)=0.2, V(s_1)=0.4, V(s_2)=0.8, V(terminal)=0.0
    step_m = [1, 1, 1]
    gae_out = compute_gae(step_r, v_preds, step_m, gamma=1.0, lam=0.95)
    # 手工递推核验:
    # t=2: delta_2 = 1.0 + 1.0 * 0.0 - 0.8 = 0.2; A_2 = 0.2
    # t=1: delta_1 = 0.0 + 1.0 * 0.8 - 0.4 = 0.4; A_1 = 0.4 + 0.95 * 0.2 = 0.59
    # t=0: delta_0 = 0.0 + 1.0 * 0.4 - 0.2 = 0.2; A_0 = 0.2 + 0.95 * 0.59 = 0.7605
    assert math.isclose(gae_out[2], 0.2, rel_tol=1e-5)
    assert math.isclose(gae_out[1], 0.59, rel_tol=1e-5)
    assert math.isclose(gae_out[0], 0.7605, rel_tol=1e-5)

    print("=== 02_rl_losses_kl_floor.py 全部断言自测通过！===")
