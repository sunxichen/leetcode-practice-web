# 编写 Long Task、Sandbox 与 Artifact 章节及代码

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

交付 Long Task 端到端生命周期、Workspace、Daytona、文件、环境变量和 Artifact durability 章节草稿及对应白板代码，完整覆盖成功路径、重建恢复和资源收尾。

## Acceptance criteria

- [x] Worker 独立重读相关源码、测试、PRD 和 deepagents/Daytona 关键实现，并与 frozen fact base 交叉验证。
- [x] 章节明确区分作者参与/主导的设计与团队最终落地的实现，并在关键处呈现设计意图、当前行为和已确认的偏差/演进。
- [x] 章节从服务入口走到 agent 构建、sandbox、event stream、artifact sync 和 `finally` 收尾。
- [x] Workspace 状态机、隔离边界、环境变量注入和文件导入具有清晰的机制解释。
- [x] Artifact export、hash 去重、externalize、restore、部分失败和防重复写入均有具体路径。
- [x] recap code 展开关键状态、恢复和一致性函数，压缩第三方样板与非关键 CRUD。
- [x] 任何 research 新发现先更新事实层，不在章节中静默偏离 frozen fact base。

## Blocked by

- [08 - 执行第二轮 Evidence-Gap Grilling 并冻结事实](08-run-evidence-gap-grilling-and-freeze-facts.md)

## Comments

- 2026-08-27: Status changed to in-progress. Ticket 10 worker starting fresh context research and drafting for Long Task, Sandbox, Workspace, and Artifact durability slice.
- 2026-08-27: Status changed to done. Ticket 10 deliverables completed:
  1. Blog draft: `.scratch/interview-deck/langagent-recap/recap-blog/t10-long-task-sandbox-artifact.md`
  2. Recap code: `.scratch/interview-deck/langagent-recap/recap-code/core/long_task_sandbox_artifact.py`
  3. Verification: passed `python3 -m py_compile`, verified against `fact-base.md` (`FACT-LT-*`, `FACT-ART-*`, `DELTA-LT-*`, `DELTA-ART-*`, GAP-04 confirmed 10min TTL, GAP-05 confirmed backend internal API, GAP-06 out-of-scope), verified no git commit hashes in narrative, cleaned `__pycache__`.
- 2026-08-27: Post-review revision completed:
  1. Removed all `Fake*`/`Mock*` classes, `mock_*` variables and fake data from `long_task_sandbox_artifact.py`.
  2. Replaced with real type stubs and `create_deep_agent` returning `CompiledStateGraph`.
  3. Replaced fake runtime execution with a commented cross-file execution trace.
  4. Verified 0 occurrences of `Fake`, `Mock`, `mock_`, `fake adapter` across recap code and chapter draft.
  5. Passed `python3 -m py_compile` and cleaned `__pycache__`. Status remains `done`.
- 2026-08-27: Final narrow fix completed:
  1. Converted `DaytonaSandbox.execute/upload_files/download_files` methods to pure ellipsis stubs (`...`), removing empty fake returned values.
  2. Converted `create_deep_agent` framework declaration to pure ellipsis stub (`...`), removing constructor instantiation `CompiledStateGraph()`.
  3. Removed hardcoded dummy metadata `size_bytes: 1024` and replaced with realistic comment / byte evaluation.
  4. Verified 0 occurrences of `Fake`, `Mock`, `mock_` across files, passed `py_compile`, cleaned `__pycache__`. Status remains `done`.
