# Ticket 05 & Ticket 06 设计资料与契约审计报告 (Design Source Audit)

> **审计定位**：针对 ChatBI、A2UI、Workflow/Chatflow、Agent Teams 的 PRD、SPEC、Tickets、ADR 与调研文档的独立设计资料核验基线，支持 Ticket 05 与 Ticket 06 的后续事实提炼与技术叙事，不直接修改 Ticket 05/06 的交付物。  
> **审计日期**：2026-08-27  
> **核验基线与只读源**：`/Users/sunxichen/Projects/langAgent`（PRD、Docs、ADR、Issues）、`.scratch/langagent-develop-reference`（当前代码运行基线 @ `4cebb661e88e02f5119fd013236c1402dc3d2cf8`）  

---

## 1. 审计方法论与核心准则

1. **文档状态与效力定性**：
   * `早期设计 (Early/Superseded)`：已被后续 PRD 或架构设计取代的历史探索文档（如 ChatBI 固定流水线方案、DeepAgents 0.4.8 早期评估）。
   * `当前有效设计 (Current Design)`：作为当前实现依据或最新确认的设计规格（如 `Agent_Teams_PRD_与技术方案.md`、`ADR 0001-0006`、`a2ui-luckin-poc.md`）。
   * `演进规划 (Proposed/Roadmap)`：仅停留在设计期、未进入当前交付切片的高级特性（如 Agent Teams Slice 2-6、A2UI 业务组件沉淀）。
2. **证据证明力边界**：
   * **文档目标 $\ne$ 代码实现**：PRD / SPEC 中的“已完成”、“计划交付”、“User Story”只能证明产品设计意图与接口契约，不能作为代码已落地的证据。
   * **Markdown Ticket 状态 $\ne$ 运行时事实**：文档中的 `Status: ready-for-agent`、`Status: accepted`、`Type: AFK` 仅为项目管理标签，不能直接证明功能已通过测试验证。
   * **代码 $\ne$ 原始设计**：代码中的临时 Hack 或未清理遗留物不能倒推为原始设计决策。
   * **外部候选引擎语义 $\ne$ 项目决策**：`/Users/sunxichen/Projects/dify` 与 `langFlowMVP` 仅能证明外部候选工作流引擎的自身机制，不能证明 langAgent 内部的架构采纳或演进决策。

---

## 2. ChatBI 体系文档逐份审计表

| Source 文件 | Status / 日期 | 类别 | Direct Claims (直接设计契约/意图) | Cannot Prove (不能证明什么) | Related Ticket | Conflict / Delta (演进冲突与差异) |
|---|---|---|---|---|---|---|
| `chatbi_data_flow_prd.md` | `design_complete` / 无显式日期 | 当前有效设计 | 1. 规定了查询结果智能截断：$\le 20$ 行全量返回给 LLM（`is_truncated=false`）；$> 20$ 行仅截取前 5 行预览（`is_truncated=true`），全量数据入 `state["data_envelope"]`。<br>2. 规划可视化子图 payload 组装：$\le 500$ 行走 `embedded` 模式直接下发数据；$> 500$ 行走 `lazy_fetch` 模式，前端调用 `/api/v1/query_by_sql` 分页懒加载。 | 1. 不能证明前端 UI 已经实现了基于 `mode: lazy_fetch` 的分页接口对接。<br>2. 不能证明实际生产环境的大数据量渲染性能指标。 | Ticket 05 (ChatBI & A2UI) | 该文档重点解决海量数据上下文溢出与 Token 消耗问题，与早期将全部查询结果回传给 LLM 的旧模式形成鲜明对比。 |
| `chatbi_agentic_redesign_analysis.md` | `deprecated` / 早期分析 | 早期诊断分析 | 1. 诊断旧 ChatBI 架构为 5 节点固定 DAG 流水线（`query_rewrite` $\to$ `sql_generation` $\to$ `sql_self_check` $\to$ `error_correction` $\to$ `exit`），LLM 仅充当单次补全器。<br>2. 指出 7 大结构性缺陷：脆弱的单次纠错、全量 Schema 暴力灌入、缺失 Schema Linking 与 Value Grounding、Few-shot 关键词粗糙匹配、同步 HTTP 阻塞与非序列化对象进 state。<br>3. 提出早期 5 工具探索式 Agent Loop 设计建议（含 `get_table_schema` 工具）。 | 1. 不能证明所分析的 7 个缺陷在当时全部线上发生了故障（属于静态代码诊断）。<br>2. 不能证明其提出的动态探索式 `get_table_schema` 工具被最终采纳。 | Ticket 05 (ChatBI & A2UI) | **关键 Delta**：文档中建议的 `get_table_schema` 动态按需探索工具，在后续实施方案（`chatbi_implementation_plan.md`）中被**明确否定**（因单技能仅 3~4 张表，直接全量内联更优）。 |
| `chatbi_implementation_plan.md` | `design_complete` / 2026 方案 | 当前有效设计 | 1. 明确关键决策：移除独立 `query_rewrite`（由 Agent 推理自然覆盖）；全量 Schema 直接内联 System Prompt（无需 `get_table_schema` 工具）；`MAX_ITERATIONS` 默认 5；Fallback 采用提交最后一次 SQL 附带 `confidence: "low"`。<br>2. 定义 4 个核心工具：`probe_column_values`（Value Grounding）、`execute_sql`（试执行与纠错）、`submit_final_sql`（结束信号）、`submit_clarification`（结构化追问）。<br>3. 定义三段式图架构：`prepare_context_node` $\to$ `agent_reasoning_node` + `tool_execution_node` $\to$ `finalize_node`。 | 1. 不能证明 Phase 2（`probe_column_values`、`submit_clarification`）与 Phase 3（Schema 缓存、自动分解）在 develop 运行时均已完全就绪。<br>2. 规划的 pytest 测试用例路径不能证明测试已执行通过。 | Ticket 05 (ChatBI & A2UI) | 取代了 `chatbi_agentic_redesign_analysis.md` 的动态选表设计，将工具集从 5 个收敛为 4 个，确立了全量 M-Schema 内联模式。 |
| `ichatbi_upgrade_implementation_plan.md` | `design_complete` / 2026 方案 | 当前有效设计 (同上一份的变体) | 1. 确认单技能 = 1 个 `app_info_id` = 3~4 张表或 1 张宽表，约 2000~4000 tokens，内联可省去 1 轮工具调用延迟。<br>2. 强调 ChatBI 子图无权直接与用户交流，追问必须以结构化数据（`submit_clarification`）返回给主 Agent 决策。<br>3. 提出详细的 Proposed Changes 清单与文件迁移计划。 | 1. 不能证明旧节点文件（`query_parse_node.py`、`sql_self_check_node.py` 等）已被物理删除或清理。<br>2. 文档中的“用户确认的关键决策”不能证明线上已上线。 | Ticket 05 (ChatBI & A2UI) | 与 `chatbi_implementation_plan.md` 保持高度一致，再次固化了全量 Schema 内联与结构化追问的设计意图。 |
| `mock_chatbi_graph.py` (源码) | `implemented` / 源码 | 独立实现 | 实现了独立的 Mock ChatBI 子图与工具节点，用于无后端数据源时的独立前端联调与链路贯通。 | 不能证明真实业务 SQL 执行的准确率与 Schema 映射能力。 | Ticket 05 (ChatBI & A2UI) | 作为真实 ChatBI 依赖未就绪时的独立降级与联调桩。 |

---

## 3. A2UI + 瑞幸 MCP 在线下单 PoC 文档逐份审计表

| Source 文件 | Status / 日期 | 类别 | Direct Claims (直接设计契约/意图) | Cannot Prove (不能证明什么) | Related Ticket | Conflict / Delta (演进冲突与差异) |
|---|---|---|---|---|---|---|
| `prd/a2ui-luckin-poc.md` | `ready-for-agent` / PoC PRD | 当前有效设计 | 1. 业务场景：以瑞幸咖啡在线下单（查门店 $\to$ 搜商品 $\to$ 选属性 $\to$ 预览 $\to$ interrupt 确认 $\to$ 下单 $\to$ 支付码）为验证场景。<br>2. 架构模式：采用“主 Agent + A2UI 子图”架构；主 Agent 编排 MCP 工具与 `render_a2ui`；A2UI 子图负责生成 A2UI JSON 并发射 `a2ui_surface` activity。<br>3. 协议模式：采用 A2UI 官方 `createSurface` + 多次 `updateComponents` 分批流式渲染；Catalog 采用 Google 官方 Basic Catalog。<br>4. 交互回流：普通操作（选店、加购）作为新 User Message 发回；关键操作（下单、取消）通过 LangGraph `interrupt/resume` 实现 HITL。 | 1. 明确声明**非目标**：不包含支付回调、订单轮询、真实定位、多用户鉴权、业务组件（ShopCard 等）与模板缓存。<br>2. 不能证明其为生产级线上系统（明确定义为 PoC 演示）。<br>3. 不能证明 `@a2ui/react` 在多终端全兼容。 | Ticket 05 (ChatBI & A2UI) | 将原本离散的 `antv_chart`、`file_download` 自定义 JSON 统一升级为组件化 A2UI 协议，验证了 LLM 动态组合 UI 与 MCP 协同能力。 |
| `prd/issues/README.md` | `ready-for-agent` / 任务索引 | 任务拆分索引 | 定义了 8 个阶段性 Issues（#1 瑞幸 MCP 接入 $\to$ #2 A2UI 子图骨架 $\to$ #3 render_a2ui 工具 $\to$ #4 主 Agent 编排 $\to$ #5 Interrupt/Resume $\to$ #6 前端 Demo $\to$ #7 交互回流 $\to$ #8 端到端演示）。 | 不能直接作为代码已全部实现的证据，必须查验具体代码与 demo 脚本。 | Ticket 05 (ChatBI & A2UI) | 展示了 A2UI PoC 的工程落地依赖路径。 |
| `prd/issues/01-luckin-mcp-integration.md` | `AFK` / 任务 Spec | 实施 Spec | 规定使用 `fastmcp` 客户端连接瑞幸 MCP Server，注册 8 个核心工具（`queryShopList`, `searchProductForMcp`, `switchProduct`, `queryProductDetailInfo`, `previewOrder`, `createOrder`, `queryOrderDetailInfo`, `cancelOrder`），硬编码坐标。 | 不能证明外部瑞幸 MCP 服务在运行时的可用性与稳定性。 | Ticket 05 (ChatBI & A2UI) | 为 A2UI 提供真实业务数据源。 |
| `prd/issues/02-a2ui-subgraph.md` | `AFK` / 任务 Spec | 实施 Spec | 定义 A2UI 子图三段式流转：`emit_create_surface` $\to$ `plan_batches` $\to$ `generate_batch` 循环，利用 Basic Catalog 输出 JSON 并通过 schema validate（最多重试 2 次）。 | 不能证明任意复杂 Prompt 下 LLM 生成的 A2UI JSON 均为零语法错误。 | Ticket 05 (ChatBI & A2UI) | 实现了 LLM 规划与分批流式组装机制。 |
| `prd/issues/03-render-a2ui-tool.md` | `AFK` / 任务 Spec | 实施 Spec | 定义主 Agent 调用的 `render_a2ui` 工具契约：入参为 `data` 与 `intent`，输出为调用 A2UI 子图生成的组件化 UI 载荷。 | 不能证明主 Agent 在所有场景下都能准确识别何时调用 `render_a2ui`。 | Ticket 05 (ChatBI & A2UI) | 确立了主图与渲染子图的解耦边界。 |
| `prd/issues/04-main-agent-orchestration.md` | `AFK` / 任务 Spec | 实施 Spec | 规定主 Agent System Prompt、8 个 MCP 工具与 `render_a2ui` 工具的统一编排逻辑，支持自取下单多轮对话。 | 不能证明复杂异常情况下的对话自愈能力。 | Ticket 05 (ChatBI & A2UI) | 实现了 ReAct 意图理解与工具路由。 |
| `prd/issues/05-interrupt-resume-hitl.md` | `AFK` / 任务 Spec | 实施 Spec | 规定在调用 `createOrder` 与 `cancelOrder` 前执行 `interrupt({"type": "confirm_order", "payload": ...})`，等待前端 resume 信号。 | 不能证明多实例并发下的持久化重放安全性。 | Ticket 05 (ChatBI & A2UI) | 验证了 LangGraph 原生 `interrupt/resume` 在关键业务动作上的防误触价值。 |
| `prd/issues/06-frontend-demo.md` | `AFK` / 任务 Spec | 实施 Spec | 规定前端使用独立 Vite + React + `@a2ui/react` 构建 Demo 页面，解析 SSE 中的 `a2ui_surface` activity 并渲染。 | 不能证明其已合入企业主前端工程（明确为独立 Demo 项目）。 | Ticket 05 (ChatBI & A2UI) | 验证了端到端渲染管道。 |
| `prd/issues/07-interaction-reflux.md` | `AFK` / 任务 Spec | 实施 Spec | 规定 A2UI 动作回流逻辑：普通点击封装为 user message 发送；确认动作调用 resume 接口。 | 不能证明复杂表单状态的双向绑定。 | Ticket 05 (ChatBI & A2UI) | 实现了 UI 到 Agent 的动作闭环。 |
| `prd/issues/08-e2e-demo-script.md` | `HITL` / 演示剧本 | 验收剧本 | 提供了完整的演示台词、操作步骤、对比展示（同一个问题问两次展示 UI 差异）与异常恢复预案。 | 不能证明系统具备超出剧本范围的任意泛化稳定性。 | Ticket 05 (ChatBI & A2UI) | 作为 PoC 验收与团队认知对齐的实证材料。 |

---

## 4. Agent Teams & ADR 文档逐份审计表

| Source 文件 | Status / 日期 | 类别 | Direct Claims (直接设计契约/意图) | Cannot Prove (不能证明什么) | Related Ticket | Conflict / Delta (演进冲突与差异) |
|---|---|---|---|---|---|---|
| `Agent_Teams_PRD_与技术方案.md` | `Ready for implementation` / 2026-08-14 | 当前总纲设计 (Master PRD) | 1. 资产定义：Team 是由 1 个 Orchestrator + 1～10 个已有 Type 7 Claw Agent 组成的独立组合资产；Team 拥有独立展示身份，不创建私有 Agent。<br>2. 交互模型：用户只与 Orchestrator 交互；Teammate 是 worker，**禁止 Ask User / HITL**，只向 Orchestrator 返回纯文本总结；Teammate 执行流对用户严格只读。<br>3. 实例生命周期：一个成员在同一 Team Thread 中最多动态创建一个持久 Teammate 实例，后续任务复用同一 thread 与 Workspace。<br>4. 调度与并发：单个 Team Thread **硬限制最多 3 个 active Teammate Run**，超出进入 FIFO 队列（由 `aibot-service` 持久调度器控制，不用内存信号量）；软等待 5 分钟（最多追加 3 次），硬上限 2 小时。<br>5. 三层流架构：Orchestrator 走现有 AG-UI 主流；常驻 status SSE 同步成员状态；按需 detail SSE + REST 游标加载只读 Timeline。 | 1. 文档声明为 MVP 方案，不能证明后续 Slice 2-6 的多端/多活运行时已全部上线。<br>2. 不能证明其支持嵌套 Team 或跨 Team 资源池调度（明确为非目标）。<br>3. 文档中规划的 8 张持久化表不能直接证明物理数据库已全部执行迁移。 | Ticket 06 (Agent Teams & Multi-Agent) | 确立了 Agent Teams 的总体架构基石，明确了与单 Agent、工作流和 stock DeepAgents 的边界。 |
| `sunxichen/work/agent-team/PRD.md` | `ready-for-agent` / Slice 1 PRD | 切片实施 Spec | 1. 范围限定：**仅交付 Slice 1 资产闭环**（`agent_team`、`agent_team_member` 增删改查、管理端单页表单、权限复用、发布中心 `AGENT_TEAM` 资产适配、Agent 删除引用保护）。<br>2. 明确非目标：**本切片不包含任何运行时代码、Team 会话页面或执行调度器**（运行时在后续切片交付）。<br>3. 保护机制：被未删除 Team 引用的 Agent 禁止物理删除，提示引用数量；Team 资产保存覆盖有效定义，不建版本快照。 | 1. **明确不能证明用户端已能运行 Agent Team**（Slice 1 仅完成管理端资产配置与发布）。<br>2. 不能证明已支持版本回滚或灰度发布。 | Ticket 06 (Agent Teams & Multi-Agent) | 作为 `Agent_Teams_PRD_与技术方案.md` 的第一个落地子集，严格限制了交付边界，防止过度承诺运行时能力。 |
| `sunxichen/work/agent-team/issues/01-07` | `ready-for-agent` / 任务 Spec | 任务拆分 Spec | 细化了 Slice 1 的 7 个任务：01 资产持久化与 CRUD API、02 候选 Agent 查询 API、03 列表与权限校验、04 引用删除保护、05 发布中心适配、06 管理端模块 UI、07 前端删除提示与消息。 | Markdown 中的 task 状态不能证明 Java 后端和 Vue 管理端代码已经全部编译部署。 | Ticket 06 (Agent Teams & Multi-Agent) | 实现了 Slice 1 的工程拆解。 |
| `ADR 0001` | `accepted` / 架构决策 | 架构决策记录 | **Agent Teams 跟随最新有效 Agent 配置**：Team 角色只保存 `agent_id` 引用，不保存 Agent 版本快照；每个 Run 启动时解析最新有效配置并记录 `config_hash`；不支持版本回滚与精确重放。 | 不能证明系统能自动追溯由于底层 Agent 人设变更导致的回答不一致原因。 | Ticket 06 (Agent Teams & Multi-Agent) | 权衡决策：舍弃复杂不可变版本中心，换取与单 Agent 配置生命周期的完全一致与极低复杂度。 |
| `ADR 0002` | `accepted` / 架构决策 | 架构决策记录 | **基于 Agent Protocol 动态创建持久 Teammate**：首次委派懒创建持久 thread，后续复用；排队 Follow-up（上限 5 条）；`interrupt_and_redirect` 替换工作并清空队列；软等待到期显式决策；不使用 stock DeepAgents `AsyncSubAgentMiddleware`（因其每次新建 thread）。 | 不能证明三方自研 Agent Protocol 服务在所有复杂网络下的连接健壮性。 | Ticket 06 (Agent Teams & Multi-Agent) | 解决了成员实例爆炸与上下文丢失问题，确立了一成员一持久 Teammate 的模型。 |
| `ADR 0003` | `accepted` / 架构决策 | 架构决策记录 | **已有 Team Thread 跟随最新 Team 定义**：Team Thread 绑定稳定 `team_id`；每个新 Orchestrator Run 读取最新 Team 定义；已移除成员保留历史卡片与 Timeline，但不接新任务；用户侧不提供版本升级确认。 | 不能证明管理员在中途频繁修改 Team 结构时用户无困惑感。 | Ticket 06 (Agent Teams & Multi-Agent) | 保持资产原地演进，避免会话迁移与版本升级带来的割裂。 |
| `ADR 0004` | `accepted` / 架构决策 | 架构决策记录 | **基于持久分配调度的三槽位准入控制**：单个 Team Thread 硬限制 3 个 active Teammate Run；限制由 `aibot-service` 持久调度器与 Run lease 保证，禁止使用进程内 `asyncio.Semaphore`，禁止 fork DeepAgents。 | 不能证明全平台维度的全局并发防击穿能力（MVP 仅做了单 Thread 级限流）。 | Ticket 06 (Agent Teams & Multi-Agent) | 确保多副本与服务重启下并发限制不失效，防止沙箱与算力超载。 |
| `ADR 0005` | `accepted` / 架构决策 | 架构决策记录 | **复用单 Agent 权限模型**：不新增 `TEAM_MANAGE/TEAM_ASK`；Team 独立存储权限记录；用户只需 Team 使用权即可运行，不要求所有成员 Agent 的直接权限；底层数据鉴权（MCP/知识库）继续向下透传用户身份。 | 不能证明企业极度严苛的细粒度成员级行权限控制需求。 | Ticket 06 (Agent Teams & Multi-Agent) | 避免权限并集/交集计算带来的复杂度爆炸，保证产品心智统一。 |
| `ADR 0006` | `accepted` / 架构决策 | 架构决策记录 | **运行时记录即 MVP 审计事实源**：不新建独立审计中心；`TeamThread / Assignment / TeammateRun / TeamEvent` 作为事实源；完整指令与过程仅保留在 Timeline，不复制第二套载荷。 | 不能证明满足金融/合规要求的独立防篡改归档审计。 | Ticket 06 (Agent Teams & Multi-Agent) | 降低 MVP 基建开销，复用现有消息历史与 Opik Trace。 |
| `deepagents-interpreter-subagents-evaluation.md` | `调研备忘` / 2026-07-22 | 框架评估报告 | 1. 评估了 DeepAgents 0.5/0.6 的 Interpreter、Dynamic Subagents、Async Subagents 和 v3 Event Streaming。<br>2. 结论：Interpreter 适合高级批量编排，不能替代持久运行时；Async Subagents 高度匹配但缺少企业级多 Agent 视图协议；推荐阶段 1 同步串行、阶段 2 异步并行。 | 1. **不能证明项目已升级或全量使用了 Interpreter 或 Dynamic Subagents**。<br>2. 调研时项目仍锁定 `deepagents 0.4.8`（后升级为 0.6.12）。 | Ticket 06 (Agent Teams & Multi-Agent) | 阐明了平台为什么没有直接照搬开源 stock 机制，而是选择自研三层流与持久调度器的原因。 |

---

## 5. Workflow / Chatflow 专项查证与第二轮 Grilling 清单

### 5.1 仓库查证结论
在 `/Users/sunxichen/Projects/langAgent` 及其文档集中进行了全量检索（包括 `find_by_name` 与 `grep_search`）：
1. **查证结果**：在当前仓库中**不存在**关于可视化工作流（Workflow）、对话流（Chatflow）、DAG 拖拽节点编排或图形化 SOP 的项目 PRD 或技术实现 SPEC（仅存在 ChatBI 内部的数据流 `chatbi_data_flow_prd.md`）。
2. **定性结论**：
   * 在先前的 recap spec 或架构讨论中提及的 Workflow/Chatflow `asset/version/runtime/human-input bridge` 等概念，**仅为第一轮技术讨论的概念基线与候选架构设想，绝不能作为 langAgent 项目的原始设计证据或已实现事实**。
   * 外部参考项目（如 `/Users/sunxichen/Projects/dify` 与 `langFlowMVP`）仅用于解释行业成熟工作流引擎（如 Dify DSL、LangFlow 图执行器）的典型语义，不能证明 langAgent 曾作出过相同的技术选型或代码实现。

### 5.2 需要在第二轮 Grilling 中向用户确认的关键问题清单

```markdown
### Workflow / Chatflow 第二轮 Grilling 提问清单：

1. 【定位与现状澄清】
   在当前 AI 智企平台的产品规划中，Workflow / Chatflow（可视化工作流/对话流编排）目前的真实状态是什么？
   - 选项 A：尚未立项，仅处于竞品调研与概念讨论阶段；
   - 选项 B：已有独立立项但文档与代码维护在其他仓库（如前端独立画布或 Java 独立编排引擎）；
   - 选项 C：平台已决定主推 Agent Teams / Claw 智能体路线，传统固定节点式的 Workflow / Chatflow 已被搁置或降级。

2. 【与 Agent 体系的边界】
   如果未来引入 Workflow / Chatflow，它与当前的 Type 7 Claw Agent 以及 Agent Teams 是何种协作关系？
   - 选项 A：Workflow 作为 Agent 内部调用的某种复杂 Tool / Skill；
   - 选项 B：Workflow 作为外层确定性编排器，节点内部挂载 Agent；
   - 选项 C：完全平行的两套资产体系，分别面向确定性审批流与自主决策任务。

3. 【引擎选型偏好】
   针对工作流执行引擎，团队内部是否有明确的技术路线倾向？
   - 选项 A：自研基于 LangGraph StateGraph 的轻量 DSL 解释器；
   - 选项 B：深度集成或改造 Dify / LangFlow 等成熟开源工作流运行时；
   - 选项 C：复用 Java 业务工作流引擎（如 Flowable / Camunda），仅将大模型作为节点任务接入。
```

---

## 6. Ticket 05 / 06 Worker 禁止过度表述清单 (Prohibited Overstatement List)

为确保 Ticket 05 与 Ticket 06 产物事实严谨、边界清晰，后续 Worker 必须严格遵守以下禁止表述红线：

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               Ticket 05 / 06 禁止过度表述红线对照表                                      │
├───────────────────┬──────────────────────────────────┬─────────────────────────────────────────────────┤
│ 领域 / 模块       │ ❌ 绝对禁止的过度表述 (Prohibited) │ ✅ 真实合规的精准表述 (Compliant Formulation)    │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ ChatBI            │ 宣称 ChatBI 已实现动态 Schema    │ 表述为：ChatBI 评估过按需选表工具，但最终确认采用 │
│ (Ticket 05)       │ 按需探索（`get_table_schema`）   │ 全量 M-Schema 内联（单技能 3~4 张表）的实用策略 │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ ChatBI            │ 宣称 ChatBI 拥有与用户直接对话   │ 表述为：ChatBI 仅以结构化格式（clarification）   │
│ (Ticket 05)       │ 追问的能力                       │ 向主 Agent 抛出疑问，由主 Agent 决策是否追问用户 │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ ChatBI            │ 宣称前端已完全实现 500 行以上    │ 表述为：设计了 embedded 与 lazy_fetch 两种模式， │
│ (Ticket 05)       │ lazy_fetch 自动分页懒加载        │ 但前端分页对接与大数据量表现属于设计契约         │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ A2UI PoC          │ 宣称 A2UI 是生产级完整下单系统， │ 表述为：A2UI 瑞幸下单是验证组件化 UI 生成、MCP   │
│ (Ticket 05)       │ 具备真实支付回调与订单轮询       │ 工具编排与 LangGraph interrupt HITL 的端到端 PoC│
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ A2UI PoC          │ 宣称已沉淀出 ShopCard 等定制业务 │ 表述为：当前 PoC 严格使用 A2UI 官方 Basic        │
│ (Ticket 05)       │ 组件与模板缓存机制               │ Catalog 自由组合，业务组件与模板化属于后续规划   │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ Workflow/Chatflow │ 将 recap spec 中的资产/版本/运行时│ 表述为：langAgent 仓库未发现工作流 PRD/代码，    │
│ (Ticket 05)       │ 桥接写成项目已实现事实           │ 相关概念仅为讨论基线，具体定位待第二轮澄清      │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ Agent Teams       │ 宣称 Agent Teams 完整多智能体    │ 表述为：PRD 完成了总纲架构与 ADR 决策，但当前    │
│ (Ticket 06)       │ 运行时与调度器在主线全部交付     │ 切片严格聚焦于 Slice 1 资产管理与发布闭环        │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ Agent Teams       │ 宣称 Teammate 支持用户直接对话、 │ 表述为：Teammate 严格以 worker 模式运行，禁止    │
│ (Ticket 06)       │ 发送指令、停止或 Ask User 提问   │ Ask User，用户只与 Orchestrator 对话，执行流只读 │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ Agent Teams       │ 宣称三槽位并发限制是由 Python 进 │ 表述为：三槽位并发限制由 aibot-service 持久调度器│
│ (Ticket 06)       │ 程内 `asyncio.Semaphore` 保证的  │ 与 Run lease 保证，不在 Python 内存中控制       │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ Agent Teams       │ 宣称 Agent Teams 具备不可变版本  │ 表述为：Team 仅保存稳定 `agent_id` 引用，新 Run  │
│ (Ticket 06)       │ 快照与回滚中心                   │ 跟随最新有效配置与定义，仅记录 `config_hash`     │
├───────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│ 通用 (General)    │ 将 Markdown Issue 中的 ready/AFK │ 表述为：区分文档规划状态与代码实现状态，        │
│                   │ 状态直接等同于代码实现与测试通过 │ High 置信度必须同时具备实际 code + test 双重证据 │
└───────────────────┴──────────────────────────────────┴─────────────────────────────────────────────────┘
```
