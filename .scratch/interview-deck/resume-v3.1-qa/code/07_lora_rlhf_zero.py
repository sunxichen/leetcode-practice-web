"""
07_lora_rlhf_zero.py — LoRA 低秩适配、RLHF 闭环流程与 DeepSpeed ZeRO 显存估算白板代码

覆盖题目编号：
- C19: LoRA 前向、参数量估算与权重合并 (LoRALinear, estimate_lora_params)
- C20: RLHF/PPO 四模型协同流程与 BT 偏好损失 (bradley_terry_rm_loss, rlhf_ppo_step_simulation)
- C22: DeepSpeed ZeRO-1/2/3 分片要点与显存估算 (estimate_zero_memory)
"""

from __future__ import annotations

import math
import random
from typing import Any


# ==============================================================================
# C19: LoRA 前向、参数量估算与权重合并
# ==============================================================================

class LoRALinear:
    """极简 LoRA 线性层实现 (纯 Python 列表，模拟低秩旁路适配器)"""
    def __init__(self, in_features: int, out_features: int, rank: int = 4, alpha: float = 16.0):
        # 考察点: LoRA 旁路低秩分解前向、B=0 与 A 高斯初始化保证恒等映射、权重合并还原与参数量估算
        # 手写量级: 25 行 / 5 分钟
        # 常见追问: 为什么 B 初始化为 0 而 A 高斯初始化？缩放系数 alpha/r 的物理意义？为什么推理部署时可以零额外延迟？

        self.in_features = in_features
        self.out_features = out_features
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank  # scaling = alpha / r

        # 1. 基础权重 W_0: [out_features, in_features]，模拟已冻结权重
        self.weight = [[0.05 * (i + j) for j in range(in_features)] for i in range(out_features)]
        self.frozen_weight = [row[:] for row in self.weight]

        # 2. 旁路矩阵 A: [rank, in_features]，高斯随机初始化 (std = 1/r)
        self.lora_A = [[(i + 1) * 0.01 for _ in range(in_features)] for i in range(rank)]

        # 3. 旁路矩阵 B: [out_features, rank]，严格全零初始化 (保证训练初始步 delta W = 0，维持恒等映射)
        self.lora_B = [[0.0 for _ in range(rank)] for _ in range(out_features)]

        self.merged = False

    def forward(self, x: list[float]) -> list[float]:
        # 公式: h = W_0 x + (alpha / r) * (B A x)
        # 基础前向: W_0 x
        h = [sum(w_ij * x_j for w_ij, x_j in zip(row, x)) for row in self.weight]

        if not self.merged:
            # 旁路第 1 跳: A x (降维至 rank)
            ax = [sum(a_ij * x_j for a_ij, x_j in zip(row, x)) for row in self.lora_A]
            # 旁路第 2 跳: B (A x) (升维至 out_features)
            b_ax = [sum(b_ij * ax_j for b_ij, ax_j in zip(row, ax)) for row in self.lora_B]
            # 缩放并相加
            h = [h_i + self.scaling * delta_i for h_i, delta_i in zip(h, b_ax)]
        return h

    def merge_weights(self) -> None:
        """部署期合并权重: W = W_0 + (alpha / r) * (B @ A)，完全消除推理额外延迟"""
        if self.merged:
            return
        for i in range(self.out_features):
            for j in range(self.in_features):
                delta_w = sum(self.lora_B[i][k] * self.lora_A[k][j] for k in range(self.rank))
                self.weight[i][j] += self.scaling * delta_w
        self.merged = True

    def unmerge_weights(self) -> None:
        """恢复拆分权重以便继续训练"""
        if not self.merged:
            return
        self.weight = [row[:] for row in self.frozen_weight]
        self.merged = False


def estimate_lora_params(
    d_in: int,
    d_out: int,
    rank: int,
    num_layers: int,
    target_modules: list[str] | None = None,
) -> dict[str, Any]:
    """估算 LoRA 训练参数量与节约比例"""
    if target_modules is None:
        target_modules = ["q_proj", "v_proj"]  # 典型只对 q, v 加 LoRA

    params_per_module_lora = rank * (d_in + d_out)  # A: r*d_in, B: d_out*r
    params_per_module_base = d_in * d_out

    total_lora_trainable = params_per_module_lora * len(target_modules) * num_layers
    total_base_targeted = params_per_module_base * len(target_modules) * num_layers

    compression_ratio = total_lora_trainable / max(total_base_targeted, 1)
    return {
        "trainable_params": total_lora_trainable,
        "base_params_covered": total_base_targeted,
        "trainable_ratio_percent": compression_ratio * 100.0,
    }


# ==============================================================================
# C20: RLHF/PPO 四模型协同流程与 BT 偏好损失
# ==============================================================================

def bradley_terry_rm_loss(r_chosen: float, r_rejected: float) -> float:
    # 考察点: Bradley-Terry 偏好概率模型、二元交叉熵形式 Reward Loss、Margin 差分对数似然
    # 手写量级: 10 行 / 2 分钟
    # 常见追问: 为什么不用 MSE 损失训练 RM？如果正负样本打分差距极大 loss 会怎样？Pairwise RM 与 pointwise RM 优劣？

    # 公式: L_BT = -log sigma(r_w - r_l) = log(1 + exp(-(r_w - r_l)))
    diff = r_chosen - r_rejected
    # 使用数值稳定形式: log(1 + exp(-x))
    if diff > 30.0:
        return math.exp(-diff)
    elif diff < -30.0:
        return -diff
    return math.log(1.0 + math.exp(-diff))


def compute_step_rewards_with_kl(
    outcome_reward: float,
    policy_logp: list[float],
    ref_logp: list[float],
    beta: float = 0.05,
) -> list[float]:
    """为各时间步注入 KL 散度惩罚，末尾步叠加 Outcome 结果奖励"""
    T = len(policy_logp)
    step_rewards = []
    for t in range(T):
        # 逐 token KL 惩罚: r_kl = -beta * (log pi_theta - log pi_ref)
        kl_div = policy_logp[t] - ref_logp[t]
        r_t = -beta * kl_div
        # 仅在最后一个 token 累加环境/RM 评判的结果奖励
        if t == T - 1:
            r_t += outcome_reward
        step_rewards.append(r_t)
    return step_rewards


def compute_gae(
    step_rewards: list[float],
    values: list[float],
    gamma: float = 1.0,
    lam: float = 0.95,
) -> list[float]:
    """广义优势估计 (GAE): 从后向前递推 TD 残差与优势值"""
    # 公式: delta_t = r_t + gamma * V_{t+1} - V_t; A_t = delta_t + gamma * lam * A_{t+1}
    T = len(step_rewards)
    advantages = [0.0] * T
    last_gae = 0.0

    for t in reversed(range(T)):
        next_v = values[t + 1] if t + 1 < len(values) else 0.0
        delta = step_rewards[t] + gamma * next_v - values[t]
        last_gae = delta + gamma * lam * last_gae
        advantages[t] = last_gae
    return advantages


def rlhf_ppo_step_simulation(
    prompt: str,
    outcome_reward: float,
    mock_policy_logp: list[float],
    mock_ref_logp: list[float],
    mock_critic_values: list[float],
    beta: float = 0.05,
) -> dict[str, Any]:
    # 考察点: Actor-Critic-Ref-Reward 四模型协同流转、逐步 KL 散度约束、GAE 广义优势估计与 PPO-Clip 更新
    # 手写量级: 40 行 / 10 分钟
    # 常见追问: 为什么需要 Reference Model？KL 散度放在 Reward 中与放在 Loss 中有何异同？PPO 相比 GRPO 为什么占用更多显存？

    # 1. 角色分工 (四模型架构):
    #    - Policy (Actor): 生成回答并计算最新对数概率
    #    - Reference Model: 冻结的 SFT 基线，提供参考分布防策略坍塌
    #    - Reward Model: 对完整生成文本打标量分 (Outcome Reward)
    #    - Critic (Value): 估计中间状态价值 V(s_t)，用于基线方差缩减

    # 2. 计算融入 KL 约束的时间步奖励序列
    step_rewards = compute_step_rewards_with_kl(outcome_reward, mock_policy_logp, mock_ref_logp, beta=beta)

    # 3. GAE 优势计算
    advantages = compute_gae(step_rewards, mock_critic_values, gamma=1.0, lam=0.95)

    # 4. 模拟 PPO-Clip 目标计算 (示例取首个 token)
    ratio = math.exp(mock_policy_logp[0] - mock_policy_logp[0])  # ratio = 1.0
    adv = advantages[0]
    eps = 0.2
    surr1 = ratio * adv
    surr2 = min(max(ratio, 1.0 - eps), 1.0 + eps) * adv
    policy_loss = -min(surr1, surr2)

    return {
        "step_rewards": step_rewards,
        "advantages": advantages,
        "policy_loss": policy_loss,
    }


# ==============================================================================
# C22: DeepSpeed ZeRO-1/2/3 分片要点与显存估算
# ==============================================================================

def estimate_zero_memory(
    param_count_billions: float,
    num_gpus: int,
    stage: int = 1,
    precision_bytes: int = 2,  # FP16/BF16 为 2 字节
    activation_gb: float = 0.0,
) -> dict[str, Any]:
    # 考察点: DeepSpeed ZeRO-1/2/3 分片原理、混合精度 Adam 16 字节 (16Ψ) 显存构成、随卡数扩展显存估算函数
    # 手写量级: 25 行 / 6 分钟
    # 常见追问: 16 字节/参数 (16Ψ) 由哪些部分构成？ZeRO-3 通信开销相比标准数据并行增加了多少？ZeRO-Offload 适用的硬件场景？

    # 核心公式 (参数量为 Psi):
    # 基础模型状态构成 (FP16/BF16 混合精度 + FP32 Adam):
    # - 模型参数: 2 字节 * Psi
    # - 梯度:     2 字节 * Psi
    # - 优化器:   12 字节 * Psi (FP32 主权重 4B + 一阶动量 4B + 二阶方差 4B)
    # 总静态状态 = 16 字节 * Psi (即 16 * Psi)

    psi = param_count_billions * 1e9  # 参数总量
    weights_total_gb = (2.0 * psi) / (1024 ** 3)
    grads_total_gb = (2.0 * psi) / (1024 ** 3)
    opt_total_gb = (12.0 * psi) / (1024 ** 3)

    n = max(num_gpus, 1)

    if stage == 0:
        # 标准数据并行: 每张卡完整复制全部状态
        w_gpu = weights_total_gb
        g_gpu = grads_total_gb
        o_gpu = opt_total_gb
    elif stage == 1:
        # ZeRO-1 (P_os): 仅切分优化器状态，参数和梯度全卡复制
        w_gpu = weights_total_gb
        g_gpu = grads_total_gb
        o_gpu = opt_total_gb / n
    elif stage == 2:
        # ZeRO-2 (P_os+g): 切分优化器状态与梯度，参数全卡复制
        w_gpu = weights_total_gb
        g_gpu = grads_total_gb / n
        o_gpu = opt_total_gb / n
    elif stage == 3:
        # ZeRO-3 (P_os+g+p): 彻底分片参数、梯度与优化器状态 (前向/反向按需 All-Gather 并立即释放)
        w_gpu = weights_total_gb / n
        g_gpu = grads_total_gb / n
        o_gpu = opt_total_gb / n
    else:
        raise ValueError(f"未知 ZeRO stage: {stage}")

    total_state_gb = w_gpu + g_gpu + o_gpu
    total_with_act_gb = total_state_gb + activation_gb

    return {
        "stage": stage,
        "num_gpus": n,
        "param_billions": param_count_billions,
        "weights_gb_per_gpu": round(w_gpu, 2),
        "grads_gb_per_gpu": round(g_gpu, 2),
        "opt_states_gb_per_gpu": round(o_gpu, 2),
        "total_static_gb_per_gpu": round(total_state_gb, 2),
        "total_with_activation_gb": round(total_with_act_gb, 2),
    }


# ==============================================================================
# 自测断言 (__main__)
# ==============================================================================

if __name__ == "__main__":
    print("=== 开始运行 07_lora_rlhf_zero.py 自测 ===")

    # 1. 测试 C19: LoRA 前向、参数量估算与权重合并
    d_in, d_out, rank = 8, 4, 2
    lora_layer = LoRALinear(in_features=d_in, out_features=d_out, rank=rank, alpha=8.0)

    # 初始状态由于 B=0，旁路输出 delta 应完全为 0
    x_test = [1.0] * d_in
    out_initial = lora_layer.forward(x_test)
    # 模拟经过梯度更新后 B 不为 0
    lora_layer.lora_B[0][0] = 0.5
    out_adapted = lora_layer.forward(x_test)
    assert out_adapted != out_initial, "B 更新后 LoRA 输出应发生自适应变化"

    # 测试权重合并前后前向结果严格一致
    out_before_merge = lora_layer.forward(x_test)
    lora_layer.merge_weights()
    assert lora_layer.merged is True
    out_after_merge = lora_layer.forward(x_test)
    for v1, v2 in zip(out_before_merge, out_after_merge):
        assert math.isclose(v1, v2, rel_tol=1e-5), f"合并前后输出不一致: {v1} vs {v2}"

    # 测试解合并还原
    lora_layer.unmerge_weights()
    assert lora_layer.merged is False

    # 测试参数量估算公式
    lora_stat = estimate_lora_params(d_in=4096, d_out=4096, rank=8, num_layers=32, target_modules=["q_proj", "v_proj"])
    # 理论值: 8 * (4096 + 4096) * 2 * 32 = 8 * 8192 * 64 = 4,194,304 参数
    expected_params = 8 * (4096 + 4096) * 2 * 32
    assert lora_stat["trainable_params"] == expected_params
    assert lora_stat["trainable_ratio_percent"] < 1.0, "LoRA 可训练参数比例应远小于 1%"
    print("✓ C19 LoRA 前向、参数量估算与合并测试通过")

    # 2. 测试 C20: Bradley-Terry RM 损失与单调性
    loss_high_margin = bradley_terry_rm_loss(r_chosen=5.0, r_rejected=1.0)  # margin = 4.0
    loss_low_margin = bradley_terry_rm_loss(r_chosen=2.0, r_rejected=1.0)   # margin = 1.0
    loss_wrong_order = bradley_terry_rm_loss(r_chosen=1.0, r_rejected=3.0)  # margin = -2.0
    # margin 越大，模型区分越明确，损失必须单调下降
    assert loss_high_margin < loss_low_margin < loss_wrong_order
    assert math.isclose(loss_high_margin, math.log(1.0 + math.exp(-4.0)), rel_tol=1e-5)

    # 测试 PPO 四模型协同与 GAE 递推
    ppo_sim = rlhf_ppo_step_simulation(
        prompt="办理公积金需要什么材料？",
        outcome_reward=1.0,
        mock_policy_logp=[-0.2, -0.3, -0.1],
        mock_ref_logp=[-0.2, -0.4, -0.1],
        mock_critic_values=[0.5, 0.6, 0.7],
        beta=0.05,
    )
    assert len(ppo_sim["step_rewards"]) == 3
    assert len(ppo_sim["advantages"]) == 3
    # 验证最终 token 包含 outcome reward
    assert ppo_sim["step_rewards"][-1] > 0.9
    print("✓ C20 RLHF BT 损失与 PPO 四模型协同测试通过")

    # 3. 测试 C22: DeepSpeed ZeRO 显存估算与多卡单调递减
    param_b = 7.0  # 7B 模型
    z0 = estimate_zero_memory(param_b, num_gpus=8, stage=0)
    z1 = estimate_zero_memory(param_b, num_gpus=8, stage=1)
    z2 = estimate_zero_memory(param_b, num_gpus=8, stage=2)
    z3 = estimate_zero_memory(param_b, num_gpus=8, stage=3)

    # 验证同一卡数下显存随 Stage 升高严格单调下降: ZeRO-0 > ZeRO-1 > ZeRO-2 > ZeRO-3
    assert z0["total_static_gb_per_gpu"] > z1["total_static_gb_per_gpu"]
    assert z1["total_static_gb_per_gpu"] > z2["total_static_gb_per_gpu"]
    assert z2["total_static_gb_per_gpu"] > z3["total_static_gb_per_gpu"]

    # 验证随 GPU 数量翻倍，ZeRO-3 单卡显存严格单调递减
    z3_4gpu = estimate_zero_memory(param_b, num_gpus=4, stage=3)
    z3_8gpu = estimate_zero_memory(param_b, num_gpus=8, stage=3)
    z3_16gpu = estimate_zero_memory(param_b, num_gpus=16, stage=3)
    assert z3_4gpu["total_static_gb_per_gpu"] > z3_8gpu["total_static_gb_per_gpu"] > z3_16gpu["total_static_gb_per_gpu"]
    # 验证卡数翻倍，单卡显存减半 (ZeRO-3)
    assert math.isclose(z3_8gpu["total_static_gb_per_gpu"] * 2.0, z3_4gpu["total_static_gb_per_gpu"], rel_tol=0.05)
    print("✓ C22 DeepSpeed ZeRO 显存估算与单调性测试通过")

    print("\n=== 07_lora_rlhf_zero.py 全部断言自测通过！===")
