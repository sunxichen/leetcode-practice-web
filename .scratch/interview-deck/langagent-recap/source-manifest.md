# Source Manifest (数据源基线与资产清单)

> **定位与用途**：本文件是 `langAgent` 项目工程复现（recap blog + recap code）的统一数据源清单与证据基础设施。记录所有可用代码库、工作树、分支、测试用例、设计文档（PRD/SPEC/ADR）、原型以及框架依赖的版本/时间基线、职责用途、权威性等级与已知局限。
> **适用对象**：后续所有 Research Worker（Tickets 02-06）、Synthesis Worker（Ticket 07）、Grilling Worker（Ticket 08）及 Writing Worker（Tickets 09-14）。

---

## 1. 证据职责与使用准则

为了防止将未落地的设计意图描述为已实现功能，或用同事的落地实现反推原始设计，证据按“所回答的问题”分工。这里不存在跨问题通用的单一权威度排行：代码对当前行为权威，PRD/SPEC/tickets/ADR 对设计意图权威，用户确认对真实历史与线上结果权威。

| 证据职责 | 证据类型 | 说明与适用边界 |
|---|---|---|
| **当前实现事实** | 最新 `develop` Reference Worktree 源码、自动化测试用例、`pyproject.toml` 与 `uv.lock` | **当前运行与版本事实基线**。用于证明系统当前支持的 API、类名、状态机、控制流、错误恢复、执行时序及精确锁定的依赖版本；不能单独证明原始设计意图。 |
| **原型与演进事实** | 本地功能分支代码、本地测试、Git 提交历史与 Diff、匹配 lockfile 版本的包源码 (Wheel/sdist/uv cache/matching tag) | 用于核验已实现但未合入 develop 的能力（如 A2UI POC）、结构演进、回归修复及框架版本匹配的底层语义；不能单独证明线上效果。 |
| **设计意图事实** | PRD、SPEC、tickets、ADR、技术调研报告、选型参考框架 (Dify / LangFlowMVP) | **目标、约束、取舍与设计契约基线**。当问题是“我当时如何设计”时，它们优先于同事最终写出的代码；但不得单独证明已实现、已上线或产生实际效果。 |
| **历史与线上事实** | 第二轮 Grilling 用户口述确认记录 | 线上事故、实际效果、团队背景和偏差原因的受控来源。未经用户确认的口述历史不得写入正式正文。 |

### 核心安全与使用纪律
1. **本地工作树只读约束**：本地路径 `/Users/sunxichen/Projects/langAgent` 包含大量用户未提交内容与敏感配置，**严禁任何写操作、提交或 stash**。
2. **机密脱敏底线**：严禁读取、输出、复制任何 `.env`、API Key、Token、私钥、数据库凭证或内部租户真实敏感信息。
3. **独立核验原则**：Fact Base 仅作为共享索引，**后续所有 Writing Worker 必须基于本清单给出的路径独立阅读原始代码和测试**，严禁仅凭二手摘要进行写作。
4. **三轨审计原则**：Tickets 02-06 对每个关键机制分别记录 `(a) 设计意图`、`(b) develop/原型实现`、`(c) 两者偏差或演进`。原因无法由仓库证明时进入 evidence gaps，交由第二轮 Grilling 确认。
5. **叙事归属原则**：正文使用“我参与/主导设计……；团队落地时……”区分设计 ownership 与实现归属，不把同事实现的全部细节表述为作者亲自编码。
6. **Claim 类型原则**：设计意图使用 `DESIGN-*`，实现事实使用 `FACT-*`，可证实偏差使用 `DELTA-*`；偏差原因没有直接证据时不得塞入 Delta，必须进入 evidence gaps。

---

## 2. 框架源码与依赖版本事实优先级 (Framework Source Fact Priority)

> **重要基线纪律**：
> - **不要依赖外部附加工作区**：不要依赖 `/Users/sunxichen/Projects/ag-ui`、`/Users/sunxichen/Projects/daytona`、`/Users/sunxichen/Projects/CopilotKit` 等外部目录作为 `langAgent` 的运行时事实来源。
> - **本地 `.venv` 过时声明**：本地 `/Users/sunxichen/Projects/langAgent/.venv` 中的 `deepagents 0.4.8` 属于旧本地工作树环境，**绝对不是当前运行基线**。
> - **唯一当前运行基线**：唯一当前运行基线是 detached develop worktree (`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference`，HEAD `4cebb661e88e02f5119fd013236c1402dc3d2cf8`)，其 `uv.lock` 明确锁定了 `deepagents 0.6.12`。
> - **上游最新资料界定**：GitHub 最新主干资料仅作概念与演进解释（必须标注 `upstream/latest`），**绝对不能覆盖项目锁定的依赖版本语义**。

在审计框架源码（如 `deepagents`、`langgraph`、`ag-ui-protocol`、`daytona` 等）时，所有 Worker 必须严格按照以下优先级获取事实：

```
┌────────────────────────────────────────────────────────────────────────┐
│ Priority 1: develop worktree 的 pyproject.toml 与 uv.lock (版本事实最高权威)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Priority 2: 本地 .venv 中与 develop uv.lock 完全匹配的已安装源码与元数据   │
│ (仅当版本完全一致时有效，如 daytona 0.167.0；版本不一致时禁止作为当前基线)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Priority 3: 匹配锁定版本的包源码 (uv cache / 官方 wheel / 官方 GitHub Tag) │
│ (用于 deepagents 0.6.12, langgraph 1.2.8, ag-ui-protocol 0.1.19 等)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Priority 4: 官方文档与 GitHub 仓库 (必须明确标注 upstream/latest，区分当前) │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 精确依赖版本表（已从 develop `uv.lock` 严格核验）
| 框架 / 包名 | 项目声明 (`pyproject.toml`) | 实际锁定版本 (`uv.lock`) | 本地 `.venv` 状态 | 源码事实获取途径 |
|---|---|---|---|---|
| **`deepagents`** | `>=0.6.12` | **`0.6.12`** (Current Runtime) | `0.4.8` (❌ 过时，禁止采纳) | `.scratch/langagent-framework-sources/deepagents` |
| **`langgraph`** | `*` (默认) | **`1.2.8`** (Current Runtime) | `1.0.10` (❌ 过时) | `.scratch/langagent-framework-sources/langgraph` |
| **`ag-ui-protocol`** | 间接依赖 (`copilotkit`) | **`0.1.19`** (Current Runtime) | `0.1.14` (❌ 过时) | `.scratch/langagent-framework-sources/ag_ui` |
| **`ag-ui-langgraph`** | 间接依赖 (`copilotkit`) | **`0.0.42`** (Current Runtime) | `0.0.29` (❌ 过时) | `.scratch/langagent-framework-sources/ag_ui_langgraph` |
| **`ag-ui-a2ui-toolkit`** | 间接依赖 (`copilotkit`) | **`0.0.4`** (Current Runtime) | - | `.scratch/langagent-framework-sources/ag_ui_a2ui_toolkit` |
| **`copilotkit`** | `>=0.1.90` | **`0.1.94`** (Current Runtime) | `0.1.84` (❌ 过时) | `.scratch/langagent-framework-sources/copilotkit` |
| **`daytona`** | 间接依赖 (`langchain-daytona`) | **`0.167.0`** (Current Runtime) | `0.167.0` (✅ 匹配可用) | `.scratch/langagent-framework-sources/daytona` |
| **`langchain-daytona`** | `==0.0.3` | **`0.0.3`** (Current Runtime) | `0.0.3` (✅ 匹配可用) | `.scratch/langagent-framework-sources/langchain_daytona` |
| **`langchain`** | `*` | **`1.3.11`** (Current Runtime) | - | `.scratch/langagent-framework-sources/langchain` |
| **`langchain-core`** | 间接依赖 | **`1.4.8`** (Current Runtime) | - | `.scratch/langagent-framework-sources/langchain_core` |
| **`baml-py`** | `==0.220.0` | **`0.220.0`** (Current Runtime) | - | 本地 `baml_src/` + 官方 Wheel |
| **`opik`** | `==1.11.0` | **`1.11.0`** (Current Runtime) | - | 官方 Wheel / uv cache |
| **`pydantic`** | `>=2.5.0` | **`2.12.5`** (Current Runtime) | - | 官方 Wheel / uv cache |
| **`fastapi`** | `>=0.109.0` | **`0.135.1`** (Current Runtime) | - | 官方 Wheel / uv cache |

### 2.2 本地只读框架源码 Bundle (`.scratch/langagent-framework-sources`)
- **绝对路径**：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-framework-sources`
- **构建方式**：按 develop `uv.lock` 精确版本，使用 `uv pip install --target ... --no-deps` 下载提取的纯源码 bundle。
- **包含框架精确源码**：
  - `deepagents 0.6.12` (`deepagents-0.6.12.dist-info`)
  - `langgraph 1.2.8` (`langgraph-1.2.8.dist-info`)
  - `langchain 1.3.11` (`langchain-1.3.11.dist-info`)
  - `langchain-core 1.4.8` (`langchain_core-1.4.8.dist-info`)
  - `ag-ui-protocol 0.1.19` (`ag_ui_protocol-0.1.19.dist-info`)
  - `ag-ui-langgraph 0.0.42` (`ag_ui_langgraph-0.0.42.dist-info`)
  - `ag-ui-a2ui-toolkit 0.0.4` (`ag_ui_a2ui_toolkit-0.0.4.dist-info`)
  - `copilotkit 0.1.94` (`copilotkit-0.1.94.dist-info`)
  - `daytona 0.167.0` (`daytona-0.167.0.dist-info`)
  - `langchain-daytona 0.0.3` (`langchain_daytona-0.0.3.dist-info`)
  - `langgraph-prebuilt 1.1.0` (`langgraph_prebuilt-1.1.0.dist-info`)
  - `langgraph-checkpoint 4.1.1` (`langgraph_checkpoint-4.1.1.dist-info`)
  - `langgraph-checkpoint-sqlite 3.0.3` (`langgraph_checkpoint_sqlite-3.0.3.dist-info`)
  - `fastmcp 3.1.1` (`fastmcp-3.1.1.dist-info`)
- **证据职责与用途**：匹配 `develop` lockfile 的框架语义基线，用于后续 Research Worker 下钻框架内部机制：
  - `deepagents`：中文补丁挂载点、middleware 链装配时序与 summarization 原生实现。
  - `langgraph`：内部 dispatch、reducer 与 checkpoint 机制。
  - `ag-ui-protocol`：事件定义与协议 schema 契约。
  - `ag-ui-langgraph`：LangGraph / AG-UI adapter 适配机制下钻。
  - `ag-ui-a2ui-toolkit`：A2UI toolkit、recovery 与 validation 运行语义下钻。
  - `daytona` / `langchain-daytona`：Daytona SDK 专属线程池调度与沙箱执行隔离。
- **性质与硬性约束**：**该目录不是可运行虚拟环境**（无 Python 解释器），仅作为本地只读源码查验基准；**绝对不得使用上游 latest 覆盖其锁定版本语义**。

---

## 3. 源码与工作树基线 (Source Repositories & Worktrees)

### 3.1 主线已合入源码基线：`develop` Reference Worktree
- **绝对路径**：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference`
- **Git 分支 / Ref**：Detached HEAD `4cebb661e88e02f5119fd013236c1402dc3d2cf8`
- **时间基线**：`2026-08-20 10:31:58 +0800`
- **最新提交说明**：`Merge #161 into develop from huangxinyi/add_datasetids`
- **证据职责**：当前主线运行行为基线。
- **主要用途**：
  - 核验通用 Dynamic Agent 运行时（`src/agent/factory/agent_factory.py` 中 `DynamicAgentFactory.build()`、`src/agent/core/state.py`、`src/agent/core/tool_manager.py`、`src/agent/core/plugin_registry.py`）。
  - 核验 Long Task Agent 核心编排（`src/server/services/long_task_agent_service.py`、`src/agent/long_task/factory.py`、`src/agent/long_task/chinese_deep_agent.py`）。
  - 核验 Daytona Sandbox 运行时与沙箱环境注入（`src/agent/long_task/daytona_runtime.py`、`src/agent/long_task/sandbox_env.py`、`Dockerfile.daytona.sandbox`）。
  - 核验 Workspace 生命周期与 Artifact 持久化导出/恢复（`src/server/services/workspace_service.py`、`src/server/services/artifact_service.py`）。
  - 核验上下文自动压缩中间件与可观测事件（`src/agent/long_task/observed_summarization_middleware.py`、`src/agent/long_task/context_compaction_events.py`）。
  - 核验 Memory 多级命名空间与持久化后端（`src/agent/long_task/memory_backend.py`、`src/agent/long_task/memory_context.py`）。
  - 核验 Skill 动态导入、签名与沙箱 Manifest（`src/server/services/skill_import_service.py`、`src/agent/long_task/skill_activation_middleware.py`）。
  - 核验 Ask User (HITL) Typed Contract 与中断恢复机制（`src/agent/ask_user/contracts.py`、`src/agent/ask_user/tool.py`）。
  - 核验 AG-UI Event Bridge、SSE 流式推送与 Blocking 聚合（`src/agent/long_task/event_bridge.py`、`src/server/services/agent_blocking_aggregator.py`）。
  - 核验 ChatBI 固定流水线基线（`src/agent/graph/subgraphs/chatbi/graph.py`）与 Visualization 子图（`src/agent/graph/subgraphs/visualization_graph.py`，组件 `AntVChart`）。
- **已知局限**：
  - 不包含未合入 develop 的前沿探索分支代码（如 ChatBI Agent Loop 升级分支 `sunxichen/chatbi-agent-loop`、A2UI POC 与 Luckin MCP 完整实现）。
  - 不包含生产集群实时日志与实际线上业务负载数据。

### 3.2 本地功能与原型工作树：`langAgent` (Read-Only)
- **绝对路径**：`/Users/sunxichen/Projects/langAgent`
- **当前分支**：`sunxichen/a2ui-poc`
- **Git Commit**：`2a48b9c7381198df3a033243897fec47541ca836` (`2026-06-05 17:16:02 +0800`) + 未提交工作树改动
- **证据职责**：未提交本地原型、设计资料与部分优化补丁的补充来源；对当前主线行为以 develop reference 为准。
- **主要用途**：
  - 核验 A2UI 子图与生成式 UI 交互机制（`src/agent/graph/subgraphs/a2ui_graph.py`、`src/agent/nodes/a2ui_nodes.py`、`src/agent/tools/a2ui_tool.py`）。
  - 核验 Luckin 场景 MCP 工具集成与主 Agent 编排（`src/agent/luckin_mcp.py`、`src/agent/luckin_orchestration.py`）。
  - 查阅本地历史设计文档、PRD、ADR 及调研报告（`docs/docs/`、`prd/`）。
- **已知局限**：
  - 包含本地试验性代码与未暂存的修改，必须严格区分已验证原型与临时改动。
  - 本地 `.venv` 中的包版本（如 `deepagents 0.4.8`）为过时环境，**绝对禁止作为当前版本事实**。
  - 绝对禁止写入或修改。

### 3.3 ChatBI Agent Loop clean reference
- **绝对路径**：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference`
- **Git Commit**：Detached HEAD `98b23b443b6864d1b85e5589cd852bab4f424869`
- **证据职责**：核验未合入 `develop` 的 ChatBI Agent Loop 分支实现，包括 `chatbi_agent_graph.py`、`chatbi_agent_state.py`、`chatbi_agent_tools.py` 与 prompts。它证明分支代码形态，不单独证明已上线或产生实际收益。

### 3.4 A2UI 未提交原型证据
- **clean negative reference**：`.scratch/langagent-a2ui-reference` @ `2a48b9c7381198df3a033243897fec47541ca836` 不包含 A2UI 实现文件，证明该 commit 本身不能作为 A2UI 已提交证据。
- **只读原型路径**：`/Users/sunxichen/Projects/langAgent`、`/Users/sunxichen/Projects/langAgent-issue2-20260611215218`（A2UI graph/nodes/tests）与 `/Users/sunxichen/Projects/langAgent-issue1-20260611215218`（Luckin MCP/tests）。
- **证据职责**：这些路径中的未提交代码与测试只支持 `prototype_verified`；用户第一轮口述确认 A2UI 是早期基础能力，但不得据此写成当前 `develop` 已合入。

---

## 4. 测试套件基线 (Test Suite Baseline)

测试用例用于核验代码路径，但必须检查测试是否真正覆盖 claim，并严格区分 develop 测试、跳过的历史测试与本地未提交原型测试。

### 4.1 `develop` Reference 测试集（真实存在于 `.scratch/langagent-develop-reference/tests/`）
| 测试文件路径 | 覆盖的核心机制与非 Happy Path | 对应审计 Ticket |
|---|---|---|
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_agent_blocking_aggregator.py` | Blocking 模式下 AG-UI 事件聚合成最终响应、错误与状态提取 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_agent_blocking_endpoint.py` | HTTP POST Blocking API 端到端契约与异常传播 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_agent_event_stream.py` | SSE 流式事件推送格式与心跳 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_agent_generate_events.py` | LangGraph / DeepAgents 事件向 AG-UI 协议事件的转换生成 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_multi_tool_calls.py` | 多工具路由的架构模拟；不构成混合子图与普通工具路径的全图回归测试 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_tool_call_args.py` | 工具参数解析、校验与敏感参数脱敏遮蔽 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_streaming_disconnect.py` | 客户端断连检测、取消信号下发、后台优雅收尾 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_http_headers.py` | `Content-Disposition` 文件名编码与换行过滤 | Ticket 02 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_workspace_service_lifecycle.py` | 3 条旧 DB 直连生命周期测试均被 skip，仅作历史结构证据 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_sandbox_env.py` | 密文环境变量解密注入 Daytona 沙箱及隔离环境验证 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_sandbox_type.py` | Standard 与 Snapshot 沙箱类型的创建、挂载与调度 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_file_service_object_keys.py` | 对象存储 Object Key 规范、命名空间与文件路由 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_artifact_restore.py` | 沙箱重建后 Artifact 回灌、Hash 缓存与部分失败容错恢复 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_initialization_error.py` | 沙箱启动失败、依赖缺失等初始化异常的拦截与分层报错 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_local_fixture_service.py` | 本地测试夹具文件导入沙箱与路径映射 | Ticket 03 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_subgraph_tool_middleware.py` | Subgraph-as-tool 在长任务中的中间件拦截与结果透传 | Ticket 03 / 05 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_memory_backend.py` | User Global 与 User-Agent 多命名空间隔离读写与持久化 | Ticket 04 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_memory_context.py` | user/agent identity 归一化与长期记忆作用域降级 | Ticket 04 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_skill_selection.py` | Skill 导入、签名缓存、ZIP 校验与显式选技 | Ticket 04 |
| `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/tests/test_long_task_skill_activation.py` | Skill read_file 观测、激活去重与事件发射 | Ticket 04 |

### 4.2 `langAgent` 本地工作树测试集（存在于 `/Users/sunxichen/Projects/langAgent/tests/`，未合入 develop）
| 测试文件路径 | 覆盖的核心机制与非 Happy Path | 对应审计 Ticket |
|---|---|---|
| `/Users/sunxichen/Projects/langAgent/tests/test_a2ui_subgraph.py` | A2UI 子图状态机执行、Spec 生成、Schema 校验与错误重试 | Ticket 05 |
| `/Users/sunxichen/Projects/langAgent/tests/test_a2ui_tool.py` | A2UI 工具调用入参与结构化输出渲染封装 | Ticket 05 |
| `/Users/sunxichen/Projects/langAgent/tests/test_luckin_main_agent_orchestration.py` | 瑞幸点单场景 Main Agent 对 A2UI 子图与 MCP 工具的端到端编排 | Ticket 05 |
| `/Users/sunxichen/Projects/langAgent/tests/test_luckin_mcp_tools.py` | 瑞幸 MCP 服务接口调用、商品检索与参数映射 | Ticket 05 |
| `/Users/sunxichen/Projects/langAgent/tests/test_long_task_agent_error_recovery.py` | 模型超时等故障注入下的状态自愈与流关闭保障 | Ticket 03 |

---

## 5. 设计文档、PRD、SPEC 与 ADR 清单 (Design & Architecture Baseline)

这些文档是设计意图证据，记录系统目标、约束、演进路线与架构契约。它们在回答“原设计是什么”时是主证据，但不单独证明已实现或已上线。

### 5.1 主线架构与规范文档 (`docs/`)
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/MUST_READ.md`：系统总体设计、模块全景图与核心原则。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/ag_ui与langgraph messages融合策略.md`：LangGraph 消息流与 AG-UI 前端协议融合策略及事件映射规则。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/AG-UI_协议_参数说明.md`：AG-UI 协议字段规范与事件定义。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/DAYTONA_NEW_MACHINE_SETUP.md`：Daytona 沙箱集群部署与配置规范。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/deepagents-memory-integration.md`：DeepAgents 记忆机制集成设计。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/long-task-memory-prd.md`：长任务记忆 PRD 与分层设计。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/long-task-memory-implementation-progress.md`：长任务记忆实现进度与对齐情况。
- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/docs/NACOS_CONFIG_GUIDE.md`：Nacos 动态配置分组与热更新机制。

### 5.2 本地设计、PRD 与 ADR 文档 (`langAgent/docs/docs/` & `langAgent/prd/`)
- `/Users/sunxichen/Projects/langAgent/prd/AI智企平台_产品PRD.md`：AI 智企平台整体产品规格与定位。
- `/Users/sunxichen/Projects/langAgent/prd/long_task_context_auto_compaction_prd.md`：长任务上下文自动压缩 PRD。
- `/Users/sunxichen/Projects/langAgent/prd/long_task_context_auto_compaction_implementation_spec.md`：上下文压缩实现技术 SPEC。
- `/Users/sunxichen/Projects/langAgent/prd/a2ui-luckin-poc.md`：A2UI 瑞幸 POC 需求与验证方案。
- **A2UI implementation tickets**：`/Users/sunxichen/Projects/langAgent/prd/issues/01-luckin-mcp-integration.md` 至 `08-e2e-demo-script.md`，用于还原设计拆分、依赖关系和验收预期；不得用 ticket 状态代替代码核验。
- **Long Task 与 Sandbox 设计包**：
  - `/Users/sunxichen/Projects/langAgent/long_task_agent_phase1_algo_prd.md`
  - `/Users/sunxichen/Projects/langAgent/long_task_agent_phase1_final_plan.md`
  - `/Users/sunxichen/Projects/langAgent/long_task_agent_implementation_plan.md`
  - `/Users/sunxichen/Projects/langAgent/long_task_agent_backend_api_contract.md`
  - `/Users/sunxichen/Projects/langAgent/long_task_agent_enterprise_review_and_design.md`
  - `/Users/sunxichen/Projects/langAgent/sandbox_governance_analysis.md`、`sandbox_governance_architecture.md`、`sandbox_governance_plan.md` 及前后端开发分工文档
  - `/Users/sunxichen/Projects/langAgent/canvas_mvp_file_artifact_prd.md`
  - `/Users/sunxichen/Projects/langAgent/long_task_subgraph_middleware_prd_and_solution.md`
- `/Users/sunxichen/Projects/langAgent/docs/docs/Agent_Teams_PRD_与技术方案.md`：Agent Teams 多智能体协作系统 PRD 与架构技术方案。
- **Agent Teams ADR 系列**（架构决策记录）：
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0001-agent-teams-follow-latest-effective-agent-config.md`：团队动态读取最新生效 Agent 配置。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0002-dynamic-persistent-teammates-over-agent-protocol.md`：基于 Agent 协议构建持久化协作 Teammate。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0003-existing-team-threads-follow-latest-team-definition.md`：存量会话线程遵循最新团队定义。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0004-durable-team-assignment-admission-control.md`：任务分配准入控制与持久化记录。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0005-agent-teams-reuse-agent-authorization-model.md`：复用底层 Agent 鉴权与权限模型。
  - `/Users/sunxichen/Projects/langAgent/docs/docs/adr/0006-team-runtime-records-are-the-mvp-audit-source.md`：团队运行时记录作为 MVP 审计源。
- **Ask User 专题**：
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/ask-user/PRD.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/ask-user/ASK_USER_开发设计.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/ask-user/ASK_USER_COMMAND_RESUME工作蓝图.md`
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/ask-user/UI-PROTOTYPE.md`
- **Agent Teams product tickets**：`/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/PRD.md` 与 `issues/01-*.md` 至 `07-*.md`，用于核验产品资产、权限和前后端契约的设计拆分。
- **Agent Teams 调研与演进**：
  - `/Users/sunxichen/Projects/langAgent/docs/docs/sunxichen/work/agent-team/research/deepagents-interpreter-subagents-evaluation.md`

---

## 6. Git 演进与分支血缘 (Git Evolution & Branch Lineage)

Git 历史与关键 Commit 能够提供代码重构、架构升级与非 Happy Path 修复的演进证据。

| 分支 / Commit | 核心演进事实与工程动机 | 对应机制 / 决策 |
|---|---|---|
| `sunxichen/chatbi-agent-loop`<br>`zhangkan/chatbi-agent-loop-optimization` | 将 ChatBI 从固定 5 节点串行图重构为灵活的 Agent Loop（分支已验证，未合入 develop），支持自检与多轮纠错 | 业务子图与 ChatBI 架构升级（决策插叙，待 Ticket 05 审计） |
| `sunxichen/a2ui-poc`<br>`work/issue1-luckin-mcp-20260611215218`<br>`work/issue2-a2ui-subgraph-20260611215218` | 实现 A2UI 结构化组件生成、A2UI Tool 封装与 Luckin MCP 交互回流（用户口述已实现基础能力，本地原型已跑通） | A2UI 生成式 UI 基础能力（待 Ticket 05 / Grilling 2 审计收敛） |
| `Commit e87da31` (`feat(long-task): env_variable 密文值 AES 解密后注入沙箱`) | 增强沙箱环境变量安全性：请求接收 AES 密文值，解密规范化后在每次 execute 前注入沙箱环境变量 | Daytona 沙箱安全注入与密文管理 |
| `Commit 2a48b9c` (`fix(long-task): keep AG-UI stream closing after LLM timeout`) | 修复大模型超时后 AG-UI 流未能正常关闭导致前端悬挂的问题，确保异常时发送 `RUN_ERROR` 并显式关闭流 | 流式生命周期与超时兜底 |
| `sunxichen/fix-messages-error` (`Commit eeff172`) | 将 LangGraph State 中容易引起覆盖丢消息的 `lambda` Reducer 替换为标准的 `add_messages` Reducer | 状态与消息 Reducer 稳定性 |
| `sunxichen/fix-cancel-problem` (`Commit cd4a967`) | 修复用户主动取消请求时历史上下文污染与孤儿状态残留的问题 | 客户端取消与中断传播 |
| `Commit 4cebb66` (`Merge #161: 让llm可见datasetid`) | 优化 RAG 与数据集路由，将 dataset_ids 显式传入 prompt 使大模型能够感知知识库上下文 | 知识接入与 RAG 上下文优化 |

---

## 7. 选型评估参考项目 (Selection & Prototype Baselines)

选型参考项目只用于核验候选引擎的运行语义；没有项目侧 PRD/SPEC/ADR 时，不能据此外推 `langAgent` 的选型结论或集成契约。

| 仓库名称 | 本地绝对路径 | Commit / Branch 基线 | 职责与下钻边界 |
|---|---|---|---|
| **dify** | `/Users/sunxichen/Projects/dify` | Commit `d93288f71112f2f054376138397153097f1d55a8` (main) | **工作流引擎选型参考**。用于核验确定性 Workflow/Chatflow DSL 定义、节点执行语义、分支并行控制与 fallback gate 选型分析。 |
| **langFlowMVP** | `/Users/sunxichen/Projects/langFlowMVP` | Commit `133405a80fbf4870c752ac645a9b71f991b54c1f` (main, 2026-07-28) | **可视化流编排原型**。用于核验模板节点定义、图形化画布交互及流式运行原型。 |

---

## 8. 变更与审计检查清单 (Manifest Integrity Checklist)

- [x] 所有文件系统物理路径（develop 源码、测试、本地分支文件、PRD/ADR、外部原型项目）均通过真实文件系统路径存在性校验；分支名、Git Commit 与 Python 逻辑模块路径通过对应 Git 工具与 AST/Import 解析另行核验，避免绝对化表述。
- [x] 明确标注 `develop` Reference Worktree 是唯一当前运行基线。
- [x] **框架版本事实已更新**：明确 `develop` worktree 的 `uv.lock` 是当前版本基线，严禁采纳本地 `.venv` 中过时的 `deepagents 0.4.8`。
- [x] **版本表精确核验**：确认 `deepagents 0.6.12`、`langgraph 1.2.8`、`ag-ui-protocol 0.1.19`、`copilotkit 0.1.94`、`daytona 0.167.0`、`langchain-daytona 0.0.3`。
- [x] 明确区分主线测试（20 个）与本地原型测试（5 个），不混淆测试归属。
- [x] 确立了按 claim 类型分工的证据职责与脱敏纪律，写入了 Fact Base 共享索引不替代独立原始材料阅读的硬性准则。
