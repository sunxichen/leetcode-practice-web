你要继续修订面试复习笔记。用户看完 Task Factory 文档后仍有疑问，请你基于代码调研补充，不要臆造。

## 目标文件
/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-task-factory.md

## 代码调研范围
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_factory/**
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_types/**
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/schemas/**
- /Users/sunxichen/Projects/agentic-gov/tests/** 中与 task_factory、invariants、DC-31、db_init_state 相关内容
- 全仓搜索 `DC-31`、`db_init_state`、`filter`、`invariant`、`opening_batch`、`reveal`

## 用户 follow-up 疑问（必须直接回答）
1. task 过滤的详细标准是什么？请把过滤/拒收/验收的标准分层说明：结构校验、业务可解性、policy/version、No-Write、最小对比对/难例筛选等（以真实代码为准，有多少写多少）。
2. `db_init_state()` 是怎么根据采样内容生成出来的？请从采样到各数据库表的初始化讲清楚：用户画像、账户、合同/贷款/冻结/银行卡等状态如何落入表；runtime policy / shadow table 是否参与；不同 task type 有何差异。
3. DC-31 是什么？请用代码和上下文解释其含义、出现位置、解决的问题、为什么命名为/标记为 DC-31（如果代码无法解释命名来源，要明确说“代码中未解释命名来源”，不要编造）。
4. 文档中“三个典型不变式”的案例用户没看懂：请改写为更详细的案例。每个案例都要包含：坏任务长什么样、如果不拦截会导致什么训练/评测污染、代码如何发现它、修复/过滤后的正确任务应满足什么。

## 额外要求
- 补充你认为与这些问题强相关、但原文遗漏的点，例如：task factory 与 golden state 自检的边界、filter 失败时是丢弃还是修复、如何保证 deterministic reproducibility。
- 写成技术博客风格，专业但不使用黑话；术语首次出现解释清楚。
- 禁止编造。找不到依据时明确写“从当前代码看，无法确认 X”。

完成后回复：修改文件 + 新增/改写章节列表。