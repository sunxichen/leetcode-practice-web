# 审计 Long Task、Sandbox 与 Artifact

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

还原一次 Long Task 从服务初始化到资源收尾的完整事实链，覆盖 Workspace、Daytona、文件导入、环境变量与 Artifact durability，并记录关键失败和恢复路径。

## Acceptance criteria

- [x] 从源码和测试还原 Long Task service、agent factory、middleware 与 event stream 的调用顺序。
- [x] 建立 Workspace allocate、reuse、resume、reclaim、suspend 和 destroy 状态机。
- [x] 解释 Daytona backend、snapshot/sandbox 类型、执行隔离、线程边界和密文环境变量注入。
- [x] 解释文件进入沙箱、Artifact export/bundle、目录同步、hash 去重和 externalize。
- [x] 覆盖沙箱重建后的 Artifact restore、部分失败和防重复 externalize。
- [x] 将真实实现、PRD 初始设想和当前遗留边界分别标记，形成独立 brief、fact rows fragment 与 evidence-gap fragment；Ticket 07 统一合并共享底稿。
- [x] 对每个关键机制建立“设计意图—`develop` 实现—偏差/演进”对照；设计事实与实现事实分别进入 fragments，无法证明的偏差原因进入 evidence gaps。

## Blocked by

- [01 - 建立 Source Manifest 与 Fact Schema](01-source-manifest-and-fact-schema.md)

## Comments
