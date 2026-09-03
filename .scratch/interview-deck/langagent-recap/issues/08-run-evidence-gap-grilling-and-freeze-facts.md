# 执行第二轮 Evidence-Gap Grilling 并冻结事实

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

由 agent 基于 evidence gaps 逐个采访用户，补齐源码无法证明的设计历史、线上故障、方案取舍、实际效果和脱敏边界；随后更新并冻结 fact base，形成正式写作的 Human-in-the-loop gate。

## Acceptance criteria

- [x] 开始前完整读取 fact base、evidence gaps 和相关专题 briefs，不重复询问仓库已经回答的问题。
- [x] 优先从“设计意图—当前实现”delta 生成问题，向用户确认偏差原因、取舍与实际结果，不要求用户复述代码可直接证明的行为。
- [x] 每次只提出一个问题，并附已有证据、真正未知点和推荐答案。
- [x] 用户回答被归类为可公开、需脱敏、仅供理解、不确定或移出范围。
- [x] 新事实回写 fact base；冲突事实保留来源和最终裁决，不覆盖原始证据。
- [x] 所有高影响 gap 均已回答、明确保留未知或移出范围。
- [x] 用户显式确认事实底稿冻结；未确认前不得启动任何正式写作 ticket。

## Blocked by

- [07 - 汇总 Fact Base 与 Evidence Gaps](07-synthesize-fact-base-and-evidence-gaps.md)

## Comments

- 2026-08-27：第二轮 Evidence-Gap Grilling 完成。Workflow/Chatflow GAP-20～GAP-24 按用户指示延期并保留为 `ACCEPTED_UNKNOWN`；GAP-06 标记为 `OUT_OF_SCOPE`；其余高影响 gap 已回答并回写事实底稿。
- 2026-08-27：用户明确确认冻结当前 fact base，允许后续写作基于已确认事实、accepted unknown 与 out-of-scope 边界开展。Ticket 08 不启动 Ticket 09-14，不在本 ticket 编写 blog 或 recap code。
