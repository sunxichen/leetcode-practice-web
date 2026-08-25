# Follow-up A — 任务剧本、故障注入、自由探索、Prompt 样例与 Simulator Mask

## 背景

我们已完成 agentic-gov 面试 recap：

- 最终 blog：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/recap-blog.md`
- 配套代码：同目录 `recap-code/`
- 事实底稿：同目录 `fact-base.md`
- 源项目：`/Users/sunxichen/Projects/agentic-gov`

项目是公积金政务 agent 的 task factory → sandbox → SFT synthesis/filtering → Agent/Simulator SFT → ART GRPO RL 全链路。用户读完 recap 后有以下追问，要求补到 recap 中。你负责回答并设计精确的补丁，但**不要直接修改 recap-blog.md 或 recap-code/**，以免与并发 writer 冲突。

## 你负责回答的问题

1. 为训练 Agent 的错误恢复能力，错误/故障信息按什么规则注入？是否也由 CanonicalTask 的剧本规定？
2. 先用预设剧本得到 golden final state，但 SFT synthesis/replay filtering/RL 是否不限制 Agent API 执行顺序或次数？异常状态码若没有在预期时间点抛出，会不会无法达到预设“异常→自愈”分支效果？解释“预设异常”与 Agent 自由探索之间真正的契约、是否存在张力、如何解决。
3. 给 Agent SFT、Simulator SFT、合成数据时 Agent/User Teacher prompt 各给一个**最小、真实结构的脱敏例子**。不要整段复制超长模板；必须标明它来自哪份真实 template/config，并说明每个 prompt 可见的信息边界。
4. Simulator SFT 做了 mask history：Agent SFT 是否也会有同类问题？为什么在 Simulator 侧更关键/如何处理？不要凭空断言，核查 Phase3/4 真实数据转换与 loss mask 实现。

## 调研要求

先自己通读、grep 和交叉核实。重点找：

- `src/agentic_gov/sandbox/`、`schemas/`、`task_factory/`、`task_loader.py`
- golden chain / error injection / failure DSL / scenario 相关实现和 tests
- `src/agentic_gov/synthesis/`、`phase2/prompt_templates/`
- `phase3/`、`phase4/` 的 dataset conversion、template、mask、监控与 experiment notes 001/004/013 等
- `research-proposal/phase1-sandbox-environment.md`、phase2 specs、相关 ADR / handoff

要分清：
- task 的 **oracle/golden reference** 是什么；
- sandbox 对 API 行为的 **contract / precondition / state transition** 是什么；
- 哪些是 deterministic injected fault，哪些是 Agent 不同操作顺序自然触发的 business error；
- replay/filtering/reward 是如何评估 trajectory 的，不可把 acceptance criteria 误写成强制 action trace match。

## 输出（只写一个 patch 文档）

写到：

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/review-followups/a-task-faults-prompts-mask.md`

文档结构：

1. `## 直接回答`：逐项回答 1/2/3/4，用面试能口述的简洁版本。
2. `## 事实与出处`：对每个关键结论列源码/文档路径、符号名和必要的短摘录/行号。
3. `## 建议插入 recap 的补丁`：按 Ch1/Ch2/Ch3/Ch5/Ch6 指明插入位置；给出可直接粘贴的中文正文（非笼统建议）。
4. `## 建议的伪代码补丁`：仅在确有必要时，指出应该补到哪个 recap-code 文件、使用真实函数名/类名、给出不超过 40 行 Python-style 伪代码。
5. `## 仍需谨慎的说法`：列出容易被面试官追问、不能过度承诺的地方。

## 写作要求

中文，技术术语保留英文。不要黑话/营销腔；像资深算法工程师解释真实系统。不要把不存在的 fault injection、prompt、mask 机制脑补出来；事实不确定就写清楚不确定性。完成后回复产出路径和 3 条最关键的澄清。