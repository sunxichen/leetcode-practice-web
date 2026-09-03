# 执行终检与修订

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

对最终 blog、recap code 和事实材料执行完整质量门禁，修复机制遗漏、事实漂移、术语冲突、代码名称错误、图文不一致和自述链路断点。

## Acceptance criteria

- [x] 机制覆盖矩阵证明所有已确认机制均进入正文、代码、概览或明确 out of scope。
- [x] 抽样 claim 可回溯到 fact base，且 writing worker 的独立 research 没有未处理冲突。
- [x] 所有伪代码通过 Python 语法编译检查，关键类名和函数名与源码、框架或已确认契约一致。
- [x] Blog、recap code、图和 execution trace 使用一致的状态、事件和调用顺序。
- [x] 当前实现、原型验证和设计态能力没有混写，敏感信息已脱敏。
- [x] 完成一次 20 至 30 分钟模拟自述，并修复无法顺畅连接或无法从材料回答的关键追问。

## Blocked by

- [13 - 集成单文件 Blog 与面试辅助入口](13-integrate-single-blog-and-interview-entrypoints.md)

## Comments

### 1. 机制覆盖表结论 (Gate A: 47/47 全量覆盖)
全量 M01～M47 技术机制在 `recap-blog.md` 与 `recap-code/` 中完成 100% 映射与覆盖：
- **M01~M08 (运行时底座)**: ReAct 核心循环、`add_messages` Reducer、`DynamicAgentFactory`+LRU 128 缓存、4 层工具分类学、动态 MCP 容错、RAG 多模态融合、Reasoning 提取、Checkpoint 延迟回滚 ➔ 覆盖于 Blog §1.1～§1.10 与 `runtime_agent_loop.py`。
- **M09~M12 (协议与生命周期)**: AG-UI 协议事件集、10 级中间件流水线、Streaming/Blocking 双模一致性、断连监听与取消传播 ➔ 覆盖于 Blog §1.11 与 `runtime_agent_loop.py`。
- **M13~M19 (长任务与沙箱)**: 13 阶段控制流、`chinese_deep_agent.py` 内存补丁、Workspace 状态机与独占租约、Daytona 专属线程池/超时、密文环境变量 AES 注入、文件增量 Diff 导入、分层错误隔离 ➔ 覆盖于 Blog §2.1～§2.9 与 `long_task_sandbox_artifact.py`。
- **M20~M22 (产物持久化)**: 目录扫描外化、SHA-256 去重与 Single-Flight、沙箱冷启动历史产物回灌 ➔ 覆盖于 Blog §3.1～§3.4 与 `long_task_sandbox_artifact.py`。
- **M23~M29 (记忆/压缩/技能)**: 五维存储、长期记忆两层收敛与乐观锁、70%/25% 自动压缩与单一 usage_updated 事件、技能签名跳过/业务 ID 目录隔离/激活去重 ➔ 覆盖于 Blog §4.1～§4.4 与 `context_hitl_business.py`。
- **M30~M32 (Human-in-the-loop)**: Ask User 强类型契约、稳定 Request ID (`au_v1_{sha256}`)、Command Resume 恢复、参数掩码与 Cancelled 默认推进行为 ➔ 覆盖于 Blog §4.5 与 `context_hitl_business.py`。
- **M33~M38 (业务子图与 A2UI)**: ChatBI 架构升级决策对照与 Agent Loop 参考实现、SQL 自检与纠错循环、DataEnvelope 20 行信封完整性分流与 200 未接线常量、Visualization AntV G2 双通道分发、Report 长文解耦、A2UI 生成式 UI 原型 ➔ 覆盖于 Blog §5.1～§5.6 与 `context_hitl_business.py`。
- **M39~M43 (平台演进范式)**: 三大编排范式分类学、Workflow Dify vs LangFlowMVP 选型与 Fallback 策略、Agent Teams 完备设计契约 (ADR 0001~0006, 1 Orchestrator + 1~10 Teammates, 3 槽位硬限制, 5m/2h/30s/5条队列, 三层流解耦) ➔ 覆盖于 Blog §6.1～§6.4 与 `workflow_agent_teams.py`。
- **M44~M47 (生产化工程)**: 分层故障自愈矩阵、全链路 Trace ID / 参数脱敏掩码、Opik 追踪与工具统计、Nacos PromptProxy 热更新 ➔ 覆盖于 Blog §7.1～§7.3 与各代码文件。

### 2. 抽检 Claim 清单与回溯核验结果 (Gate B: 15/15 全部通过)
- `CLAIM-01 (Ch1)`: AgentRegistry MD5 LRU 128 编译缓存 ➔ 回溯 `FACT-RT-002`, `GAP-02` (PASS)
- `CLAIM-02 (Ch1)`: MainAgentState 采用 add_messages Reducer 解决状态丢消息 ➔ 回溯 `FACT-RT-003` (PASS)
- `CLAIM-03 (Ch1)`: ToolStatisticsCollector 旁路事件替代 ToolIDRewriter 原地篡改 ➔ 回溯 `FACT-TOOL-006`, `DELTA-RT-001` (PASS)
- `CLAIM-04 (Ch1)`: with_disconnect_watcher 轮询断连与延迟两阶段回滚 ➔ 回溯 `FACT-RT-007`, `FACT-RT-008` (PASS)
- `CLAIM-05 (Ch2)`: Workspace 状态机 (allocating/allocated/reclaiming/reclaimed/destroying) 与 10min TTL ➔ 回溯 `FACT-LT-002`, `GAP-04` (PASS)
- `CLAIM-06 (Ch2)`: 沙箱密文环境变量 AES 解密后在每次 execute 前 export 动态注入与脱敏 ➔ 回溯 `FACT-LT-004`, `FACT-SEC-001` (PASS)
- `CLAIM-07 (Ch3)`: Artifact 扫描 SHA-256 去重与冷启动历史回灌 ➔ 回溯 `FACT-ART-001`, `FACT-ART-002`, `GAP-06` (PASS)
- `CLAIM-08 (Ch4)`: 长期记忆收敛为 USER_GLOBAL 与 USER_AGENT 两层单表存储并防跨用户串扰 ➔ 回溯 `FACT-MEM-001`, `GAP-09` (PASS)
- `CLAIM-09 (Ch4)`: 上下文压缩 70% 触发 / 25% 保留，流式通道收敛为单一 context.usage_updated ➔ 回溯 `FACT-CMP-001`, `GAP-07`, `GAP-10` (PASS)
- `CLAIM-10 (Ch4)`: Skill 导入按业务 ID 目录隔离落盘 ➔ 回溯 `FACT-SKL-001`, `GAP-11` (PASS)
- `CLAIM-11 (Ch4)`: Ask User 稳定 ID (`au_v1_{sha256}`)、interrupt/resume 恢复，分布式 CAS 为设计态 ➔ 回溯 `FACT-ASK-001`, `GAP-12`, `GAP-13` (PASS)
- `CLAIM-12 (Ch5)`: ChatBI 主线运行 6 节点固定 DAG，Agent Loop 属于独立参考分支原型 (未合入未上线) ➔ 回溯 `FACT-BI-001`, `FACT-BI-003`, `GAP-14`, `GAP-15` (PASS)
- `CLAIM-13 (Ch5)`: DataEnvelope 超过 20 行置 data_complete=False 分流 client_fetch，DETAIL_QUERY_THRESHOLD=200 为未接线常量 ➔ 回溯 `FACT-BI-002`, `GAP-27` (PASS)
- `CLAIM-14 (Ch6)`: Workflow 选型自研图引擎+复用 Dify 沙箱，GAP-20~24 保持 accepted_unknown 演进设计 ➔ 回溯 `DESIGN-WF-001`, `GAP-20~24` (PASS)
- `CLAIM-15 (Ch6)`: Agent Teams 基于 ADR 0001~0006 形成设计契约 (3 槽位/5m/2h/30s/5条)，标记为 design_complete 待实施 ➔ 回溯 `DESIGN-TM-001~011`, `ADR 0001~0006`, `GAP-25/26` (PASS)

### 3. 代码质量与名称核对清单 (Gate C: 4/4 编译通过，符号 100% 真实)
- **编译检查**: 4 个 `.py` 文件全部通过 `python3 -m py_compile` 严格语法校验，无 `__pycache__` 遗留。
- **符号核验**:
  * `runtime_agent_loop.py`: `DynamicAgentFactory`, `AgentRegistry`, `ToolManager`, `ReasoningCallbackHandler`, `with_disconnect_watcher`, `ToolStatisticsCollector` 均在 `develop` 源码与框架源码中真实存在。
  * `context_hitl_business.py`: `JavaMemoryBackend`, `ObservedDeepAgentsSummarizationMiddleware`, `SkillImportService`, `SkillActivationMiddleware`, `create_ask_user_tool`, `build_chatbi_agent_graph` 均在主线或参考分支中真实存在。
  * `long_task_sandbox_artifact.py`: `WorkspaceService`, `LongTaskAgentService`, `ArtifactService`, `SubgraphToolMiddleware`, `apply_chinese_patches`, `ToolErrorGuardMiddleware` 均在主线源码与测试中真实存在。
  * `workflow_agent_teams.py`: `TeamAssetVO`, `TeamAssignmentScheduler`, `TeamMemberVO`, `AssignmentVO`, `WorkflowDSL`, `WorkflowHumanInputNode` 与 Master PRD、ADR 0001～0006 设计契约完全一致。

### 4. 一致性抽查结果 (Gate D: 5/5 抽查一致)
- **Workspace 状态机**: Blog、ASCII 状态图与代码统一使用 `allocating` ➔ `allocated` ➔ `reclaiming` ➔ `reclaimed` ➔ `destroying`（以及 `error` 状态）。
- **Ask User 稳定 ID 公式**: 统一为 $\text{stable\_request\_id} = \text{"au\_v1\_"} + \text{SHA256}(\text{"v1\x1f"} + \text{thread\_id} + \text{"\x1f"} + \text{run\_id} + \text{"\x1f"} + \text{tool\_call\_id})[:32]$。
- **ChatBI 节点序列**: 固定 DAG (`entry` ➔ `query_rewrite` ➔ `sql_generation` ➔ `sql_self_check` ➔ `[error_correction]?` ➔ `exit`) 与 Agent Loop (`prepare_context` ➔ `agent_reasoning` ◄► `tool_execution` ➔ `finalize`) 图文代码一致。
- **Agent Teams 数值规则**: 5 分钟同步软等待（最多追加 3 次）、2 小时后台硬上限、30 秒删除宽限期、5 条 Follow-up 队列上限、3 槽位并发上限在 Blog 与代码中严格一致。
- **DataEnvelope 20 行分流**: 统一阐述 20 行实际分流行为（`data_complete=False` + `client_fetch`）与源码保留的 `DETAIL_QUERY_THRESHOLD = 200` 未接线常量（GAP-27 OPEN）。

### 5. 成熟度与脱敏门扫描结果 (Gate E: 100% 洁净)
- **越界表述**: 全文未将 Agent Teams、ChatBI Agent Loop、A2UI 或未上线功能描述为“已上线/生产验证/实战验证”。
- **敏感信息**: 扫描未发现生产真实 IP、内部私有域名、账号凭证或真实客户名称。
- **哈希与 Mock**: 扫描未发现 40 位 hex commit hash，未包含 Fake/Mock 虚构样板。

### 6. 模拟自述与链路修复记录 (Gate F: 链路完整，零断点)
- **自述主线**: §0.2 规划的 0~30 分钟 6 阶段自述路线（开篇蓝图 ➔ 底座运行时 ➔ 长任务与沙箱 ➔ 上下文与人机协同 ➔ 业务链路与 ChatBI ➔ 编排演进与 Teams）在正文对应章节均有坚实的技术与决策支撑。
- **附录 Q&A 覆盖**: 附录 A 的 8 项高频追问（Q1 状态机消息合并、Q2 沙箱与产物回灌、Q3 记忆收敛、Q4 自动压缩与有效投影、Q5 Ask User 恢复、Q6 ChatBI 升级与防崩、Q7 三大编排范式选型、Q8 Agent Teams 调度三层流）均能在正文与白板代码中找到直接依据。
- **定点修订**:
  1. 修复了 Blog 引言与附录 A/B 中 13 处指向 `recap-code/` 的相对链接路径（将 `../recap-code/` 修正为 `recap-code/`，解决单文件同级解析问题）。
  2. 将章节标题中残留的 10 处历史 brief 别名（如 `FACT-WS-*`, `FACT-DAY-*`, `FACT-ENV-*`, `FACT-FIM-*`, `FACT-VIS-*`, `FACT-REP-*`, `FACT-DA-*`）定点替换为 `fact-base.md` 规范的统一 Fact Base ID（如 `FACT-LT-002`, `FACT-LT-004`, `FACT-BI-005` 等）。


