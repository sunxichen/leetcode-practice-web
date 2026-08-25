# Follow-up C — RL 泄露隔离、非梯度监控、L1-L3 课程与 N_norm

## 背景

我们已完成 agentic-gov 面试 recap：

- 最终 blog：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/recap-blog.md`
- 配套代码：同目录 `recap-code/`
- 事实底稿：同目录 `fact-base.md`
- 源项目：`/Users/sunxichen/Projects/agentic-gov`
- ART：`/Users/sunxichen/Projects/ART`

你负责 Phase6/RL 相关的四个追问。**不要直接修改 recap-blog.md 或 recap-code/**，只写一个后续 integration 能合并的 patch 文档。

## 你负责回答的问题

1. Phase6 检测到 simulator **只读泄露**后，如何保证它绝对不进入 Reward、不会反过来惩罚 Agent？实际动作是丢单条 trajectory、丢整个 group、标为 monitor-only、重采样，还是其他？沿着真实 data path 追到 reward / `TrainableModel.log` / train 的输入边界，给精确回答。也说明无法“绝对保证”的边界以及如何审计。
2. `10% 非梯度监控预算`是什么？这部分是否只前向、但不反向和 optimizer step？它具体监控什么，如何选取，不计入 reward / loss 的哪个边界？把 budget/monitor/eval/holdout 的概念区分开。
3. recap 缺少课程学习：项目的 L1~L3 三级课程究竟是什么？每级的 task/reward/采样/晋级或 quota 规则是什么？它和已写的 learnability pool / frontloading / variance-aware mixture / SR5 的关系是什么？若项目有多代命名或不同文档冲突，要解释演化，不要强行合并。
4. `N_norm = 2560`如何设定？是统计量、硬件 batch token size、经验 guardrail，还是通过哪些稳定性实验/contract 定下？在什么范围触发、它改变了什么梯度，为什么不会把 KL/entropy 同时缩放？引用真实 loss_norm_floor / notes。明确它的 trade-off。

## 调研要求

先自己核实代码与文档。重点：

- `phase6/art/monitoring.py`、`rollout.py`、`train_grpo.py`、`loss_norm_floor.py`、`learnability_pool*.py`、`scenario_sampler.py`、`rl_task_pool.py`
- `src/agentic_gov/runtime/simulator_leak_monitor.py` 与 reward 相关代码
- Phase6 experiment notes 014/016/020/021/022/023/024/025/026/027/028/029/030/031
- phase6 plans / handoffs / ADRs 含 L1/L2/L3、monitor budget、N_norm 的证据
- ART 的 loss/reduction 路径（如必要）

## 输出（只写一个 patch 文档）

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/review-followups/c-rl-isolation-curriculum-nnorm.md`

结构：

1. `## 直接回答`：四项问题，先给 30 秒面试答案，再给精确 data-flow 说明。
2. `## 事实与出处`：真实路径、函数/类、配置字段、日志/报告中的关键数字。
3. `## 建议插入 recap 的补丁`：按 Ch8/Ch9/Ch10/Ch11 提供可直接粘贴正文；给课程学习一张 ASCII/mermaid 图（仅在确有项目事实支持时）。
4. `## 建议的伪代码补丁`：必要时给短伪代码（真实函数名），特别是 leak exclusion gate 或 loss normalization floor。
5. `## 仍需谨慎的说法`：把实验结论、运行时保障、策略目标明确区分。

## 风格

中文，像资深算法工程师解释真实线上训练管道。不能用“绝对不会”替代真实 gate/审计证据。完成后回复产出路径、每题一句结论、以及是否发现现有 recap 有需要纠正的表述。