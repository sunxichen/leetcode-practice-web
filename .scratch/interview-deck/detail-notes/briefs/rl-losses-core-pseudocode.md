# Follow-up brief：面试手写版 RL Loss 变体图谱（不可运行 Python-style 伪代码）

你刚完成了 `rl-objectives-ppo-grpo-cispo-reinforce-dapo-gspo-dpo.md` 与可运行的 `rl-objectives-losses.py`。用户反馈：可运行代码很完整，但**变体间的核心对比不够突出**。面试中往往要求手写每种方法 loss 的核心，而关键能力是能从一种变体用最小改动推到另一种。

## 输出（只新建这个文件）

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/rl-objectives-core-pseudocode.py`

它必须是 **Python-style 伪代码，刻意不可直接运行**：可以使用抽象 `Tensor`、`mean_by_sequence`、`stop_gradient` 等符号，不要 import torch、不要 mock、不要为可运行性引入数据结构噪声。文件需可作为面试时手写答案的“压缩版模板”。

## 核心写法

1. 文件开头用一个很短的注释图说明共同输入：
   - `new_logp`, `old_logp`, `ref_logp`, `rewards`, `advantages`, `mask`, `group_id`
   - `log_ratio = new_logp - old_logp`，`ratio = exp(log_ratio)`
   - 说明原始 PPO 的 action timestep 在 LLM 中特化成 token timestep
2. 先定义极少量共享 helper 伪代码：
   - `masked_token_mean`
   - `per_sequence_mean`
   - `group_relative_advantage`
   - `sequence_geometric_ratio`
   每个 helper 只有核心 3-8 行，注释说明它改变的是哪个统计粒度。
3. 对每一种方法写一个**20 行以内的核心函数**，但可把公式写得清楚：
   - `reinforce_loss`
   - `ppo_clip_loss`
   - `grpo_loss`
   - `cispo_loss`
   - `dapo_loss`
   - `gspo_loss`
   - `dpo_loss`
4. 每个函数紧邻写 `# 从 X 到 Y，只改这几行：` 的 diff 风格注释：
   - REINFORCE → PPO：增加 old policy ratio 与 `min(rA, clip(r)A)`，说明 clip 为什么可能把梯度置零。
   - PPO → GRPO：去掉 critic/GAE，改为同 prompt group 的 reward z-score；保持原始 GRPO 所采用的 sequence/sample-level 聚合，要精确说明。
   - GRPO → CISPO：`min(...)` 改为 `stop_gradient(clamp(ratio))*advantage*new_logp`；说明为什么 detach 后 clip 不再制造 PPO 式梯度死区。明确这对应 CISPO 的加权 REINFORCE 视角，并把 ART/agentic-gov 作为组合实现单独注释，不能等同为“官方 CISPO 的唯一形式”。
   - GRPO → DAPO：核心 loss 内的非对称 Clip-Higher + global token normalization；`dynamic_sampling_filter` 单列为 **loss 外** 系统步骤，不能假装它是可微 loss 一行。
   - GRPO → GSPO：ratio 由 token ratio 变成 sequence-level geometric-mean ratio，clip 的决策粒度变成整条序列；必须精确表达 loss 如何处理 token logprob/序列聚合。
   - DPO：单独画分界线，强调不共享 online PG batch；用 `chosen/rejected` + `reference` 的 log-sigmoid objective。
5. 末尾提供两个非常短的“面试手写顺序”区块：
   - **在线 RL family 30 秒模板**：从 `new_logp`、`old_logp`、advantage、ratio 到 clip/weight 到 reduction。
   - **最常见的 7 个写错点**：符号正负、对 positive/negative advantage 的 PPO min、old/ref 混淆、mask、zero-variance group、DPO 不是 reward advantage、dynamic sampling 不是 loss。

## 内容边界与准确性

- 沿用专题已研究的一手来源；对不确定之处重新核查论文/官方实现。
- 这是**比可运行代码更短、更可对照**的文件，不要复制 600 行实现，也不要写成长文教程。
- DAPO、GSPO、CISPO 的论文版本/工程实现差异必须在注释中明确，而不是用过度简化的说法掩盖。
- 保留中文注释，语言像资深算法工程师给另一个工程师整理白板答案：直接、准确、无营销/黑话。

完成后回复文件路径，并用 5-8 条 bullet 总结该文件让“对比重点突出”的具体设计。