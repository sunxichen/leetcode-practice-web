# 专题二：deepagents CompositeBackend 详解

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #8

## What to build

detail-notes/02-composite-backend.md：CompositeBackend 详解，至少包含：它向 agent 提供哪些 tools（逐一列签名与语义）、路由/委托机制（不同路径前缀如何路由到不同 backend）、与 StateBackend/StoreBackend/FilesystemBackend 的关系、langAgent 中的实际组装方式。

## Acceptance criteria

- [ ] 工具清单与签名逐项对 deepagents 0.6.12 源码核实。
- [ ] 与 follow-up #11（glob vs grep）呼应但不重复展开。
- [ ] langAgent 组装方式以 develop 基线为准。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
