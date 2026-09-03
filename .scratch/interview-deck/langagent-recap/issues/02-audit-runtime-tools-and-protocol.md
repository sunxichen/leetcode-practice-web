# 审计平台 Runtime、工具与协议

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

为通用 Dynamic Agent、ReAct loop、动态图编译、工具系统、checkpoint 和 AG-UI 协议建立可独立核验的专题 brief、fact rows 与 evidence gaps，使后续章节能够准确解释平台底座。

## Acceptance criteria

- [x] 从源码、测试和设计文档交叉还原请求进入、图构建、运行、事件转换和结束的控制流。
- [x] 独立审计相关 PRD/SPEC/tickets/ADR，分别记录设计意图、`develop` 当前实现和偏差/演进；设计事实不得从代码反推，偏差原因无法证明时进入 evidence gaps。
- [x] 讲清 state/reducer、动态编译、图缓存、plugin/subgraph、MCP、RAG、模型 reasoning 和 checkpoint 机制。
- [x] 讲清普通工具、主图节点、子图入口和 subgraph-as-tool 的语义边界。
- [x] 讲清 AG-UI、middleware、流式与 blocking 输出、断连和取消的主要契约。
- [x] 每条关键结论写入本 Ticket 的 fact rows fragment，并在 evidence-gap fragment 中记录证据冲突、过期文档和需要用户确认的历史；Ticket 07 统一合并共享底稿。
- [x] Brief 足以让另一个 worker 回到原始代码复核，不把推断写成实现事实。

## Blocked by

- [01 - 建立 Source Manifest 与 Fact Schema](01-source-manifest-and-fact-schema.md)

## Comments
