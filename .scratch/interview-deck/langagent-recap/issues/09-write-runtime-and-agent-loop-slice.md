# 编写平台 Runtime 与 Agent Loop 章节及代码

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

交付平台总览、通用 Dynamic Agent、ReAct loop、动态图、工具/子图边界与核心协议章节草稿，同时产出对应的白板型 recap code，使这一部分能够独立建立运行时底座认知。

## Acceptance criteria

- [x] Worker 在写作前亲自阅读负责主题的源码、测试、设计材料和必要的框架实现，不只消费 fact base 或 brief。
- [x] 章节明确区分作者参与/主导的设计与团队最终落地的实现，并在关键处呈现设计意图、当前行为和已确认的偏差/演进。
- [x] 独立 research 结论与冻结 fact base 交叉验证；发现冲突时暂停相关 claim 并重新打开 evidence gap。
- [x] 章节讲清请求、配置、图编译、agent loop、工具执行、状态合并、checkpoint 和事件输出。
- [x] 决策插叙覆盖动态图、工具与子图边界等关键取舍，并包含具体失败或边界路径。
- [x] 对应 recap code 使用真实函数名，保留决定行为的控制流，并解释必要的函数内部逻辑。
- [x] 章节草稿和代码可以独立阅读，术语与 frozen fact base 一致。

## Blocked by

- [08 - 执行第二轮 Evidence-Gap Grilling 并冻结事实](08-run-evidence-gap-grilling-and-freeze-facts.md)

## Comments

- 2026-08-27: Status changed to `in-progress`. Starting independent code research, fact-base cross-check, recap chapter draft and recap code implementation for Ticket 09.
- 2026-08-27: Status changed to `done`.
  - **产出物清单**:
    - 章节独立草稿: `.scratch/interview-deck/langagent-recap/recap-blog/t09-runtime-agent-loop.md`
    - 白板复现代码: `.scratch/interview-deck/langagent-recap/recap-code/core/runtime_agent_loop.py`
  - **核验原始材料**:
    - `src/agent/factory/agent_factory.py`, `src/agent/factory/agent_registry.py`, `src/agent/core/state.py`
    - `src/agent/core/tool_manager.py`, `src/agent/core/mcp_client.py`, `src/agent/tools/rag_tool.py`
    - `src/server/services/agent_service.py`, `src/server/services/agent_blocking_aggregator.py`
    - `src/server/utils/streaming_disconnect.py`, `src/agent/factory/reasoning_handler.py`, `src/agent/middleware/tool_statistics_collector.py`
    - 自动化单测: `test_multi_tool_calls.py`, `test_tool_call_args.py`, `test_agent_generate_events.py`, `test_agent_blocking_aggregator.py`, `test_streaming_disconnect.py`, `test_http_headers.py`
    - 框架基线: `langgraph 1.2.8`, `ag-ui-protocol 0.1.19`, `ag-ui-langgraph 0.0.42`, `copilotkit 0.1.94`
  - **验证结果**:
    - Python `py_compile` 语法编译通过（0 错误）。
    - 严格与 Ticket 08 冻结 fact base 对齐，显式区分设计意图、当前实现与演进差异，涵盖 4 个关键决策插叙与 1 个多 ToolCall 路由边界缺陷。
  - **待 Orchestrator 验收事项**:
    - 本章节与后续 Ticket 10 (Long Task)、Ticket 11 (Memory/Context/HITL/Business) 及 Ticket 13 (整合总篇) 的接口对齐。
- 2026-08-27: 窄修与初验问题修复 (Narrow Revision for Ticket 09 Verification):
  - **Commit Hash 与锚点清理**: 移除了正文中所有 commit hash 锚点（如 `4cebb661e88e`、`eeff172`），统一改为明确的路径描述与“早期覆盖型 Reducer”等演进表述。
  - **十六进制串扫描**: 全文正则扫描 `\b[0-9a-f]{7,40}\b`，确认章节草稿与 recap code 中 0 处残留 commit hash。
  - **性能与收益话术复查**: 修正了“单请求秒级/毫秒级响应”等泛化性能表述，严格替换为架构目标与机制描述（“面向即时对话与交互式编排”）。
  - **环境与中间文件清理**: 运行 `py_compile` 再次验证语法通过（0 错误），并彻底移除了生成的 `__pycache__/` 目录与 `.pyc` 字节码文件，保持工作目录整洁。
  - **状态确认**: 保持 Status=`done`。
