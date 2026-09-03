# 审计 Workflow/Chatflow 与 Agent Teams 演进

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

从 `langAgent` 中心视角建立 Workflow/Chatflow 和 Agent Teams 的设计事实包，明确框架选型、运行契约、可靠性模型、验证程度和未实现边界。

## Acceptance criteria

- [x] 对照研究报告与必要的框架源码核验 Dify、LangFlowMVP 的运行语义和选型结论。
- [x] 独立审计 PRD/SPEC/tickets/ADR，分别记录设计契约、原型/`develop` 实现和偏差/未实现边界；设计完成不得表述为已上线。
- [x] 讲清 Workflow asset/version、runtime request/context/result、事件适配、Workflow-as-tool 和 human-input bridge。
- [x] 讲清 checkpoint、resume、幂等、并发、背压、取消、重试、安全与可观测性边界。
- [x] 讲清 Agent Teams 的 asset、Orchestrator、持久 Teammate、assignment admission、follow-up/redirect 和双层超时。
- [x] 讲清 Team Event/read model、断连执行、权限、审计和数据保留。
- [x] 每项能力标记为设计完成、原型验证、实现中或已实现，并形成独立 brief、fact rows fragment 与 evidence-gap fragment；Ticket 07 统一合并共享底稿。

## Blocked by

- [01 - 建立 Source Manifest 与 Fact Schema](01-source-manifest-and-fact-schema.md)

## Comments

- 2026-08-27: Accepted after two correction passes and independent design/code audits. Agent Teams is a completed design baseline, not proven runtime delivery. Workflow is currently represented only by exploratory research plus external-engine observations; project status and Dify integration details remain for second grilling.
- 2026-08-27: Acceptance invalidated because the worker context had been reused across tickets. Reassigned to a fresh agent process for independent research and reconstruction.
- 2026-08-27: Fresh-context audit completed and revised with three tracks (DESIGN/DELTA/FACT, 21 total claims), 7 strictly atomic single-question Gaps (no compound questions, no assumed component lists), oral facts (`FACT-TM-003`, `FACT-WF-003`, `DELTA-WF-001`), framework Delta (`DELTA-TM-001`), fully explicit scratch evidence paths, and standardized terminology ("the inspected async_subagents.py middleware does not define...").
- 2026-08-27: Orchestrator accepted the fresh-context deliverables: 21 claims and 7 atomic evidence gaps. Review record: `research/t06-fresh-context-review.md`.
