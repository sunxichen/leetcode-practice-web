"""面试手写版：RL & Alignment Loss 变体极简核心伪代码 (Whiteboard / Interview Template)

【定位说明】：
本文件为面试手写与白板推导设计的【极简 Python-style 伪代码】（刻意不可直接运行）。
剥离了分布式通信、PackedTensors 拼包、KV 缓存及 PyTorch 样板工程细节，
聚焦于 7 种核心方法之间【最小 Diff】的数学与代码演进。

================================================================================
【Advantage Pipeline 全景数据流图】(层 A: 生产 Advantage -> 层 B: 消费 Advantage)：
  - PPO:      rewards + critic_values -> GAE 逐步递推 -> advantages [B, T] -> PPO loss
  - GRPO:     grouped trajectory rewards -> group z-score -> advantages [B] -> 广播 -> GRPO loss
  - DAPO:     复用 GRPO-style 组优势 + 系统外围 Dynamic Sampling 过滤 -> DAPO loss
  - GSPO:     复用 GRPO-style 组优势 -> 结合 sequence_geometric_ratio -> GSPO loss
  - CISPO:    本体可消费任意 A (Critic/MC/Group) -> CISPO loss; agentic-gov 配方中喂 GRPO 组优势
  - DPO:      离线偏好对 (chosen/rejected) -> DPO loss (无在线 Reward 与 Advantage)
================================================================================
【统一输入约定】（Online Policy Gradient 算法家族共享输入）：
  - new_logp:   [B, T]  当前策略在新参数下的对数概率 log π_θ(y_t | x, y_<t) (有梯度)
  - old_logp:   [B, T]  采样时旧策略对数概率 log π_old(y_t | x, y_<t) (无梯度/冻结)
  - ref_logp:   [B, T]  SFT 参考模型对数概率 log π_ref(y_t | x, y_<t) (无梯度/冻结)
  - rewards:    [B] 或 [B, T] 标量结果奖励或逐步奖励 (用于层 A 生成 Advantage)
  - advantages: [B] 或 [B, T] 层 A 产出的优势估计张量 (无梯度输入给层 B)
  - mask:       [B, T]  有效 Assistant Response Token 掩码 (1=有效, 0=Prompt/Pad)
  - group_id:   [B]     同 Prompt 采样的组索引 (用于 GRPO 组内统计)
  
  * 注：\pi_θ(y_t) 的工程获取链路：
    logits = model(input_ids)               # [B, N, V] 最后一层 LM Head 词表投影
    shift_logits = logits[:, :-1, :]        # [B, N-1, V] 因果时序错位对齐
    shift_labels = input_ids[:, 1:]         # [B, N-1] 实际目标 Token ID
    token_logp = log_softmax(shift_logits, dim=-1).gather(dim=-1, index=shift_labels)
    new_logp = token_logp * mask            # [B, T] 提取实际生成 Token 的对数似然 (保留梯度)
================================================================================
"""


# ==============================================================================
# 0. 五个极简通用 Helper（层 A 优势生产 与 层 B 统计归一化）
# ==============================================================================

# ----------------- 【层 A：Advantage 生产管道 Helper】 -----------------

def gae_advantage(step_rewards, critic_values, mask, gamma=1.0, lam=0.95):
    """【层 A: GAE 优势计算 (PPO 经典上游)】：基于 Critic 状态价值 V(s) 反向递推 TD 残差"""
    # step_rewards: [B, T] 逐步奖励 (末尾为 Outcome Reward, 中间可包含 KL 惩罚)
    # critic_values: [B, T+1] Critic 估计的 V(s_t), 末尾为终止状态价值 (通常为 0)
    T = critic_values.shape[1] - 1
    advantages = zeros_like(step_rewards)
    last_gae = 0.0
    for t in reversed(range(T)):
        next_val = critic_values[:, t + 1]
        delta = step_rewards[:, t] + gamma * next_val * mask[:, t] - critic_values[:, t]
        last_gae = delta + gamma * lam * last_gae * mask[:, t]
        advantages[:, t] = last_gae
    return stop_gradient(advantages)             # [B, T] 逐步 GAE 优势 (无梯度)


def group_relative_advantage(rewards, group_id):
    """【层 A: 组相对优势计算 (GRPO / DAPO / GSPO 标配)】：同 Prompt 组内做 z-score"""
    # rewards: [B] 序列级标量奖励; 若 std == 0 (全对或全错零方差组)，显式置 0
    mu = group_mean(rewards, by=group_id)
    std = group_std(rewards, by=group_id)
    return (rewards - mu) / (std + 1e-8)         # [B] 标量组相对优势 (广播至整条序列)


# ----------------- 【层 B：Policy Loss 消费管道 Helper】 -----------------

def masked_token_mean(tensor, mask):
    """【全局 Token 级归一化】：全 Batch 有效 Token 总数作为唯二分母 (DAPO / CISPO)"""
    return sum(tensor * mask) / (sum(mask) + 1e-8)


def per_sequence_mean(token_tensor, mask):
    """【样本级归一化】：先求每条序列的 Token 均值，再求 Batch 序列均值 (原始 GRPO)"""
    seq_len = sum(mask, dim=-1)                   # [B] 每条序列有效长度
    seq_mean = sum(token_tensor * mask, dim=-1) / seq_len  # [B]
    return mean(seq_mean)                        # 标量


def sequence_geometric_ratio(new_logp, old_logp, mask):
    """【序列级几何平均比值】：整条回答共享一个标量 Ratio (GSPO 核心)"""
    # s_i = ( π_θ(y_i|x) / π_old(y_i|x) )^(1 / |y_i|) = exp( 1/|y_i| * sum_t (new - old) )
    seq_len = sum(mask, dim=-1)
    mean_log_diff = sum((new_logp - old_logp) * mask, dim=-1) / seq_len
    return exp(mean_log_diff)                    # [B] 序列级标量比值


# ==============================================================================
# 1. REINFORCE (Williams 1992) —— Policy Gradient 原始基石
# ==============================================================================

def reinforce_loss(new_logp, advantages, mask):
    """
    公式: L = - E [ sum_t log π_θ(y_t) * A ]
    特点: 无 Ratio (纯 On-policy 单步更新), 轨迹全量 Monte Carlo 收益 A = R - b(x), 方差极大。
    """
    seq_logp = sum(new_logp * mask, dim=-1)      # [B] 序列对数概率总和
    return -mean(advantages * seq_logp)          # 标量损失


# ==============================================================================
# 2. PPO-Clip (Schulman et al. 2017) —— 引入重要性采样与悲观剪裁
# ==============================================================================

# 从 REINFORCE 到 PPO，只改这几行：
#   + 层 A 优势管道：典型由 Critic 配合 GAE 产生 advantages [B, T] (gae_advantage)
#   + 引入旧策略比值 ratio = exp(new_logp - old_logp) 支持同一批数据多 Epoch 更新
#   + 增加悲观剪裁 min(ratio * A, clip(ratio, 1-eps, 1+eps) * A) 限制步长
#   * 注意：当 ratio > 1+eps 且 A > 0 时，目标被截断为常数，导数为 0（产生梯度死区！）

def ppo_clip_loss(new_logp, old_logp, advantages, mask, eps=0.2):
    # advantages 来自上游 gae_advantage(...) 或广播标量
    ratio = exp(new_logp - old_logp)             # [B, T] Token 级重要性比值
    surr1 = ratio * advantages
    surr2 = clip(ratio, 1.0 - eps, 1.0 + eps) * advantages
    
    token_loss = -min(surr1, surr2)              # PPO 悲观剪裁目标
    return masked_token_mean(token_loss, mask)


# ==============================================================================
# 3. GRPO (DeepSeekMath 2024 / DeepSeek-R1) —— 废除 Critic 的组相对优化
# ==============================================================================

# 从 PPO 到 GRPO，只改这几行：
#   - 彻底废除 Critic 网络与 GAE
#   + 层 A 优势管道：同 Prompt 采样 G 条回答计算组内 z-score 相对分数：
#     adv = group_relative_advantage(rewards, group_id)
#   + 增加参考模型 KL 散度惩罚：beta * (exp(ref - new) - (ref - new) - 1)
#   * 注意：原始 GRPO 采用 per_sequence_mean 归一化（先序列均值再组均值），会隐式欠加权长序列 Token

def grpo_loss(new_logp, old_logp, ref_logp, rewards, group_id, mask, eps=0.2, beta=0.04):
    adv = group_relative_advantage(rewards, group_id) # [B] 标量组相对优势
    ratio = exp(new_logp - old_logp)                  # [B, T]
    
    surr = min(ratio * adv, clip(ratio, 1.0 - eps, 1.0 + eps) * adv)
    kl_div = exp(ref_logp - new_logp) - (ref_logp - new_logp) - 1.0  # Schulman KL 估计
    
    token_obj = surr - beta * kl_div
    return -per_sequence_mean(token_obj, mask)        # 负号：最大化目标转为最小化损失


# ==============================================================================
# 4. CISPO (MiniMax-M1 2025 / OpenPipe ART 默认) —— 剪裁 Detached 权重消灭死区
# ==============================================================================

# 从 GRPO 到 CISPO，只改这几行：
#   - 放弃对整个 Objective 进行 min(...) 剪裁
#   + 将剪裁移至【重要性采样权重】，并执行 stop_gradient (.detach())：
#     is_weight = stop_gradient(clip(ratio, 1 - eps_low, 1 + eps_high))
#   + 损失回归加权 REINFORCE 形式：- is_weight * advantage * new_logp
#   * 为什么彻底消除死区：∂/∂θ [ stop_gradient(clip(ratio)) * A * log π ] = clip(ratio) * A * ∂log π/∂θ
#     即使 ratio 突破上界 (如 ratio=5.0)，梯度依然非零且保持优化方向，仅幅度被上界约束！
#   * 【Advantage 边界解耦】：
#     - CISPO 算法本体：消费任意合法 advantages (GAE / MC / Group Advantage 均可)
#     - OpenPipe ART / agentic-gov 落地配方：
#       adv = group_relative_advantage(rewards, group_id) -> cispo_loss(..., adv, ...)

def cispo_loss(new_logp, old_logp, advantages, mask, eps_low=1.0, eps_high=4.0):
    ratio = exp(new_logp - old_logp)
    # 裁剪 Detached 权重，默认宽非对称截断 [0, 5]
    clipped_weight = stop_gradient(clip(ratio, 1.0 - eps_low, 1.0 + eps_high))
    
    token_loss = -clipped_weight * advantages * new_logp
    return masked_token_mean(token_loss, mask)


# ==============================================================================
# 5. DAPO (ByteDance / THU 2025) —— 非对称 Clip-Higher 与全局 Token 分母
# ==============================================================================

# 从 GRPO 到 DAPO，只改这几行：
#   * 层 A 优势管道：在原论文 group-RL 配方中仍复用 GRPO 的 group_relative_advantage
#   1. [Loss 级] Clip-Higher 非对称裁剪：eps_high(0.28) > eps_low(0.20)，延缓熵坍塌
#   2. [Loss 级] Token-Level 归一化：改用 masked_token_mean，平等对待长短 CoT 中的每个 Token
#   3. [System 级 (非 Loss 行)] Dynamic Sampling：在 Rollout 层过滤全 0/全 1 的零方差组并持续补采

def dapo_loss(new_logp, old_logp, advantages, mask, eps_low=0.2, eps_high=0.28):
    ratio = exp(new_logp - old_logp)
    # 非对称悲观剪裁 (Clip-Higher)
    surr = min(ratio * advantages, clip(ratio, 1.0 - eps_low, 1.0 + eps_high) * advantages)
    # 全局 Token 级归一化 (区分于 GRPO 的 per_sequence_mean)
    return -masked_token_mean(surr, mask)


# 【DAPO 系统的外围步骤（不能写进 Loss 可微图）】：
def dynamic_sampling_step(prompts, policy, group_size_G):
    # 采样 G 条轨迹 -> 计算奖励方差 -> 若方差 == 0 则丢弃该组并重新采样 -> 直到填满 Batch
    pass


# ==============================================================================
# 6. GSPO (Qwen Team 2025) —— 序列级几何平均比值与整序列统一剪裁
# ==============================================================================

# 从 GRPO 到 GSPO，只改这几行：
#   * 层 A 优势管道：在原论文 group-RL 配方中仍复用 GRPO 的 group_relative_advantage
#   - 放弃在每个 Token 上计算独立 ratio 与独立 clip (避免 4k 序列比值方差累积爆炸)
#   + 将 Ratio 升维为【序列级几何平均比值】：seq_ratio = sequence_geometric_ratio(...)
#   + 整条序列共享统一的剪裁决策：min(seq_ratio * A, clip(seq_ratio) * A)
#   * 梯度传导：∂seq_ratio/∂θ = seq_ratio * (1/|y|) * sum_t ∂new_logp_t/∂θ
#     整条序列的所有 Token 同步、等比例更新，根除 Token 间方差撕裂与 MoE 路由抖动。

def gspo_loss(new_logp, old_logp, advantages, mask, eps=0.2):
    seq_ratio = sequence_geometric_ratio(new_logp, old_logp, mask)  # [B] 序列级几何比值
    
    surr1 = seq_ratio * advantages                                  # [B]
    surr2 = clip(seq_ratio, 1.0 - eps, 1.0 + eps) * advantages     # [B]
    seq_obj = min(surr1, surr2)                                     # [B]
    return -mean(seq_obj)


# ==============================================================================
# 7. DPO (Rafailov et al. NeurIPS 2023) —— 离线成对偏好学习（独立范式）
# ==============================================================================
# ------------------------------------------------------------------------------
# ⚠️ 注意范式分界线：DPO 不属于 Policy Gradient，不共享上述在线 Rollout Batch！
# 输入数据为成对离线偏好对 (x, y_w, y_l)，无在线 ratio，无显式优势基线 A。
# ------------------------------------------------------------------------------

def dpo_loss(pi_chosen_logp, pi_rejected_logp, ref_chosen_logp, ref_rejected_logp,
             chosen_mask, rejected_mask, beta=0.1):
    """
    公式: L = - E [ log σ( β * log(π_θ(y_w)/π_ref(y_w)) - β * log(π_θ(y_l)/π_ref(y_l)) ) ]
    原理: 基于 Bradley-Terry 模型反解出隐式奖励 r_implicit = β * (log π_θ - log π_ref)
    """
    # 计算胜出与失败回答的全序列 Log-Likelihood
    pi_cw_sum  = sum(pi_chosen_logp * chosen_mask, dim=-1)        # [B]
    ref_cw_sum = sum(ref_chosen_logp * chosen_mask, dim=-1)       # [B]
    pi_rl_sum  = sum(pi_rejected_logp * rejected_mask, dim=-1)    # [B]
    ref_rl_sum = sum(ref_rejected_logp * rejected_mask, dim=-1)   # [B]
    
    # 隐式奖励差值 (Implicit Reward Margin Logits)
    logits = beta * ((pi_cw_sum - ref_cw_sum) - (pi_rl_sum - ref_rl_sum))
    return -mean(log(sigmoid(logits)))


# ==============================================================================
# 8. 面试手写 30 秒通用模板 (Online PG Family)
# ==============================================================================
"""
【30 秒在线强化学习白板骨架】：
```python
def general_llm_rl_step(new_logp, old_logp, rewards, group_id, mask):
    # 1. 优势计算 (层 A 管道: 以 Group Advantage 为例)
    adv = (rewards - group_mean(rewards, group_id)) / (group_std(rewards, group_id) + 1e-8)
    
    # 2. 比值与截断核心 (层 B 消费: 依算法二选一/三选一):
    #   - PPO/GRPO/DAPO: ratio = exp(new - old); obj = min(r*A, clip(r)*A)
    #   - CISPO:        ratio = exp(new - old); obj = stop_gradient(clip(r)) * A * new_logp
    #   - GSPO:         s = exp(mean(new - old)); obj = min(s*A, clip(s)*A)
    
    # 3. 分母归一化 (依算法二选一):
    #   - Token-Level (DAPO/CISPO): sum(obj * mask) / sum(mask)
    #   - Sample-Level (GRPO):      mean( sum(obj * mask, dim=-1) / sum(mask, dim=-1) )
    return -loss
```
"""


# ==============================================================================
# 9. 面试中最常写错的 7 个陷阱点 (Bug Checklist)
# ==============================================================================
"""
1. 【Loss 符号反了】：
   策略梯度理论是【最大化】收益 Objective J(θ)；但深度学习优化器默认做【梯度下降】，代码必须返回 -J(θ)。
2. 【PPO min 截断写错】：
   必须是 min(ratio * A, clip(ratio) * A)；不能写成 max 或直接 clip(ratio * A)。
3. 【混淆 old_logp 与 ref_logp】：
   - old_logp: 采样行为策略 (用于重要性采样比值 ratio = exp(new - old)，更新策略参数时必须固定)。
   - ref_logp: 初始 SFT 参考模型 (用于 KL 惩罚约束漂移，全训练过程始终冻结不变)。
4. 【Mask 与分母除法位置】：
   - 必须在序列对数似然累加前乘以 Mask；
   - 分母必须是 sum(mask)（实际有效 Token 数），不能除以张量的固定最大长度 T（Pad 会稀释梯度）。
5. 【零方差组除以 0】：
   当组内全对 (R=[1,1]) 或全错 (R=[0,0]) 时，std=0。必须加上 eps 或判断 std < 1e-7 时显式置 advantage = 0。
6. 【DPO 误用 Advantage / 误求比值】：
   DPO 是纯离线损失，不包含任何在线 ratio 或 advantage，核心是隐式奖励差送入 log(sigmoid(...))。
7. 【把 Dynamic Sampling 塞进 Loss】：
   Dynamic Sampling 是 Rollout 阶段的重采样/过滤调度，属于外部系统工程逻辑，不可写进可导 Loss 函数。
"""
