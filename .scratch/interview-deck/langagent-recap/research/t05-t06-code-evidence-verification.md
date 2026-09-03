# Ticket 05 & Ticket 06 实现证据复核报告 (Code Evidence Verification)

> **复核定位**：针对 ChatBI Agent Loop、DataEnvelope / Visualization 阈值、A2UI PoC 工作树、DeepAgents 0.6.12 `async_subagents` 源码事实以及 Develop Baseline 中 Agent Teams 运行时代号的独立代码与测试证据核验基线。为 Ticket 05 与 Ticket 06 提供精确的证据锚点、置信度分级和表述边界，不直接修改 Ticket 05/06 的交付文件。  
> **复核日期**：2026-08-27  
> **审计性质**：本轮复核为**静态源码与测试用例审计（Static Source & Test Case Audit）**，未在终端实际执行测试运行；评级为 `High` 仅代表代码库中**同时存在直接实现代码与对应测试用例证据（code + relevant test evidence）**，不写“测试已通过”。  
> **核验对象**：  
> 1. `.scratch/langagent-chatbi-agent-loop-reference` 与 `.scratch/langagent-develop-reference`（代码基线 @ `4cebb661e88e02f5119fd013236c1402dc3d2cf8`）  
> 2. `/Users/sunxichen/Projects/langAgent`（PRD、A2UI 工作树源码及前端 demo）  
> 3. `.scratch/langagent-framework-sources/deepagents`（锁定版本 `0.6.12`）  

---

## 1. ChatBI Agent Loop 实现与测试审计

### 1.1 查验范围与结果
对 `.scratch/langagent-chatbi-agent-loop-reference` 及主仓库 `src/agent/graph/subgraphs/chatbi/` 与 `tests/` 进行了穷尽检索：

1. **代码存在性**：
   * 在 `.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/` 中存在完整的 Agentic 重构源码：
     * [`chatbi_agent_graph.py`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_graph.py)：三段式图编排（`prepare_context_node` $\to$ `agent_reasoning_node` + `tool_execution_node` $\to$ `finalize_node`）；
     * [`chatbi_agent_tools.py`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_tools.py)：实现了 `probe_column_values`、`execute_sql`、`submit_final_sql`、`submit_clarification` 4 个核心工具；
     * [`chatbi_agent_state.py`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_state.py)：精简可序列化的 `ChatBIAgentState`；
     * [`chatbi_agent_prompts.py`](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-chatbi-agent-loop-reference/src/agent/graph/subgraphs/chatbi/chatbi_agent_prompts.py)：M-Schema 全量内联 System Prompt。
2. **测试与可执行验证证据**：
   * 在 `.scratch/langagent-chatbi-agent-loop-reference/tests/` 下仅有 4 个通用测试（`test_http_headers.py`、`test_long_task_local_fixture_service.py`、`test_long_task_subgraph_tool_middleware.py`、`test_workspace_service_lifecycle.py`）；
   * **未发现任何针对 ChatBI Agent Loop 的自动化测试文件**（如 `test_chatbi_agent_graph.py` 或 `test_chatbi_agent_tools.py` 均不存在）；在历史 `.pyc` 中曾出现过 `test_chatbi_wrapper.pyc`，但源码已被清理。

### 1.2 规范定性准则 (Maturity & Confidence)
* **Maturity 定性**：`implemented`（代码已在独立分支/参考实现中完成编写）；
* **Evidence Type**：`code`（或结合设计文档标为 `code + doc`）；
* **Confidence 评级**：**严格评为 `Medium`**。由于缺乏配套自动化测试文件（`test`），**绝不能评为 `High`**（High 严格保留给同时具备直接 `code + relevant test` 双重证据的事实）。

---

## 2. DataEnvelope 与 Visualization 阈值与流转机制审计

### 2.1 `<= 20` / `> 20` 截断行为（代码与 PRD 对照）
* **代码证据**：
  * [develop exit_node.py#L29-L32, L159-L174](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/nodes/exit_node.py#L29-L32)：
    * 常量定义：`PREVIEW_THRESHOLD = 20`，`PREVIEW_ROWS_WHEN_TRUNCATED = 5`；
    * 当 `total_rows <= 20` 时：设置 `is_truncated = False`，`preview_data = full_data`；
    * 当 `total_rows > 20` 时：设置 `is_truncated = True`，`preview_data = full_data[:5]`（仅展示前 5 行预览），提示数据已自动保存至信封；
  * [develop mock_chatbi_graph.py#L54-L79](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/mock_chatbi_graph.py#L54-L79)：完全镜像实现了 $\le 20$ 全量与 $> 20$ 截取 5 行并置 `is_truncated: True` 的行为；
* **PRD 对应**：
  * [`chatbi_data_flow_prd.md#L21-L34`](file:///Users/sunxichen/Projects/langAgent/chatbi_data_flow_prd.md#L21-L34)：规定了 `THRESHOLD = 20`，小数据全量返回，大数据截断 5 行的意图。
* **结论**：`<= 20` / `> 20` 行为在 **PRD 与 develop 代码中完全对齐**，且有代码直接实现。

### 2.2 `<= 500` / `> 500` 与 `client_fetch` / `inline_complete` 阈值审计
* **PRD 中的设计**：
  * [`chatbi_data_flow_prd.md#L42-L44, L103-L117`](file:///Users/sunxichen/Projects/langAgent/chatbi_data_flow_prd.md#L42-L44)：规划了 `mode: embedded`（$\le 500$ 行）与 `mode: lazy_fetch`（$> 500$ 行）策略。
* **Develop 代码中的真实实现**：
  * [develop exit_node.py#L25](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/graph/subgraphs/chatbi/nodes/exit_node.py#L25)：代码中实际定义的明细查询阈值为 `DETAIL_QUERY_THRESHOLD = 200`（而非 500）。当总行数超过 200 时，`DataEnvelope` 不内联 `full_data`，只带 `query_sql` + `sample_rows` 并置 `data_complete = False`；
  * [develop visualization_nodes/nodes.py#L359-L411](file:///Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/langagent-develop-reference/src/agent/nodes/visualization_nodes/nodes.py#L359-L411)：
    * 字段名称并非 PRD 中的 `mode`，而是规范化为 **`dataset_strategy`**；
    * 策略取值：
      1. **`inline_complete`**：当 `envelope.data_complete == True` 时发射，包含全量行数据，`sql = None`，前端直接绑 AntV；
      2. **`client_fetch`**：当 `envelope.data_complete == False` 时发射，不传全量行数据，提供明文 `sql = envelope.query_sql` 与 `page_size`，指示前端走分页接口拉数；
      3. **`none`**：无信封异常路径。
* **前端消费证据**：
  * 在当前仓库中，`frontend-demo` 仅针对 A2UI 瑞幸 PoC，**未包含消费 `dataset_strategy: client_fetch` 的商业前端图表组件源码或测试**；
  * 前端对接属于跨团队接口契约（由 Java 端或桌面前端负责消费），在 langAgent 仓库中仅能证明服务端事件装配与发射逻辑（`code`），不能证明前端已闭环联调（`gap`）。

---

## 3. A2UI 未提交工作树机制与 Code + Test 逐项核验

在 `/Users/sunxichen/Projects/langAgent` 的未提交 A2UI 工作树中，五大关键机制均具备独立、精准的源码与对应测试用例证据（静态审计）：

| 机制序号 | 机制名称 | 核心实现代码位置 (Code) | 对应测试用例位置 (Relevant Test Evidence) | 置信度 | 静态验证要点与断言覆盖 |
|:---|:---|:---|:---|:---:|:---|
| **1** | **分批生成 (Batch Generation)** | [`src/agent/graph/subgraphs/a2ui_graph.py`](file:///Users/sunxichen/Projects/langAgent/src/agent/graph/subgraphs/a2ui_graph.py) | [`tests/test_a2ui_subgraph.py::test_shop_data_and_intent_render_create_surface_then_update_components_messages`](file:///Users/sunxichen/Projects/langAgent/tests/test_a2ui_subgraph.py#L62-L93) | **High** | 测试覆盖首批发射 `beginRendering`（携带 `surfaceId`），后续批次生成 `surfaceUpdate`，并在 `generator.calls` 中断言 `previous_components` 跨批累积上下文。 |
| **2** | **Schema 校验与重试 (Validation & Retry $\le 2$)** | [`src/agent/nodes/a2ui_nodes.py`](file:///Users/sunxichen/Projects/langAgent/src/agent/nodes/a2ui_nodes.py) | [`tests/test_a2ui_subgraph.py::test_invalid_generator_output_retries_with_validation_error_context`](file:///Users/sunxichen/Projects/langAgent/tests/test_a2ui_subgraph.py#L116-L143)<br>[`tests/test_a2ui_subgraph.py::test_invalid_generator_output_raises_clear_error_after_two_retries`](file:///Users/sunxichen/Projects/langAgent/tests/test_a2ui_subgraph.py#L156-L180) | **High** | 1. 测试覆盖生成非法组件时带 `validation_error` 重试并成功修复；<br>2. 测试覆盖连续非法输出在达到 2 次重试上限后断言抛出明确的 `ValueError` 异常。 |
| **3** | **Activity 事件发射 (Activity Emission)** | [`src/agent/tools/a2ui_tool.py`](file:///Users/sunxichen/Projects/langAgent/src/agent/tools/a2ui_tool.py) | [`tests/test_a2ui_tool.py::test_render_a2ui_tool_emits_activity_snapshots_for_each_a2ui_batch`](file:///Users/sunxichen/Projects/langAgent/tests/test_a2ui_tool.py#L68-L110)<br>[`tests/test_a2ui_tool.py::test_render_a2ui_tool_returns_short_confirmation_not_a2ui_json`](file:///Users/sunxichen/Projects/langAgent/tests/test_a2ui_tool.py#L112-L131) | **High** | 1. 测试覆盖通过 `astream_events(version="v2")` 捕获 `copilotkit_emit_activity`，断言其 `activity_type == "a2ui_surface"` 且载荷符合 A2UI 规范；<br>2. 测试覆盖工具返回给 LLM 的是简短文本确认而非巨量 A2UI JSON。 |
| **4** | **HITL 中断与恢复 (Interrupt & Resume)** | [`src/agent/luckin_orchestration.py`](file:///Users/sunxichen/Projects/langAgent/src/agent/luckin_orchestration.py) | [`tests/test_luckin_main_agent_orchestration.py::test_luckin_agent_interrupt_resume_confirm_calls_create_order`](file:///Users/sunxichen/Projects/langAgent/tests/test_luckin_main_agent_orchestration.py#L116-L143)<br>[`tests/test_luckin_main_agent_orchestration.py::test_luckin_agent_interrupt_emits_confirmation_activity`](file:///Users/sunxichen/Projects/langAgent/tests/test_luckin_main_agent_orchestration.py#L145-L168)<br>[`tests/test_luckin_main_agent_orchestration.py::test_luckin_agent_interrupt_resume_cancel_does_not_call_create_order`](file:///Users/sunxichen/Projects/langAgent/tests/test_luckin_main_agent_orchestration.py#L169-L195) | **High** | 1. 测试覆盖调用 `createOrder` 前被 LangGraph `interrupt()` 挂起，且断言未实际发起 MCP 调用；<br>2. 测试覆盖发射 `luckin_hitl_confirmation` activity；<br>3. 测试覆盖 `Command(resume={"confirm": True})` 恢复后执行下单，而 `confirm: False` 时不断言调用工具并输出“已取消”。 |
| **5** | **普通交互回流 (Interaction Reflux)** | 后端：[`src/agent/luckin_orchestration.py`](file:///Users/sunxichen/Projects/langAgent/src/agent/luckin_orchestration.py)<br>前端：[`frontend-demo/src/App.tsx`](file:///Users/sunxichen/Projects/langAgent/frontend-demo/src/App.tsx) | 后端：[`tests/test_luckin_main_agent_orchestration.py::test_luckin_agent_structured_select_shop_action_searches_products_then_renders`](file:///Users/sunxichen/Projects/langAgent/tests/test_luckin_main_agent_orchestration.py#L221-L246)<br>前端：[`frontend-demo/src/__tests__/App.interaction-reflux.test.tsx::sends normal A2UI action as a structured user message to the chat stream`](file:///Users/sunxichen/Projects/langAgent/frontend-demo/src/__tests__/App.interaction-reflux.test.tsx#L26-L48) | **High** | 1. 前端测试覆盖 A2UI 组件点击（`select_shop`）被构造为结构化 JSON 并作为普通 User Message 发送至对话流；<br>2. 后端测试覆盖主 Agent 解析该 Action 后触发商品搜索并调用 `render_a2ui` 重新渲染。 |

---

## 4. DeepAgents 0.6.12 `async_subagents` 源码事实复核

在 `.scratch/langagent-framework-sources/deepagents/middleware/async_subagents.py` 中，源码定义了基于 Agent Protocol 的异步 Subagent 运行时控制面：

### 4.1 Thread 创建与复用机制
1. **`start_async_task` 每次新建独立 Thread**：
   * 源码位置：`async_subagents.py#L286-L364`；
   * 行为：调用 `client.threads.create()` 创建全新的远端 Thread，并将该 `thread["thread_id"]` 直接作为 `task_id`（即 `task_id = thread["thread_id"]`）；
   * 结论：**`start_async_task` 无法在已有 Thread 上复用实例，每次委派均创建新 Thread 与新 Task 记录**（这也是为什么 AI 智企 Agent Teams 需要自研持久调度器与映射表的原因）。
2. **`update_async_task` 在同一已有 Thread 上创建中断式新 Run**：
   * 源码位置：`async_subagents.py#L506-L608`；
   * 行为：通过 `task_id` 定位已有的 `thread_id`，调用 `client.runs.create(thread_id=tracked["thread_id"], assistant_id=..., input=..., multitask_strategy="interrupt")`；
   * 结论：**`update_async_task` 保持 `task_id` / `thread_id` 不变，中断前一个 Run 并在此 Thread 历史基础上启动新 Run**。

### 4.2 工具操作与状态机行为
* **`start_async_task`**：异步/同步发起远端 Run 后立即返回 `task_id`，向 Agent State 写入 `async_tasks: {task_id: {"status": "running", ...}}`，**不阻塞主 Agent 执行**；
* **`check_async_task`**（`#L441-L504`）：查询 `client.runs.get`；若状态为 `"success"` 则读取 `client.threads.get` 中的最后一条消息作为 `result`；若为 `"error"` 则提取错误详情；更新 state 中该任务的 `status` 与 `last_checked_at`；
* **`cancel_async_task`**（`#L610-L687`）：调用 `client.runs.cancel(thread_id, run_id)`，将 state 中任务状态置为 `"cancelled"`；
* **`list_async_tasks`**（`#L736-L840`）：支持按 `status_filter` 过滤；对所有非终态任务（不在 `cancelled, success, error, timeout, interrupted` 中）并发刷新实时状态，批量更新 state 并格式化返回摘要列表。

---

## 5. Develop Baseline 中 Agent Teams 运行时代码审计

### 5.1 检索范围与方法
针对当前基线 `.scratch/langagent-develop-reference` 进行了全量检索：
1. **模式与关键字检索**：
   * `grep_search` 关键词：`agent_team`、`team_thread`、`teammate`、`TeamAssignmentScheduler`、`team-member-runner`、`delegate_and_wait`、`delegate_in_background`、`interrupt_and_redirect`、`list_team_tasks`、`cancel_team_work`；
   * 搜索路径：`.scratch/langagent-develop-reference/src/` 与 `tests/`；
2. **文件名称检索**：
   * `find_by_name` 查找 `*team*`。

### 5.2 查证结论与定性
* **搜索结果**：在 `.scratch/langagent-develop-reference`（当前核验的 Python 代码基线）中，上述所有 Team 运行时关键词的匹配结果均为 **0 匹配（No results found）**。
* **技术定性与边界**：
  * `Develop 0 matches` **仅证明所核验的 Python baseline 中不存在 Team runtime 代码**，不推断 Java 后端或前端实际实施状态；
  * `sunxichen/work/agent-team/PRD.md`（Slice 1）**只能证明该切片的设计与计划范围及明确排除项**（即计划在 Slice 1 中 langAgent 保持 zero changes，由 Java 端 `aibot-service` 与前端承接资产闭环），**不能作为资产闭环已在实际工程中落地交付的证据**；
  * **结论**：Slice 1 PRD 明确了资产管理的计划范围与运行时排除项，其实际实施进度与生产状态需进一步核验 Java/前端仓库或由用户确认。

---

## 6. 综合证据与表述准则矩阵表 (Claim-by-Claim Verification Matrix)

| Candidate Claim (候选技术事实) | Verified Evidence (核验代码/测试证据) | Supported Wording (合规严谨表述) | Prohibited Inference (绝对禁止的过度推断) |
|:---|:---|:---|:---|
| **ChatBI Agent Loop 架构** | `chatbi_agent_graph.py`, `chatbi_agent_tools.py`, `chatbi_agent_state.py` (无 tests) | ChatBI Agent Loop 具备完整三段式图与 4 工具源码（`Maturity: implemented`, `Confidence: Medium`） | ❌ 禁止宣称具备相关自动化测试用例（`Confidence: High`）；禁止宣称已实现动态 `get_table_schema` 工具 |
| **DataEnvelope $\le 20$ 截断** | `exit_node.py#L159-L174`, `mock_chatbi_graph.py#L54-L79` | $\le 20$ 行全量返回预览，$> 20$ 行仅截取前 5 行预览并写入信封由代码直接实现 | ❌ 禁止宣称大于 20 行时丢弃数据或主模型能直接感知全量明细 |
| **Visualization 策略契约** | `exit_node.py#L25` (`THRESHOLD=200`), `visualization_nodes/nodes.py#L359-L411` | 服务端根据 `data_complete` 组装 `dataset_strategy: inline_complete` 或 `client_fetch`（明文 SQL + `page_size`） | ❌ 禁止宣称代码阈值是 500（PRD 规划为 500，代码实现为 200）；禁止宣称 langAgent 仓库已证明前端图表分页懒加载已闭环 |
| **A2UI 分批流式组装** | `a2ui_graph.py` + `test_a2ui_subgraph.py` (L62-L93) | A2UI 子图具备 `beginRendering` 与分批 `surfaceUpdate` 的实现代码与对应测试断言（`High`） | ❌ 禁止将 A2UI 分批渲染泛化为所有页面统一机制；静态审计不代表动态运行测试已通过 |
| **A2UI Schema 校验与重试** | `a2ui_nodes.py` + `test_a2ui_subgraph.py` (L116-L180) | A2UI 具备 Basic Catalog 校验及带错误上下文重试 2 次的实现代码与对应测试断言（`High`） | ❌ 禁止宣称大模型在无重试情况下 100% 产出零语法错误 A2UI JSON；静态审计不代表动态运行测试已通过 |
| **A2UI HITL 下单确认** | `luckin_orchestration.py` + `test_luckin_main_agent_orchestration.py` (L116-L195) | 具备 `createOrder`/`cancelOrder` 关键操作前 `interrupt()` 挂起与 resume 恢复的实现代码与对应测试断言（`High`） | ❌ 禁止宣称已实现生产级真实支付回调、订单轮询或多用户状态机防护；静态审计不代表动态运行测试已通过 |
| **A2UI 交互回流机制** | `App.tsx`, `App.interaction-reflux.test.tsx` + `test_luckin_main_agent_orchestration.py` | 普通点击作为 user message 发回对话流、确认动作走 resume 具备前后端实现代码与对应测试用例（`High`） | ❌ 禁止宣称已实现复杂跨表单状态的双向响应式绑定；静态审计不代表动态运行测试已通过 |
| **DeepAgents Async Subagents 语义** | Framework `async_subagents.py#L286-L364, L506-L608` | `start_async_task` 每次创建新 Thread/Task；`update_async_task` 在同一 Thread 上通过 `interrupt` 发起新 Run | ❌ 禁止宣称 stock DeepAgents 原生支持“单成员单持久 Thread”的业务 Agent Teams 模型 |
| **Agent Teams Runtime 现状** | Develop 检索结果（0 matches） + `sunxichen/work/agent-team/PRD.md#L163` | Python develop 基线无 Team runtime 代码；Slice 1 PRD 明确计划范围为资产配置与管理闭环（运行时在后续切片），实际实施与生产状态待用户确认 | ❌ 禁止推断生产环境已部署运行时；禁止宣称存在未提交的 Python 调度器；禁止将 PRD 规划直接等同于后端/前端已实际交付上线 |
