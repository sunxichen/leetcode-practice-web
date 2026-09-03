# 汇总 Fact Base 与 Evidence Gaps

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

把各专题审计合并为一份无重复、可追溯的 fact base 和一份只包含高价值未知项的 evidence gaps，为第二轮 grilling 提供唯一问题集。

## Acceptance criteria

- [x] 合并并去重全部专题 fact rows，统一术语、成熟度、置信度和脱敏状态。
- [x] 所有已确认机制均映射到 fact、明确未知项或 out-of-scope 说明。
- [x] 文档、代码、测试和框架事实的冲突被显式列出，不静默选择版本。
- [x] 每个核心机制保留可关联的设计 claim、实现 claim 与 delta，按问题选择权威来源，不使用单一全局证据排行覆盖冲突。
- [x] Evidence gaps 只保留仓库无法回答且会影响正文准确性的设计历史、线上现象、取舍和效果。
- [x] 每个 gap 包含已有证据、未知点、建议问题和推荐的保守表述。
- [x] 输出 fact-base review 摘要；此 ticket 不开始正式 blog 或 recap code 写作。

## Blocked by

- [02 - 审计平台 Runtime、工具与协议](02-audit-runtime-tools-and-protocol.md)
- [03 - 审计 Long Task、Sandbox 与 Artifact](03-audit-long-task-sandbox-and-artifact.md)
- [04 - 审计 Memory、Compaction、Skill 与 Ask User](04-audit-memory-compaction-skill-and-ask-user.md)
- [05 - 审计业务子图、A2UI 与 ChatBI 升级](05-audit-business-a2ui-and-chatbi-upgrade.md)
- [06 - 审计 Workflow/Chatflow 与 Agent Teams 演进](06-audit-workflow-and-agent-teams-evolution.md)

## Comments

- 2026-08-27: Accepted after isolated-context synthesis and two targeted correction passes. Orchestrator independently verified 130 unique 9-field claims (34 DESIGN / 14 DELTA / 82 FACT; 54 High / 76 Medium), 26 one-question evidence gaps, zero commit hashes, and 132 unique existing evidence paths. Review: `research/t07-fact-base-review.md`.
