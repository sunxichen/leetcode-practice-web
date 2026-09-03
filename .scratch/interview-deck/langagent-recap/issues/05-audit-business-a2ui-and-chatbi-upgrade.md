# 审计业务子图、A2UI 与 ChatBI 升级

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

还原 ChatBI、DataEnvelope、Visualization/A2UI 到 AG-UI Activity 的代表性业务链路，并以证据化前后对照解释 ChatBI 从固定图升级为 agent loop 的架构变化。

## Acceptance criteria

- [x] 从相关分支、源码和测试重建 ChatBI 升级前后的节点、状态、工具和退出路径。
- [x] 独立审计 ChatBI、A2UI 及相关业务机制的 PRD/SPEC/tickets，分别记录原始设计意图、`develop`/原型实现和偏差/演进；不得用未提交原型证明已合入主线。
- [x] 结构事实与设计动机分开记录；代码无法证明的触发背景和效果进入 evidence gaps。
- [x] 还原 SQL 生成、检索、自检、纠错、执行与 DataEnvelope 传递的关键机制。
- [x] 还原 Visualization 的 spec 生成、校验、重试、输出和事件回传。
- [x] 还原 A2UI 的结构化输出、interrupt/resume 和交互回流基础能力。
- [x] 对 Report、RAG 和其他业务能力给出足以支撑全貌的事实摘要，不逐项复制业务代码。
- [x] 输出独立 brief、fact rows fragment 与 evidence-gap fragment；Ticket 07 统一合并共享底稿。

## Blocked by

- [01 - 建立 Source Manifest 与 Fact Schema](01-source-manifest-and-fact-schema.md)

## Comments

- 2026-08-27: Accepted after two correction passes and an independent code-evidence audit. ChatBI branch code remains non-develop and Medium confidence; A2UI remains an uncommitted, user-confirmed PoC; frontend integration and production outcomes remain gaps.
- 2026-08-27: Acceptance invalidated because the worker context had been reused across tickets. Reassigned to a fresh agent process for independent research and reconstruction.
- 2026-08-27: Re-audited and completed in a fresh isolated context without prior candidate contamination. All deliverables (brief, facts, evidence gaps, fresh-context-review) reconstructed and verified.
- 2026-08-27: Orchestrator accepted the fresh-context deliverables: 22 claims and 6 atomic evidence gaps. Review record: `research/t05-fresh-context-review.md`.
