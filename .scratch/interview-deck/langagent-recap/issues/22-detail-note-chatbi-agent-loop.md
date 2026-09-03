# 专题五：ChatBI Agent Loop 版本详解

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #14

## What to build

detail-notes/05-chatbi-agent-loop.md：ChatBI agent loop 版本（参考分支）详解：loop 设计特点、三段式循环如何逐步推理（prepare → agent ⇄ tools → finalize）、4 闭包工具语义、列值探测闭环、退出条件与 MAX_ITERATIONS、与固定 DAG 的对照、成熟度标注（prototype_verified，未合入主线）。

## Acceptance criteria

- [ ] 以 .scratch/langagent-chatbi-agent-loop-reference 分支源码为准。
- [ ] 含一轮完整循环的消息/状态流转示例。
- [ ] 成熟度与边界表述与 fact-base 一致。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
