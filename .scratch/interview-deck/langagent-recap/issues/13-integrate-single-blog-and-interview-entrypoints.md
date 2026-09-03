# 集成单文件 Blog 与面试辅助入口

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

把各垂直写作 slice 重写为一篇连贯的单文件专业工程 blog，补齐全局蓝图、章节过渡、终局复盘、自述路线、专题入口和白板索引，同时保持 recap code 可独立阅读。

## Acceptance criteria

- [x] 合并不是机械拼接；统一第一人称、术语、成熟度措辞、状态名和事件名。
- [x] Long Task 请求生命周期构成清晰主线，通用平台、业务能力和演进章节自然接入。
- [x] 开头包含系统蓝图和 20 至 30 分钟自述路线，但正文保持独立技术深度。
- [x] 决策插叙和非 happy path 分布合理，不打断主链路或重复叙述。
- [x] 文末提供高频追问、白板代码索引和后续专题入口，不把正文改写成面试题库。
- [x] Blog 与 recap code 相互一致，也能分别独立阅读。

## Blocked by

- [09 - 编写平台 Runtime 与 Agent Loop 章节及代码](09-write-runtime-and-agent-loop-slice.md)
- [10 - 编写 Long Task、Sandbox 与 Artifact 章节及代码](10-write-long-task-sandbox-and-artifact-slice.md)
- [11 - 编写 Memory、Compaction、Skill、HITL 与业务链路章节及代码](11-write-context-hitl-and-business-slice.md)
- [12 - 编写 Workflow/Chatflow 与 Agent Teams 演进章节及代码](12-write-workflow-and-agent-teams-slice.md)

## Comments

### 1. 整合决策与主线结构

- **叙事主线**：以一次 Long Task 端到端 13 阶段执行生命周期（请求解析 ➔ Workspace Claim ➔ Run 独占租约 ➔ 沙箱环境准备 ➔ 产物冷启动回灌 ➔ 补账扫描 ➔ 文件 Diff 导入 ➔ 技能签名导入 ➔ 状态持久化 ➔ 图装配 ➔ Single-Flight 流式执行与产物同步 ➔ 终态外化 ➔ finally 租约安全释放）为主线骨架；将通用 Dynamic Agent 底座、长期记忆与上下文压缩、Ask User、业务子图（ChatBI / Visualization / A2UI / Report / RAG）以及平台高阶演进（Workflow 与 Agent Teams）有机融为一体。
- **第一人称叙事统一**：统一采用“核心设计与实现参与者”身份，明确区分作者参与/主导的设计与团队最终落地的工程实现，如实反映架构 ownership。
- **术语统一表**：
  | 概念类别 | 统一样式与规范名 | 消除的漂移与别名 |
  |---|---|---|
  | 运行时 | `DynamicAgentFactory`, `AgentRegistry` (MD5 LRU 128), `PromptProxy` | 统一消除单例图与局部命名差异 |
  | 状态机 | `MainAgentState`, `add_messages` Reducer | 统一说明早期覆盖型 lambda 缺陷与原生修复 |
  | 沙箱与租约 | `WorkspaceService`, `allocating/allocated/reclaiming/reclaimed/destroying/error`, `_provider_heartbeat` (no-op `true`), `_lease_renewal` | 统一沙箱生命周期状态机与心跳机制 |
  | 产物持久化 | `ArtifactService`, `export_artifacts`, `export_artifact_bundle`, `restore_artifacts_to_sandbox`, `_sha256_cache` | 统一双层管理（全量扫描 vs 显式策展）与中转路径 |
  | 上下文与记忆 | `Messages`, `Checkpoint`, `USER_GLOBAL`, `USER_AGENT`, `preferences.md`, `ObservedDeepAgentsSummarizationMiddleware` (70%/25%/6条防抖) | 统一五维存储界定与两层收敛说明 |
  | HITL | `AskUserQuestion` (1-4题/2-4选项), `stable_request_id` (`au_v1_{sha256}`), `AskUserInterruptTranslator`, `AskUserToolArgsMasker` | 统一强类型契约与确定性恢复流程 |
  | 业务子图 | `chatbi_text2sql` (固定 6 节点 DAG vs Agent Loop 三段式循环), `DataEnvelope` (20行分流 / 200行未接线常量 GAP-27), `Visualization` (AntV G2 双通道) | 统一前后对照与带外 Activity / 带内 ToolMessage 分发 |
  | 平台演进 | `Workflow/Chatflow` (Dify 沙箱复用 + LangFlowMVP 独立演进), `Agent Teams` (Orchestrator + 持久 Teammate, 3 槽位准入, Follow-up 5, 双层超时 5m/2h, 三层流解耦) | 统一 ADR 0001-0006 设计契约与演进实施路线图 |
- **删改与精简原则**：
  1. 删减了各 slice 独立的重复章节导言与前缀，合并为全局架构蓝图与统一叙事体系。
  2. 规范化决策插叙为标准的 6 段式结构（触发场景、核心问题、候选方案、最终选择、代价与结果、演进边界），共提炼 7 个核心决策插叙分布于各章节。
  3. 保留所有关键 Mermaid / ASCII 流程图与时序图，确保与正文描述及白板代码完全一致。

### 2. 事实与成熟度验证结果

- **机制覆盖率**：基于 `mechanism-coverage.md` 进行自动化矩阵校验，M01 至 M47 全量 47 项工程机制实现 **100% 覆盖（47/47）**。
- **Claim 回溯抽检（12 条关键 Claim 对应 Fact Base 编号）**：
  1. `FACT-RT-002` (MD5 LRU 128 编译缓存) ➔ Section 1.2
  2. `FACT-RT-003` (add_messages Reducer 幂等合并) ➔ Section 1.4
  3. `FACT-RT-008` (两阶段 Checkpoint 延迟回滚防死锁) ➔ Section 1.10
  4. `FACT-LT-002` / `GAP-05` (算法本地 SQLite 重构为 Java Internal API) ➔ Section 2.1, 2.4
  5. `FACT-WS-001` / `GAP-04` (Workspace 状态机与 Janitor 10min TTL) ➔ Section 2.3
  6. `FACT-ENV-001` (EnvAwareDaytonaSandbox 动态 export 注入) ➔ Section 2.6
  7. `FACT-ART-001` / `FACT-ART-006` / `GAP-06` (Artifact 全量扫描与冷启动回灌) ➔ Section 3.1, 3.4
  8. `FACT-MEM-002` / `GAP-09` (长期记忆收敛为 USER_GLOBAL/USER_AGENT 两层) ➔ Section 4.2
  9. `FACT-CMP-001` / `GAP-07` (上下文自动压缩 70%/25%/6条防抖) ➔ Section 4.3
  10. `FACT-ASK-001` / `GAP-12` (Ask User 强类型契约与稳定 ID 恢复) ➔ Section 4.5
  11. `FACT-BI-001` / `GAP-14` (ChatBI 固定 DAG 与 Agent Loop 参考实现) ➔ Section 5.2
  12. `FACT-TM-001` / `ADR 0001-0006` (Agent Teams 完备设计契约) ➔ Section 6.3
- **安全与合规扫描**：
  - 扫描无任何 git commit hash；
  - 扫描无任何 Fake/Mock 字样；
  - 无伪造线上事故数字或时延/吞吐数据；
  - 严格保持成熟度标定（已实现 / 原型验证 / 设计完成 / 提议 / accepted_unknown）。
- **代码与文件完整性**：
  - `recap-blog/` 下 4 份分章草稿完整保留；
  - `recap-code/` 下 4 份白板代码保持只读并在附录 B 建立完整映射索引；
  - 未创建任何 `__pycache__` 文件，未提交 git commit。

### 3. Orchestrator 双轴验收与复验记录

- **首轮双轴复审 12 项窄修全部关闭**：
  1. [P1] L73 删除无证据的“经过实战验证”修辞，改为提议性结构表述；
  2. [P1 事实漂移] §0.2 准确分层 Agent Teams（`design_complete`，Master PRD 与 6 项 ADR，待实施）与 Workflow/Chatflow（`proposed / accepted_unknown`，GAP-20～24）；
  3. [P1 blog-code 不一致] §9.4 附录 B 纠正不存在的方法名，对齐为真实符号（`TeamAssignmentScheduler.submit_assignment` / `replace_assignment_in_slot` 与 `PersistentTeammateManager.interrupt_and_redirect` / `OrchestratorDelegationTools.interrupt_and_redirect`）；
  4. [P1 未证实时延] §2.1 消除未证实的“数十秒沙箱 I/O 延迟”，对齐源文“数秒到十几秒无效沙箱 I/O”；
  5. [中 叙事契约] 在 7 个决策插叙与 §6 关键位置补齐第一人称 Ownership（明确区分作者参与/主导的设计与团队最终落地的实现，与 ORAL 记录一致）；
  6. [P2 决策插叙] 补齐决策插叙候选方案 A/B、代价要素与“回归验证 / 现状锚点”；
  7. [P2 Ask User 公式] 附录 A Q5 对齐 §4.5 完整稳定 ID 公式（含 `"v1\x1f"` 协议版本前缀与单元分隔符）；
  8. [P2 回滚机制] §9.1 附录 B 改为引用真实 `_pending_rollbacks` 两阶段延迟回滚机制；
  9. [P2 术语对齐] §5.2 与附录 A Q6 将“单应用”纠正为“单技能”（对齐 DESIGN-BI-003）；
  10. [P2 词汇表] 序言声明的成熟度词汇与正文用法统一；
  11. [P2 章首过渡] 补齐第 4 章章首承接过渡句；
  12. [P2 去重] §2.1 四阶段演进精简为一句话级指引，消除与 §2.4/§3.1 的重复。
- **第二轮测试锚点修正**：
  - 发现 3 处虚构测试文件引用（`tests/test_agent_factory.py`、`tests/test_artifact_sync.py`、`tests/test_chatbi.py`），已基于 develop 基线全量 20 个真实测试文件彻底修正：
    - §1.3 与 §1.5：如实标注无主线独立工厂单测，锚定至 `tests/test_multi_tool_calls.py`（函数 `test_direct_tool_execution`、`test_route_logic`）与源码/fact-base 交叉审计；
    - §1.6：锚定至 `tests/test_agent_generate_events.py`（函数 `test_generate_events_filters_raw_and_preserves_event_order`）与 `tests/test_agent_blocking_aggregator.py`（函数 `test_collects_tool_result_rag_usage_and_activity`）；
    - §2.4：锚定至 `tests/test_sandbox_type.py` 与 `tests/test_long_task_initialization_error.py`，并说明 `test_workspace_service_lifecycle.py` 中旧本地 DB 单测已标记为 `@pytest.mark.skip`；
    - §2.8：锚定至 `tests/test_long_task_subgraph_tool_middleware.py`（函数 `test_subgraph_tool_middleware_returns_command_with_shared_state` 与 `test_subgraph_tool_middleware_returns_error_tool_message_on_failure`）；
    - §3.1：清除 `test_artifact_sync.py`，完整锚定至 `tests/test_artifact_restore.py`（函数 `test_restore_artifacts_happy_path`、`test_restore_artifacts_non_ascii_path_uses_temp_mv`、`test_sync_after_restore_does_not_reexternalize`）；
    - §5.2：如实标注主线固定 6 节点 DAG 无主线专项单测，以源码与 `FACT-BI-001` 交叉验证为准；Agent Loop 参考实现保持标注无主线单测。
- **Orchestrator 源码路径修正**：
  - 确认 `prompt_proxy` 实际定义在 `src/server/config/system_prompts.py`；
  - 确认 ChatBI 节点实际定义在 `src/agent/graph/subgraphs/chatbi/nodes/`。


