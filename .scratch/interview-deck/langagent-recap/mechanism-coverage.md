# Mechanism Coverage (全量机制覆盖与审计映射矩阵)

> **定位与用途**：本文件将 [spec-recap-blog.md](spec-recap-blog.md) 中已确认的全部 57 项 User Stories、10 大设计决策与全量技术机制，严格映射为各专题审计任务（Tickets 02-06）、预期证据位置与成熟度目标。
> **覆盖原则**：**零静默遗漏**。任何在 Spec 中提及的技术机制均有明确的 Ticket 归属、核验代码位置与产物去向，并提供由表格可机械核验的 57/57 逐条对齐清单。

---

## 1. 57 项 User Stories 全量逐条映射表 (US 1 - US 57)

> **注**：目标成熟度预判中，`implemented` 表示 develop 主线代码/测试已支持；`prototype_verified` 表示本地分支或原型验证；`design_complete` 表示 PRD/ADR 完成完备设计；`unconfirmed` 表示机制边界尚待专题审计核验；`not_applicable` 表示属于叙事架构、白板代码规范、事实纪律与交付形式等工程写作/流程规范，不适用运行时系统成熟度评估。

| US 编号 | 用户故事描述 (User Story) | 所属能力机制 / 审计主题 | 负责 Ticket | 预期主要证据与落点 | 目标成熟度预判 |
|---|---|---|---|---|---|
| **US 01** | 作为项目核心设计与实现参与者，我想用第一人称讲清项目为何这样设计，以便展示真实的架构 ownership。 | 叙事身份与架构 Ownership | Ticket 09, 13 | `spec-recap-blog.md` 叙事规则 | `not_applicable` |
| **US 02** | 作为复习者，我想先看到一张完整系统蓝图，以便快速建立单 Agent、Long Task、Workflow 和 Agent Teams 的关系。 | 全景架构蓝图 (System Blueprint) | Ticket 09 | `docs/MUST_READ.md`、`src/` 架构 | `not_applicable` |
| **US 03** | 作为读者，我想沿一次 Long Task 请求走完整条执行链，以便理解组件如何在真实运行中协作。 | Long Task 端到端生命周期执行链 | Ticket 03, 10 | `src/server/services/long_task_agent_service.py` | `implemented` |
| **US 04** | 作为读者，我想理解通用 Dynamic Agent 与 Long Task Agent 的职责边界，以免把两套运行时混为一谈。 | 双运行时定位与职责边界 | Ticket 02, 09 | `src/agent/factory/agent_factory.py`<br>`src/agent/long_task/factory.py` | `implemented` |
| **US 05** | 作为读者，我想理解 ReAct loop 的决策、工具调用、观察、回边和终止，以便口述 Agent 最核心的执行模型。 | ReAct 核心循环与执行状态机 | Ticket 02, 09 | `src/agent/factory/agent_factory.py#L434-L650` | `implemented` |
| **US 06** | 作为读者，我想理解 LangGraph state、reducer、checkpoint 和 interrupt 语义，以便解释状态如何跨节点和跨请求持续。 | LangGraph 状态机、Reducer 与 Checkpoint | Ticket 02, 09 | `src/agent/core/state.py`<br>Commit `eeff172` (`add_messages`) | `implemented` |
| **US 07** | 作为读者，我想理解配置如何驱动动态图编译与缓存，以便解释平台如何承载不同业务 Agent。 | `DynamicAgentFactory.build()` 配置编译与缓存 | Ticket 02, 09 | `src/agent/factory/agent_factory.py#L265-L430` | `implemented` |
| **US 08** | 作为读者，我想区分普通工具、图节点、子图入口和 subgraph-as-tool，以便说明不同扩展机制的适用场景。 | 工具与子图扩展机制分类学 | Ticket 02, 09 | `src/agent/factory/agent_factory.py`<br>`src/agent/core/tool_manager.py` | `implemented` |
| **US 09** | 作为读者，我想理解动态 MCP 工具的 schema、认证、执行、超时和结果回传，以便讲清免注册工具接入。 | 动态 MCP 工具集成与鉴权协议 | Ticket 02, 09 | `src/agent/tools/mcp_tools.py`<br>`src/agent/core/mcp_client.py` | `implemented` |
| **US 10** | 作为读者，我想理解 RAG、文件上下文和多模态上下文如何进入模型，以便说明知识接入不是简单拼 prompt。 | 知识检索、文件与多模态上下文注入 | Ticket 02, 09 | `src/agent/tools/rag_tool.py`<br>`src/agent/long_task/file_context_injection_middleware.py` | `implemented` |
| **US 11** | 作为读者，我想理解 Long Task Agent 的初始化、middleware 组装、事件流和收尾，以便掌握长任务编排主干。 | Long Task Middleware 链组装与编排主干 | Ticket 03, 10 | `src/agent/long_task/factory.py`<br>`src/agent/long_task/chinese_deep_agent.py` | `implemented` |
| **US 12** | 作为读者，我想理解 Workspace 与 Daytona Sandbox 生命周期，以便解释隔离执行和资源复用。 | Workspace 状态机与 Daytona 沙箱管理 | Ticket 03, 10 | `src/server/services/workspace_service.py`<br>`tests/test_workspace_service_lifecycle.py` | `implemented` |
| **US 13** | 作为读者，我想理解密文环境变量如何被安全地注入沙箱，以便说明凭证边界和日志脱敏。 | 密文环境变量解密与沙箱安全注入 | Ticket 03, 10 | `src/agent/long_task/sandbox_env.py`<br>`tests/test_sandbox_env.py` | `implemented` |
| **US 14** | 作为读者，我想理解上传文件如何进入沙箱，以便说明对象存储、文件解析和执行环境的连接。 | 上传文件与本地夹具导入沙箱 | Ticket 03, 10 | `src/server/services/sandbox_file_import_service.py`<br>`src/server/services/local_fixture_import_service.py` | `implemented` |
| **US 15** | 作为读者，我想理解 Artifact 的发现、导出、hash 去重、外部化和恢复，以便说明临时沙箱中的产物如何持久交付。 | Artifact 目录扫描、Hash 去重与外部化 | Ticket 03, 10 | `src/server/services/artifact_service.py`<br>`src/agent/long_task/tools.py` | `implemented` |
| **US 16** | 作为读者，我想理解沙箱重建后的 Artifact 回灌和防重复 externalize，以便掌握非 happy path 下的数据一致性。 | 沙箱重建后 Artifact 回灌与容错恢复 | Ticket 03, 10 | `src/server/services/artifact_service.py`<br>`tests/test_artifact_restore.py` | `implemented` |
| **US 17** | 作为读者，我想区分对话历史、checkpoint 和长期记忆，以便避免把所有上下文机制都称为 memory。 | 三层上下文界定 (History / Checkpoint / Long-term) | Ticket 04, 11 | `docs/deepagents-memory-integration.md`<br>`docs/long-task-memory-prd.md` | `implemented` |
| **US 18** | 作为读者，我想理解 User Global 与 User-Agent memory 的 namespace 和隔离，以便解释跨会话记忆如何避免串扰。 | 长期记忆多命名空间与虚拟文件持久化 | Ticket 04, 11 | `src/agent/long_task/memory_backend.py`<br>`tests/test_long_task_memory_backend.py` | `implemented` |
| **US 19** | 作为读者，我想理解自动上下文压缩的触发、摘要、消息替换和失败降级，以便说明长会话如何持续运行。 | 上下文自动压缩触发与消息替换 | Ticket 04, 11 | `src/agent/long_task/observed_summarization_middleware.py`<br>`prd/long_task_context_auto_compaction_prd.md` | `implemented` |
| **US 20** | 作为读者，我想理解压缩事件如何被观测，以便解释 token 使用和上下文变化如何对前端及运维可见。 | 上下文压缩可观测性与 Token 统计事件 | Ticket 04, 11 | `src/agent/long_task/context_compaction_events.py` | `implemented` |
| **US 21** | 作为读者，我想理解 Skill 导入、校验、signature、缓存、选择和渐进加载，以便说明过程性知识如何按需进入 Agent。 | Skill 动态导入、签名与 Manifest 管理 | Ticket 04, 11 | `src/server/services/skill_import_service.py`<br>`tests/test_long_task_skill_selection.py` | `implemented` |
| **US 22** | 作为读者，我想理解 Skill 激活去重与安全事件，以便说明可观测性不应改变工具执行结果。 | Skill read_file 拦截、激活去重与事件发射 | Ticket 04, 11 | `src/agent/long_task/skill_activation_middleware.py`<br>`tests/test_long_task_skill_activation.py` | `implemented` |
| **US 23** | 作为读者，我想理解 Ask User 的 typed contract、稳定 request ID、interrupt 和 resume，以便解释 Human-in-the-loop 的确定性恢复。 | Ask User 强类型契约与 Command Resume | Ticket 04, 11 | `src/agent/ask_user/contracts.py`<br>`src/agent/ask_user/tool.py` | `implemented` |
| **US 24** | 作为读者，我想看到 Ask User 的重复提交、快照缺失、取消和恢复失败路径，以便理解它不是只有 pending 卡片的 happy path。 | Ask User 非 Happy Path (重放/取消/快照缺失) | Ticket 04, 11 | `src/agent/ask_user/contracts.py`<br>`src/agent/ask_user/tool.py` | `unconfirmed` (待Ticket 04审计) |
| **US 25** | 作为读者，我想理解 AG-UI 的 run、message、tool、activity、custom 和 artifact 事件，以便掌握 Agent 与前端之间的协议层。 | AG-UI 协议核心事件集与前端契约 | Ticket 02, 09 | `docs/AG-UI_协议_参数说明.md`<br>`uv.lock` (`ag-ui-protocol 0.1.19`) | `implemented` |
| **US 26** | 作为读者，我想理解 deepagents/LangGraph 事件如何被 Event Bridge 和 middleware 转换，以便说明领域执行与展示协议如何解耦。 | 事件桥接与展示协议解耦 (Event Bridge) | Ticket 02, 09 | `src/agent/long_task/event_bridge.py`<br>`docs/ag_ui与langgraph messages融合策略.md` | `implemented` |
| **US 27** | 作为读者，我想理解流式接口与 blocking 接口如何共享事件语义，以便解释多种调用方式的一致性。 | Streaming 与 Blocking 双模事件一致性 | Ticket 02, 09 | `src/server/services/agent_blocking_aggregator.py`<br>`tests/test_agent_blocking_aggregator.py` | `implemented` |
| **US 28** | 作为读者，我想理解客户端断连、取消传播、后台收尾和流关闭，以便回答生产长连接中的可靠性问题。 | 客户端断连检测、取消传播与流关闭保障 | Ticket 02, 09 | `tests/test_streaming_disconnect.py`<br>Commit `2a48b9c` | `implemented` |
| **US 29** | 作为读者，我想沿 ChatBI、DataEnvelope、Visualization/A2UI 到 AG-UI Activity 的代表链路理解业务子图。 | 业务子图全链路 (ChatBI -> DataEnvelope -> Visualization) | Ticket 05, 11 | `src/agent/graph/subgraphs/chatbi/`<br>`src/agent/schemas/data_envelope.py` | `implemented` |
| **US 30** | 作为读者，我想理解 ChatBI 从固定节点流水线升级到 agent loop 的结构变化、收益和代价，以便看到真实架构演进。 | ChatBI 架构升级演进动机与前后对照 (Decision 插叙) | Ticket 05, 11 | `src/agent/graph/subgraphs/chatbi/`<br>Branch `sunxichen/chatbi-agent-loop` | `prototype_verified` (待Ticket 05审计) |
| **US 31** | 作为读者，我想理解 SQL 生成、自检、纠错和退出条件，但不需要逐个背诵所有 prompt 和业务 CRUD。 | SQL 生成、自检与纠错循环退出机制 | Ticket 05, 11 | `src/agent/graph/subgraphs/chatbi/prompts/sql_generation.py`<br>`src/agent/graph/subgraphs/chatbi/prompts/sql_correction.py` | `implemented` |
| **US 32** | 作为读者，我想理解 Visualization 的 spec 生成、校验、重试与 ToolMessage 回传，以便掌握白盒子图的价值。 | Visualization 子图 AntVChart 生成与重试校验 | Ticket 05, 11 | `src/agent/nodes/visualization_nodes/nodes.py`<br>`src/agent/graph/subgraphs/visualization_graph.py` | `implemented` |
| **US 33** | 作为读者，我想理解 Report 与 A2UI 的入口、状态、输出和交互回流，以便获得业务能力全貌。 | Report 报告生成与 A2UI 结构化交互全貌 | Ticket 05, 11 | `src/agent/graph/subgraphs/report_graph.py`<br>`langAgent/src/agent/graph/subgraphs/a2ui_graph.py` | `prototype_verified` (A2UI待Ticket 05审计) |
| **US 34** | 作为读者，我想理解初始化失败、模型超时、工具异常、沙箱异常和事件异常的分层处理，以便说明错误为何不能统一吞掉。 | 运行时分层错误处理与故障自愈 | Ticket 02, 03, 10 | `tests/test_long_task_initialization_error.py`<br>`src/server/routes/agent_routers.py` | `implemented` |
| **US 35** | 作为读者，我想理解 correlation、幂等、去重、参数遮蔽和事件配对，以便掌握协议一致性和安全边界。 | 关联透传、产物幂等去重与敏感参数掩码 | Ticket 02, 03, 10 | `tests/test_http_headers.py`<br>`src/server/services/artifact_service.py` | `implemented` |
| **US 36** | 作为读者，我想理解 Opik、工具统计和结构化日志如何关联 run 与 workspace，以便说明系统如何观测。 | Opik 追踪、工具度量与结构化日志 | Ticket 02, 03, 10 | `src/agent/core/opik_integration.py`<br>`src/agent/middleware/tool_statistics_collector.py` | `implemented` |
| **US 37** | 作为读者，我想适度下钻 LangGraph、deepagents、AG-UI 和 Daytona 的关键内部语义，以便证明项目不是简单调包。 | 关键第三方框架底层运行语义下钻 | Tickets 02, 03, 09, 10 | `uv.lock` 锁定版本源码 (`deepagents 0.6.12` 等) | `implemented` |
| **US 38** | 作为读者，我想理解开放式 Agent loop 与确定性 Workflow/Chatflow 的边界，以便说明平台为什么需要第二种编排范式。 | 开放式 Agent 与确定性 Workflow 范式边界 | Ticket 06, 12 | `prd/AI智企平台_产品PRD.md` | `design_complete` |
| **US 39** | 作为读者，我想理解 Workflow asset、runtime contract、事件适配、human-input bridge、checkpoint 和版本语义，以便掌握集成蓝图。 | Workflow 运行时契约、事件适配与状态机 | Ticket 06, 12 | `prd/AI智企平台_产品PRD.md` | `design_complete` |
| **US 40** | 作为读者，我想理解 Dify 与 LangFlowMVP 路线比较和 fallback gate，以便复述技术选型依据而不是只报框架名称。 | Dify vs LangFlowMVP 选型评估与 Fallback Gate | Ticket 06, 12 | `/Users/sunxichen/Projects/dify`<br>`/Users/sunxichen/Projects/langFlowMVP` | `design_complete` |
| **US 41** | 作为读者，我想理解 Agent Teams 的 Orchestrator、持久 Teammate、assignment、并发和双层超时，以便掌握多 Agent 调度模型。 | Agent Teams 调度架构、Teammates 与双层超时 | Ticket 06, 12 | `docs/docs/Agent_Teams_PRD_与技术方案.md`<br>`docs/docs/adr/0001-0006` | `design_complete` |
| **US 42** | 作为读者，我想理解 Team Event、read model、断连执行、权限和审计，以便说明多 Agent 系统的生产化边界。 | Team Event 数据流、Read Model 聚合与审计模型 | Ticket 06, 12 | `docs/docs/adr/0004-durable-team-assignment-admission-control.md`<br>`docs/docs/adr/0006-team-runtime-records-are-the-mvp-audit-source.md` | `design_complete` |
| **US 43** | 作为复习者，我想让 recap code 使用真实函数名与关键控制流，以便在白板上还原项目而不背一套虚构 API。 | 白板代码真实符号与控制流保真度 | Tickets 09-12 | 真实源码符号索引 (`recap-code/`) | `not_applicable` |
| **US 44** | 作为复习者，我想让关键函数的内部机制得到代码或文字解释，以便在追问时能继续下钻。 | 白板代码逐层注释与执行逻辑解析 | Tickets 09-12 | 源码注释设计规范 | `not_applicable` |
| **US 45** | 作为复习者，我想让标准算法和第三方样板保持简写，以便 recap code 仍然 minimal。 | 样板代码精简与 Minimal 约束 | Tickets 09-12 | 白板代码精简规范 | `not_applicable` |
| **US 46** | 作为复习者，我想区分必须能默写、需要能解释和追问时展开的代码，以便合理分配准备时间。 | 代码分级准备 (默写/解释/追问展开) | Tickets 09-12 | `recap-code/` 分级标签 | `not_applicable` |
| **US 47** | 作为事实核验者，我想让每个重要 claim 都有证据类型和成熟度，以便避免把 PRD 意图写成实现结果。 | Fact Base 事实分级与证据类型纪律 | Ticket 01, 07 | `fact-base.md` Claim Schema | `not_applicable` |
| **US 48** | 作为事实核验者，我想把真实线上事故与一般失败模式分开，以便不根据 commit message 虚构影响。 | 真实事故与一般失败模式严格分离纪律 | Ticket 01, 07, 08 | `evidence-gaps.md` 准入规则 | `not_applicable` |
| **US 49** | 作为项目参与者，我想在第二轮 grilling 中只回答源码无法回答的问题，以便把时间用于补充真实设计历史。 | 第二轮 Grilling 聚焦未决高价值问题 | Ticket 07, 08 | `evidence-gaps.md` 收集流程 | `not_applicable` |
| **US 50** | 作为项目参与者，我想在正式写作前确认并冻结 fact base，以便所有后续章节使用同一套事实。 | 事实底稿冻结硬门禁 (Freeze Gate) | Ticket 07, 08 | 第二轮 Grilling 用户确认流程 | `not_applicable` |
| **US 51** | 作为读者，我想获得一篇连贯的单文件长文，以便不在多个专题之间来回跳转。 | 单文件 Markdown 长文总装交付 | Ticket 13 | `recap-blog.md` | `not_applicable` |
| **US 52** | 作为读者，我想看到设计决策以触发场景、问题、候选方案、选择、代价和结果组织，以便理解架构为何演进。 | 决策插叙 6 段式标准结构 | Tickets 09-12 | 各章节决策插叙编写规范 | `not_applicable` |
| **US 53** | 作为读者，我想看到具体非 happy path 和恢复流程，以便材料不成为只展示成功演示的宣传稿。 | 深度覆盖非 Happy Path 与故障自愈流程 | Tickets 09-12 | 测试用例与异常分支代码 | `not_applicable` |
| **US 54** | 作为面试准备者，我想获得一条 20 至 30 分钟自述路线，以便从深度正文中提炼陈述主干。 | 20-30 分钟面试自述路线规划 | Ticket 13 | `recap-blog.md` 前置导航节 | `not_applicable` |
| **US 55** | 作为面试准备者，我想获得高频追问和白板代码索引，以便快速定位需要复习的实现。 | 高频追问与白板代码双向索引附录 | Ticket 13 | `recap-blog.md` 附录 | `not_applicable` |
| **US 56** | 作为后续研究者，我想保留 fact base、briefs 和专题入口，以便继续扩写更深的专题 blog。 | 专题 briefs 与长效知识资产沉淀 | Tickets 01-14 | `briefs/`、`fact-base.md` | `not_applicable` |
| **US 57** | 作为写作 worker，我想亲自核对负责主题的源码、测试和设计材料，以便 fact base 作为共享约束而不是未经验证的二手结论。 | 写作 Worker 独立源码核验硬性准则 | Tickets 09-12 | 写作前独立源码核验流程 | `not_applicable` |

---

## 2. 专题机制覆盖矩阵 (按审计 Ticket 分组)

### 2.1 运行时、动态图编排与工具系统 (Audit Domain 1 -> Ticket 02)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M01 | **ReAct 核心循环** | US 5, 35 | Ticket 02 | `src/agent/factory/agent_factory.py#L434-L650`<br>`src/agent/core/state.py` | `implemented` | 决策、ToolCall、Observation、回边与终止条件；多 ToolCall 并发执行合并机制。 |
| M02 | **State 与 Reducer 机制** | US 6 | Ticket 02 | `src/agent/core/state.py`<br>Commit `eeff172` (`add_messages`) | `implemented` | `MainAgentState` 字段结构；从自定义覆盖 `lambda` 修复为 `add_messages` Reducer 的原因与防丢消息机制。 |
| M03 | **动态图编译与缓存** | US 7 | Ticket 02 | `src/agent/factory/agent_factory.py#L265-L430`<br>`src/server/services/agent_service.py` | `implemented` | `DynamicAgentFactory.build()` 解析配置、按需组装节点与边、CompiledStateGraph 缓存与热更新机制。 |
| M04 | **工具与扩展分类边界** | US 8 | Ticket 02 | `src/agent/factory/agent_factory.py`<br>`src/agent/core/tool_manager.py` | `implemented` | 明确区分普通本地工具、主图节点、子图入口 schema（如 `chatbi_text2sql`）与 `subgraph-as-tool`。 |
| M05 | **动态 MCP 工具接入** | US 9 | Ticket 02 | `src/agent/tools/mcp_tools.py`<br>`src/agent/core/mcp_client.py` | `implemented` | MCP Tool schema 动态解析、鉴权 Header 传递、网络超时控制与结果结构化回传。 |
| M06 | **知识接入与 RAG 注入** | US 10 | Ticket 02 | `src/agent/tools/rag_tool.py`<br>`src/server/services/rag_service.py`<br>Commit `4cebb66` | `implemented` | 向量召回、`dataset_ids` 显式感知、RAG 引用指引（`RAG_CITATION_GUIDANCE`）注入 prompt 机制。 |
| M07 | **模型推理过程提取** | US 37 | Ticket 02 | `src/agent/factory/reasoning_handler.py`<br>`src/server/services/llm_service.py` | `implemented` | DeepSeek 推理模型 `<think>` 标签拦截、流式解析与独立 reasoning 事件流分发。 |
| M08 | **LangGraph Checkpoint 与持久化** | US 6, 17 | Ticket 02 | `src/agent/factory/agent_factory.py`<br>`src/server/services/session_service.py` | `implemented` | Checkpointer 配置、线程级状态快照持久化、跨会话恢复机制。 |

### 2.2 协议层与流式生命周期 (Audit Domain 2 -> Ticket 02)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M09 | **AG-UI 协议事件集** | US 25 | Ticket 02 | `docs/AG-UI_协议_参数说明.md`<br>`uv.lock` (`ag-ui-protocol 0.1.19`) | `implemented` | `RUN_STARTED/RUN_FINISHED/RUN_ERROR`、`TEXT_MESSAGE_*`、`TOOL_CALL_*`、`ACTIVITY_SNAPSHOT`、`CUSTOM` 事件契约。 |
| M10 | **事件桥接与转换 (Event Bridge)** | US 26 | Ticket 02 | `src/agent/long_task/event_bridge.py`<br>`docs/ag_ui与langgraph messages融合策略.md` | `implemented` | LangGraph 内部运行事件向 AG-UI 协议事件的规范化映射与状态解耦。 |
| M11 | **Streaming 与 Blocking 双模一致性** | US 27 | Ticket 02 | `src/server/services/agent_blocking_aggregator.py`<br>`tests/test_agent_blocking_aggregator.py` | `implemented` | 同一事件流在 SSE 流式接口与 HTTP Blocking 接口中的消费与聚合机制。 |
| M12 | **断连检测与取消传播** | US 28 | Ticket 02 | `tests/test_streaming_disconnect.py`<br>Commit `2a48b9c` | `implemented` | 客户端断开连接捕获、取消信号广播、后台任务安全退出与流正常关闭保障。 |

### 2.3 Long Task 编排、Workspace 与 Daytona 沙箱 (Audit Domain 3 -> Ticket 03)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M13 | **Long Task 编排主干与生命周期** | US 11 | Ticket 03 | `src/server/services/long_task_agent_service.py`<br>`src/agent/long_task/factory.py` | `implemented` | 一次长任务端到端主线：请求解析、Workspace 绑定、Agent 构建、Middleware 链装配、事件流式分发、资源收尾。 |
| M14 | **DeepAgents 0.6.12 中文运行时补丁** | US 11 | Ticket 03 | `src/agent/long_task/chinese_deep_agent.py`<br>`uv.lock` (`deepagents 0.6.12`) | `implemented` | 动态 monkey-patch 机制、系统提示词汉化、语言指令置顶策略（不污染 site-packages）。 |
| M15 | **Workspace 状态机与资源治理** | US 12 | Ticket 03 | `src/server/services/workspace_service.py`<br>`tests/test_workspace_service_lifecycle.py` | `implemented` | `thread_id` 到 `workspace_id` 映射；`ALLOCATING -> ALLOCATED -> RECLAIMING -> RECLAIMED -> DESTROYING` 状态机；进程重启 claim 恢复。 |
| M16 | **Daytona 沙箱后端与执行隔离** | US 12, 37 | Ticket 03 | `src/server/services/workspace_service.py`<br>`tests/test_sandbox_type.py`<br>`Dockerfile.daytona.sandbox` | `implemented` | Daytona API Client 集成、专属线程池调度、超时保护、Standard 与 Snapshot 沙箱类型差异。 |
| M17 | **密文环境变量安全注入** | US 13 | Ticket 03 | `src/agent/long_task/sandbox_env.py`<br>`tests/test_sandbox_env.py` | `implemented` | 请求传入 AES 密文解密、规范化校验、每次 execute 前 export 注入、日志脱敏掩码。 |
| M18 | **文件与测试夹具导入沙箱** | US 14 | Ticket 03 | `src/server/services/sandbox_file_import_service.py`<br>`src/server/services/local_fixture_import_service.py` | `implemented` | 对象存储文件下载与本地夹具文件灌入沙箱 `/workspace` 的路径映射与错误处理。 |
| M19 | **长任务异常分层拦截与恢复** | US 34 | Ticket 03 | `tests/test_long_task_initialization_error.py`<br>`src/agent/long_task/tool_error_guard_middleware.py` | `implemented` | 沙箱初始化失败、大模型超时、工具执行异常等故障的分层捕获与流关闭保障。 |

### 2.4 产物持久化与 Artifact Durability (Audit Domain 4 -> Ticket 03)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M20 | **Artifact 目录扫描与外化** | US 15 | Ticket 03 | `src/server/services/artifact_service.py`<br>`src/agent/long_task/tools.py` | `implemented` | 监控 `/workspace/artifacts/` 目录、`export_artifacts` 工具调用、元数据上报。 |
| M21 | **Hash 去重与并发锁治理** | US 15 | Ticket 03 | `src/server/services/artifact_service.py#L30-L110` | `implemented` | per-thread 异步互斥锁（防止多任务阻塞）、`sha256` 内存缓存比对、幂等防止重复外化。 |
| M22 | **沙箱重建后 Artifact 回灌 (Restore)** | US 16 | Ticket 03 | `src/server/services/artifact_service.py`<br>`tests/test_artifact_restore.py` | `implemented` | 沙箱失效/重建时从对象存储拉取历史产物回灌至新沙箱、Hash 校验、部分失败容错机制。 |

### 2.5 记忆体系、上下文自动压缩与过程知识 (Audit Domain 5 -> Ticket 04)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M23 | **三层上下文概念与隔离** | US 17 | Ticket 04 | `docs/deepagents-memory-integration.md`<br>`docs/long-task-memory-prd.md` | `implemented` | 明确区分多轮对话历史、LangGraph Checkpoint 与持久化 Long-term Memory。 |
| M24 | **Memory 命名空间与后端存储** | US 18 | Ticket 04 | `src/agent/long_task/memory_backend.py`<br>`tests/test_long_task_memory_backend.py` | `implemented` | `USER_GLOBAL` 与 `USER_AGENT` 独立隔离作用域、虚拟 `preferences.md` 读写协议与后端 API 路由。 |
| M25 | **上下文自动压缩机制** | US 19 | Ticket 04 | `src/agent/long_task/observed_summarization_middleware.py`<br>`prd/long_task_context_auto_compaction_prd.md` | `implemented` | Token 预算阈值触发、结构化摘要提示词、消息修剪与替换、压缩失败优雅降级。 |
| M26 | **压缩过程可观测性** | US 20 | Ticket 04 | `src/agent/long_task/context_compaction_events.py` | `implemented` | 捕获并向前端分发 `usage_updated`、压缩开始/完成事件，上报 Opik。 |
| M27 | **Skill 导入、签名与沙箱 Manifest** | US 21 | Ticket 04 | `src/server/services/skill_import_service.py` | `implemented` | Zip 导入、技能集合与资源身份签名、沙箱 `.langagent_manifest.json` 写入。 |
| M28 | **Skill 动态选择机制** | US 21 | Ticket 04 | `src/agent/long_task/factory.py`<br>`tests/test_long_task_skill_selection.py` | `implemented` | 任务意图与 Skill 元数据匹配选择与测试覆盖。 |
| M29 | **Skill 激活观测与去重** | US 22 | Ticket 04 | `src/agent/long_task/skill_activation_middleware.py`<br>`tests/test_long_task_skill_activation.py` | `implemented` | 拦截成功的 `read_file(SKILL.md)`、发射 `skill_activation` ActivitySnapshot 事件并执行激活去重。 |

### 2.6 Human-in-the-loop (Ask User) 机制 (Audit Domain 6 -> Ticket 04)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M30 | **Ask User 强类型 Contract** | US 23 | Ticket 04 | `src/agent/ask_user/contracts.py` | `implemented` | Pydantic 模型校验（`AskUserQuestion`）、2-4 个选项约束、敏感词拒绝拦截。 |
| M31 | **中断挂起与 Command Resume** | US 23 | Ticket 04 | `src/agent/ask_user/tool.py` | `implemented` | LangGraph `interrupt()` 挂起状态、稳定 `request_id` 生成、前端答案回传后的精确恢复。 |
| M32 | **Ask User 异常与防御路径** | US 24 | Ticket 04 | `src/agent/ask_user/contracts.py`<br>`src/agent/ask_user/tool.py` | `unconfirmed` (待Ticket 04审计) | 用户重复提交答案防重放、快照缺失容错、取消及恢复失败降级策略（待 Ticket 04 审计细化）。 |

### 2.7 业务子图、A2UI 与 ChatBI 升级 (Audit Domain 7 -> Ticket 05)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M33 | **ChatBI 架构升级 (Decision 插叙)** | US 29, 30 | Ticket 05 | `src/agent/graph/subgraphs/chatbi/`<br>Branch `sunxichen/chatbi-agent-loop` | `prototype_verified` (待Ticket 05审计) | 从固定 5 节点串行图升级为 Agent Loop（分支已验证，未合入 develop），审计演进动机与代价。 |
| M34 | **SQL 生成、自检与纠错循环** | US 31 | Ticket 05 | `src/agent/graph/subgraphs/chatbi/prompts/sql_generation.py`<br>`src/agent/graph/subgraphs/chatbi/prompts/sql_correction.py` | `implemented` | Schema 检索、DDL 渲染、SQL 语法检查、执行错误反馈重写循环与最大重试退出条件。 |
| M35 | **DataEnvelope 数据契约封装** | US 29 | Ticket 05 | `src/agent/schemas/data_envelope.py`<br>`src/agent/tools/envelope_tool.py` | `implemented` | 强类型数据包定义、查询结果集承载、跨工具/子图/节点的状态流转与消费规范。 |
| M36 | **Visualization 白盒子图 (AntVChart)** | US 32 | Ticket 05 | `src/agent/nodes/visualization_nodes/nodes.py`<br>`src/agent/graph/subgraphs/visualization_graph.py` | `implemented` | DataEnvelope 输入、AntV G2/AntVChart 图表 Spec 生成、校验失败自动重试、ToolMessage 回传。 |
| M37 | **Report 报告生成业务子图** | US 33 | Ticket 05 | `src/agent/graph/subgraphs/report_graph.py`<br>`src/server/services/manual_report_service.py` | `implemented` | 手动/自动报告生成入口、Markdown/Docx 格式转换、流式进度与状态输出契约。 |
| M38 | **A2UI 生成式 UI 基础能力** | US 33 | Ticket 05 | `langAgent/src/agent/graph/subgraphs/a2ui_graph.py`<br>`langAgent/tests/test_a2ui_subgraph.py`<br>用户第一轮 Grilling 口述 | `prototype_verified` (待Ticket 05审计) | 结构化 UI Spec 生成、A2UI Tool 封装、瑞幸点单 POC 验证；用户确认为早期已实现基础能力。 |

### 2.8 平台演进：工作流与多智能体团队 (Audit Domain 8 -> Ticket 06)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M39 | **Workflow vs Agent Loop 范式边界** | US 38 | Ticket 06 | `prd/AI智企平台_产品PRD.md`<br>`docs/MUST_READ.md` | `design_complete` | 确定性低成本流水线 vs 开放式探索 Agent 的适用场景划分与双引擎定位。 |
| M40 | **Dify vs LangFlowMVP 选型与 Fallback Gate** | US 40 | Ticket 06 | `/Users/sunxichen/Projects/dify`<br>`/Users/sunxichen/Projects/langFlowMVP`<br>`prd/AI智企平台_产品PRD.md` | `design_complete` | 评估 Dify 与 LangFlowMVP 在 DSL、节点执行、并发与调试上的优劣，设计 Fallback Gate 方案。 |
| M41 | **Workflow 运行时契约与事件适配** | US 39 | Ticket 06 | `prd/AI智企平台_产品PRD.md` | `design_complete` | Workflow asset/version 定义、统一 Request/Context/Result、AG-UI 事件适配与 Workflow-as-tool。 |
| M42 | **Agent Teams 调度与持久协作架构** | US 41 | Ticket 06 | `docs/docs/Agent_Teams_PRD_与技术方案.md`<br>`docs/docs/adr/0001-0006` | `design_complete` | Orchestrator 路由、Persistent Teammates、Assignment 准入控制、同步/后台并行与双层超时控制。 |
| M43 | **Team Event、审计模型与权限边界** | US 42 | Ticket 06 | `docs/docs/adr/0004-durable-team-assignment-admission-control.md`<br>`docs/docs/adr/0006-team-runtime-records-are-the-mvp-audit-source.md` | `design_complete` | Team Event 数据流、Read Model 聚合、断连持续执行、权限继承与 MVP 审计源规范。 |

### 2.9 生产化工程、可观测性与安全 (Audit Domain 9 -> Tickets 02, 03, 07)
| 机制序号 | 机制名称 (Mechanism) | Spec 对应条款 | 目标 Ticket | 预期主要证据 (Primary Evidence) | 目标成熟度预判 | 审计关注要点 (Audit Focus) |
|---|---|---|---|---|---|---|
| M44 | **分层错误处理与故障隔离** | US 34 | Ticket 02, 03 | `tests/test_long_task_initialization_error.py`<br>`src/server/routes/agent_routers.py` | `implemented` | 拒绝统一吞掉异常；区分协议层错误、大模型超时、工具异常、沙箱崩溃分层响应。 |
| M45 | **幂等性、相关性与日志脱敏** | US 35 | Ticket 02, 03 | `tests/test_http_headers.py`<br>`src/server/services/artifact_service.py` | `implemented` | Trace ID / Correlation ID 全链路透传、产物外化幂等去重、工具敏感参数掩码遮蔽。 |
| M46 | **Opik 与指标度量体系** | US 36 | Ticket 02, 03 | `src/agent/core/opik_integration.py`<br>`src/agent/middleware/tool_statistics_collector.py` | `implemented` | Opik 链路追踪集成、工具执行耗时与成功率统计、Run 与 Workspace 关联度量。 |
| M47 | **Nacos 配置中心动态获取** | US 7 | Ticket 02 | `docs/NACOS_CONFIG_GUIDE.md`<br>`src/server/services/nacos_prompt_service.py` | `implemented` | Prompt 与 Agent 配置动态拉取，区分已实现读取与待审计热更新。 |

---

## 3. 覆盖完整性机械核验统计 (Zero-Omission Mechanical Verification)

- **Spec User Stories 逐条对齐统计**：`57 / 57` 项 User Stories 已在第 1 节表格中完成**逐条独立覆盖**（US 01 至 US 57 全量对齐，无任何合并折叠）。
- **技术机制分解**：从 57 项需求中提炼出 47 项具体工程机制（M01 至 M47），精确分配到 Tickets 02 至 06。
- **架构决策与演进对齐**：ChatBI 升级（US 30 / M33）、A2UI 交互（US 33 / M38）、Daytona 密文环境变量（US 13 / M17）、Workflow 选型（US 40 / M40）、Agent Teams ADR（US 41-42 / M42-M43）均已列入重点审计。
- **成熟度区分**：严格区分 `implemented`（develop 已合入）、`prototype_verified`（分支/本地原型已跑通）、`design_complete`（PRD/ADR 已完成设计）、`unconfirmed`（待审计确认）与 `not_applicable`（写作与流程规范），杜绝把演进与原型混为 develop 主线代码。
