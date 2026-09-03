# 解答 follow-up 3/6：多工具并发现状与修复方案、Workspace↔Daytona 状态映射

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)
Follow-ups: [follow-ups.md](../follow-ups.md) #3 #6

## What to build

- fragments/f03-multi-tool-concurrency.md：LangGraph ToolNode 的多工具并发执行能力 vs 本项目当前实现的真实做法（develop 源码核实是否并发、缺陷边界 FACT-RT-004）；给出面向面试的修复方案（候选设计、取舍、回归验证思路）。
- fragments/f06-workspace-daytona-states.md：Workspace 状态机（allocating/allocated/reclaiming/reclaimed/destroying/error）与底层 Daytona sandbox 实际状态的逐态对应表，含状态不一致时的治理行为（源码核实）。

## Acceptance criteria

- [ ] 并发问题须明确区分"框架能力""项目现状""缺陷影响"三层。
- [ ] 修复方案须可白板复现（伪代码级），不发明已实现的事实。
- [ ] 状态映射表每个格子有源码证据。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
