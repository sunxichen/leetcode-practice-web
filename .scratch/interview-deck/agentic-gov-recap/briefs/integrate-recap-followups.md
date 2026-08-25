# Integration brief：将已验收的追问补丁合入 agentic-gov recap

## 背景

已完成的 agentic-gov recap 位于：

- Blog：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/recap-blog.md`
- 伪代码：同目录 `recap-code/`

用户阅读后提出 12 个深挖问题。三个独立调研 worker 已分别产出**经过 orchestrator 初验的事实补丁**：

- `review-followups/a-task-faults-prompts-mask.md`
- `review-followups/b-sft-quality-eval-token-skew.md`
- `review-followups/c-rl-isolation-curriculum-nnorm.md`

你是一个**全新上下文的 integration writer**。你的工作不是重新研究全部项目，也不是写新专题；而是通读 recap 和三个 patch、核实其引用的关键源文件后，将内容有选择地、无重复地合入 recap blog 与必要的 recap-code 文件。

## 必须回答并落入 recap 的问题

1. 错误注入的规则、CanonicalTask/golden reference 与 Agent 自由探索的关系；异常码触发时机如何既有预设覆盖、又不限制 action trace。
2. Agent/User Teacher、Agent SFT、Simulator SFT 的最小脱敏 prompt / input 结构和信息边界。
3. L3 Tagger 的真实用途（后验行为画像、采样/coverage/审计），避免和漏斗同名 L3 entity verifier 混淆。
4. family-level split 的两个具体例子、泄漏风险。
5. SFT 以及链路可复用评估指标的公式、分母、样本单位；不要堆无项目证据的指标。
6. token skew / hard violation 68.75% 的定义、因果机制、为什么不是“模型语义过拟合”简单解释。
7. Agent SFT 与 Simulator SFT 的 mask history 差别/为什么 Simulator 更严重。
8. Phase6 simulator 只读泄露如何在 reward/train 输入前隔离；10% 非梯度监控预算的真实边界。
9. L1-L3 课程学习与已写 learnability pool/frontloading/SR5 的关系。
10. `N_norm = 2560` 的实验性设定、policy-only floor、tradeoff。

## 写法和范围

- **不要**把三个 patch 原样全文粘贴。合并为现有章节中必要的增补，保持 blog 的 `All-in / Hands-on` 风格、中文平实表达、逻辑流水线主线。
- 不要膨胀成第二本百科：正文新增优先放在既有 Ch1/2/3/4/5/6/8/9/10/11 的相关位置；每处尽量 1-4 段 + 必要的小表/公式/样例。
- `hard violation`、`L3`、`monitor-only`、`leak exclusion` 等术语首次出现必须短定义。
- 任何“绝对隔离/保证”只能写成项目真实的 gate、fail-closed、train-input boundary、audit 机制；保留 patch 中的谨慎边界，不能做理论上无条件的保证。
- 保留项目真实函数名、路径和数值；如果 patch 与源代码/原 recap 矛盾，优先查 `/Users/sunxichen/Projects/agentic-gov` 源码后再决定，并在回复中报告。

## Pseudocode 修改

只有当正文新增内容需要实际代码锚点时才修改 `recap-code/`。优先合并 patch 中建议的短伪代码，且：

- 函数名必须真实存在；Python 语法合法（仍是不可运行的 explanatory pseudocode）
- 不要复制不必要的辅助类型/配置
- 不允许破坏现有 8 个文件的 `py_compile` 通过状态

预期重点：`01_task_design.py` / `02_sandbox.py`（fault contract）和 `07_rl_rollout_reward.py` / `08_art_grpo.py`（leak gate / normalization floor），但根据已有代码内容避免重复。

## 验收

完成后：

1. 对 recap-blog.md 做结构检查，确认 Ch0-Ch12 都还在、12 个原决策插叙仍存在。
2. 对所有 `recap-code/*.py` 跑 `python3 -m py_compile`。
3. 在回复中给一个“问题 → blog 新增位置”映射表，并列修改的代码文件、未合入内容及原因。
4. 不修改 detail-notes 的两篇新专题或三个 patch 文档。

## 输入文件（必须先读）

- `spec-recap-blog.md`
- `fact-base.md`
- `recap-blog.md`
- `recap-code/` 全部文件（至少理解相关文件）
- `review-followups/a-task-faults-prompts-mask.md`
- `review-followups/b-sft-quality-eval-token-skew.md`
- `review-followups/c-rl-isolation-curriculum-nnorm.md`

完成后回复修改文件列表、问题映射、验证命令结果、发现的矛盾/保留项。