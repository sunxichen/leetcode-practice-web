# Follow-up A — 任务剧本、故障注入、自由探索、Prompt 样例与 Simulator Mask

## 直接回答

### 1. 错误/故障信息按什么规则注入？是否也由 CanonicalTask 规定？
- **两类错误正交解耦**：系统中的错误分为“外部瞬态系统故障注入（Deterministic Injected Faults）”与“业务状态机前置/参数校验错误（Dynamic Precondition & Business Errors）”。
- **注入规则**：针对 `TEMPORARY_UNAVAILABLE` 等系统瞬态故障，通过 `CanonicalTask.sandbox_overrides.inject_errors` 显式声明 `[{"tool_name": "...", "on_call": N, "error_code": "..."}]`。沙箱在 `execute()` 内部维护基于工具的计数器 `_call_counter[tool_name]`；**关键规则是计数器仅在参数校验与前置条件（Preconditions）全部通过之后才累加**。第 $N$ 次合法调用出栈并抛出注入错误，第 $N+1$ 次合法调用放行，支持 Agent 重试自愈。
- **是否由 CanonicalTask 规定**：**是的**。`sandbox_overrides` 是 `CanonicalTask` 的顶层 Schema 字段（由 `hard_instance_generator.py` 写入）；同时 `golden.py` 在推导 `golden_final_state` 时，通过 `GOLDEN_CHAINS_RECOVERABLE_ERROR` 路由执行对应的带重试 Oracle 脚本。而业务类错误（如超限 `AMOUNT_EXCEEDS_LIMIT`、未核身 `PRECONDITION_NOT_MET`）则无需注入配置，由沙箱根据数据库状态与 `RuntimeFlags` 自然抛出。

### 2. 预设剧本与 Agent 自由探索的真实契约
- **无 Action Trace 强匹配**：SFT 合成、L1 Replay 过滤与 RL Reward **均不限制 Agent 的 API 执行次序与冗余查询次数**。系统与 Agent 之间的契约是**“物理终态与业务不变式契约（State Transition & Invariants Contract）”**，而非“轨迹克隆（Action Trace Cloning）”。
- **时序错位不会导致故障失效**：因为故障注入绑定的是 `(tool_name, on_call)` 且挂载在前置条件校验之后，而非绑死在全局对话轮次（Global Step）。无论 Agent 在前期闲聊几轮、多次查询余额还是调整查询顺序，只要首次发起目标写操作，就会精准命中第 1 次注入；后续保持参数再次发起重试即放行。
- **张力与解决方案**：
  - *潜在张力*：Agent 遇到报错可能直接消极逃避（如直接选择 `Escalate` 转人工），若无约束会产生假收敛；
  - *解决方案*：可恢复故障任务的元数据明确规定 `expected_terminal_action: Finish`。若 Agent 遇错直接放弃，会因终态动作不匹配（L1 `terminal_action_mismatch`）或 DB 未形成有效写入（`R_complete < 1.0`）被直接判定失败或扣减 Reward；只有完成“捕获异常 $\to$ 调整/重试 $\to$ 终态办结”才能拿满分。

### 3. 4 类 Prompt 最小脱敏结构与信息边界
- **Agent Teacher Prompt（数据合成）**：源自 `phase2/prompt_templates/agent_teacher/v1.1/base.jinja`。
  - *可见边界*：政策规则（`PolicyCard`）、工具白名单、限额参数（`policy_params`）、`ApiSpec` 声明、两段式 Envelope 约束、完整对话历史（含自身 `<analysis>` 与结构化 `ToolTurn` observation）。
  - *不可见*：`hidden_truth`（用户真实背景/真值）、`reveal_policy`（披露时机）、`golden_final_state`、`sandbox_overrides`。
- **User Teacher Prompt（数据合成）**：源自 `phase2/prompt_templates/user_teacher/v1.1/base.jinja`。
  - *可见边界*：9 维 `persona`、`hidden_truth`（`user_profile` + `case_context`，严格剥离 `latent`）、`reveal_policy`（5 条 DSL 规则）、触发词典、过滤后的自然语言历史（`_serialize_turns_for_user_view` 彻底剔除 Agent 的思考、`<args>` 及工具 observation）。
  - *不可见*：政策条款、工具定义、沙箱数据库、Agent 思考、底层执行链。
- **Agent SFT Prompt（模型训练与推理）**：源自 `convert_stream1_to_llamafactory.py` + `agent_sft.qwen3_4b_lora.yaml`。
  - *可见边界*：OpenAI Function 格式 `tools` 定义、多轮 `messages`（包含 `user` 文本、`assistant` 输出与 `observation` 工具返回 JSON）。
  - *不可见*：`hidden_truth`、`reveal_policy`、`persona`、`sandbox_overrides`。
- **Simulator SFT Prompt（模型训练与推理）**：源自 `convert_stream2_to_llamafactory.py` + `frozen_simulator_backend.py`。
  - *可见边界*：`system` 消息内的 JSON 化 `persona`、`hidden_truth`、`reveal_policy`、开场意图，以及纯自然语言对话历史（`agent` 与 `simulator` 交替）。
  - *不可见*：`tools` 定义、API 请求参数、工具 JSON 返回、Agent 内部思考。

### 4. Simulator Mask History 与 Agent SFT 对比
- **Simulator SFT 必须启用 `mask_history: true`**：
  - *根因*：Stream ② 采用**按用户发言轮次切片（Prefix Slicing）**的数据抽取模式。1 条 3 轮交互的轨迹会被拆解为 3 条独立样本（$H=[], T=U_1$；$H=[A_1, U_1], T=U_2$；$H=[A_1, U_1, A_2, U_2], T=U_3$）。若 `mask_history: false`，历史中的用户轮次会被重复计算 Loss，导致 $U_1$ 被学 3 次、$U_2$ 被学 2 次、$U_3$ 仅被学 1 次，产生严重的前缀过拟合与长尾欠学习偏差。开启后仅对每条切片样本末尾的目标轮次算 Loss。
- **Agent SFT 为何保持 `mask_history: false`**：
  - *根因*：Stream ① 采用**全量对话轨迹（Full-Conversation Trajectory）**格式。1 条轨迹作为 1 条完整样本输入，不存在前缀切片导致的重复样本。在 ShareGPT 模板下，LLaMA-Factory 默认屏蔽 `user` 和 `observation`（置为 -100），对样本内**所有 `assistant` 轮次计算 Loss**。整条轨迹只输入一次，每个 Assistant 决策步骤被且仅被监督一次，故 `mask_history: false` 是完全自洽且能最大化利用监督信号的设计。

---

## 事实与出处

### 1. 故障注入与沙箱执行计数器
- **Schema 定义**：`src/agentic_gov/schemas/task.py` 中的 `InjectedError`（L272-L279）与 `SandboxOverrides`（L281-L285），包含 `tool_name`, `on_call`, `error_code`, `recover_after_calls`。
- **沙箱计数与注入拦截**：`src/agentic_gov/sandbox/engine.py` 中的 `Sandbox.execute()`：
  - L137-L160（Step 5）：优先执行前置条件校验（`runtime_flags.has(pre, subject)`），不满足则返回 `PRECONDITION_NOT_MET`，**不累加计数器**；
  - L164-L175（Step 6）：前置条件通过后累加计数器 `self._call_counter[tool_name] += 1`，调用 `_pop_injection()` 匹配 `on_call` 并弹出返回 `error_result(code, injected=True)`；
  - L181-L186（Step 7）：未命中注入则正常派发给业务 Handler。
- **任务生成与 Golden Chain 绑定**：
  - `src/agentic_gov/hard_instance_generator.py`（L718-L732）：`_attach_temporary_unavailable()` 将注入挂载到 `task.sandbox_overrides`；
  - `src/agentic_gov/task_factory/golden.py`（L1203-L1228 / L1269-L1272）：`golden_chain_temporary_unavailable_recovery` 显式构造 `[ExpectedAction(expect_status='error', expect_code='TEMPORARY_UNAVAILABLE'), ExpectedAction(note='retry')]` 驱动沙箱推导 `golden_final_state`。

### 2. 状态转移契约与验证器实现
- **L1 沙箱重放验证器**：`src/agentic_gov/verifier/funnel.py` 中的 `_compute_l1()`（L406-L550）：
  - L471-L483：逐个重放 Trajectory 中的 `Call_API`，断言沙箱实测 `obs` 与记录的 `ToolTurn` 完全一致（`tool_observation_mismatch`），但不限制非 API 交互及前序调用路径；
  - L491-L503：断言终态动作等于预期（`terminal_action_mismatch`）；
  - L525-L538：断言终态数据库一致性（`stale_actual_final_state`）；
  - L550：断言 `r_complete == 1.0`。
- **终态比对与无轨迹约束**：`src/agentic_gov/reward/complete.py` 中的 `compute_r_complete()` 与 `compare_final_state_subset()`（L81-L96），仅基于 `task.compare_spec` 指定的表字段子集（如 `tables.fund_account[0].balance`）比对 `actual_state` 与 `golden_state`，无任何动作轨迹匹配逻辑。

### 3. Prompt 模板与信息边界隔离
- **Agent Teacher 模板**：`phase2/prompt_templates/agent_teacher/v1.1/base.jinja`（L48-L100），渲染 `policy_id`, `allowed_tools`, `escalation_conditions`, `hard_rules`, `policy_params`, `api_specs`, `<analysis>/<action>`，末尾追加 `turns`。
- **User Teacher 模板**：`phase2/prompt_templates/user_teacher/v1.1/base.jinja`（L34-L116），渲染 `hidden_truth_json`（剔除 `latent`）、`persona_json`、`reveal_policy`（5 条 DSL 规则）、`reveal_triggers`、`vague_terms`、`belief_grounding`。
- **用户视角脱敏过滤**：`src/agentic_gov/synthesis/prompt_renderer.py` 中的 `_serialize_turns_for_user_view()`，彻底剔除 `<analysis>` 思维、`<args>` 参数块及所有 `ToolTurn` observation。
- **Simulator 运行时 Prompt**：`src/agentic_gov/runtime/frozen_simulator_backend.py` 中的 `_system_prompt()`（L149-L171）与 `_normalize_history()`（L173-L189）。

### 4. Mask History 与训练配置
- **Note 004 事故记录**：`docs/experiment-notes/004-simulator-sft-role-order-fix-and-mask-history.md`：
  - L14-L24：记录 4,028 条（35%）样本被 LLaMA-Factory 静默丢弃（`Dropped invalid example: []`）；
  - L47-L65：论证 `mask_history: false` 在 Prefix Slicing 下导致早期轮次重复计算 Loss 的采样偏差；
  - L107-L115 / L144-L152：修复为 `mask_history: true`，确认 `label_ids` 仅最后一条 Simulator Turn 为非 -100。
- **Note 013 角色反转**：`docs/experiment-notes/013-simulator-sft-agent-simulator-role-naming.md`，确认 `agent` (user_tag) / `simulator` (assistant_tag) 的设计动机。
- **训练配置文件对比**：
  - `phase3/llamafactory/agent_sft.qwen3_4b_lora.yaml`（L30）：`mask_history: false`（Full Conversation 格式，全量 Assistant 轮次学一次）；
  - `phase3/llamafactory/simulator_sft.qwen3_4b_lora.yaml`（L48）：`mask_history: true`（Prefix Slicing 格式，仅目标轮次学一次）。

---

## 建议插入 recap 的补丁

### 补丁 1：更新 Ch1（任务设计），补充可恢复故障与 Golden Chain 的关系
- **插入位置**：`recap-blog.md` 第 1.4 节（`### 1.4 Golden Chain 确定性状态机`）末尾。
- **建议正文**：
```markdown
#### 4. 可恢复故障（Recoverable Error）的 Golden Chain 建模
在政务场景中，系统故障恢复也是标准业务能力的一部分。对于配置了瞬态故障（如 `TEMPORARY_UNAVAILABLE`）或入参缺失自愈的任务，`src/agentic_gov/task_factory/golden.py` 实现了专门的 `golden_chain_temporary_unavailable_recovery`：
- **两阶段期望动作**：在调用写工具（如 `submit_purchase_withdrawal`）时，Golden Script 显式声明两个连续动作——第一步 `ExpectedAction(expect_status="error", expect_code="TEMPORARY_UNAVAILABLE")`，第二步 `ExpectedAction(note="retry after TEMPORARY_UNAVAILABLE")`；
- **推导一致终态**：沙箱在重放该 Golden Chain 时，第 1 次被拦截报错，第 2 次放行写库，从而推导出包含完整业务办理结果的 `golden_final_state`。这保证了即使包含异常自愈过程，任务依然拥有严格确定的物理终态。
```

---

### 补丁 2：更新 Ch2（沙箱环境），澄清“预设异常”与自由探索的无冲突契约
- **插入位置**：`recap-blog.md` 第 2.4 节（`### 2.4 错误注入与韧性评测`）末尾。
- **建议正文**：
```markdown
#### 3. 预设异常与 Agent 自由探索的解耦契约
面试中常被追问：“如果沙箱预设了第 1 次调用报错，但 Agent 自由探索时改变了 API 调用顺序或增加了多次查询，会不会导致报错时机错位？”

答案是**绝对不会**。沙箱与 Agent 之间维持的是**“工具作用域 + 前置门禁计数（Tool-scoped & Precondition-gated）”**契约：
1. **局部工具计数器**：注入配置为 `{"tool_name": "submit_purchase_withdrawal", "on_call": 1}`。计数器 `_call_counter` 仅按 `tool_name` 独立累计，Agent 前期调用多少次 `query_balance` 或 `verify_identity`，完全不影响写工具的计数器；
2. **前置条件优先拦截**：在沙箱 8 步执行管道中，Step 5（前置条件校验）优先于 Step 6（错误注入拦截）。若 Agent 在未满足前置条件（如未核身）时盲目调用写接口，触发的是 `PRECONDITION_NOT_MET`，**计数器不递增**。只有当 Agent 满足所有前置条件、首次发起合规调用时，才精准触发 `TEMPORARY_UNAVAILABLE`；
3. **状态转移而非轨迹匹配**：L1 验证与强化学习打分仅比对最终数据库状态（`compare_spec`）和终态动作类型，不强制 Agent 的调用顺序与 Golden Script 完全一致。Agent 无论重试几次、采取何种对白，只要在最大轮数内最终合规自愈并达成目标 DB 状态，即视为成功。
```

---

### 补丁 3：更新 Ch3（SFT 数据合成），给出 Agent/User Teacher 的最小结构脱敏样例与边界表格
- **插入位置**：`recap-blog.md` 第 3.1 节（`### 3.1 双 Teacher 协同机制与信息边界隔离`）文末。
- **建议正文**：
```markdown
#### 3. Teacher Prompt 最小脱敏样例与信息边界矩阵

为清晰界定双 Teacher 的信息边界，下表总结了两者的可见性控制，并附上生产环境中的真实脱敏结构片段：

| 信息维度 | Agent Teacher (`agent_teacher/v1.1/base.jinja`) | User Teacher (`user_teacher/v1.1/base.jinja`) |
|---|---|---|
| **政策与规则 (PolicyCard / HardRules)** | **完全可见** (包含限额、转人工条件、红线) | **彻底屏蔽** (不可见任何政策条款) |
| **工具定义 (ApiSpec)** | **完全可见** (工具名、入参 Schema、前置条件) | **彻底屏蔽** (不可见任何 API 与数据库结构) |
| **真实个人事实 (HiddenTruth)** | **彻底屏蔽** (必须通过对话与工具查询获取) | **完全可见** (持有 `user_profile` 与 `case_context`) |
| **信息披露策略 (RevealPolicy DSL)** | **彻底屏蔽** (无法预知用户何时愿意告知) | **完全可见** (严格执行 5 条 DSL 释放时机) |
| **对话历史 (Dialogue History)** | **全量上下文** (自身 `<analysis>` + `<action>` + `ToolTurn` JSON) | **脱敏视图** (仅保留纯自然语言对白，剔除一切内部思考与工具数据) |

##### (1) Agent Teacher 结构样例（节选自 `agent_teacher/v1.1/base.jinja`）
```text
你是一位政务办事助手。你的任务是帮助用户办理公积金相关业务。

【Policy Card 摘要】
- policy_id: HF-WD-PURCHASE
- allowed_tools: verify_identity, query_purchase_contract, submit_purchase_withdrawal
- hard_rules: 未核验身份前严禁调用业务工具; 提取额不得超过购房总价

【Task-local 参数 (runtime_policy)】
- withdrawal_limit_purchase: 500000

【可用工具】
- submit_purchase_withdrawal: required_args: ['id_number', 'contract_number', 'amount'] ...

【输出格式要求】
必须严格按以下格式输出：
<analysis>（内部推理）</analysis>
<action type="Ask_User|Call_API|Finish|Escalate|FinishWithRefusal" [tool="..."]>（动作内容）</action>

【对话历史】
user: 同志，我想办购房提取公积金。
assistant: <analysis>用户表达购房提取意图，第一步必须索要身份与合同信息。</analysis><action type="Ask_User">您好，请问您的身份证号和购房合同号是多少？</action>
user: 我身份证是 440304196107019301，合同号是 CONTRACT_2025_0748。
```

##### (2) User Teacher 结构样例（节选自 `user_teacher/v1.1/base.jinja`）
```text
你要扮演一位政务办事窗口的用户。请严格按以下设定和规则说话。

【你的背景（Hidden Truth，不要主动全部说出来）】
{
  "user_profile": {"name": "赵敏", "id_number": "440304196107019301", "fund_balance": 60000},
  "case_context": {"contract_number": "CONTRACT_2025_0748", "requested_amount": 50749}
}

【你的 Persona（9 维）】
{"age_group": "senior_50_70", "cooperation_level": "compliant", "patience_turns": 8, "style": "colloquial"}

【Reveal Policy】
- user_profile.id_number: reveal_when_requested
- case_context.contract_number: reveal_in_opening
- case_context.requested_amount: reveal_when_requested_after_delay

【行为规则】
1. 严守 reveal_policy：若规则为 reveal_when_requested_after_delay，Agent 首次追问时必须回复“让我找找”延迟一轮，下一轮才能提供；
2. 实体保真：身份证号与合同号必须逐字从 Hidden Truth 复制，严禁编造。

【对话历史】（已过滤 Agent 思考与工具返回）
user: 同志，我想办购房提取公积金，合同号是 CONTRACT_2025_0748。
assistant: 收到，请问您的身份证号是多少？
```
```

---

### 补丁 4：更新 Ch5（SFT 训练），给出 Agent SFT 真实输入样例并对比 Mask 机制
- **插入位置**：`recap-blog.md` 第 5.1 节（`### 5.1 训练架构与 4 桶数据配比`）后半部分。
- **建议正文**：
```markdown
#### 3. Agent SFT 训练数据最小结构与 Loss Mask 机制
在数据进入 LLaMA-Factory 之前，`convert_stream1_to_llamafactory.py` 将 Stream ① 转换为 ShareGPT 格式。其最小真实结构如下：

```json
{
  "sample_id": "traj_withdrawal_purchase_001",
  "tools": "[{\"type\": \"function\", \"function\": {\"name\": \"verify_identity\", \"parameters\": {...}}}]",
  "messages": [
    {"role": "user", "content": "我想取公积金交首付，身份证 440304196107019301。"},
    {"role": "assistant", "content": "<analysis>用户已提供身份证，核验身份。</analysis>\n<action type=\"Call_API\" tool=\"verify_identity\">\n<args>{\"id_number\": \"440304196107019301\"}</args>\n</action>"},
    {"role": "observation", "content": "{\"status\": \"ok\", \"response\": {\"name\": \"赵敏\", \"status\": \"active\"}}"},
    {"role": "assistant", "content": "<analysis>核身成功，继续索要合同号。</analysis>\n<action type=\"Ask_User\">身份核验通过，请提供购房合同号。</action>"}
  ]
}
```

- **Loss Mask 机制（`mask_history: false` 的数学合理性）**：
  在 `agent_sft.qwen3_4b_lora.yaml` 中配置 `mask_history: false`。LLaMA-Factory 在处理带有 `tools` 的 ShareGPT 数据时，会自动将 `user` 和 `observation` 角色的 Token 屏蔽（`labels = -100`），仅对所有 `assistant` 角色计算交叉熵损失。由于 Stream ① 的每条样本是**整条完整的多轮轨迹**（未拆解切片），样本中的每个 Assistant 轮次在每个 Epoch 中仅被计算一次梯度，因此无需开启 `mask_history`。
```

---

### 补丁 5：更新 Ch6（User Simulator），补充 Simulator SFT 最小输入样例与 Mask History 深度解析
- **插入位置**：`recap-blog.md` 第 6.3 节（`### 6.3 决策插叙③：Role 顺序与 Mask History 修复`）文末。
- **建议正文**：
```markdown
#### 5. Simulator SFT 训练数据最小结构样例
`convert_stream2_to_llamafactory.py` 输出的单条切片样本结构如下：

```json
{
  "sample_id": "sim_sample_turn_02",
  "system": "{\"instruction\": \"你扮演政务服务对话中的办事群众...\", \"persona\": {\"age_group\": \"senior_50_70\"}, \"hidden_truth\": {\"user_profile\": {\"id_number\": \"440304196107019301\"}}, \"reveal_policy\": {\"user_profile.id_number\": \"reveal_when_requested\"}}",
  "messages": [
    {"role": "agent", "content": "请以办事群众身份开始本轮政务咨询。"},
    {"role": "simulator", "content": "同志，我想取公积金交首付。"},
    {"role": "agent", "content": "您好，请问您的身份证号是多少？"},
    {"role": "simulator", "content": "我的身份证号是 440304196107019301。"}
  ]
}
```

- **为何 Simulator 侧必须配置 `mask_history: true`**：
  在 `dataset_info.json` 中，`simulator` 角色映射为 `assistant_tag`（计入 Loss），`agent` 角色映射为 `user_tag`（Mask 屏蔽）。由于 Stream ② 是按用户轮次逐步切片展开的，上述对话若设置 `mask_history: false`，第一句群众话术将在前缀样本与当前样本中被重复计算 2 次 Loss，导致开场白梯度权重被数倍放大。设置 `mask_history: true` 后，框架只对最后一条 `simulator` 消息（`target_user_utterance`）计算 Loss，确保了多轮样本在强化学习仿真建模中的无偏分布。
```

---

## 建议的伪代码补丁

在 `recap-code/02_sandbox.py` 中，建议在 `Sandbox.execute` 中精确体现**“前置条件校验优先于错误注入拦截”**与**“基于工具的调用计数”**逻辑（不超过 40 行）：

```python
# 建议补充至 recap-code/02_sandbox.py 中的 Sandbox.execute 实现

    def execute(self, tool_name: str, args: dict[str, Any]) -> SandboxResult:
        if self._terminated:
            raise RuntimeError("Sandbox already terminated")

        # 1-4. 工具存在性、白名单、必填项与格式校验 (失败返回 INVALID_FORMAT 等)
        # ...

        # 5. 前置业务条件校验 (Preconditions): 未满足时不递增 call_counter，直接返回
        spec = self.api_specs[tool_name]
        for pre in spec.preconditions:
            subject = self._resolve_subject(spec.precondition_subject_refs.get(pre), args)
            if not self.runtime_flags.has(pre, subject):
                result = error_result(SandboxError.PRECONDITION_NOT_MET, missing=pre)
                self._record(tool_name, args, result)
                return result

        # 6. 错误注入拦截 (Error Injection): 仅对合法触达本步骤的调用递增计数器
        self._call_counter[tool_name] = self._call_counter.get(tool_name, 0) + 1
        injected = self._pop_injection(tool_name, self._call_counter[tool_name])
        if injected is not None:
            result = error_result(SandboxError(injected["error_code"]), injected=True)
            self._record(tool_name, args, result)
            return result

        # 7-8. 派发 Handler 执行并写入后置条件 (Postconditions)
        result = self.tool_handlers[tool_name](self.db, args, self._get_readonly_call_log())
        if result.status == "ok":
            for post in spec.postconditions:
                self.runtime_flags.set(post, self._resolve_subject(..., args, result.data))
        self._record(tool_name, args, result)
        return result
```

---

## 仍需谨慎的说法

1. **不可将 Golden Chain 称为“标准答案轨迹（Golden Trace）”**：
   - *风险*：若面试官误以为评测是比对 Agent 的每一步 Action 是否与 Golden Chain 一致，会质疑 Agent 是否拥有自由探索能力。
   - *澄清措辞*：Golden Chain 仅用于生成环境的 **Oracle 数据库终态（`golden_final_state`）**。评测机制是基于 `compare_spec` 比对状态变更子集，**不要求任何 Action Trace 匹配**。
2. **不可将所有业务报错混为“注入错误（Injected Faults）”**：
   - *风险*：若宣称超额提取、未核身、无贷款等都是“注入”的，会显得系统缺乏真实业务状态机。
   - *澄清措辞*：只有 `TEMPORARY_UNAVAILABLE` 这类模拟三方接口网络抖动的不可预测瞬态故障属于 `inject_errors` 注入；所有业务报错（`AMOUNT_EXCEEDS_LIMIT`, `PRECONDITION_NOT_MET`, `NO_ACTIVE_LOAN`）均是由沙箱状态机与 Handler 契约自然触发的。
3. **不可宣称 Agent SFT 与 Simulator SFT 的 Loss Mask 是“随便配的”**：
   - *风险*：面试官常深挖“为什么一个设 false 一个设 true，是否有理论依据”。
   - *澄清措辞*：必须明确指出根本原因在于**数据切分粒度（Data Granularity）**的不同：Agent SFT 是一条完整的 Conversation 样本，计算全量 Assistant Loss 无采样偏置；Simulator SFT 是 Prefix Slicing 切片样本，若不开启 `mask_history: true` 会导致前缀用户轮次被二次加权采样造成严重的梯度倾斜。
