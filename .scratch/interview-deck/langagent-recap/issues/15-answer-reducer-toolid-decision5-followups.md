# 解答 follow-up 1/2/7：reducer 问题、Tool ID 插叙、决策插叙五

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)
Follow-ups: [follow-ups.md](../follow-ups.md) #1 #2 #7

## What to build

研究并产出三份解答 fragment，供 T26 整合进 recap-blog.md：

- fragments/f01-reducer-problem.md：`lambda x, y: x + y` 覆盖型 reducer 在项目中实际引发了什么问题（现象、根因、add_messages 如何修复、消息配对/幂等语义），含具体示例。
- fragments/f02-tool-id-interlude.md：§1.6 决策插叙三（Tool ID 原地篡改 → ToolStatisticsCollector 旁路）当时遇到了什么具体问题，展开触发场景、崩溃机理、两方案对比。
- fragments/f07-decision-five.md：§2.8 决策插叙五的详细解释（先读 recap-blog.md 确认其主题，再下钻源码展开）。

## Acceptance criteria

- [ ] 每份 fragment 先用一两句话给出"电梯答案"，再展开机制与具体示例。
- [ ] 所有事实经 develop 基线与框架源码独立核验，标注 FACT/GAP 编号或源码路径。
- [ ] 含至少一个具体代码/消息序列示例，可直接嵌入 blog。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
