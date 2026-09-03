# 专题四：deepagents SummarizationMiddleware 机制详解

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #10（呼应 #12）

## What to build

detail-notes/04-summarization-middleware.md：deepagents 0.6.12 SummarizationMiddleware 详解：触发条件、token 计数方式、摘要生成与消息替换、Command 状态更新、与 checkpointer 的关系、可配置项（含提示词自定义，呼应 follow-up #12 但不重复展开）、langAgent 的 ObservedDeepAgentsSummarizationMiddleware 继承观测方案。

## Acceptance criteria

- [ ] 全部机制以锁定框架源码为准，含关键方法与调用链。
- [ ] 明确哪些行为是框架原生、哪些是 langAgent 扩展。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
