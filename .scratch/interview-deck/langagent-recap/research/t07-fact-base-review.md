# Ticket 07: Fact Base 汇编与交叉审计审查报告 (Synthesis & Review)

> **审计背景**：本报告由全新独立 Context 执行，基于 Ticket 02 至 Ticket 06 的专题 Briefs、事实片段（Fragments）、各领域源码复核报告与设计资料审计报告，完成全局 Fact Base、Evidence Gaps 与三轨底稿的统一归并与交叉审计，并从头完整覆盖旧候选输出。
> **执行角色**：Synthesis Worker (Ticket 07)  
> **审查日期**：2026-08-27  
> **核心产物**：  
> 1. `fact-base.md`（130 条结构化事实底稿与证据全景索引）  
> 2. `evidence-gaps.md`（26 项严格原子化开放式未决证据与第二轮 Grilling 登记册）  
> 3. `research/t07-fact-base-review.md`（本审查报告）  

---

## 1. 独立审计输入材料清单 (Input Sources Checklist)

本轮 Synthesis 完整审查并交叉核验了以下输入数据源与专题交付物：

| 输入类别 | 物理路径 / 查验基线 | 审查重点与证据效力 | 物理路径存在性核验 |
|---|---|---|:---:|
| **总纲与规范** | `spec-recap-blog.md`<br>`source-manifest.md`<br>`mechanism-coverage.md`<br>`issues/07-synthesize-fact-base-and-evidence-gaps.md` | 57 条 User Stories、M01-M47 机制映射、证据分级标准（Tier 1-4）与 9 字段 Schema 规范。 | **PASS (100% 存在)** |
| **专题 Briefs (T02-T06)** | `briefs/t02-runtime-tools-protocol.md`<br>`briefs/t03-long-task-sandbox-artifact.md`<br>`briefs/t04-memory-compaction-skill-ask-user.md`<br>`briefs/t05-business-a2ui-chatbi.md`<br>`briefs/t06-workflow-agent-teams.md` | 各专题技术架构、演进沿革、设计决策与实现细节深度梳理。 | **PASS (100% 存在)** |
| **事实与 Gap 片段 (Fragments)** | `fragments/t02-facts.md` & `fragments/t02-evidence-gaps.md` (3 gaps)<br>`fragments/t03-facts.md` & `fragments/t03-evidence-gaps.md` (3 gaps)<br>`fragments/t04-facts.md` & `fragments/t04-evidence-gaps.md` (7 gaps)<br>`fragments/t05-facts.md` & `fragments/t05-evidence-gaps.md` (6 gaps)<br>`fragments/t06-facts.md` & `fragments/t06-evidence-gaps.md` (7 gaps) | 5 个专题共提取 26 项原始 Gap 与全部结构化事实行。 | **PASS (100% 存在)** |
| **专项复核报告** | `research/t05-fresh-context-review.md`<br>`research/t06-fresh-context-review.md`<br>`research/t05-t06-code-evidence-verification.md`<br>`research/t05-t06-design-source-audit.md` | 节点统计核验（6 命名/5 核心）、A2UI Code+Test 静态验证、Teams 框架中间件对比与 Develop 0 match 负向核验。 | **PASS (100% 存在)** |
| **源码与框架只读源** | `.scratch/langagent-develop-reference` (`develop` 主线)<br>`.scratch/langagent-chatbi-agent-loop-reference` (参考分支)<br>`/Users/sunxichen/Projects/langAgent` (未提交工作树)<br>`.scratch/langagent-framework-sources/deepagents` (`0.6.12`)<br>`.scratch/langagent-framework-sources/langgraph` (`1.2.8`) | 源码行级锚点、测试断言与框架内部调用机制。 | **PASS (100% 存在)** |

---

## 2. 全局 Claim 统计与分布 (Claim Distribution Summary)

本次归并消除了各 Fragment 中的局部别名（如 `CBI`、`VIS`、`REP`、`RAG` 等），全面收敛至 15 项标准分类，严格落实 **DESIGN（设计意图） / DELTA（演进偏差） / FACT（实现事实）** 三轨并存模型。

### 2.1 按分类与三轨分布统计矩阵

| 业务分类领域 (Category) | DESIGN (设计意图) | DELTA (演进偏差) | FACT (实现事实) | 领域小计 (Subtotal) |
|---|:---:|:---:|:---:|:---:|
| **RT (Runtime & Lifecycle)** | 1 | 1 | 11 | **13** |
| **PROTO (HTTP & Transport)** | 0 | 0 | 1 | **1** |
| **TOOL (Tools & MCP & RAG)** | 0 | 0 | 6 | **6** |
| **AGUI (AG-UI Protocol)** | 2 | 0 | 2 | **4** |
| **LT (Long Task & Workspace)** | 3 | 3 | 11 | **17** |
| **ART (Artifact Durability)** | 2 | 1 | 4 | **7** |
| **SEC (Security & Sandbox)** | 0 | 0 | 1 | **1** |
| **MEM (Long-term Memory)** | 2 | 1 | 6 | **9** |
| **CMP (Context Compaction)** | 1 | 1 | 6 | **8** |
| **SKL (Skill System)** | 0 | 1 | 8 | **9** |
| **ASK (Ask User / HITL)** | 3 | 1 | 9 | **13** |
| **BI (ChatBI / Vis / Report)** | 5 | 3 | 7 | **15** |
| **A2UI (Generative UI)** | 2 | 0 | 4 | **6** |
| **TM (Agent Teams)** | 11 | 1 | 3 | **15** |
| **WF (Workflow / Chatflow)** | 2 | 1 | 3 | **6** |
| **全量总计 (Grand Total)** | **34** | **14** | **82** | **130** |

### 2.2 按成熟度 (Maturity) 统计
- `implemented` (已在主线/分支实现): **80 条**
- `prototype_verified` (原型已验证/具备测试): **6 条**（A2UI 4 条 + LT 异常流 1 条 + 瑞幸编排 1 条）
- `design_complete` (正式设计完成/PRD/ADR): **28 条**
- `proposed` (探索性提案/调研规划): **4 条**
- `deprecated` (已废弃早期设计): **8 条**
- `unconfirmed` (基线负向核验待确认): **4 条**
- **总计**: **130 条**

### 2.3 按置信度 (Confidence) 与严格证据准则再审统计

对全量 130 条 Claim 执行了置信度严格再审：
- **FACT High 准则**：必须同时具备代码实现（`code`）与直接相关测试用例（`relevant test`）双重静态证据，且不暗示动态运行已执行通过。经核验，共有 **28 条** FACT 评定为 `High` 置信度（其余 54 条 FACT 因仅具源码、框架依赖或为口述/负向核验而评为 `Medium`）。
- **DELTA High 准则**：当 `maturity=implemented` 且评为 `High` 时，必须满足“设计侧具备冻结/生效设计文档”且“实现侧具备 code + relevant test 证据”。经核验：
  - `DELTA-LT-002` (子图拦截)、`DELTA-ART-001` (产物回灌)、`DELTA-MEM-001` (记忆收敛)、`DELTA-SKL-001` (技能隔离) 均满足双侧 High 规则，评定为 `High`；
  - `DELTA-BI-001` (M-Schema 替代按需选表) 与 `DELTA-TM-001` (中间件 vs Teams 设计) 基于冻结 ADR/方案与锁定框架源码核验，评定为 `High`；
  - `DELTA-LT-001` (SQLite 转向 Internal API) 因实现侧 `WorkspaceService` 的历史生命周期测试存在 skip 用例，从严降级为 `Medium`。
- **DESIGN High 准则**：必须为已冻结、已批准或正式归档的 PRD、SPEC、ADR 或 API 契约（共 **20 条** DESIGN 评为 `High`）。

**最终置信度统计**：
- `High`: **54 条** (28 FACT + 6 DELTA + 20 DESIGN)
- `Medium`: **76 条** (54 FACT + 8 DELTA + 14 DESIGN)
- `Low`: **0 条**
- **总计**: **130 条**

### 2.4 按脱敏与用户确认状态统计
- **Sanitization Status**: `clean` (**130 条**，所有私有凭据、密钥与生产域名已脱敏规范化)
- **User Confirmation Status**:
  - `not_applicable`: **122 条**（纯技术与代码事实）
  - `confirmed`: **4 条**（A2UI PoC 原型由用户口述确认进入基础能力）
  - `pending_grilling_2`: **4 条**（Teams/Workflow 演进重点与物料位置待第二轮 Grilling 确认）

---

## 3. Claim ID 规范化全景映射表 (Fragment ID $\to$ Global Canonical ID)

| Fragment 原始 ID | 全局规范 ID | 归属分类 | 成熟度 | 置信度 | 机制要点简述 |
|---|---|---|---|---|---|
| `T02: DESIGN-RT-001` | `DESIGN-RT-001` | `RT` | `design_complete` | Medium | Nacos 配置监听与 PromptProxy 热更新设计 |
| `T02: DESIGN-AGUI-001` | `DESIGN-AGUI-001` | `AGUI` | `deprecated` | Medium | ToolIDRewriter 原地改写与 1:N 聚合（已废弃） |
| `T02: DESIGN-AGUI-002` | `DESIGN-AGUI-002` | `AGUI` | `design_complete` | Medium | AG-UI + LangGraph 消息融合与 Checkpoint 状态分叉 |
| `T02: DELTA-RT-001` | `DELTA-RT-001` | `TOOL` | `implemented` | Medium | ToolIDRewriter 原地篡改废弃 ──► ToolStatisticsCollector 旁路通知 |
| `T02: FACT-RT-010` | `FACT-RT-001` | `RT` | `implemented` | Medium | DynamicAgentFactory.build() 动态图编译 |
| `T02: FACT-RT-011` | `FACT-RT-002` | `RT` | `implemented` | Medium | AgentRegistry MD5 LRU 128 编译缓存 |
| `T02: FACT-RT-012` | `FACT-RT-003` | `RT` | `implemented` | Medium | MainAgentState add_messages Reducer 智能合并 |
| `T02: FACT-RT-013` | `FACT-RT-004` | `RT` | `implemented` | Medium | 多工具路由仅检查 tool_calls[0]，混合调用后续丢弃 |
| `T02: FACT-RT-014` | `FACT-TOOL-001` | `TOOL` | `implemented` | **High** | ToolManager 动态 Pydantic 模型与 _JsonCoercingBaseModel |
| `T02: FACT-RT-015` | `FACT-TOOL-002` | `TOOL` | `implemented` | **High** | _mask_args_for_log 工具参数敏感信息脱敏 |
| `T02: FACT-RT-016` | `FACT-TOOL-003` | `TOOL` | `implemented` | Medium | @tool 子图入口契约与 route() 条件边拦截 |
| `T02: FACT-RT-017` | `FACT-RT-005` | `RT` | `implemented` | Medium | file_context 临时 HumanMessage 注入（不入 Checkpoint） |
| `T02: FACT-RT-018` | `FACT-RT-006` | `RT` | `implemented` | Medium | ReasoningCallbackHandler Format A/B 思考提取 |
| `T02: FACT-RT-019` | `FACT-AGUI-001` | `AGUI` | `implemented` | **High** | 10 项中间件流水线与异常兜底保活机制 |
| `T02: FACT-RT-020` | `FACT-AGUI-002` | `AGUI` | `implemented` | **High** | AgentBlockingAggregator 同步阻塞聚合响应 |
| `T02: FACT-RT-021` | `FACT-RT-007` | `RT` | `implemented` | **High** | with_disconnect_watcher 客户端断连检测与退出 |
| `T02: FACT-RT-022` | `FACT-RT-008` | `RT` | `implemented` | Medium | _pending_rollbacks 延迟回滚机制 |
| `T02: FACT-RT-023` | `FACT-PROTO-001` | `PROTO` | `implemented` | **High** | build_content_disposition RFC 5987 编码 |
| `T02: FACT-RT-024` | `FACT-RT-009` | `RT` | `implemented` | Medium | OpikTracer 动态注入与链路追踪 |
| `T02: FACT-RT-025` | `FACT-TOOL-004` | `TOOL` | `implemented` | Medium | MCPClientManager 超时未强制拦截与连接未复用 |
| `T02: FACT-RT-026` | `FACT-TOOL-005` | `TOOL` | `implemented` | Medium | search_knowledge_base / RAG 图文 RRF 与来源透传 |
| `T02: FACT-RT-027` | `FACT-RT-010` | `RT` | `implemented` | Medium | LangGraph 1.2.8 interrupt() / Command(resume) 原理 |
| `T02: FACT-RT-028` | `FACT-TOOL-006` | `TOOL` | `implemented` | Medium | ToolStatisticsCollector 旁路统计事件机制 |
| `T02: FACT-RT-029` | `FACT-RT-011` | `RT` | `implemented` | Medium | NacosConfigProvider 提示词热更新与图缓存解耦 |
| `T03: DESIGN-LT-001` | `DESIGN-LT-001` | `LT` | `deprecated` | **High** | Phase 1 本地 SQLite long_task.db 方案（已废弃） |
| `T03: DESIGN-LT-002` | `DESIGN-LT-002` | `LT` | `deprecated` | Medium | Phase 1 CompiledSubAgent + task 工具调度（已废弃） |
| `T03: DESIGN-LT-003` | `DESIGN-LT-003` | `LT` | `deprecated` | Medium | Phase 1 全量覆盖式文件下载导入（已废弃） |
| `T03: DESIGN-ART-001` | `DESIGN-ART-001` | `ART` | `deprecated` | **High** | Phase 1 沙箱直连下载产物（已废弃） |
| `T03: DESIGN-ART-002` | `DESIGN-ART-002` | `ART` | `design_complete` | **High** | Canvas MVP 文件型 Artifact 预览器模型 |
| `T03: DELTA-LT-001` | `DELTA-LT-001` | `LT` | `implemented` | Medium | SQLite 直连 ──► HTTP Internal API 治理重构 |
| `T03: DELTA-LT-002` | `DELTA-LT-002` | `LT` | `implemented` | **High** | CompiledSubAgent ──► SubgraphToolMiddleware 拦截 |
| `T03: DELTA-LT-003` | `DELTA-LT-003` | `LT` | `implemented` | Medium | 全量覆盖 ──► 增量 Diff 与 URL 签名比对 |
| `T03: DELTA-ART-001` | `DELTA-ART-001` | `ART` | `implemented` | **High** | 沙箱直读 ──► 生成即外化与重建回灌机制 |
| `T03: FACT-LT-001` | `FACT-LT-001` | `LT` | `implemented` | Medium | deepagents 0.6.12 + chinese_deep_agent.py 补丁 |
| `T03: FACT-LT-002` | `FACT-LT-002` | `LT` | `implemented` | Medium | WorkspaceService HTTP API 与 16 线程池调度 |
| `T03: FACT-LT-003` | `FACT-SEC-001` | `SEC` | `implemented` | **High** | sandbox_env.py AES 解密与 POSIX 正则 export 注入 |
| `T03: FACT-LT-004` | `FACT-LT-003` | `LT` | `implemented` | **High** | WorkspaceService Standard vs Snapshot 沙箱路由 |
| `T03: FACT-LT-005` | `FACT-LT-004` | `LT` | `implemented` | Medium | acquire_run_lease 独占租约与 provider_heartbeat 保活 |
| `T03: FACT-LT-006` | `FACT-LT-005` | `LT` | `implemented` | Medium | SandboxFileImportService 增量 Diff 与路径净化 |
| `T03: FACT-LT-007` | `FACT-LT-006` | `LT` | `implemented` | **High** | LocalFixtureImportService 本地测试夹具导入 |
| `T03: FACT-LT-008` | `FACT-LT-007` | `LT` | `implemented` | Medium | ToolErrorGuardMiddleware 拦截沙箱超时与命令错误 |
| `T03: FACT-LT-009` | `FACT-LT-008` | `LT` | `implemented` | **High** | 初始化异常捕获与 asyncio.shield 租约释放 |
| `T03: FACT-LT-010` | `FACT-LT-009` | `LT` | `implemented` | **High** | SubgraphToolMiddleware 隔离执行与 Command 同步 |
| `T03: FACT-ART-001` | `FACT-ART-001` | `ART` | `implemented` | **High** | restore_artifacts_to_sandbox 回灌与 ASCII 临时中转 |
| `T03: FACT-ART-002` | `FACT-ART-002` | `ART` | `implemented` | Medium | sync_artifacts_directory Per-Thread 锁与哈希去重 |
| `T03: FACT-ART-003` | `FACT-ART-003` | `ART` | `implemented` | Medium | export_artifacts 显式策展与 Activity 卡片生成 |
| `T03: FACT-ART-004` | `FACT-ART-004` | `ART` | `implemented` | Medium | Single-Flight + Coalesce 周期同步与 30s 兜底外化 |
| `T03: FACT-LT-011` | `FACT-LT-010` | `LT` | `prototype_verified` | Medium | LLM 流超时与后台产物任务取消隔离测试 |
| `T03: FACT-LT-012` | `FACT-LT-011` | `LT` | `implemented` | Medium | DeepAgentState DeltaChannel 增量 Checkpoint |
| `T04: DESIGN-MEM-001` | `DESIGN-MEM-001` | `MEM` | `deprecated` | Medium | 长期记忆 v4.0 四层架构与 4 张物理表（已废弃） |
| `T04: DESIGN-MEM-002` | `DESIGN-MEM-002` | `MEM` | `design_complete` | Medium | 长期记忆 V2.2 PRD 两层用户偏好与单表存储 |
| `T04: DESIGN-CMP-001` | `DESIGN-CMP-001` | `CMP` | `design_complete` | Medium | 上下文压缩 70%/25% 规则与 4 类生命周期事件规划 |
| `T04: DESIGN-ASK-001` | `DESIGN-ASK-001` | `ASK` | `design_complete` | Medium | Ask User 最小交互契约（1-4 题、2-4 选项、敏感词拦截） |
| `T04: DESIGN-ASK-002` | `DESIGN-ASK-002` | `ASK` | `design_complete` | Medium | Ask User 复用 stream 接口与 interrupt() 机制 |
| `T04: DESIGN-ASK-003` | `DESIGN-ASK-003` | `ASK` | `proposed` | Medium | Phase 3+ 独立 AskUserRequest 表与分布式 CAS 方案 |
| `T04: DELTA-MEM-001` | `DELTA-MEM-001` | `MEM` | `implemented` | **High** | 4 层架构 4 张表 ──► 2 层用户记忆单张 agent_memory 表 |
| `T04: DELTA-CMP-001` | `DELTA-CMP-001` | `CMP` | `implemented` | Medium | PRD 4 个生命周期事件 ──► develop 单一 usage_updated 事件 |
| `T04: DELTA-SKL-001` | `DELTA-SKL-001` | `SKL` | `implemented` | **High** | 扁平 OSS URL 列表 ──► 结构化 skill_configs 业务 ID 隔离 |
| `T04: DELTA-ASK-001` | `DELTA-ASK-001` | `ASK` | `design_complete` | Medium | Phase 3+ 分布式 CAS ──► develop stable_request_id + 状态机 |
| `T04: FACT-MEM-001` | `FACT-MEM-001` | `MEM` | `implemented` | **High** | JavaMemoryBackend USER_GLOBAL / USER_AGENT 命名空间 |
| `T04: FACT-MEM-002` | `FACT-MEM-002` | `MEM` | `implemented` | **High** | build_memory_context 身份归一化与非法降级 |
| `T04: FACT-MEM-003` | `FACT-MEM-003` | `MEM` | `implemented` | **High** | JavaMemoryBackend 404/5xx 优雅降级为空记忆 |
| `T04: FACT-MEM-004` | `FACT-MEM-004` | `MEM` | `implemented` | **High** | JavaMemoryBackend 乐观锁与 409 单次重试 |
| `T04: FACT-MEM-005` | `FACT-MEM-005` | `MEM` | `implemented` | **High** | JavaMemoryBackend 虚拟路径锁定为 preferences.md |
| `T04: FACT-MEM-006` | `FACT-MEM-006` | `MEM` | `implemented` | Medium | MemoryMiddleware <agent_memory> 注入与防凭据泄露 |
| `T04: FACT-MEM-006(cmp)` | `FACT-CMP-001` | `CMP` | `implemented` | Medium | chinese_deep_agent.py 运行时覆写 70% 触发与 25% 保留 |
| `T04: FACT-MEM-007` | `FACT-CMP-002` | `CMP` | `implemented` | Medium | min_messages=6 防首轮压缩防抖判断 |
| `T04: FACT-MEM-008` | `FACT-CMP-003` | `CMP` | `implemented` | Medium | ConversationHistoryBackend 历史归档与多模态转存 |
| `T04: FACT-MEM-009` | `FACT-CMP-004` | `CMP` | `implemented` | Medium | CHINESE_SUMMARY_PROMPT 四段式结构化摘要 |
| `T04: FACT-MEM-010` | `FACT-CMP-005` | `CMP` | `implemented` | Medium | Command(_summarization_event) 动态截断投影 |
| `T04: FACT-MEM-011` | `FACT-CMP-006` | `CMP` | `implemented` | Medium | context.usage_updated CUSTOM 事件流式发射 |
| `T04: FACT-SKL-001` | `FACT-SKL-001` | `SKL` | `implemented` | **High** | SkillImportService 结构化导入与 layout-v3 签名 |
| `T04: FACT-SKL-002` | `FACT-SKL-002` | `SKL` | `implemented` | **High** | 沙箱 .langagent_manifest.json 签名缓存复用 |
| `T04: FACT-SKL-003` | `FACT-SKL-003` | `SKL` | `implemented` | **High** | 50MB 大小限制、Zip Slip 防御与单一 SKILL.md 校验 |
| `T04: FACT-SKL-004` | `FACT-SKL-004` | `SKL` | `implemented` | **High** | staging ──► 正式目录原子替换与 backup 自动回滚 |
| `T04: FACT-SKL-005` | `FACT-SKL-005` | `SKL` | `implemented` | **High** | selected_skill 显式选技提示词置顶强制注入 |
| `T04: FACT-SKL-006` | `FACT-SKL-006` | `SKL` | `implemented` | **High** | SkillActivationMiddleware read_file 拦截与活动派发 |
| `T04: FACT-SKL-007` | `FACT-SKL-007` | `SKL` | `implemented` | **High** | SkillActivationMiddleware 只读性与异常隔离 |
| `T04: FACT-SKL-008` | `FACT-SKL-008` | `SKL` | `implemented` | Medium | deepagents 0.6.12 SkillsMiddleware 渐进式发现 |
| `T04: FACT-ASK-001` | `FACT-ASK-001` | `ASK` | `implemented` | Medium | AskUserQuestion 规格约束与敏感关键词初筛 |
| `T04: FACT-ASK-002` | `FACT-ASK-002` | `ASK` | `implemented` | Medium | stable_request_id 确定性 SHA-256 哈希防串扰 |
| `T04: FACT-ASK-003` | `FACT-ASK-003` | `ASK` | `implemented` | Medium | create_ask_user_tool interrupt 挂起与答案常数时间校验 |
| `T04: FACT-ASK-004` | `FACT-ASK-004` | `ASK` | `implemented` | Medium | AskUserInterruptTranslator 业务事件转译 |
| `T04: FACT-ASK-005` | `FACT-ASK-005` | `ASK` | `implemented` | Medium | AskUserToolArgsMasker 参数脱敏流式下发 |
| `T04: FACT-ASK-006` | `FACT-ASK-006` | `ASK` | `implemented` | Medium | forwardedProps.command.resume 恢复链路 |
| `T04: FACT-ASK-007` | `FACT-ASK-007` | `ASK` | `implemented` | Medium | ask_user 仅绑定至顶层 Agent、子代理显式剔除 |
| `T04: FACT-ASK-008` | `FACT-ASK-008` | `ASK` | `implemented` | Medium | 取消操作 contracts 支持与安全默认值推进 |
| `T04: FACT-ASK-009` | `FACT-ASK-009` | `ASK` | `implemented` | Medium | Ask User 代码已就绪但缺失独立单元测试用例 |
| `T05: DESIGN-CBI-001` | `DESIGN-BI-001` | `BI` | `deprecated` | **High** | 早期 ChatBI 固定 6 命名节点流水线（已废弃） |
| `T05: DESIGN-CBI-002` | `DESIGN-BI-002` | `BI` | `deprecated` | Medium | 早期 5 工具探索与 get_table_schema 工具（已废弃） |
| `T05: DESIGN-CBI-003` | `DESIGN-BI-003` | `BI` | `design_complete` | **High** | 全量 M-Schema 内联与 4 核心工具实施方案 |
| `T05: DESIGN-CBI-004` | `DESIGN-BI-004` | `BI` | `design_complete` | **High** | submit_clarification 结构化追问返回主 Agent |
| `T05: DESIGN-VIS-001` | `DESIGN-BI-005` | `BI` | `design_complete` | **High** | 可视化 500 行 embedded / lazy_fetch PRD 设计 |
| `T05: DESIGN-A2UI-001` | `DESIGN-A2UI-001` | `A2UI` | `design_complete` | **High** | A2UI 瑞幸 PoC PRD（Basic Catalog + HITL + 回流） |
| `T05: DESIGN-A2UI-002` | `DESIGN-A2UI-002` | `A2UI` | `design_complete` | **High** | 前端独立 Demo Vite + React + @a2ui/react Spec |
| `T05: DELTA-CBI-001` | `DELTA-BI-001` | `BI` | `design_complete` | **High** | 否定 get_table_schema ──► 全量 M-Schema 内联决策 |
| `T05: DELTA-CBI-002` | `DELTA-BI-002` | `BI` | `implemented` | Medium | develop 固定 DAG ──► chatbi-agent-loop 分支 ReAct 循环 |
| `T05: DELTA-VIS-001` | `DELTA-BI-003` | `BI` | `implemented` | Medium | PRD 500 行 lazy_fetch ──► develop 200 行 client_fetch |
| `T05: FACT-CBI-001` | `FACT-BI-001` | `BI` | `implemented` | Medium | develop ChatBI 6 命名节点固定 DAG 实现 |
| `T05: FACT-CBI-002` | `FACT-BI-002` | `BI` | `implemented` | Medium | DataEnvelope 20 预览 / 200 行内联双层阈值 |
| `T05: FACT-CBI-003` | `FACT-BI-003` | `BI` | `implemented` | Medium | chatbi-agent-loop 分支 ReAct 循环（默认 6 轮迭代，无单测） |
| `T05: FACT-CBI-004` | `FACT-BI-004` | `BI` | `implemented` | Medium | chatbi-agent-loop 分支 4 闭包工具与 Fallback 实现（无单测） |
| `T05: FACT-VIS-001` | `FACT-BI-005` | `BI` | `implemented` | Medium | Visualization 子图 Spec 校验与重试 2 次机制 |
| `T05: FACT-VIS-002` | `FACT-BI-006` | `BI` | `implemented` | Medium | Visualization antv_chart Activity 双通道派发 |
| `T05: FACT-REP-001` | `FACT-BI-007` | `BI` | `implemented` | Medium | Report 子图多动作路由与草案状态分离 |
| `T05: FACT-A2UI-001` | `FACT-A2UI-001` | `A2UI` | `prototype_verified` | **High** | A2UI 子图分批组装、校验重试与 Activity 派发 (Code+Test) |
| `T05: FACT-A2UI-002` | `FACT-A2UI-002` | `A2UI` | `prototype_verified` | **High** | render_a2ui 工具封装与纯文本回执 (Code+Test) |
| `T05: FACT-A2UI-003` | `FACT-A2UI-003` | `A2UI` | `prototype_verified` | **High** | 瑞幸 MCP 下单/取消 interrupt 挂起与 resume 闭环 (Code+Test) |
| `T05: FACT-A2UI-004` | `FACT-A2UI-004` | `A2UI` | `prototype_verified` | **High** | 普通交互回流结构化 User Message 与 Demo (Code+Test) |
| `T06: DESIGN-TM-001` | `DESIGN-TM-001` | `TM` | `design_complete` | **High** | Team 组合资产、动态有效配置解析与跟随最新定义 |
| `T06: DESIGN-TM-002` | `DESIGN-TM-002` | `TM` | `design_complete` | **High** | 用户仅与 Orchestrator 交互、Teammate 禁用 Ask User |
| `T06: DESIGN-TM-003` | `DESIGN-TM-003` | `TM` | `design_complete` | **High** | 一成员一持久 Teammate 实例与线程懒创建复用 |
| `T06: DESIGN-TM-004` | `DESIGN-TM-004` | `TM` | `design_complete` | **High** | 3 槽位并发硬限制与持久调度器 FIFO 队列管理 |
| `T06: DESIGN-TM-005` | `DESIGN-TM-005` | `TM` | `design_complete` | **High** | Follow-up 队列（上限 5 条）与 interrupt_and_redirect 替换 |
| `T06: DESIGN-TM-006` | `DESIGN-TM-006` | `TM` | `design_complete` | **High** | 同步软等待 5 分钟与 Assignment 硬上限 2 小时双层超时 |
| `T06: DESIGN-TM-007` | `DESIGN-TM-007` | `TM` | `design_complete` | **High** | 三层流架构（主流 + 状态 SSE + 详情 SSE/REST）与只读流 |
| `T06: DESIGN-TM-008` | `DESIGN-TM-008` | `TM` | `design_complete` | **High** | 后台任务解耦、Outbox 幂等键与 Lease/Heartbeat 恢复 |
| `T06: DESIGN-TM-009` | `DESIGN-TM-009` | `TM` | `design_complete` | **High** | 复用 Agent 权限模型、无提权与上下文透传 |
| `T06: DESIGN-TM-010` | `DESIGN-TM-010` | `TM` | `design_complete` | **High** | 运行时记录即 MVP 审计事实源与删除级联 Fence |
| `T06: DESIGN-TM-011` | `DESIGN-TM-011` | `TM` | `design_complete` | **High** | Slice 1 资产 CRUD/发布需求（排除运行时与调度器） |
| `T06: DESIGN-WF-001` | `DESIGN-WF-001` | `WF` | `proposed` | Medium | 调研笔记工作流引擎选型建议（LangFlowMVP + Dify 沙箱） |
| `T06: DESIGN-WF-002` | `DESIGN-WF-002` | `WF` | `proposed` | Medium | 调研笔记工作流 DSL、数据信封与 AG-UI 适配构想 |
| `T06: DELTA-TM-001` | `DELTA-TM-001` | `TM` | `design_complete` | **High** | deepagents 0.6.12 每次新建线程 ──► Team 架构持久实例与 3 槽位 |
| `T06: DELTA-WF-001` | `DELTA-WF-001` | `WF` | `unconfirmed` | Medium | 口述最新演进重点 ──► develop 负向核验未合入演进差距 |
| `T06: FACT-TM-001` | `FACT-TM-001` | `TM` | `implemented` | Medium | deepagents 0.6.12 async_subagents.py 线程创建与更新语义 |
| `T06: FACT-TM-002` | `FACT-TM-002` | `TM` | `unconfirmed` | Medium | develop 负向核验确认未包含 Teams 运行时与调度器代码 |
| `T06: FACT-TM-003` | `FACT-TM-003` | `TM` | `design_complete` | Medium | 用户第一轮口述确认 Teams 是最新重点（不推断代码已落地） |
| `T06: FACT-WF-001` | `FACT-WF-001` | `WF` | `implemented` | Medium | Dify 与 LangFlowMVP 外部引擎原生执行语义核验 |
| `T06: FACT-WF-002` | `FACT-WF-002` | `WF` | `unconfirmed` | Medium | develop 负向核验确认未包含 Workflow PRD 或运行时代码 |
| `T06: FACT-WF-003` | `FACT-WF-003` | `WF` | `proposed` | Medium | 用户第一轮口述确认 Workflow 是最新重点（不推断代码已落地） |

---

## 4. 全局 26 项 Evidence Gaps 映射与原子化审查

原始 5 个 Fragment 中实际包含 **26 项** 初始 Gaps（T02: 3 项, T03: 3 项, T04: 7 项, T05: 6 项, T06: 7 项）。本次 Synthesis **彻底杜绝了为了减少数量而合并不同未知的做法**，将 T05 的 6 项与 T06 的 7 项完全保持为 13 项独立 Global Gaps，并将 T02 至 T04 的复合问题与预设选项全面纯净化为单一原子问题，建立 1:1 精确映射：

| Global Gap ID | 原始 Fragment ID | 业务领域 | 核心单一未知点 | Proposed Question 纯净化与次要问题取舍论证 |
|---|---|---|---|---|
| `GAP-01` | `T02: GAP-RT-001` | Runtime & Configuration | Nacos 监听器生产实际启用状态 | **1:1 映射**：回归原始唯一未知，精准聚焦线上生产环境是否实际启用了 Nacos 变更监听器以支持运行时提示词热更新。 |
| `GAP-02` | `T02: GAP-RT-002` | Runtime & Compilation Cache | 多 Pod 编译缓存失效协同 | 原生原子问题，保留单中心未知。 |
| `GAP-03` | `T02: GAP-RT-003` | Runtime & Persistence Backend | 生产 Checkpointer 存储后端 | **纯净化**：原提问包含“存储后端选型”与“是否存在迁移”复合问题，删除次要的物理迁移历史问题，收敛为聚焦生产实际存储后端的主问题。 |
| `GAP-04` | `T03: GAP-LT-001` | Long Task & Workspace Lifecycle | 沙箱回收 Janitor TTL 阈值 | 原生原子问题，保留单中心未知。 |
| `GAP-05` | `T03: GAP-LT-002` | Long Task & Storage Architecture | MySQL 转 Internal API 核心动因 | 原生原子问题，开放式无选项设问。 |
| `GAP-06` | `T03: GAP-ART-001` | Artifact & Sandbox Transport | 非 ASCII 中转机制原始业务触发场景 | **1:1 映射**：代码已证实底层限制与 ASCII 中转实现，问题精准聚焦于最初是在哪类业务产物或场景中触发发现该限制。 |
| `GAP-07` | `T04: GAP-MEM-001` | Memory & Compaction Tuning | 70%/25% 压缩参数调优依据 | **纯净化**：原提问包含“参数调优依据”与“是否出现过关键上下文遗忘案例”复合问题，删除案例追问，聚焦核心参数调优依据。 |
| `GAP-08` | `T04: GAP-MEM-002` | Memory & Optimistic Concurrency | 409 单次重试耗尽后的业务兜底 | **纯净化**：原提问包含“是否发生过”与“如何兜底”复合问题，收敛为高并发冲突耗尽后的业务兜底策略。 |
| `GAP-09` | `T04: GAP-MEM-003` | Memory & Scope Evolution | 四层记忆收敛为两层的考量 | **纯净化**：原提问包含“核心考量”与“是否放弃组织级记忆”复合设问，删除预设追问，保留开放式产品考量。 |
| `GAP-10` | `T04: GAP-CMP-001` | Compaction & Event Protocol | 压缩仅发射单事件技术权衡 | 原生原子问题，保留单中心未知。 |
| `GAP-11` | `T04: GAP-SKL-001` | Skill & Ingestion Protocol | 技能 ID 目录隔离解决的冲突 | 原生原子问题，开放式无预设设问。 |
| `GAP-12` | `T04: GAP-ASK-001` | HITL & Race Condition | Ask User 重复 Resume 竞态控制 | **纯净化**：原提问包含“实际成熟度”与“如何并发控制”，收敛为聚焦重复提交/多端恢复时的竞态控制主问题。 |
| `GAP-13` | `T04: GAP-ASK-002` | HITL & State Machine Roadmap | Phase 3+ CAS 方案推进状态 | **纯净化**：剔除原提问中的“是已被替代还是在路线图中”的二选一预设，改为自由叙述推进状态。 |
| `GAP-14` | `T05: GAP-CBI-001` | ChatBI & Agent Loop Rollout | ChatBI Agent Loop 合并进展 | **独立保留**：独立聚焦 Agent Loop 架构在主线代码中的合并进展与落地状态。保守表述严格使用“分支实现/参考实现”，不写“实证”。 |
| `GAP-15` | `T05: GAP-CBI-002` | ChatBI & Fixed DAG Trade-offs | 主线保留固定 DAG 的工程考量 | **独立保留**：独立聚焦主线代码保持固定流水线 DAG 的工程权衡与考量。 |
| `GAP-16` | `T05: GAP-A2UI-001` | A2UI & Platform Positioning | A2UI PoC 后的演进定位规划 | **独立保留**：独立聚焦 A2UI 协议在完成瑞幸在线下单 PoC 后的平台定位。 |
| `GAP-17` | `T05: GAP-A2UI-002` | A2UI & Canvas Boundaries | A2UI 与 Canvas 预览区边界 | **独立保留**：独立聚焦 A2UI 协议与 Canvas 文件产物预览工作区的边界划分。 |
| `GAP-18` | `T05: GAP-VIS-001` | Visualization & Frontend | client_fetch 策略前端对接状态 | **独立保留**：独立聚焦可视化 client_fetch 策略在业务前端图表组件中的对接与联调状态。 |
| `GAP-19` | `T05: GAP-VIS-002` | Visualization & Large Datasets | 前端图表大数据渲染性能与上限 | **独立保留**：独立聚焦前端图表组件消费 client_fetch 策略时的大数据渲染性能与上限表现。 |
| `GAP-20` | `T06: GAP-WF-001` | Workflow & Integration Architecture | Dify Workflow 集成架构契约 | **独立保留**：独立聚焦 Dify Workflow/Chatflow 集成架构方案与运行契约。 |
| `GAP-21` | `T06: GAP-WF-002` | Workflow & Design Materials | Dify Workflow 权威设计物料路径 | **独立保留**：独立聚焦 Dify Workflow 官方 PRD/SPEC 权威设计物料的具体存放路径。 |
| `GAP-22` | `T06: GAP-WF-003` | Workflow & Implementation Status | Dify Workflow 代码实现与发布状态 | **独立保留**：独立聚焦 Dify Workflow 代码实现进度、自动化测试与上线状态。 |
| `GAP-23` | `T06: GAP-WF-004` | Workflow & Code Repository | Dify Workflow 代码仓库与分支位置 | **独立保留**：独立聚焦 Dify Workflow 实际研发代码所在的代码仓库与分支位置。 |
| `GAP-24` | `T06: GAP-WF-005` | Workflow & Architecture Boundaries | Workflow 与 Agent/Teams 协作边界 | **独立保留**：独立聚焦 Workflow 与 Claw Agent 及 Agent Teams 的定位分工与协作边界。 |
| `GAP-25` | `T06: GAP-TM-001` | Agent Teams & Rollout Status | Agent Teams 各端代码实现与上线 | **独立保留**：独立聚焦 Agent Teams 目前在各系统端的实际代码实现、测试与上线状态。 |
| `GAP-26` | `T06: GAP-TM-002` | Agent Teams & Code Repository | Agent Teams 各端代码仓库位置 | **独立保留**：独立聚焦 Agent Teams 各端开发代码所在的代码仓库与分支位置。 |

---

## 5. Commit Hash 锚点与路径存在性复核结果

1. **Commit Hash 锚点全量清理**：
   - 检查了 `fact-base.md`、`evidence-gaps.md` 与本审查报告中所有的十六进制字符；
   - 彻底移除了 `fact-base.md` 第 6 行与 review 输入表格中残留的 `develop @ <commit-hash>` hash 锚点，统一更正为 `.scratch/langagent-develop-reference`（develop 主线工作树）；
   - 全文无任何 7-40 位 commit hash 遗留，所有 PRD 状态标记（如 `@ ready-for-agent` 与 `@ Ready for implementation`）确认为合规文档状态标记。
2. **Evidence Location 路径存在性核验**：
   - 脚本对 `fact-base.md` 中引用的全部物理路径（剥离 `#L...` 行号锚点后）执行了 `os.path.exists()` 自动化查验；
   - 核验结果：**100% 路径通过物理存在性校验（MISSING COUNT: 0）**，涵盖 `develop` 主线代码、测试文件、`langAgent` 文档/ADR/PRD、A2UI 工作树以及 `deepagents`/`langgraph` 框架源码。

---

## 6. 审查结论与后续衔接

Ticket 07 定向返工已全面落实：
- 全局 130 条 Claim 结构与置信度经过严格再审；
- 26 项 Evidence Gaps 保持完全独立原子化，消除了所有复合设问与预设选项；
- 全量清理了 commit hash 锚点并完成了路径物理存在性校验。

三份交付文件已就绪，为接下来的 Ticket 08（第二轮 Grilling 与口述事实受控入库）提供了精准、可信的证据底座。
