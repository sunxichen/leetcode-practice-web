# 专题一：LangGraph/deepagents Handler、Callback 与 Middleware 机制详解

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #5

## What to build

detail-notes/01-handler-callback-middleware.md：讲清 LangGraph 的 callback/handler 机制（LangChain CallbackHandler 体系、astream_events 事件源）与 deepagents/LangChain middleware 机制（awrap_model_call 等钩子）的底层运行机制与使用方式；二者如何串联（middleware 内部触发 callback、事件如何流出到 astream_events）；结合 langAgent 的实际用法举例。

## Acceptance criteria

- [ ] 底层机制以 deepagents 0.6.12 与锁定 LangGraph/LangChain 源码为准，含关键调用链。
- [ ] 每个机制给出"怎么用 + 底层怎么跑 + 项目里用在哪"三段式。
- [ ] 含至少一个端到端事件流转 trace。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
