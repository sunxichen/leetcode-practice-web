# 任务：写白板手写 code 第一批 `code/01_reward_advantage_passk.py`、`code/02_rl_losses_kl_floor.py`、`code/03_rl_pipeline_sync_async.py`

你在为一场 40-60 分钟的简历项目问答面试准备"白板手写 code"材料。要求：面试现场能在白板/纸上默写出来，所以代码必须短、直白、无依赖、每个函数可独立手写。

## 必读（按顺序）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 口径红线与 code Tier 纪律
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — **§三 白板 code 清单**，你负责：
   - 01 文件：C01（Reward 乘法门控）、C02（GRPO group advantage）、C03（pass@k 无偏估计 + 组内方差概率）、C09（沙箱执行 + Golden State diff）、C10（NLI per-message 取 max）、C25（方差感知采样 + 零方差过滤）
   - 02 文件：C04（token-level PPO/GRPO/CISPO loss 带 mask + 分母地板）、C05（advantage 级 KL + disable_adapter 参考 logprob）、C21（DPO loss）、C28（GAE）
   - 03 文件：C06（完整同步 RL 训练 pipeline 伪码）、C07（Async RL 有界陈旧 + 版本租约伪码）、C08（token-diff 校验器）
3. 复用素材（先读，能搬则搬、搬则精简）：
   - `.scratch/interview-deck/detail-notes/rl-objectives-core-pseudocode.py`、`rl-objectives-losses.py`
   - `.scratch/interview-deck/agentic-gov-recap/recap-code/07_rl_rollout_reward.py`、`08_art_grpo.py`、`02_sandbox.py`、`05_sft_training.py`
   - `/Users/sunxichen/Downloads/简历3.0/research/async-rl-investigation.md`（C07 用）

## 硬性要求
1. 每个函数头部三行注释：`# 考察点: ...` / `# 手写量级: N 行 / M 分钟` / `# 常见追问: ...`。
2. 代码即白板风格：变量名直白（rewards, group, mask），关键行尾注公式（如 `# A = (R - mean) / (std + eps)`）；CISPO 必须体现 `clip(ratio).detach() * A * logp` 的"ratio 作权重、梯度不截断"特征；分母地板 `max(mask_sum, N_norm)`。
3. 无第三方依赖：只用 Python 标准库（math/random/statistics）。loss 类用纯 list/float 实现（不 import torch/numpy），保证任何环境能跑。
4. 每个文件带 `if __name__ == "__main__":` 小测试（断言关键性质，如 advantage 组均值为 0、门控缺失即 0、pass@k 边界 n==c 等），写完必须实际运行 `python3 <file>` 验证全部通过。
5. 口径：C07 注释里写明"Merged 单份权重下多轮在途请求旧版本 adapter 404 是机制冲突非陈旧度问题"；禁词：转段、管线、训服分离。
6. 中文注释，术语保留英文。

## 输出
- `.scratch/interview-deck/resume-v3.1-qa/code/01_reward_advantage_passk.py`
- `.scratch/interview-deck/resume-v3.1-qa/code/02_rl_losses_kl_floor.py`
- `.scratch/interview-deck/resume-v3.1-qa/code/03_rl_pipeline_sync_async.py`

完成后回复：3 个文件路径 + 每个文件行数 + 每个 __main__ 的运行结果（粘贴最后几行输出）+ 覆盖 code 编号清单。
