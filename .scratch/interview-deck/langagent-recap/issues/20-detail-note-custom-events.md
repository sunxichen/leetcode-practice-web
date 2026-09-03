# 专题三：langAgent Custom 事件机制

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #9

## What to build

detail-notes/03-custom-events.md：langAgent 项目中 AG-UI Custom 事件机制详解：事件怎么发送（adispatch_custom_event / copilotkit_emit_activity 等真实发送点）、如何经 Event Bridge/middleware 转换、如何到达前端、项目里有哪些 Custom 事件类型及各自用途。

## Acceptance criteria

- [ ] 发送链路以 develop 源码逐跳核实（谁调用、经过谁、在哪序列化）。
- [ ] 区分框架原生 custom event 与项目封装的发送助手。
- [ ] 含至少一条完整事件 trace（产生 → 桥接 → SSE → 前端消费）。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
