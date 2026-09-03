# Follow-ups 登记册（2026-08-28，用户通读 recap blog 与 recap code 后提出）

处理规则：非专题条目先在此登记并由 worker 研究解答（产出 fragments/），验收后由 T26 统一整合进 recap-blog.md；专题条目独立成文于 detail-notes/；recap code 现有 core/ 与 evolution/ 保持不动，新增 skeleton/ 一套。

| # | 条目 | 类型 | 处理 ticket | 状态 |
|---|---|---|---|---|
| 1 | `lambda x, y: x+y` reducer 遇到了什么问题，需详细解释 | blog follow-up | T15 → fragments/f01-reducer-problem.md | resolved（产物已验收） |
| 2 | §1.6 决策插叙三（Tool ID 透传演进）没看明白，遇到什么问题需解释 | blog follow-up | T15 → fragments/f02-tool-id-interlude.md | resolved（产物已验收） |
| 3 | §1.7 多工具并发：项目现状是否实现并发调用？缺陷如何解决（面试方案） | blog follow-up | T16 → fragments/f03-multi-tool-concurrency.md | resolved（产物已验收） |
| 4 | recap code 新增 MCP 工具全链路 .py（接收→注册→执行→结果回 agent loop） | recap code | T25 → recap-code/skeleton/ | resolved（产物已验收） |
| 5 | 专题一：Handler / Callback / Middleware 机制详解（含底层运行机制） | detail-notes | T18 → detail-notes/01-handler-callback-middleware.md | resolved（产物已验收） |
| 6 | Workspace 状态机与底层 Daytona sandbox 状态逐态对应 | blog follow-up | T16 → fragments/f06-workspace-daytona-states.md | resolved（产物已验收） |
| 7 | §2.8 决策插叙五需要更详细解释 | blog follow-up | T15 → fragments/f07-decision-five.md | resolved（产物已验收） |
| 8 | 专题二：deepagents CompositeBackend 详解（含提供给 agent 的 tools） | detail-notes | T19 → detail-notes/02-composite-backend.md | resolved（产物已验收） |
| 9 | 专题三：langAgent Custom 事件机制（怎么发送的） | detail-notes | T20 → detail-notes/03-custom-events.md | resolved（产物已验收） |
| 10 | 专题四：deepagents SummarizationMiddleware 机制详解 | detail-notes | T21 → detail-notes/04-summarization-middleware.md | resolved（产物已验收） |
| 11 | glob 与 grep 的区别 | blog follow-up | T17 → fragments/f11-glob-vs-grep.md | resolved（产物已验收） |
| 12 | 上下文压缩提示词是否可自定义、怎么自定义 | blog follow-up | T17 → fragments/f12-compaction-prompt.md | resolved（产物已验收） |
| 13 | blog 整体缺少示例解释（各机制与决策点补具体例子） | blog follow-up | T26 整合时统一增强 | resolved（T26 已整合 8 处走查示例） |
| 14 | 专题五：ChatBI agent loop 版本详解（循环推理设计特点） | detail-notes | T22 → detail-notes/05-chatbi-agent-loop.md | resolved（产物已验收） |
| 15 | 专题六：LangGraph/deepagents HITL 详解 + AG-UI 在其上的便捷能力 | detail-notes | T23 → detail-notes/06-hitl-and-ag-ui.md | resolved（产物已验收） |
| 16 | 专题七：Agent Teams 详解（Orchestrator 工具清单与内部实现逻辑，design_complete） | detail-notes | T24 → detail-notes/07-agent-teams-orchestrator-tools.md | resolved（产物已验收） |
| 17 | recap code 不够 minimal、难记 skeleton；另写一套 skeleton 级代码，现有保留不动 | recap code | T25 → recap-code/skeleton/ | resolved（产物已验收） |

整合与终检：T26（整合 fragments + 全文示例增强 + 专题入口链接）、T27（终检）。

## 第二轮 follow-up（2026-08-31）

| # | 条目 | 类型 | 处理 ticket | 状态 |
|---|---|---|---|---|
| 18 | Daytona 的 stopped 状态和 delete 有什么区别 | blog follow-up | T28 → fragments/f13-daytona-stopped-vs-delete.md | resolved（产物已验收） |
| 19 | 专题一改为框架学习向：内置高价值 Callback/Middleware 全景 | detail-notes | T29 → detail-notes/01 增补章节 | resolved（产物已验收） |
| 20 | 专题四：连续链式压缩没看懂，需要实例 | detail-notes | T30 → detail-notes/04 增补走查实例 | resolved（产物已验收） |
| 21 | 专题六太底层：需要"怎么用 LangGraph/deepagents 实现 HITL"+实例 | detail-notes | T31 → detail-notes/06 增补使用向指南 | resolved（产物已验收） |
