# 审计 Memory、Compaction、Skill 与 Ask User

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

为长期运行所需的记忆、上下文治理、过程性知识和 Human-in-the-loop 建立一份联合事实包，讲清四项机制如何共享 checkpoint、filesystem、middleware 和事件协议，又如何保持边界。

## Acceptance criteria

- [x] 区分对话历史、checkpoint、User Global memory、User-Agent memory 和 workspace 文件。
- [x] 还原 memory namespace、backend 路由、读取、注入和写回逻辑。
- [x] 还原自动压缩的触发、摘要、消息替换、观测事件和失败降级。
- [x] 还原 Skill 下载、校验、signature、缓存、选择、渐进读取、激活和去重。
- [x] 还原 Ask User typed contract、稳定 request ID、interrupt、pending、resume、参数遮蔽与异常路径。
- [x] 对照 PRD/SPEC、实现和测试记录设计偏差，并输出独立 brief、fact rows fragment 与 evidence-gap fragment；Ticket 07 统一合并共享底稿。
- [x] 对每个关键机制建立“设计意图—`develop` 实现—偏差/演进”对照；设计事实与实现事实分别进入 fragments，无法证明的偏差原因进入 evidence gaps。

## Blocked by

- [01 - 建立 Source Manifest 与 Fact Schema](01-source-manifest-and-fact-schema.md)

## Comments
