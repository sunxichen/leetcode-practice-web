# Related Work 备查笔记：DeepSeek-R1 / DAPO / CISPO

> 用途：面试回答"你的 Agentic RL 项目和 R1 / DAPO 什么关系"。只记一手论文（arXiv 原文）事实 + 口径核对。
> 项目一句话：政务对话办事场景，Qwen3-4B + LoRA（双 4090），GRPO 风格组内相对优势 + ART 框架 token-level CISPO loss，K=8 组内采样，任务可学性筛选。

## 1. DeepSeek-R1（arXiv:2501.12948）

**GRPO 的出处与原始表述**
- GRPO 不是 R1 原创：R1 v1 §2.2.1 原文 "we adopt Group Relative Policy Optimization (GRPO) [Shao et al., 2024]"；v1 参考文献表中 Shao et al. 2024 = DeepSeekMath（arXiv:2402.03300）。
- v2（Nature 版）§2.1 同样在 GRPO 处给出引用（ref. 64），且 v2 贡献说明写明 "Junxiao Song proposed the GRPO algorithm"。
- 无 critic 的原始描述（v1 §2.2.1）：GRPO "foregoes the critic model that is typically the same size as the policy model, and estimates the baseline from group scores instead"（省掉与策略模型同大的 critic，改用组内分数估计基线）。
- 组内相对优势（v1 §2.2.1 Eq.3；v2 §2.1 Eq.3）：每题从旧策略采 G 个输出 {o1..oG}，A_i = (r_i − mean(r)) / std(r)；目标函数为 PPO 式 min-clip + KL 罚（Eq.1）。
- v2 §2.1 另一处表述：GRPO "originally proposed to simplify the training process and reduce the resource consumption of PPO"。

**R1 训练要点（备查数字）**
- R1-Zero：DeepSeek-V3-Base 上纯 RL、无 SFT；rule-based 奖励 = 准确率奖励 + 格式奖励（v1 §2.2.2），明确不用神经奖励模型（怕 reward hacking、省资源）。
- 采样配置（v2 §2.1）：每题 G=16 个输出，每步 32 题 → batch 512；KL 系数 0.001；rollout 温度 1。
- R1 多阶段管线：冷启动 SFT → 推理导向 RL → 拒绝采样 + SFT → 全场景 RL（v1 §2.3；v2 §3）。

## 2. DAPO（arXiv:2503.14476）

- 定位：全开源大规模 RL 系统（基于 verl），Qwen2.5-32B base → AIME 2024 50 分，超过 DeepSeek-R1-Zero-Qwen-32B 的 47 分且只用 50% 训练步数（摘要、§1、Fig.1）。
- 对 GRPO 的回顾（§2.2）：GRPO 去掉 value function、用组内归一化奖励估计优势；并明确指出 GRPO 是 sample-level loss（先在序列内对 token 平均、再跨样本平均）。

**四个关键技术（§1 列举，§3 详述）**
1. Clip-Higher（§3.1）：把单一 clip ε 解耦为 ε_low / ε_high，抬高上界，避免低概率"探索" token 概率被压住，治熵塌缩（entropy collapse）；§4.1 设 ε_low=0.2、ε_high=0.28。
2. Dynamic Sampling（§3.2）：动机——某 prompt 组内全对或全错时组内优势全零 → 零梯度，随训练推进有效 prompt 越来越少。做法——过采样并过滤 accuracy=1 和 0 的 prompt，"keep sampling until the batch is fully filled with samples whose accuracy is neither 0 nor 1"；目标函数加约束 0 < |{答对的输出}| < G（Eq.8/11）；Algorithm 1 用 dynamic sampling buffer，攒够 N 条才训练。
3. Token-Level Policy Gradient Loss（§3.3）：把 sample-level 归一改为按 batch 总 token 数归一（1/Σ|o_i|，Eq.12），长回复的 token 贡献不再被稀释，超长样本中的乱码/重复等低质模式能被有效惩罚。
4. Overlong Reward Shaping（§3.4）：先验证 Overlong Filtering（屏蔽截断样本的 loss）能稳训练，再提 Soft Overlong Punishment（超过预期长度后进入惩罚区间、越长罚越多）；§4.1：预期最大 16,384 + 4,096 soft punish cache → 生成上限 20,480。
- 其他：去掉 KL 项（§2.3，长 CoT 场景分布本就会远离初始模型）；rule-based 奖励 ±1（§2.4 Eq.7）。
- 消融（§4.2 表）：naive GRPO 30 → +Clip-Higher 38 → +Soft Overlong Punishment 41 → +Token-level Loss 42 → +Dynamic Sampling = DAPO 50（AIME 2024）。

## 3. CISPO 出处（既不是 R1 也不是 DAPO）

- CISPO（Clipped IS-weight Policy Optimization）出自 MiniMax-M1（arXiv:2506.13585）§3.1；摘要原文："CISPO clips importance sampling weights rather than token updates"。
- 机制（§3.1 Eq.4/5）：不用 PPO/GRPO 的 min-clip 裁 token 更新，改为裁剪重要性采样权重 r̂ = clip(r, 1−ε_low^IS, 1+ε_high^IS) 并 stop-gradient，作为 REINFORCE 式 log π 项的系数；所有 token 都保留梯度贡献（不丢 token）。
- 动机（§3.1）：低概率"分叉" token（However/Wait/Aha 等反思词）在首次 on-policy 更新后就被 clip 出局；DAPO 的 Clip-Higher 在他们 16 轮 off-policy 更新的设置下仍不够。
- 关键事实（§3.1 原文）：CISPO "adopting the group relative advantage from GRPO and the token-level loss (Yu et al., 2025 [即 DAPO])"——即 CISPO 本身就 = GRPO 组内相对优势 + DAPO 式 token-level 归一 + IS 权重裁剪；M1 还直接借用 DAPO 的 dynamic sampling 和 length penalty，且同样无 KL 项。
- 效果（§3.1 / Fig.2）：Qwen2.5-32B 控制实验，CISPO 用 50% 训练步数追平 DAPO。
- 与 ART 的关系：ART（OpenPipe Agent Reinforcement Trainer）官方文档/README 自述为 GRPO 框架（"train multi-step agents ... using GRPO"），公开文档未直接提及 CISPO；本项目"ART 实际优化 token-level CISPO loss"属框架实现层面事实，以所用 ART 版本代码为准，面试时说"框架实现层面"即可。

## 4. 口径核对（你的两个说法 vs 原文）

- ✅ "算法上复用 DeepSeek-R1 路线的组内相对优势思路"：与原文吻合。更精确的说法：组内相对优势 + 无 critic 是 GRPO 的设计，GRPO 出自 DeepSeekMath（arXiv:2402.03300），R1 沿用并带火；答"复用 GRPO（R1 路线）的组内相对优势"最稳。
- ✅ "框架实际优化的 loss 是 CISPO"：与原文不冲突且自洽——CISPO 论文自己就声明采用 GRPO 组内优势 + DAPO token-level loss（M1 §3.1），所以"GRPO 风格组内相对优势 + token-level CISPO loss"正是 CISPO 的标准组合。注意把出处说对：CISPO 来自 MiniMax-M1，不是 R1/DAPO。
- ✅ "数据筛选与 DAPO 动态采样同向但不是复现"：准确。同向点：都是剔除组内奖励全同（全对/全错）→ 零优势的样本（DAPO §3.2）。差异点：DAPO 是训练循环内在线过采样、buffer 填满才更新（Algorithm 1）；本项目目前是采样前的任务可学性筛选（rollout 侧/离线），训练中动态重采仍是计划——照实说即可。
- ⚠️ 防混：DAPO 的 "Token-Level Policy Gradient Loss"（loss 归一粒度，DAPO §3.3）与 CISPO 的 token-level IS 权重裁剪（裁剪对象，M1 §3.1）是两个正交改动，CISPO 同时采用了两者；面试别把两个 "token-level" 当成同一个东西。
- ⚠️ 细节：R1 的 GRPO 带 KL 罚（β=0.001，v2 §2.1）；DAPO、CISPO 都去掉了 KL。组大小 R1-Zero / DAPO 均为 G=16，本项目 K=8 是同思路的小规模实例。
