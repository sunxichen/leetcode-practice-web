你要继续修订面试复习笔记。用户看完文档后仍有疑问，请你基于代码调研补充，不要臆造。

## 目标文件
优先编辑：/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md
如你认为非常必要，也可对以下文件做少量交叉补充：/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-task-types-business-rules.md

## 代码调研范围
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_factory/golden.py
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_types/**
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_types/registry.py
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_types/runtime_bundle.py
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_loader.py
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/sandbox/**
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/schemas/**
- 相关 tests，尤其 golden/task_type/sandbox 相关测试

## 用户 follow-up 疑问（必须直接回答）
1. `generate_golden_final_state` 是怎么产生的？每个 task type 的 `generate_golden_final_state` 是一致的吗？
2. `ExpectedAction` 列表是否与 task type 关联？一个固定 task type 的 expected action 列表和对应 expected status 是否就固定？还是会按 flow variant / boundary case / task metadata 改变？
3. task type 与 handler 的关系是什么？TaskTypeBundle 如何把 policy_card、api_specs、tool_handlers 组织到一起？Sandbox.execute 如何根据 tool_name 找到对应 handler？PolicyCard.allowed_tools、ApiSpec、handler 三者分别负责什么？

## 写作要求
- 补充到现有文档的最合适章节；若需要可新增 FAQ/澄清小节。
- 用「先结论，后机制，最后例子」的方式回答，避免读者继续困惑。
- 对固定/不固定的问题要非常明确：哪些是 task_type 级固定，哪些是 task instance / flow variant / boundary metadata 决定。
- 使用成熟工程师写技术博客的风格：专业但不使用黑话；术语首次出现解释清楚。
- 所有字段、函数、状态码、文件路径必须以代码为依据。

完成后回复：修改文件列表 + 每个疑问补到了哪个章节。