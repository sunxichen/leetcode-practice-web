# agentic-gov 深问答案集独立审阅（GPT-2 / v1）

> 审阅对象：41 题 v1 草稿；按 G1→G7 增量核对题目锚点与仓库证据。

## G1 Reward 与判定设计

### 逐题判定

- **G1-1：通过。** v1→v2→v3 的反例链完整，728 条重算、组内 std 约 +30%、零方差组数不变均与锚点一致；也明确区分“当前 v3”与 T2/NoHitChecker 事故期读数。
- **G1-2：问题（阻塞级事实错误）。** 乘法门控、FWR 非对称补丁、`R_escalate` 移出训练和的主论证正确；但答案称 `R_terminal` “只取 0、0.5、1，0.5 留给合法平局”。现役实现 `src/agentic_gov/reward/terminal.py` 是对三个合法终局动作做精确匹配，分数只取 **0 或 1**；合法但不匹配也是 0，不存在 0.5。题目锚点的“三值”指三个 action label（Finish / FinishWithRefusal / Escalate），不是三档数值。必须改正，否则会直接误讲核心 reward 契约。
- **G1-3：通过。** 正确区分正仿射缩放与重分配内部质量项；“零方差组不变”与 v2 counterfactual 口径一致。建议把“严格空操作”限定为实现采用标准组内标准化且缩放系数为正的情形，但不构成当前答案错误。
- **G1-4：通过。** terminal-only 的可信 outcome、拒绝三类过程奖励、episode 级 Monte Carlo return 广播到 assistant token 的局限都覆盖到位；没有冒充已解决 temporal credit assignment。
- **G1-5：通过。** 纯 NLI 的跨 hypothesis 阈值不可统一、P-07/N1-03 不可达、per-message max、三层 hybrid 与 P/N1 非对称裁决均与锚点一致；0.0032/0.9971 数字准确。
- **G1-6：基本通过，有一处非阻塞补全。** hard / efficiency / 业务拒绝的责任划分、hard-zero vs 负分 vs resample、恢复可学性和 2.08% 证据均正确。建议明确补一句：现役 hard-zero 桶还包含 envelope 解析/格式/action-contract 失败，并通过 `failure_class` 与真安全违规分开观测；当前开头只列两类 sandbox hard error，容易让第一次记忆误以为 hard 桶只有越权/未知工具。
- **G1-8：通过。** 诚实说明权重来自继承与定性判断、没有系统敏感性分析，并明确 v3 中 `R_escalate=0`；计划/已执行口径清楚。

### 事实抽查记录

- `src/agentic_gov/reward/v3_config_binding.py`、`src/agentic_gov/reward/aggregate.py`：v3 有效权重为 `R_complete=0.65`、`R_disclosure=0.35`、`R_escalate=0`、两项 efficiency penalty 各 `-0.10`；`R_complete = R_state × R_terminal`。
- `src/agentic_gov/reward/terminal.py`：合法终局动作集合为三个 action；精确相等得 1.0，否则得 0.0；缺失、异常、结构化记录不可靠均 fail closed 为 0。由此证伪 G1-2 的 0.5 说法。
- `research-proposal/adr-l2-nli-premise-per-message.md`：同一 P-01 hit row，full-dialogue score **0.0032**，per-message max **0.9971**；512-token 截断解释一致。
- `research-proposal/adr-format-failure-hard-zero-vs-resample.md`、`phase6/free-rollout-readiness-report.md`：624 条自由 rollout 中 format failure 13 条，合计 **2.08%**，四类任务均低于 5% 门。
- `src/agentic_gov/runtime/episode_runner.py`：真 sandbox hard error 是 `UNKNOWN_TOOL`、`TOOL_NOT_ALLOWED`；`PRECONDITION_NOT_MET`、`MISSING_REQUIRED_ARG`、`INVALID_FORMAT` 等 sandbox 返回错误走 efficiency。另有 envelope/parse/action-contract failure 留在 hard-zero 桶，需与前者分开表述。

## G2 环境、数据与 Simulator

### 逐题判定

- **G2-1：通过。** 正确说明 contrast pair 的价值在数据覆盖和评测，而不在 advantage 层；混组数字例子、同任务 K 次采样作为公平 baseline、子采样成对约束均覆盖锚点。
- **G2-2：通过。** 信息边界、JSON 捷径、agent 不再自然语言告知、history 仅保留 user/assistant 并合并连续同角色等机制准确；表达通俗。
- **G2-3：问题（非阻塞口径不严）。** 不阻断、不把 simulator 行为罚给 agent、非 unprompted、10–14% 与四条反转条件均正确；但答案先说 reward “没有任何一项依赖群众第几轮才说实话”，这与现役 `P_turns` 间接依赖对话轮数矛盾。仓库 ADR 的准确口径是：早答确实可能影响 `P_turns`，只是同 task 的 K 条 rollout 中偏差低方差、近似共同平移，因此污染有限，而不是完全没有 reward 通道。后文又承认共同平移，形成轻微内部不一致。建议改为“除 `P_turns` 的间接影响外，核心 outcome/disclosure 不依赖 reveal 时机；实测该影响低方差”。
- **G2-4：通过。** 六层自动校验 + L6 人审、split 隔离、near-dup >0.90 拒绝、P5 holdout 一 family 一 task 的特殊口径、synthetic-to-real gap 均交代清楚；没有把 P5 特例泛化。
- **G2-5：基本通过。** boundary factor、共享种子/冻结字段、合法联动字段、reveal-policy 约束与恢复型 golden chain 都有事实依据。建议收敛措辞：“A 侧取限额内、B 侧取限额外，正确动作就反过来”只是数值边界示例，不宜让人记成所有 pair 都固定 A=Finish、B=拒绝；实际 side/action 映射由 boundary contract 决定。
- **G2-6：通过。** Policy Card / required_slots / API Spec / sandbox precondition / reward 的职责分层准确，prompt 无强制力与 workflow 过度写死的取舍合理，policy 版本硬绑定也覆盖到位。

### 事实抽查记录

- `research-proposal/adr-simulator-information-boundary.md`：已实施方案明确跳过 tool/system/observation，只给 simulator 自然语言对话；给 raw tool result 会引入 JSON shortcut 并错误激励 agent。
- `research-proposal/adr-simulator-delayed-reveal-not-blocking-phase6.md`：`after_delay` 占相关任务池约 **10–14%**（nonloan 26/180、purchase 6/60）；不是 unprompted；ADR 明确单列“`P_turns` 污染有限”，并非“不影响任何 reward”。
- 同 ADR：反转条件包括变成 unprompted、占比 >30%、reward/评测开始依赖 reveal timing、leak 进入 reward；opening leak 需保持 0。
- `research-proposal/adr-phase6-contrast-pair-grpo-grouping.md`：GRPO 对比发生在同一任务的 K 次尝试之间；pair 价值位于数据层与评测层；canonical/naturalized 子采样都要求 A/B 同留同删。
- `research-proposal/phase2-task-instance-generation.md`：contrast pair 使用共享 `seed.seed_id` 保证 non-boundary DB 字段一致；boundary 字段禁止 `reveal_in_opening` 和 `reveal_when_requested_after_delay`；允许登记过的联动字段变化。
- `research-proposal/最终研究方案.md`：`policy_id/policy_version` 在 task 装入 sandbox 前硬校验；required slots、API required args、sandbox precondition 的职责边界与答案一致。

## G3 训练、采样与稳定性

### 逐题判定

- **G3-1：通过。** “GRPO-style group-relative advantage + ART token-level CISPO”口径准确；ratio detach、宽裁剪、梯度只走 `new_logprobs`，以及 PPO 按 advantage 方向进入饱和分支的解释正确。strict on-policy 下 clip 极少触发的限定也到位。
- **G3-2：问题（非阻塞概念混淆）。** 零方差过滤、过滤省不了已发生的 judge 成本、禁止 hardest-first、2–6/8 核心带都正确；但末句说“7/8–8/8 饱和 canary 如果开始被过滤，说明模型退化”。全对饱和组本来就会因零方差被过滤，这通常是健康而非退化；真正的 tripwire 是 canary 的成功/动作分布从全对发生迁移（例如出现错动作/方差），不是“被过滤”本身。需要改写以免第一次记忆把 dynamic filter 方向记反。
- **G3-3：通过。** 最关键的口径纪律合格：明确 P5/T4 schedule 已冻结但未执行；4 rare-action core + 2 Finish anchors + 2 breadth、12-cell/terminal/task/family 浓度约束、同 cell 确定性补位、每步至少 6 个 usable、500 步及超参均与设计文档一致；历史 Step-2 0.74:0.26 配比也明确标为历史。
- **G3-4：通过。** L1→L3、K=8 同质训练、K=32 只做死区终裁不更新、purchase×FWR 的 `NOT_ELIGIBLE_AS_MONOTONIC_LADDER` 与“80 episode 重测未完成”口径完整；没有把修复假设说成已证明。
- **G3-5：通过。** KL 针对 disclosure + turns 压力诱发的“一次性倾倒/政务复读机”，以及“饱和 SFT 样本混进 GRPO 池不等于 rehearsal”的论证准确；0.04→0.08、T4 冻结 0.08 的历史/当前口径清楚。自蒸馏被明确写成报警后的备选，未冒充已执行。
- **G3-6：基本通过，有非阻塞漏项。** 当前 T4 的自动停训/硬暂停/告警+确认探针/promotion eligibility 分级和 8/60 门准确。但答案称自动停训“具体四种”过窄：当前 registry 还把错误 checkpoint/reward/judge identity、receipt/resume mismatch、冻结 schedule/anchor 契约破坏、simulator opening leak、授权 ceiling 等确定性执行/测量破坏列为拒绝启动或自动停训。建议把“四种”改为“代表性包括”，再按“不可恢复证据污染”总类概括。

### 事实抽查记录

- `docs/experiment-notes/024-phase6-strict-onpolicy-cispo-vs-grpo-and-async-drift.md`：CISPO 默认 clip 区间 `[0,5]`（`epsilon=1.0`, `epsilon_high=4.0`），`prob_ratio.detach()` 仅作权重；对外准确表述即 “GRPO-style group-relative advantages with token-level CISPO loss”。
- `research-proposal/expert-consult-p5-t4-planning-20260812.md`：T4 设计为 **500-step planning horizon**，每步 8 组（4 non-Finish core + 2 Finish anchor + 2 breadth），设计冻结但报告本身不授权训练；补位最多 2 组/步、全程最多 200 组，目标至少 6 usable groups。
- 同文档：LR `1e-5→3e-6` cosine、KL `0.08`、K=8、seed `20260609`、每 50 步 checkpoint、step 0 后每 100 步 dev eval；与答案一致。
- 同文档：rolling 50-step block 中每 cell 5–15%，Finish 25–35%，Escalate/FWR 各 30–40%，task/family caps 与答案一致。
- `research-proposal/expert-consult-p5-t4-nonr2-hardstops-20260812.md`：train-batch format/HV >5% 是 alert，不直接 kill；固定 60-task probe 在 ≥8/60 时确认；`prob_ratio_max>4` 是 hard pause + owner gate，历史 formal max **1.726**。
- 同 registry：NaN/Inf、身份/收据/恢复/split/JRA/静默 fallback 入梯度等不可恢复污染自动停止；simulator opening leak、冻结 schedule 与授权边界也有硬权力，因此答案“四种穷尽”不完整。

## G4 难题复盘

### 逐题判定

- **G4-1：基本通过。** 20min→数分钟的跨阶段口径、并发 4 的人为串行、8 轮 ping-pong、completion 长尾，以及 busy-time 与 phase-conditioned GPU utilization 的不同分母都讲清楚。小修建议：不要把 GPU 63% idle 只归成“等网络和 simulator 思考”；后续 instrumentation 还发现 non-zero LoRA serving 路径下 per-request decode 很慢。更稳妥的结论是“agent bucket 主导但不是 GPU 饱和，内部混合了请求/调度/serving kernel 与串行长尾”。
- **G4-2：通过。** 538s→1127s、2.1×、continuous batching、wave barrier、相位错开被破坏、已回滚永久废弃均准确。
- **G4-3：通过。** 1511→250 tok/s、prefix cache 94%、cheap fixes 仅 3–11%、根因只收窄到 r=128 non-zero LoRA serving path、未冒充内核级因果证明、A6000/4090 硬件口径都有明确限定。
- **G4-4：通过。** strict 696s vs async 1356s、约 44% 丢弃、rollout 瓶颈使 overlap 无利可图、merged 单版本中途 404 与 LoRA 双版本存活的差异、k=1 只管完成后的 admission 不管 in-flight 生命周期，均与证据一致；1.8–2× drift 也标成历史观测而非定律。
- **G4-5：问题（非阻塞但应修因果表述）。** 0.844→0.804、grad_norm 34.98、format failure/entropy 辅证、N_norm 2560 vs 4096、0/823、late residual −0.108705 都准确。但答案把根因说得过满：“padded 4096 + assistant token 少，所以分母太小把梯度放大几十倍”。Note 026 后续技术校正明确指出 4096 只是 pad 后宽度、健康 batch 的 completion token 也与 139–241 大量重叠，不能简单归因为“长上下文/短回答”；可直接确认的是特定 impersonation family 产生异常 policy gradient，现有 masked-mean 分母会集中该异常，normalization floor 能抑制它。另“823 步”应说 **823 个 gradient batch/update**，不是 823 个 outer training step。
- **G4-6：通过。** JRA 只证明运行时 checker/model/bundle/adjudicator/prompt 等身份与 parity，不证明语义正确或不存在 judge gaming；R3 是盲化独立语义审计且尚未执行，计划/事实口径严格。NoHitChecker 与 config SHA 的事故机制解释准确。
- **G4-7：通过。** 五问有效性契约、frozen×loan 不可观测/政策不支持、impersonation 信号只在 metadata、validator 未执行完整 registry、247 条 exact-hash 退役与 fail-closed 接线均一致。

### 事实抽查记录

- `handoff/handoff-phase6-grpo-rollout-throughput-optimization-20260625.md`：agent busy-time **98%**，agent GPU rollout 相位 idle **63%**、mean util 17.9%；busy-time 是 per-trajectory await wall 之和，不能当 GPU 饱和率。
- `docs/rl-rollout-throughput-survey.md`、batched-runner handoff：legacy **~538s**，batched **~1127s**，即 **2.1× slower**。
- `docs/experiment-notes/phase6_agent_stage_instr_4b_20260702_115431/verdict.md`：prefix cache **94%**；peak generation **1511→~250 tok/s（6.0×）**；证据支持 LoRA path 收窄，不支持点名某个 kernel 的确定因果。
- `docs/experiment-notes/025-phase6-strict-4b-async-k1-and-merged-serving-semantics-20260707.md`：strict median **696s**、async **1356s**；112 trained + 87 dropped，drop 约 **44%**；历史 drift 约 strict 的 **1.8–2×**；旧 model name 会 404。
- 同 Note 025 / effectiveness handoff：val strict **0.844→0.839→0.809→0.804**；step 37 grad_norm **34.98**、entropy **1.84**。
- `docs/experiment-notes/026-phase6-s3r-s3r2-recovery-experiments-20260717.md`：skip batch assistant tokens **139–241**；`N_norm=4096` 把 controls 压至约 0.32–0.42，`N_norm=2560` accepted；T4-R2 grad guard **0/823**、late residual **−0.108705**。同文档明确修正“4096=真实长上下文/短回答就是根因”的过度归因。
- `phase6/handoff/p5_t3b_jra_spec.md`：T2 实际 `_NoHitChecker`；真 NLI 重算 Finish strict **89→294/384**，说明运行时实例身份不能由 config SHA 代替。
- `docs/decisions/adr-phase6-p5-t0-scope-and-gates-20260806.md`、Note 030：共退役 **247 task rows**（162 impersonation ghost + 85 frozen unobservable loan query），数字准确。

## G5 由点扩面：RL/LLM 基础

### 逐题判定

- **G5-1：通过。** critic 的跨任务价值估计与单轨迹 absolute signal、组内 baseline 的局部性、显存/稳定性权衡、零方差代价和 K=8 的算力折中均讲清楚。建议把“critic 没有零方差问题”收窄为“不会因同组 reward 恰好相同而机械归零”，critic 仍可能估计差、advantage 接近零，不应理解成保证有信号。
- **G5-2：基本通过，有非阻塞技术简化。** 三条轴（DAPO 数据 admission/replacement、GSPO IS 粒度、CISPO 梯度路径）和“瓶颈在任务/测量而非换算法”准确。GSPO 段把 token ratio 描述成“几千个比率的乘积”过于粗糙；更准确是序列级 importance ratio/目标把 token-level ratio 的长序列高方差和不稳定性聚合处理，常见实现不是直接拿未归一化概率乘积做训练。建议避免给第一次记忆留下错误公式。
- **G5-3：通过。** 先声明 CE 方向，再分别写 `CE(p_data,π)` 与 `CE(π,π_ref)`，并指出后者多出 `H(π)`、最小化会附带压熵；这正是题目要求的关键限定。项目落点与 KL=0.08 一致。
- **G5-4：问题（事实表述需修）。** 两种 pass@k 公式都写对，0.16→pass@8≈0.75 也对；但称有限样本组合数估计“**不假设独立性**”不准确。`1-C(n-c,k)/C(n,k)` 是在 n 个独立/可交换生成样本上、无放回组合计算得到的常用无偏估计；它不自动修复 rollout 间相关性。另 pass@k 只表示“至少一个成功”，严格的 mixed-group 概率还要排除全成功；在 p=0.16 时全成功可忽略，但概念上应说明。
- **G5-5：问题（阻塞级事实错误/内部矛盾）。** on/off-policy、staleness、IS 修正与 clip 后有偏近似的解释总体正确；但结尾称 CISPO 是“**重要性权重裁剪到 4 倍以内**”。本项目 ART 默认参数是 `epsilon=1.0, epsilon_high=4.0`，实际 ratio clip 区间为 `[1−1, 1+4]=[0,5]`，上限是 **5**，不是 4。`prob_ratio_max>4` 是 T4 的人工暂停监控阈值，不能与 CISPO clip 上限混淆；且 G3-1 已正确说默认上界对应 5，构成答案集内部矛盾。
- **G5-6：通过。** 同 task paired delta、family 内相关性、family-clustered bootstrap、DEFF 只用于设计期近似、P5 holdout 一 family 一 task、一次预指定 look 与 CI `[+3.29,+15.13]pp` 全部准确。答案也没有把 S1 的正结果扩张成 Phase 6 全面通过。

### 事实抽查记录

- `docs/experiment-notes/024-phase6-strict-onpolicy-cispo-vs-grpo-and-async-drift.md`：ART CISPO 默认 `epsilon=1.0`、`epsilon_high=4.0`，明确写 ratio clip range **`[0,5]`**；由此证伪 G5-5 的“4 倍以内”。
- `docs/experiment-notes/007-sft-coldstart-vs-grpo-readiness-passk-analysis.md`：iid 近似 `pass@k=1-(1-p)^k`；p=0.16 时 pass@8≈0.75；真正死区为 pass@k≈0 与 hard-zero 地板。
- 题目锚点给出的有限样本估计为 `1-C(n-c,k)/C(n,k)`；这是无放回组合估计，不等于“无需独立/可交换采样假设”，答案需降格。
- `docs/decisions/adr-phase6-rl-effectiveness-verdict.md`：S1 held-out Escalate 从 **0.6974→0.7895**，delta **+9.21pp**，family-clustered bootstrap 95% CI **[+3.29,+15.13]pp**；同一 ADR 同时保留 HV 上升描述，因此只能报切片效果，不能报全面成功。答案守住了这一边界。
- `research-proposal/expert-consult-p5-power-sizing-20260806.md`：P5 holdout 通过每 cell/family 单任务设计把 DEFF 压近 1；正式推断仍使用 clustered bootstrap，不以 DEFF 替代。

## G6 业界动向与启发

### 逐题判定

- **G6-1：问题（非阻塞事实口径）。** AReaL-SEA→单独训练/验收 simulator、CoVe→constraint fuzzification 与 outcome/constraint verifier 的设计映射是对的；但答案举例称 Phase 4 五门包括“单轮延续率、追问频率分布对标真实数据”，这不是仓库冻结的五项 exit gate。实际五项是：instruction following ≥0.95、RPCR leak-free ≥0.90、persona consistency ≥0.90、premature termination ≤0.05、topic drift ≤0.05。应直接列真实五门或不举例，避免把文献启发说成项目已执行指标。
- **G6-2：问题（非阻塞概念泛化）。** OPD 两要件、无领域 oracle teacher、sandbox/verifier 适合 RLVR、自蒸馏只是 Phase 6.5 gated option 且未执行，均准确。问题在“RL 本身比蒸馏更不容易遗忘”：`RL's Razor` 支持的是 **on-policy 学习相对 off-policy 学习**更少遗忘，不能概括成 RL > distillation；OPD 本身也是 on-policy distillation，仓库甚至把它作为恢复遗忘的方案。建议改成“on-policy RL/OPD 通常比 off-policy SFT 式更新更少遗忘”。
- **G6-3：通过。** 减 turn、多 job multiplex、bounded-staleness async、框架/资源工程四类地图完整；2×4090 单 job 的适用性过滤与 async 立场分裂的任务依赖解释符合调研。严格主线与重新评估条件没有混成已切 async。
- **G6-4：通过。** 可程序化验证优先、hybrid judge 只处理语义项、JRA 防身份漂移、R3 防 judge gaming 且未执行、方向不对称按误判代价设计，均与 G1/G4 一致。建议补一句 adjudicator 并非只“处理前两层拿不准”，部分 P/N1 路径是按预定方向强制复核；不过当前表述整体不影响主结论。

### 事实抽查记录

- `research-proposal/phase4-simulator-sft-plan.md`：Phase 4 五项硬门为 **0.95 instruction、0.90 RPCR、0.90 persona、≤0.05 premature termination、≤0.05 topic drift**；答案所举“单轮延续率/追问频率”不是该 gate 表。
- `research-proposal/方案评估报告.md`：AReaL-SEA 被用于支持“user simulator 单独 SFT/评估”，CoVe 被用于支持 constraint fuzzification 与关键约束/终态验证；设计影响主线有仓库依据。
- `docs/on-policy-distillation-applied-to-this-project.md`：OPD 判据是学生自采样 + 教师 per-token log-prob；项目缺领域 oracle teacher，主线是 sandbox/verifier episode reward 的 RLVR；Phase 6.5 self-distill 是可选扩展，未执行。
- `docs/on-policy-distillation-survey.md`：`RL's Razor` 的准确对比是 on-policy 相对 off-policy 遗忘更少；同文档将 OPD 列为恢复 IF/chat 能力的方法，因此不能简化成“RL 比蒸馏更不遗忘”。
- `docs/rl-rollout-throughput-survey.md`：明确写 bounded staleness 没有学界共识；RollMux 主张保持 on-policy，多 job 填 bubble；AReaL/StreamRL/Laminar 接受有限 staleness；对本项目建议保留 strict baseline。
- `research-proposal/phase5-reward-pipeline.md` 与 T4 registry：hybrid chain、JRA、blinded R3 三层防线成立；R3 是预注册未来审计，不可说已完成。

## G7 代码实现卡

### 逐题判定

- **G7-1：问题（阻塞级实现错误/跨题矛盾）。** CISPO 与 PPO 的核心梯度差异解释正确，但手写的“实际 loss”有两处关键常数错误：ART 组内 advantage 的分母是 `std + 1e-6`，不是 `1e-12`；CISPO 默认 `epsilon=1.0, epsilon_high=4.0`，代码是 `clip(ratio.detach(), 0, 5)`，不是 `clamp(max=4.0)`。这既重复 G5-5 的错误，也与 G3-1 已正确给出的上界 5 自相矛盾。另若题目强调“实际优化”，最好补出 ART 的 trajectory token weight、assistant mask 与 denominator reduction；当前伪代码只能称核心 token surrogate，不能称完整生产 reduction。
- **G7-2：基本通过，有一处非阻塞项目落点混淆。** 在已冻结的符号下，k1/k2/k3 公式及无偏性、非负性、方差/数值风险都正确。问题是落回项目时先说“监控场景要非负”，而现役 drift telemetry 的 `approx_kl_old_new = mean(old_logprob-new_logprob)` 正是可取负的 k1；项目另用绝对 logprob gap 与 ratio 分位数补足幅度监控。KL anchor 的 `loss/kl_policy_ref` 也使用逐 token log-ratio 的 k1 家族并以 0.08 系数修正 advantage。建议把“监控要非负”改成一般选型偏好，不要说成当前实现事实。
- **G7-3：通过。** assistant-only mask、保留原始 OpenAI `Choice`/logprobs、字符串重建导致无 trainable assistant result、`observation→tool` 角色归一化四个关键点都与 ART 和项目 adapter 一致。严格实现并非简单手工记 span，而是 chat-template sentinel/token alignment 后置 mask，但答案作为面试走查抽象足够准确。
- **G7-4：基本通过。** v3 binding fail-closed、sandbox `export_state()`、compare_spec 子集比对与 runtime shadow table 剥离、reported/structured terminal 双证据、乘法门控、N1 veto、冻结 turn target、hard-zero、加权结算和结构化 breakdown 均准确。小修：代码中的 hard/complete/disclosure/escalate/efficiency 是顺序调用，不是“并行算”；config binding 也不只是裸 sha 相等，而是 canonical config、binding id、bundle 等完整绑定校验。两处均不影响主数据流。
- **G7-5：通过。** 单一 `<analysis>/<action>` parser、五类结构化 action 的 fail-closed envelope、拒绝 Qwen3 原生 think 通道、LF `template:qwen` 与 Qwen3 jinja 的两处 token skew、`enable_thinking=False` 反直觉注入空 think、0→0.6875 回归、手写 jinja 与 IDENTICAL gate 均有直接仓库证据。

### 事实抽查记录

- `/Users/sunxichen/Projects/ART/src/art/preprocessing/tokenize.py`：组内 population std；`advantage /= reward_std + 1e-6`；`advantage == 0` 默认过滤。由此证伪 G7-1 的 `1e-12`。
- `/Users/sunxichen/Projects/ART/src/art/loss.py`：CISPO 默认上下参数分别为 1.0/4.0，实际 `torch.clip(..., 1-epsilon, 1+epsilon_high)` 即 **[0,5]**；ratio detach，梯度走 `new_logprobs`。同文件还包含 trajectory weights、assistant mask、denominator reduction 与 KL advantage adjustment。
- `patches/art/phase6-cispo-drift-telemetry.patch`：`approx_kl_old_new=(-logprob_diff).mean()`，注释明确该均值可正可负；另记录 `logprob_abs_diff_*`、ratio p95/p99/max，故 G7-2 不应把当前 telemetry 概括为非负估计。
- ART `tokenize.py`：只有含 logprobs 的原始 `Choice`（或显式允许无 logprobs 的 assistant dict）才进入 trainable mask；无 trainable assistant message 时返回 `None`。`phase3/llamafactory/smoke_test_tokenization.py` 对 `observation→tool` 做显式重映射。
- `src/agentic_gov/runtime/episode_runner.py`：episode 结束以 `sandbox.export_state()` 填 `actual_final_state`。`src/agentic_gov/reward/complete.py` 支持 `exact`、`exact:<literal>`、`in_set:<...>` 并剥离 `runtime_policy`。
- `src/agentic_gov/reward/aggregate.py`、`runtime/reward_glue.py`：v3 校验发生在 verifier/provider 工作前；最终 `RewardBreakdown` 附回 EpisodeResult 与 Trajectory JSON，支持逐分量审计。
- `docs/experiment-notes/011-...`、`012-...` 与 `research-proposal/adr-phase3-chat-template-qwen-not-qwen3.md`：default system 缺失 + 末轮空 think 是精确两处 skew；修复后 Agent/Simulator token diff 为 IDENTICAL；历史 hard violation **0→0.6875**。

## 总体判断

41/41 题均存在且均已完成逐题核查，没有缺题；答案集的项目复盘、数字记忆、计划/已执行边界和大部分 RL 机制解释总体扎实，但当前版本仍有 **3 个受阻题位（2 类核心事实根因）**，不宜直接作为最终面试背诵稿。修正 `R_terminal` 二值契约，以及 CISPO/advantage 的真实实现常数后，可进入下一轮语言压缩与口径统一。

### 阻塞级问题清单

1. **G1-2 — 核心 reward 契约讲错。** `R_terminal` 只可能为 **0/1**；三个值是三种合法 action label，不存在 0.5“合法平局”。
2. **G5-5、G7-1 — CISPO clip 上限讲错且跨题矛盾。** 默认参数产生的实际区间是 **[0,5]**；`prob_ratio_max>4` 是监控 hard-pause 阈值，不是 clip 上限。G3-1 已说上界 5，必须全稿统一。
3. **G7-1 — 实现常数讲错。** ART 组内 advantage 使用 `std + 1e-6`，不是 `std + 1e-12`；代码题要求手写真实实现，此处必须精确。

### 非阻塞修改建议

- **Reward/环境：** G1-6 补齐 format/action-contract 也在 hard-zero 桶；G2-3 明确 reveal timing 会经 `P_turns` 间接影响 reward；G2-5 避免把一个 boundary 示例说成所有 pair 的固定 A/B 动作方向。
- **训练/稳定性：** G3-2 将 canary tripwire 改为“从稳定全对分布发生迁移”，不要把正常零方差过滤说成退化；G3-6 把“四种自动停训”改成代表例，并纳入身份、收据、schedule、opening leak、授权边界等不可恢复污染。
- **性能复盘：** G4-1 不要把 GPU idle 单归因于网络/simulator；G4-5 降格“长上下文+短回答”的根因断言，并把 823 改成 gradient batches/updates。
- **通用 RL：** G5-1 收窄 critic“没有零方差问题”的绝对表述；G5-2 精确描述 GSPO sequence-level ratio；G5-4 删除有限样本 pass@k “不假设独立性”，并区分 pass@k 与 mixed-group 概率。
- **业界映射：** G6-1 换回 Phase 4 的真实五项 gate；G6-2 把“RL 比蒸馏更不遗忘”改成 on-policy 相对 off-policy 的限定结论；G6-4 可补 adjudicator 的方向性强制复核路径。
- **代码卡：** G7-1 若称“实际 loss”，补出 weights/mask/denominator（以及 KL anchor 的位置）；G7-2 明确当前 drift telemetry 的 k1 可为负，非负幅度由 abs-gap/ratio 指标辅助；G7-4 把“并行计算”改成顺序数据流，并准确描述完整 config binding。

