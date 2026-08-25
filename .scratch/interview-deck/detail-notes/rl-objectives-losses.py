"""RL & LLM Alignment Objectives Comparison: REINFORCE, PPO, GRPO, CISPO, DAPO, GSPO, DPO.

本文件为教学与算法对比用的最小可运行 PyTorch 实现。
演示以下核心机制的数学实现与行为差异：
  1. Token-level vs. Sequence-level Importance Ratio (GRPO vs. GSPO)
  2. PPO-Clip 梯度死区 (Dead Zone) vs. CISPO Detached Clipped Weight (持续梯度流)
  3. GRPO Group-Relative Advantage 估计与零方差组表现
  4. DAPO Token-Level 损失分母归一化 vs. GRPO Sample-Level 归一化
  5. DPO 离线隐式奖励偏置 (Implicit Reward Margin) 与 Bradley-Terry 对数几率目标

【注意】：本实现为教学最小实现，聚焦于 Loss 与梯度的数学语义，
省略了真实生产环境中的分布式 All-Gather、张量打包 (Packing)、KV 缓存优化与环境 Rollout 循环。
"""

from __future__ import annotations

from typing import NamedTuple
import torch
import torch.nn.functional as F


# ==============================================================================
# 0. 辅助数据结构与公共 Helper 函数
# ==============================================================================

class BatchData(NamedTuple):
    """用于 Policy Gradient 类算法的合成测试 Batch。"""
    group_ids: torch.Tensor          # [B], 每个序列所属的 Prompt 组 ID (如 [0, 0, 1, 1])
    rewards: torch.Tensor            # [B], 序列级标量奖励
    old_logprobs: torch.Tensor       # [B, T], 采样时旧策略 log π_old(y_t | x, y_<t)
    ref_logprobs: torch.Tensor       # [B, T], 参考模型 log π_ref(y_t | x, y_<t)
    assistant_mask: torch.Tensor     # [B, T], 1 表示有效 response token, 0 表示 prompt/padding


class DPOBatchData(NamedTuple):
    """用于 DPO 偏好优化的合成测试 Batch。"""
    chosen_old_logprobs: torch.Tensor     # [B, T], 胜出回答在采样时的 logprob
    chosen_ref_logprobs: torch.Tensor     # [B, T], 胜出回答在参考模型下的 logprob
    chosen_mask: torch.Tensor             # [B, T], 胜出回答 mask
    rejected_old_logprobs: torch.Tensor   # [B, T], 失败回答在采样时的 logprob
    rejected_ref_logprobs: torch.Tensor   # [B, T], 失败回答在参考模型下的 logprob
    rejected_mask: torch.Tensor           # [B, T], 失败回答 mask


def compute_group_advantages(
    rewards: torch.Tensor,
    group_ids: torch.Tensor,
    eps: float = 1e-8,
) -> torch.Tensor:
    """计算 GRPO 风格的组内相对优势 (Group-Relative Advantage)。
    
    对同一个 Prompt 采样出的 G 个回答，优势为该回答奖励在组内的 z-score：
        A_i = (r_i - mean(r_group)) / (std(r_group) + eps)
    
    参数:
        rewards: [B] 标量奖励
        group_ids: [B] 组标识符
        eps: 防止除零的微小常数
    返回:
        advantages: [B] 归一化后的优势值
    """
    advantages = torch.zeros_like(rewards)
    unique_groups = torch.unique(group_ids)
    for g in unique_groups:
        mask = (group_ids == g)
        group_rewards = rewards[mask]
        if group_rewards.numel() <= 1:
            advantages[mask] = 0.0
        else:
            mean = group_rewards.mean()
            std = group_rewards.std(unbiased=False)
            if std < 1e-7:
                # 零方差组（如全对或全错），无有效对比梯度信号
                advantages[mask] = 0.0
            else:
                advantages[mask] = (group_rewards - mean) / (std + eps)
    return advantages


def compute_token_importance_ratios(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    mask: torch.Tensor,
) -> torch.Tensor:
    """计算 Token 级重要性采样比值:
        r_t(θ) = π_θ(y_t | s_t) / π_old(y_t | s_t) = exp(log π_θ - log π_old)
    """
    log_ratio = (new_logprobs - old_logprobs) * mask
    return torch.exp(log_ratio)


def compute_sequence_geometric_ratios(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    mask: torch.Tensor,
) -> torch.Tensor:
    """计算 GSPO 风格的序列级几何平均重要性比值:
        s_i(θ) = ( π_θ(y_i|x) / π_old(y_i|x) )^(1 / |y_i|)
               = exp( (1 / |y_i|) * sum_t (log π_θ(y_{i,t}) - log π_old(y_{i,t})) )
    
    返回:
        [B] 每个序列一个标量比值
    """
    seq_lengths = mask.sum(dim=-1).clamp(min=1.0)  # [B]
    log_diff_sum = ((new_logprobs - old_logprobs) * mask).sum(dim=-1)  # [B]
    mean_log_diff = log_diff_sum / seq_lengths
    return torch.exp(mean_log_diff)


# ==============================================================================
# 1. REINFORCE Loss (Williams 1992 基石)
# ==============================================================================

def reinforce_loss(
    new_logprobs: torch.Tensor,
    advantages: torch.Tensor,
    mask: torch.Tensor,
) -> torch.Tensor:
    """REINFORCE Policy Gradient 损失函数。
    
    公式:
        L(θ) = - (1 / B) * sum_{i=1}^B [ A_i * sum_{t=1}^{T_i} log π_θ(y_{i,t} | s_{i,t}) ]
    
    特点:
      - 无 Importance Ratio (假设完全 On-Policy 单步更新)。
      - 梯度直接将整个轨迹的 log π 乘以该轨迹的 Return/Advantage。
      - 方差极大，无法复用样本多步更新。
    """
    # [B, T] -> 每条序列的加权 log_prob 和
    seq_logprobs = (new_logprobs * mask).sum(dim=-1)  # [B]
    loss = -(advantages * seq_logprobs).mean()
    return loss


# ==============================================================================
# 2. PPO-Clip Loss (Schulman et al. 2017)
# ==============================================================================

def ppo_clip_loss(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    advantages: torch.Tensor,
    mask: torch.Tensor,
    epsilon: float = 0.2,
) -> torch.Tensor:
    """PPO Clipped Surrogate 损失函数（自回归 LLM Token 级落地）。
    
    公式:
        L(θ) = - E_t [ min( r_t(θ) * A_t, clip(r_t(θ), 1-ε, 1+ε) * A_t ) ]
    
    核心机制:
      - 原始 PPO (Schulman 2017) 定义在通用 MDP 动作时间步 a_t 上；在自回归 LLM 落地中，
        每个 Token 生成即为一个 MDP 动作步，因此对应为 Token 级比值 r_t(θ) = exp(new_logprobs - old_logprobs)。
      - 当 r_t > 1+ε 且 A > 0 时，目标被 clip 截断为常数 (1+ε)*A，对 new_logprobs 导数为 0（梯度死区）。
      - 传统 PPO 通常配合独立 Critic 网络计算 GAE 优势。
    """
    # 优势广播到 [B, T]
    adv_expanded = advantages.unsqueeze(-1) if advantages.dim() == 1 else advantages
    prob_ratio = compute_token_importance_ratios(new_logprobs, old_logprobs, mask)
    
    surr1 = prob_ratio * adv_expanded
    surr2 = torch.clamp(prob_ratio, 1.0 - epsilon, 1.0 + epsilon) * adv_expanded
    
    # 悲观剪裁目标 (PPO-Clip)
    token_loss = -torch.min(surr1, surr2) * mask
    
    # 标准 PPO 常按有效 token 均值做 reduction
    total_tokens = mask.sum().clamp(min=1.0)
    return token_loss.sum() / total_tokens


# ==============================================================================
# 3. GRPO Loss (DeepSeekMath: Shao et al. 2024 / DeepSeek-R1)
# ==============================================================================

def grpo_loss(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    ref_logprobs: torch.Tensor | None,
    advantages: torch.Tensor,
    mask: torch.Tensor,
    epsilon: float = 0.2,
    beta_kl: float = 0.04,
) -> torch.Tensor:
    """GRPO (Group Relative Policy Optimization) 损失函数。
    
    公式 (DeepSeekMath Eq. 3):
        J_GRPO(θ) = E [ (1/G) * sum_{i=1}^G (1/|y_i|) * sum_{t=1}^{|y_i|} {
                        min( r_{i,t} * A_i, clip(r_{i,t}, 1-ε, 1+ε) * A_i ) - β * D_KL(π_θ || π_ref)
                    } ]
    
    相较 PPO 改动:
      1. 去掉 Critic，Advantage A_i 是同 Prompt 组内 G 个采样的标量相对归一化 (Group Advantage)。
      2. 序列内求均值 (1 / |y_i|)，组内求均值 (1 / G) —— 即 Sample-Level 归一化。
      3. 添加了相对参考模型 π_ref 的 Token 级 KL 散度惩罚。
    """
    adv_expanded = advantages.unsqueeze(-1)  # [B, 1]
    prob_ratio = compute_token_importance_ratios(new_logprobs, old_logprobs, mask)
    
    surr1 = prob_ratio * adv_expanded
    surr2 = torch.clamp(prob_ratio, 1.0 - epsilon, 1.0 + epsilon) * adv_expanded
    surrogate_obj = torch.min(surr1, surr2)  # [B, T]
    
    # KL 惩罚: D_KL(π_θ || π_ref) ≈ exp(log π_ref - log π_θ) - (log π_ref - log π_θ) - 1
    if ref_logprobs is not None and beta_kl > 0:
        kl_div = torch.exp(ref_logprobs - new_logprobs) - (ref_logprobs - new_logprobs) - 1.0
        token_obj = (surrogate_obj - beta_kl * kl_div) * mask
    else:
        token_obj = surrogate_obj * mask
    
    # GRPO 原论文的 Sample-Level 归一化: 先求每条序列的平均 Token 目标，再求 Batch 均值
    seq_lengths = mask.sum(dim=-1).clamp(min=1.0)  # [B]
    seq_mean_obj = token_obj.sum(dim=-1) / seq_lengths  # [B]
    
    # 最小化负目标
    return -seq_mean_obj.mean()


# ==============================================================================
# 4. CISPO Loss (MiniMax-M1 2025 / OpenPipe ART 默认)
# ==============================================================================

def cispo_loss(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    advantages: torch.Tensor,
    mask: torch.Tensor,
    epsilon_low: float = 1.0,
    epsilon_high: float = 4.0,
    denominator_floor: float | None = None,
) -> torch.Tensor:
    """CISPO (Clipped Importance Sampling Policy Optimization) 损失函数。
    
    公式 (MiniMax-M1 / ART loss.py):
        L_CISPO(θ) = - (1 / N_denom) * sum_{i,t} [
                        clip( sg(r_{i,t}(θ)), 1-ε_low, 1+ε_high ) * A_i * log π_θ(y_{i,t})
                     ]
    
    相较 PPO/GRPO 的关键区别:
      1. 裁剪对象是【重要性采样权重 r_t.detach()】，而不是裁剪整个 Surrogate 目标。
      2. 带有 stop-gradient (sg/detach) 的裁剪权重作为标量乘在 log π_θ 上：
             ∂/∂θ [ sg(clip(r)) * A * log π_θ ] = clip(r) * A * ∂log π_θ/∂θ
      3. 彻底消除梯度死区：即便探索 Token 概率暴涨 (r >> 1)，梯度方向依然保持且不为 0，
         仅梯度步长被上界限制，非常适合多轮 Agent 与复杂推理链的关键转折 Token。
      4. 默认采用宽非对称截断 (如 [0, 5]，即 ε_low=1.0, ε_high=4.0)。
      5. 支持 Loss Normalization Floor (N_norm 地板分母)，防止超短异常样本引发梯度尖峰。
    """
    adv_expanded = advantages.unsqueeze(-1)  # [B, 1]
    
    # 重要性比值并 detach (仅作为加权系数，不传导自身梯度的微分)
    prob_ratio = compute_token_importance_ratios(new_logprobs, old_logprobs, mask).detach()
    
    # 对权重进行非对称裁剪
    clipped_weight = torch.clamp(prob_ratio, 1.0 - epsilon_low, 1.0 + epsilon_high)
    
    # 损失本质是加权 REINFORCE: -(clipped_IS_weight * Advantage * log_prob)
    token_loss = -(clipped_weight * adv_expanded * new_logprobs) * mask
    
    # 分母归一化
    stock_denom = mask.sum().clamp(min=1.0)
    if denominator_floor is not None:
        effective_denom = max(float(stock_denom.item()), float(denominator_floor))
    else:
        effective_denom = float(stock_denom.item())
        
    return token_loss.sum() / effective_denom


# ==============================================================================
# 5. DAPO Loss & System Concepts (ByteDance/THU 2025, arXiv:2503.14476)
# ==============================================================================

def dapo_loss(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    advantages: torch.Tensor,
    mask: torch.Tensor,
    epsilon_low: float = 0.2,
    epsilon_high: float = 0.28,
) -> torch.Tensor:
    """DAPO (Decoupled Clip and Dynamic Sampling Policy Optimization) Loss 实现。
    
    公式 (DAPO arXiv:2503.14476):
        L_DAPO(θ) = - (1 / sum_i |y_i|) * sum_{i,t} min(
                        r_{i,t} * A_i,
                        clip(r_{i,t}, 1-ε_low, 1+ε_high) * A_i
                    )
    
    DAPO 的 4 大技术支柱 (区分 Loss 级与 System 级):
      1. [Loss 级] Clip-Higher (非对称裁剪): ε_low=0.2, ε_high=0.28 (或更高)。
         放宽上界裁剪阈值，缓解 GRPO 训练推理模型的熵坍塌 (Entropy Collapse)。
      2. [Loss 级] Token-Level Normalization: 弃用 GRPO 的 Sample-Level 平均，
         改用全 Batch 总有效 Token 数作为全局分母，消除了对长 Reasoning 链条中 Token 的隐式欠加权。
      3. [System 级] Dynamic Sampling: 训练 Rollout 阶段过滤全 0/全 1 的零方差 Group 并持续补采
         （见下文 `filter_zero_variance_groups_and_resample` 模拟函数）。
      4. [System 级] Overlong Reward Shaping: 针对超长被截断回答施加渐进惩罚。
    """
    adv_expanded = advantages.unsqueeze(-1)
    prob_ratio = compute_token_importance_ratios(new_logprobs, old_logprobs, mask)
    
    # Clip-Higher 非对称裁剪
    surr1 = prob_ratio * adv_expanded
    surr2 = torch.clamp(prob_ratio, 1.0 - epsilon_low, 1.0 + epsilon_high) * adv_expanded
    surrogate_obj = torch.min(surr1, surr2) * mask
    
    # Token-level 归一化: 全 Batch Token 总数作为唯一分母
    total_tokens = mask.sum().clamp(min=1.0)
    return -(surrogate_obj.sum() / total_tokens)


def dynamic_sampling_filter(
    batch_rewards: list[list[float]],
    min_variance: float = 1e-12,
) -> tuple[list[int], list[int]]:
    """DAPO 系统级特性演示：过滤无学习信号的零方差 Prompt 组。
    
    返回:
        kept_group_indices: 保留的组索引
        dropped_group_indices: 抛弃并需触发重采样的组索引
    """
    kept, dropped = [], []
    for g_idx, r_list in enumerate(batch_rewards):
        r_tensor = torch.tensor(r_list, dtype=torch.float32)
        if r_tensor.numel() < 2 or r_tensor.var(unbiased=False).item() < min_variance:
            dropped.append(g_idx)
        else:
            kept.append(g_idx)
    return kept, dropped


# ==============================================================================
# 6. GSPO Loss (Qwen Team 2025, arXiv:2507.18071)
# ==============================================================================

def gspo_loss(
    new_logprobs: torch.Tensor,
    old_logprobs: torch.Tensor,
    advantages: torch.Tensor,
    mask: torch.Tensor,
    epsilon: float = 0.2,
) -> torch.Tensor:
    """GSPO (Group Sequence Policy Optimization) 损失函数。
    
    公式 (Qwen Team arXiv:2507.18071):
        J_GSPO(θ) = E [ (1/G) * sum_{i=1}^G min( s_i(θ) * A_i, clip(s_i(θ), 1-ε, 1+ε) * A_i ) ]
        其中序列级几何平均比值:
        s_i(θ) = exp( (1 / |y_i|) * sum_{t=1}^{|y_i|} (log π_θ(y_{i,t}) - log π_old(y_{i,t})) )
    
    相较 GRPO 的核心革新:
      1. 粒度对齐：LLM 的奖励是分配给完整序列 (Sequence) 的，GRPO 在 Token 级算比值会导致
         长推理链 (如 4k-8k tokens) 中比值方差累积爆炸，不同 Token 被碎片化裁剪。
      2. GSPO 在 Sequence 级计算几何平均比值 s_i(θ)，整条序列共享统一的标量比值与裁剪状态。
      3. 梯度传导分析:
         ∂s_i(θ)/∂θ = s_i(θ) * (1 / |y_i|) * sum_t ∂log π_θ(y_{i,t})/∂θ
         序列中每个 Token 的梯度严格正比于 (s_i(θ) / |y_i|) * A_i。
      4. 大幅降低 MoE 路由抖动和训练不稳定性。
    """
    # [B] 序列级几何平均重要性比值
    seq_ratios = compute_sequence_geometric_ratios(new_logprobs, old_logprobs, mask)
    
    surr1 = seq_ratios * advantages
    surr2 = torch.clamp(seq_ratios, 1.0 - epsilon, 1.0 + epsilon) * advantages
    
    # 序列级悲观裁剪目标
    seq_objective = torch.min(surr1, surr2)  # [B]
    
    # 组内 / Batch 内序列均值
    return -seq_objective.mean()


# ==============================================================================
# 7. DPO Loss (Rafailov et al. NeurIPS 2023)
# ==============================================================================

def dpo_loss(
    chosen_logprobs: torch.Tensor,
    chosen_ref_logprobs: torch.Tensor,
    chosen_mask: torch.Tensor,
    rejected_logprobs: torch.Tensor,
    rejected_ref_logprobs: torch.Tensor,
    rejected_mask: torch.Tensor,
    beta: float = 0.1,
    label_smoothing: float = 0.0,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """DPO (Direct Preference Optimization) 离线偏好对齐损失函数。
    
    公式 (Rafailov et al. 2023):
        L_DPO(θ; π_ref) = - E_{(x, y_w, y_l)} [
            log σ( β * log(π_θ(y_w|x) / π_ref(y_w|x)) - β * log(π_θ(y_l|x) / π_ref(y_l|x)) )
        ]
    
    本质特征 (非 Policy Gradient 旁支):
      - 无在线 Rollout，无显式 Critic，无 Importance Ratio r_t(θ)。
      - 基于 Bradley-Terry 偏好模型闭式推导出隐式奖励: r_implicit(x, y) = β * log(π_θ(y|x) / π_ref(y|x))。
      - 当模型对胜出回答的偏好相对劣势时，梯度自动大幅增强；反之达到饱和区。
    
    返回:
        loss: 标量损失
        chosen_rewards: [B] 隐式奖励
        rejected_rewards: [B] 隐式奖励
    """
    # 计算胜出与失败回答的全序列对数似然
    pi_chosen_logps = (chosen_logprobs * chosen_mask).sum(dim=-1)      # [B]
    ref_chosen_logps = (chosen_ref_logprobs * chosen_mask).sum(dim=-1)  # [B]
    
    pi_rejected_logps = (rejected_logprobs * rejected_mask).sum(dim=-1)      # [B]
    ref_rejected_logps = (rejected_ref_logprobs * rejected_mask).sum(dim=-1)  # [B]
    
    # 隐式奖励 (Implicit Reward)
    chosen_logratios = pi_chosen_logps - ref_chosen_logps
    rejected_logratios = pi_rejected_logps - ref_rejected_logps
    
    chosen_rewards = beta * chosen_logratios.detach()
    rejected_rewards = beta * rejected_logratios.detach()
    
    # 偏好对数几率 (Logits)
    logits = beta * (chosen_logratios - rejected_logratios)
    
    if label_smoothing > 0:
        # 带标签平滑的二元交叉熵形式
        losses = -F.logsigmoid(logits) * (1 - label_smoothing) - F.logsigmoid(-logits) * label_smoothing
    else:
        losses = -F.logsigmoid(logits)
        
    return losses.mean(), chosen_rewards, rejected_rewards


# ==============================================================================
# 8. 教学与对比运行用例 (Side-by-Side Smoke Demonstrations)
# ==============================================================================

def create_synthetic_pg_batch() -> tuple[BatchData, torch.Tensor]:
    """生成 Policy Gradient 算法所需的合成 Batch 数据。
    
    构建 2 个 Prompt 组，每组 2 条回答 (B=4, T=6):
      Group 0: Prompt 1 (数学题) -> 回答 0 (正确, reward=1.0), 回答 1 (错误, reward=0.0)
      Group 1: Prompt 2 (代码题) -> 回答 2 (正确, reward=1.0), 回答 3 (正确, reward=1.0) -> 演示零方差组!
    """
    B, T = 4, 6
    group_ids = torch.tensor([0, 0, 1, 1], dtype=torch.long)
    rewards = torch.tensor([1.0, 0.0, 1.0, 1.0], dtype=torch.float32)
    
    # 掩码：回答 0 长 4, 回答 1 长 6, 回答 2 长 3, 回答 3 长 5
    assistant_mask = torch.tensor([
        [1, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 0, 0, 0],
        [1, 1, 1, 1, 1, 0],
    ], dtype=torch.float32)
    
    # 采样时的旧 logprob
    old_logprobs = torch.tensor([
        [-0.5, -0.6, -0.4, -0.7, 0.0, 0.0],
        [-0.8, -1.2, -0.9, -1.1, -0.5, -0.6],
        [-0.3, -0.4, -0.5, 0.0, 0.0, 0.0],
        [-0.4, -0.5, -0.6, -0.7, -0.8, 0.0],
    ], dtype=torch.float32)
    
    # 参考模型的 logprob (近似旧策略)
    ref_logprobs = old_logprobs.clone()
    
    # 当前策略的可学习参数 (用于生成 new_logprobs)
    logits_param = old_logprobs.clone().requires_grad_(True)
    
    batch = BatchData(
        group_ids=group_ids,
        rewards=rewards,
        old_logprobs=old_logprobs,
        ref_logprobs=ref_logprobs,
        assistant_mask=assistant_mask,
    )
    return batch, logits_param


def demo_comparison_suite():
    print("=" * 80)
    print("🚀 开始运行 RL 与对齐目标函数 (RL Objectives) 对照测试套件")
    print("=" * 80)
    
    batch, logits = create_synthetic_pg_batch()
    advantages = compute_group_advantages(batch.rewards, batch.group_ids)
    print(f"\n[1] 组相对优势计算 (Group-Relative Advantages):")
    print(f"    Rewards:   {batch.rewards.tolist()}")
    print(f"    Group IDs: {batch.group_ids.tolist()}")
    print(f"    Advantage: {[round(a, 4) for a in advantages.tolist()]}")
    print(f"    👉 注意: Group 1 (最后两个样本) 奖励全为 1.0，组内标准差为 0，优势全为 0.0 (零方差组)！")
    
    # --------------------------------------------------------------------------
    # 1. 梯度死区实验: PPO vs CISPO
    # --------------------------------------------------------------------------
    print("\n" + "-" * 80)
    print("[2] 核心机制实验: PPO-Clip 梯度死区 vs CISPO 持续梯度流")
    print("-" * 80)
    
    # 模拟极端探索场景：某个关键 Token 的新概率大幅增加 (Ratio = 2.5 > 1 + 0.2 = 1.2)
    # 优势 A = +1.0 (正向反馈)
    single_old_lp = torch.tensor([[-2.0]])
    single_new_lp_ppo = torch.tensor([[-1.0]], requires_grad=True)  # Ratio = exp(1.0) ≈ 2.718
    single_new_lp_cispo = torch.tensor([[-1.0]], requires_grad=True)
    single_mask = torch.tensor([[1.0]])
    single_adv = torch.tensor([1.0])
    
    # 计算 PPO Loss 与梯度
    loss_p = ppo_clip_loss(single_new_lp_ppo, single_old_lp, single_adv, single_mask, epsilon=0.2)
    loss_p.backward()
    grad_p = single_new_lp_ppo.grad.item()
    
    # 计算 CISPO Loss 与梯度
    loss_c = cispo_loss(single_new_lp_cispo, single_old_lp, single_adv, single_mask, epsilon_low=1.0, epsilon_high=4.0)
    loss_c.backward()
    grad_c = single_new_lp_cispo.grad.item()
    
    ratio_val = torch.exp(single_new_lp_ppo - single_old_lp).item()
    print(f"  当前 Token Ratio: {ratio_val:.4f} (显著超出 PPO 上界 1.2)")
    print(f"  PPO-Clip Loss: {loss_p.item():.4f}, 产生的梯度: {grad_p:.4f}  <-- 截断为常数，梯度为 0 (进入死区!)")
    print(f"  CISPO Loss:    {loss_c.item():.4f}, 产生的梯度: {grad_c:.4f}  <-- Detached weight 剪裁为 {min(ratio_val, 5.0):.2f}，梯度保持更新!")
    assert abs(grad_p) < 1e-6, "PPO 在超界正优势下梯度必须被截断为 0"
    assert abs(grad_c) > 0.1, "CISPO 在超界时梯度必须保持活跃非零"

    # --------------------------------------------------------------------------
    # 2. Token-level vs Sequence-level 比值: GRPO vs GSPO
    # --------------------------------------------------------------------------
    print("\n" + "-" * 80)
    print("[3] 核心机制实验: GRPO (Token-Level Ratio) vs GSPO (Sequence-Level Ratio)")
    print("-" * 80)
    
    # 构造一条 4-token 序列，有的 token 比值大，有的比值小
    test_old = torch.tensor([[-1.0, -1.0, -1.0, -1.0]])
    # token 0 暴涨 (ratio=2.72), token 1 骤降 (ratio=0.37), token 2/3 不变 (ratio=1.0)
    test_new = torch.tensor([[-0.0, -2.0, -1.0, -1.0]], requires_grad=True)
    test_m = torch.tensor([[1.0, 1.0, 1.0, 1.0]])
    
    token_ratios = compute_token_importance_ratios(test_new, test_old, test_m)
    seq_ratio = compute_sequence_geometric_ratios(test_new, test_old, test_m)
    
    print(f"  Token 级 Ratios (GRPO 视角): {[round(r, 4) for r in token_ratios[0].tolist()]}")
    print(f"    👉 Token 0 会被 Clip (2.718 > 1.2), Token 1 会被 Clip (0.368 < 0.8), 同一条序列内割裂裁剪")
    print(f"  Sequence 级几何平均 Ratio (GSPO 视角): {seq_ratio.item():.4f}")
    print(f"    👉 几何平均后序列整体 Ratio 为 1.0，落在 [0.8, 1.2] 内，整条序列获得平滑、一致的优化步长")
    
    # --------------------------------------------------------------------------
    # 3. 归一化分母实验: GRPO Sample-Level vs DAPO Token-Level
    # --------------------------------------------------------------------------
    print("\n" + "-" * 80)
    print("[4] 核心机制实验: GRPO Sample-Level 均值 vs DAPO 全局 Token-Level 均值")
    print("-" * 80)
    
    loss_grpo = grpo_loss(batch.old_logprobs, batch.old_logprobs, batch.ref_logprobs, advantages, batch.assistant_mask)
    loss_dapo = dapo_loss(batch.old_logprobs, batch.old_logprobs, advantages, batch.assistant_mask)
    print(f"  GRPO Loss (Sample-Level 归一化): {loss_grpo.item():.4f}")
    print(f"  DAPO Loss (Token-Level 全局归一化): {loss_dapo.item():.4f}")

    # --------------------------------------------------------------------------
    # 4. DPO 偏好对齐测试
    # --------------------------------------------------------------------------
    print("\n" + "-" * 80)
    print("[5] 偏好学习实验: DPO (Direct Preference Optimization) 隐式奖励与对数几率")
    print("-" * 80)
    
    B_dpo, T_dpo = 2, 4
    chosen_old = torch.tensor([[-0.5, -0.5, 0.0, 0.0], [-0.8, -0.6, -0.4, 0.0]])
    chosen_ref = chosen_old.clone()
    chosen_mask = torch.tensor([[1, 1, 0, 0], [1, 1, 1, 0]], dtype=torch.float32)
    
    rejected_old = torch.tensor([[-1.5, -1.5, 0.0, 0.0], [-1.2, -1.2, -1.2, 0.0]])
    rejected_ref = rejected_old.clone()
    rejected_mask = torch.tensor([[1, 1, 0, 0], [1, 1, 1, 0]], dtype=torch.float32)
    
    # 训练中的策略参数
    chosen_pi = chosen_old + 0.2  # 胜出回答概率提升
    rejected_pi = rejected_old - 0.2  # 失败回答概率降低
    
    d_loss, c_rew, r_rew = dpo_loss(
        chosen_pi, chosen_ref, chosen_mask,
        rejected_pi, rejected_ref, rejected_mask,
        beta=0.1
    )
    print(f"  DPO Loss: {d_loss.item():.4f}")
    print(f"  Chosen Implicit Rewards:   {[round(r, 4) for r in c_rew.tolist()]}")
    print(f"  Rejected Implicit Rewards: {[round(r, 4) for r in r_rew.tolist()]}")
    assert (c_rew > r_rew).all(), "胜出回答的隐式奖励应当严格大于失败回答"
    
    # --------------------------------------------------------------------------
    # 5. 全算法 Smoke Run 完整性验证
    # --------------------------------------------------------------------------
    print("\n" + "-" * 80)
    print("[6] 全算法数值有限性与可用性 Smoke Run")
    print("-" * 80)
    
    l_reinforce = reinforce_loss(logits, advantages, batch.assistant_mask)
    l_ppo = ppo_clip_loss(logits, batch.old_logprobs, advantages, batch.assistant_mask)
    l_grpo = grpo_loss(logits, batch.old_logprobs, batch.ref_logprobs, advantages, batch.assistant_mask)
    l_cispo = cispo_loss(logits, batch.old_logprobs, advantages, batch.assistant_mask)
    l_dapo = dapo_loss(logits, batch.old_logprobs, advantages, batch.assistant_mask)
    l_gspo = gspo_loss(logits, batch.old_logprobs, advantages, batch.assistant_mask)
    
    print(f"  1. REINFORCE Loss: {l_reinforce.item():.4f}")
    print(f"  2. PPO-Clip  Loss: {l_ppo.item():.4f}")
    print(f"  3. GRPO      Loss: {l_grpo.item():.4f}")
    print(f"  4. CISPO     Loss: {l_cispo.item():.4f}")
    print(f"  5. DAPO      Loss: {l_dapo.item():.4f}")
    print(f"  6. GSPO      Loss: {l_gspo.item():.4f}")
    print(f"  7. DPO       Loss: {d_loss.item():.4f}")
    
    for name, val in [
        ("REINFORCE", l_reinforce),
        ("PPO", l_ppo),
        ("GRPO", l_grpo),
        ("CISPO", l_cispo),
        ("DAPO", l_dapo),
        ("GSPO", l_gspo),
        ("DPO", d_loss),
    ]:
        assert torch.isfinite(val), f"{name} loss 必须为有限数值 (finite number)"
        
    print("\n" + "=" * 80)
    print("✅ 所有 7 种强化学习/偏好对齐损失函数测试全部通过！")
    print("=" * 80)


if __name__ == "__main__":
    demo_comparison_suite()
