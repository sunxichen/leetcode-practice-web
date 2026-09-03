# 专题六：LangGraph/deepagents HITL 详解与 AG-UI 便捷能力

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #15

## What to build

detail-notes/06-hitl-and-ag-ui.md：HITL 详解：LangGraph interrupt()/Command(resume) 底层语义、deepagents 的 HITL 工具审批能力；AG-UI（含 ag-ui-langgraph 集成层）在这些底层之上提供的便捷功能（事件映射、工具调用渲染、状态同步等）；langAgent Ask User 如何在其上构建强类型契约。

## Acceptance criteria

- [ ] 底层语义以锁定框架源码为准；AG-UI 便捷能力以实际依赖版本为准。
- [ ] 明确分层：框架原生 / AG-UI 集成层 / langAgent 自建。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
