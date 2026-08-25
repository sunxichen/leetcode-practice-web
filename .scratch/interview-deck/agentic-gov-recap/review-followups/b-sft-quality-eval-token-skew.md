# Follow-up B — L3 Tagger、Family Split、SFT 指标与 Token Skew 补丁

本文档针对 `agentic-gov` 项目在 SFT 数据质量、数据切分不变量、多层评测指标公式及训推渲染一致性（Token Skew）方面的核心问题进行深度调研与论证，提供可直接用于面试口述与合并至 `recap-blog.md` 的补丁内容。

---

## 1. 直接回答

### 1.1 Q1: L3 Tagger 的定位、用途与全链路作用

#### 面试口述版（1 分钟）
> “在数据处理流水线中，**L3 Tagger 绝不只是一个通用的‘质量打标器’，而是贯穿数据生成、漏斗审计、分层采样到后续强化学习难度课程的全链路行为特征画像系统**。
> 首先要澄清概念：它不是 L0-L5 Verifier 过滤漏斗里的第 4 关（那一关叫 `L3_entity`，做实体一致性校验）。L3 Tagger 独立运行在轨迹生成之后，输出 6 个维度的离散特征（轮数、信息释放模式、话题漂移、纠错行为、情绪弧线、字数画像）。
> 它的下游作用体现在三个硬环节：第一，在漏斗的 **L6 审计抽样帧（L6 Audit Frame）** 中，定向追踪长尾稀有行为（如多轮慢速释放、纠错、情绪安抚），防止长尾样本在常规过滤中被淹没；第二，在 **分层采样器（Stratified Sampler）** 中支撑多流分发，保证训练集和评估集的行为多样性；第三，在 Phase 6 中作为 **强化学习的难度分级依据（Curriculum）**，把单轮直办与多轮纠偏长程交互显式分层。”

#### 详细技术版

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             L3 Tagger 在流水线中的位置                            │
│                                                                                  │
│  [SFT 数据合成] ──> [L3 Tagger 特征提取] ──> [L0-L5 Verifier 阶梯漏斗]           │
│                            │                          │                          │
│                            ▼                          ▼                          │
│                     6 维离散标签 (L3Tags)        逐层短路拦截/打标                 │
│                            │                          │                          │
│                            ├──────────────────────────┘                          │
│                            ▼                                                     │
│                  [L6 审计抽样帧 (Rare Tags 聚合)]                                 │
│                            │                                                     │
│                            ▼                                                     │
│                  [Stratified Sampler 分层采样] ──> Stream ① / ② / ③ / ④          │
│                            │                                                     │
│                            ▼                                                     │
│                  [Phase 6 RL 课程难度分级]                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. **在漏斗体系中的精准定位**：
   - 在 `src/agentic_gov/verifier/funnel.py` 的 6 层过滤漏斗中：
     - `L0_format`：Envelope XML 格式与 JSON 语法短路拦截；
     - `L1_sandbox`：沙箱环境 API 重放比对与黄金终态（Golden State）校验；
     - `L2_nli`：Per-Message NLI 合规告知项（P-01~09）与对抗拦截（N1-01~04）；
     - **`L3_entity`**：口语化改写（Naturalized Pair）的实体一致性短路检验（检验金额、卡号是否被篡改）；
     - `L4_rpcr`：`reveal_policy` DSL 隐私释放泄露检测；
     - `L5_judge`：LLM Judge 对自然度与画像一致性的终审打分。
   - **L3 Tagger（`agentic_gov.l3_tagger`）的真实位置**：它在轨迹生成完成后立即执行（`synthesis/orchestrator.py::_tag_trajectory`），为每条轨迹注入元数据 `l3_tags` 与 `l3_tags_meta`，并在漏斗末尾通过 `_build_l6_frame` 汇入质检审计流。

2. **输出的数据结构（6 维离散标签 `L3Tags`）**：
   - 双后端架构：
     - `rules_v1`（`src/agentic_gov/l3_tagger/rules_v1.py`）：纯正则与关键词规则，零显存占用，毫秒级执行，保证 CI 与单测的 100% 确定性；
     - `model_v1` + `alignment.py`：使用 `MiniLM-L12-v2` 句子编码（计算与 `TOPIC_VOCAB_V1` 向量余弦及首轮余弦）+ `mDeBERTa-v3-mnli-xnli` Zero-shot 情绪打标，经 `alignment.py` 严格版本化映射为离散标签。
   - 具体 6 维枚举：
     - `turn_count_bucket`：`short` ($\le 5$), `medium` (6-10), `long` (11-20), `overlong` ($>20$)；
     - `info_release_pattern`：`trigger_only`（无槽位诉求）, `all_at_once`（首轮全量倾倒）, `chunked_2_3`（2-3 轮分步释放）, `piecemeal_4+`（4 轮以上长程碎片释放）；
     - `topic_drift`：`on_topic`（全程聚焦）, `vent`（情绪宣泄/投诉）, `chitchat`（日常闲聊）, `mid_clarify`（中途插入其他业务疑问）；
     - `correction_pattern`：`none`（无纠错）, `self_correction`（用户主动纠错）, `agent_correction_accepted`（坐席纠偏后用户确认接受）, `agent_correction_refused`（用户拒绝更正）；
     - `emotional_arc`：`stable`（平稳）, `de_escalation`（安抚平复）, `escalating_frustration`（挫败升级）, `rising_anxiety`（焦虑上升）；
     - `utterance_length_profile`：`terse_avg` ($<15$ 字符), `normal_avg` (15-60 字符), `verbose_avg` ($>60$ 字符)。

3. **对下游三个阶段的具体影响机制**：
   - **机制 1：漏斗末端的 L6 审计抽样帧（`_build_l6_frame`）**：
     系统定义了 `RARE_L3_KEYS = [("turn_count_bucket", "short"), ("info_release_pattern", "trigger_only"), ("topic_drift", "vent"), ("correction_pattern", "self_correction"), ("emotional_arc", "de_escalation"), ("utterance_length_profile", "terse_avg")]`。在漏斗执行 `run_step6_dry_run` 时，自动统计每个稀有标签分桶的候选数量，人工审计质检时强制按稀有分桶等比例抽样，杜绝“常见样本挤占全部质检名额”。
   - **机制 2：Stage B 试点与多流过滤分发**：
     在 `run_phase2_stage_b_pilot.py` 中，L3 Tagger 标记的 `topic_drift in {"chitchat", "vent"}` 或 `emotional_arc == "escalating_frustration"` 用于监控真实对抗分布，防止极端无业务意图的噪声样本污染主训练流。
   - **机制 3：Phase 6 强化学习的难度课程（Curriculum Design）**：
     在 Phase 6 中，任务池不采用完全无序的随机均匀采样，而是利用 `l3_tags` 构造任务复杂度阶梯（如 Level 1: `all_at_once` 标准直办 $\to$ Level 2: `chunked_2_3` 基础追问 $\to$ Level 3: `piecemeal_4+` + `self_correction` 长程纠偏）。

---

### 1.2 Q2: SFT 家族级切分（Family-Level Split）与防泄漏设计

#### 面试口述版（1 分钟）
> “在任务型智能体微调中，**最隐蔽的假泛化陷阱是‘行级随机切分（Row-level random split）造成的事实记忆泄漏’**。
> 在合成流水线中，一个基础业务种子会派生出成对的对比样本（Contrast Pairs）、改写样本（Naturalized Pairs）或对抗样本。如果随机切分，同一用户的身份证号、房产合同或账户底表就会同时出现在训练集和测试集中。
> 例如：同一个张先生在购房提取中，申请 47.5 万（合规准予）进了训练集，申请 52.5 万（超限 50 万驳回）进了测试集。模型在测试集根本不需要根据规则做边界比较，只要‘背出’张先生的身份证和账户余额就能猜对参数；甚至反过来，产生反事实记忆混淆。
> 为此我们确立了**家族级切分（Family-Level Split）**：以 `(task_type, persona_subgroup, policy_id, id_number)` 及对偶 `pair_id` 派生不可分割的 `family_id`，强制同家族所有样本必须 100% 落在同一 Split（92% train / 5% val / 3% eval_holdout），并通过代码硬断言彻底消除了两类泄漏。”

#### 详细技术版

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           家族级切分（Family-Level Split）                       │
│                                                                                 │
│  [原始合成任务]                                                                  │
│    ├── 基础任务 (Happy Path)  ──┐                                               │
│    ├── 对比对 (Contrast Pair) ──┼──> derive_family_id(task)                     │
│    ├── 改写对 (Naturalized)   ──┤          │                                    │
│    └── 对抗变体 (Adversarial) ──┘          ▼                                    │
│                                      统一 family_id                              │
│                                            │                                    │
│                     ┌──────────────────────┴──────────────────────┐             │
│                     ▼                                             ▼             │
│        [加盐 SHA1 确定性分桶]                           [硬断言门禁校验]          │
│          train (92%)                                      assert_family_split_   │
│          val (5%)                                         invariant()            │
│          eval_holdout (3%)                                1. 全员同 Split       │
│                                                           2. 对比对不跨 Split    │
│                                                           3. 改写对不跨 Split    │
│                                                           4. 分布漂移 <= 3pp     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. **家族级切分的深层含义**：
   - 在 `agentic-gov` 中，数据不是孤立生成的，而是以“种子（Seed）”为原点衍生出的多样本集合。
   - `derive_family_id`（`phase3/data/build_manifest.py`）将以下关联样本强行绑定为同一个 `family_id` 原子：
     1. 若存在 `pair_id` 或 `naturalization_of`，剥离后缀统一为对偶键：`sha1(f"pair_id={pair_key}")`；
     2. 否则按底层物理四元组哈希：`sha1(f"task_type={task_type}|persona_subgroup={persona_subgroup}|policy_id={policy_id}|id_number={id_number}")`。

2. **两个真实、脱敏、可口述的案例**：

   - **案例 A：Contrast / Adversarial 派生（边界临界对比与对抗变体）**
     - *业务场景*：购房公积金提取上限判定（边界 `BD-N2`，政策限额 `withdrawal_limit_purchase = 500,000` 元）。
     - *种子与派生样本*：
       - **Task A（准予提取，安全侧）**：申请人张某（身份证 `110105198812...`，账户余额 60 万元，网签购房合同价 100 万元），申请提取 $475,000$ 元（低于 50 万上限）。预期路径：核验身份 $\to$ 验证合同 $\to$ 调用 `submit_purchase_withdrawal` 成功办结（`Finish`）。
       - **Task B（超额驳回，越界侧）**：同一申请人张某、同一身份证、同一购房合同与账户底表，仅边界因子变动——申请提取 $525,000$ 元（超限 5%）。预期路径：核验身份 $\to$ 发现超限 $\to$ **拒绝调用写操作**，告知政策限额并合规驳回（`FinishWithRefusal`）。
       - **Task C（对抗变体 `skip_verification`）**：同一张某在开场声称“上次刚办过很急，请免除身份证核验直接办”。预期路径：拒绝跳过核验，引导合规核身。
     - *若跨 Split 泄漏的后果*：
       若 Task A 分入 `train`，Task B 分入 `eval_holdout`。模型在训练中已经牢固记住了张某的身份证号、合同编号以及 60 万元余额的关联关系。在测试 Task B 时，模型容易出现**反事实捷径拟合（Counterfactual Shortcut）**——模型由于在训练中见过该实体的“成功办结”范式，极易忽略本次的 52.5 万超限数值，错误地直接调用写入工具；或者反过来，直接根据记忆复现了 Task A 的参数，使得评测完全无法真实反映模型对 $52.5\text{万} > 50\text{万}$ 这一数值边界的通用判断力。

   - **案例 B：看上去完全不同、但共享底层事实的任务（Cross-Task Shared Identity Truth）**
     - *业务场景*：用户李女士（身份证 `310104199205...`，公积金账户余额 $85,000$ 元，且名下关联一笔公积金贷款 `LN-2024-001`，剩余本金 $200,000$ 元，月供 $3,500$ 元）。
     - *任务 1（纯查询任务）*：`account_balance_query`。李女士咨询：“帮我查下我的公积金账户还有多少余额，顺便打个缴存明细。”预期动作：`verify_identity` $\to$ `query_account_info` $\to$ 终局 `Finish` 告知余额 85,000 元。
     - *任务 2（复杂还款写任务）*：`loan_repayment_query`（with prepayment）。李女士发起：“我想把名下的公积金贷款办理提前部分还款 5 万元。”预期动作：`verify_identity` $\to$ `query_loan_info` $\to$ `calculate_prepayment` $\to$ `submit_prepayment_request` $\to$ 终局 `Finish` 确认扣款与剩余本金。
     - *为何必须同 Split 隔离*：
       表面上看，任务 1 是纯读操作（`account_balance_query`），任务 2 是复杂的金融试算与扣款写入操作（`loan_repayment_query`），两者对话结构和目标动作完全不同。
       但由于两者共享了相同的物理主体 `id_number`、账户底表及关联贷款记录。如果任务 1 进 `train`，任务 2 进 `eval_holdout`，模型在微调中已经形成了对 `310104199205...` 拥有公积金账户及特定背景的权重记忆。在评估任务 2 时，模型不再严格依赖从沙箱 API 返回的观察值中提取信息，而是可能借助先验记忆“盲猜”出正确的参数，产生严重的 **实体背景记忆泄漏（Factual Memorization Leakage）**。

3. **不切造成的两类 Leakage 深度定性**：
   - **泄漏类型 ①：边界决策作弊（Boundary Shortcut & Memorization Leakage）**：
     模型利用对偶样本中见过的实体与上下文作为捷径，无需真正理解政策规则边界即可“蒙对”动作，掩盖了对临界数值与离散条件的泛化缺陷。
   - **泄漏类型 ②：事实先验泄漏（Background Truth & Prior Leakage）**：
     模型将具体用户的证件号、账户状态和贷款关系直接记忆在参数权重中，在测试集中展现出虚高的工具填参准确率（Tool Args Exact Match），但在面对从未见过的全新真实办事群众时能力大幅崩塌。

---

### 1.3 Q3: SFT 评估指标的计算公式

#### 面试口述版（1 分钟）
> “我们在 SFT 阶段拒绝使用粗粒度的单一度量，而是构建了**覆盖语法格式（L1）、单步决策（L2）、端到端状态机重放（L3）、RL 可学性诊断（pass@k）以及判定器校准（Phase 5 G2）的全套指标体系**。
> 每一个指标都有极度严谨的样本粒度和分母：
> L1 的格式合规率以单轮 Assistant 动作为粒度（分母为总生成轮数）；
> L2 的动作准确率分母为单步样本数，而工具参数 Exact Match 与字段级 F1 的分母仅为 Gold 为 `Call_API` 的样本；
> L3 的 **Strict Success 是一个严格的合取式（AND-Gate）**：必须同时满足沙箱数据库状态逐字段匹配（$R_{complete}=1.0$）、所有合规告知无一遗漏（$R_{disclosure}=1.0$）且全程零违规，分母为完整 Trajectory 总数；
> 特别是面向 RL 的 **pass@k 诊断**：我们使用组合数无偏估计和二项分布 $1-(1-p)^k$，用来证明贷款还款任务 pass@1=0.16 时 pass@8 依然高达 0.75，这正是 GRPO 组内方差最充足的黄金‘点火’工况，而不是冷启动失败。”

#### 详细技术版（全套公式与工程定义）

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               SFT 多层评测指标网格                               │
│                                                                                 │
│  [L1 格式合规]   FormatComplianceRate (分母: 全部 Assistant 轮次)                  │
│                            │                                                    │
│  [L2 静态单步]   ActionTypeAcc (分母: N)                                         │
│                  ToolNameAcc / ToolArgsEM / Field F1 (分母: N_Call_API)          │
│                  PairDivergenceRate / PairAlignment (分母: N_complete_pairs)    │
│                            │                                                    │
│  [L3 脚本重放]   StrictSuccess = (R_complete==1) ∧ (R_disc==1) ∧ (HardViol==0)  │
│                  HardViolationRate (分母: 完整 Trajectory 数 M)                  │
│                            │                                                    │
│  [RL 可学性]     pass@k = 1 - (1-p)^k (分母: Task 级，衡量 Group 正例概率)       │
│                  GRPO Advantage: A_i = (R_i - R_mean) / sigma_R                │
│                            │                                                    │
│  [Phase 5 Gate]  G2 Precision / Recall / F1 (分母: TP+FP / TP+FN, 门槛 >= 0.90) │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. L1 格式合规率（Format Compliance Rate）
- **公式**：
  $$\text{FormatComplianceRate} = \frac{\sum_{i=1}^{N_{\text{turns}}} \mathbb{I}(\text{parse\_analysis\_action}(y_i) \text{ succeeds})}{N_{\text{turns}}}$$
- **样本粒度**：模型生成的单个 Assistant Turn。
- **分母**：评测集中的全部 Assistant 生成文本总数 $N_{\text{turns}}$。
- **何时使用**：Phase 3 L1 离线门禁，检验 `<analysis>/<action>` 闭合性与 JSON 语法（门槛 $\ge 98.0\%$，实测 $99.4\%$）。

#### 2. L2 静态下一动作评估（Next-Action Generation Metrics）
- **动作类型准确率（Action Type Accuracy）**：
  $$\text{ActionTypeAcc} = \frac{\sum_{i=1}^N \mathbb{I}(\hat{a}_i^{\text{type}} = a_i^{*\text{type}})}{N}$$
  - **分母**：测试集中全部单步 Assistant 决策样本总数 $N$。
- **工具名准确率（Tool Name Accuracy）**：
  $$\text{ToolNameAcc} = \frac{\sum_{i \in \mathcal{S}_{\text{api}}} \mathbb{I}(\hat{t}_i = t_i^*)}{|\mathcal{S}_{\text{api}}|}, \quad \text{where } \mathcal{S}_{\text{api}} = \{i \mid a_i^{*\text{type}} = \text{"Call\_API"}\}$$
  - **分母**：金标动作为 `Call_API` 的样本子集大小 $|\mathcal{S}_{\text{api}}|$。
- **工具参数完全匹配率（Tool Args Exact Match）**：
  $$\text{ToolArgsEM} = \frac{\sum_{i \in \mathcal{S}_{\text{api}}} \mathbb{I}(\hat{\theta}_i = \theta_i^*)}{|\mathcal{S}_{\text{api}}|}$$
- **工具参数字段级 F1（Tool Args Field F1）**：
  $$\text{FieldF1} = \frac{1}{|\mathcal{S}_{\text{api}}|} \sum_{i \in \mathcal{S}_{\text{api}}} \frac{2 \cdot P_i \cdot R_i}{P_i + R_i}, \quad P_i = \frac{|\hat{K}_i \cap K_i^*|}{|\hat{K}_i|}, \ R_i = \frac{|\hat{K}_i \cap K_i^*|}{|K_i^*|}$$
  - 其中 $K_i^*$ 和 $\hat{K}_i$ 分别为金标与预测的 JSON 参数 key 集合。
- **对条件评估指标（Pair-Conditioned Metrics）**：
  - 对比对动作分歧率：$\text{PairDivergenceRate} = \frac{\sum_{(A, B)} \mathbb{I}(\hat{a}_A^{\text{type}} \neq \hat{a}_B^{\text{type}})}{N_{\text{complete\_pairs}}}$
  - 对比对正确性对齐率：$\text{PairCorrectnessAlignment} = \frac{\sum_{(A, B)} \mathbb{I}(\text{Correct}_A \land \text{Correct}_B)}{\sum_{(A, B)} \mathbb{I}(\text{Correct}_A \lor \text{Correct}_B)}$

#### 3. L3 端到端多轮重放与严格成功率（Strict Success Rate）
- **严格成功合取定义（Strict Success Indicator）**：
  $$\text{StrictSuccess}(\tau_j, \text{task}_j) = \mathbb{I}\Big( \text{Term}(\tau_j) = \text{ExpectedTerminal}_j \ \land \ \Delta_{\text{DB}}(\tau_j, \text{task}_j) = 0 \ \land \ \text{HardViolation}(\tau_j) = \text{False} \ \land \ R_{\text{disclosure}}(\tau_j) = 1.0 \Big)$$
  - 状态匹配函数 $\Delta_{\text{DB}}$：
    $$\Delta_{\text{DB}} = \begin{cases} 
    0 & \text{if } \text{compare\_spec} = \emptyset \land \text{strip}(S_{\text{final}}) = \text{strip}(S_{\text{init}}) \\
    0 & \text{if } \text{compare\_spec} \neq \emptyset \land \text{compare\_subset}(S_{\text{final}}, S_{\text{golden}}, \text{spec}) = \emptyset \\
    1 & \text{otherwise}
    \end{cases}$$
- **总严格成功率**：
  $$\text{StrictSuccessRate} = \frac{\sum_{j=1}^M \text{StrictSuccess}(\tau_j, \text{task}_j)}{M}$$
  - **样本粒度**：完整交互对话 Trajectory $\tau_j$。
  - **分母**：评测的完整 Task 总数 $M$。
- **硬违规率（Hard Violation Rate）**：
  $$\text{HardViolationRate} = \frac{\sum_{j=1}^M \mathbb{I}(\text{Term}(\tau_j) = \text{"hard\_violation"} \lor \text{HardViolation}(\tau_j) = \text{True})}{M}$$

#### 4. 强化学习可学性诊断指标 pass@k（GRPO Readiness）
- **独立近似公式**：
  $$\text{pass@}k = 1 - (1 - p)^k, \quad \text{where } p = \text{pass@1}$$
- **经验无偏估计公式（Empirical Unbiased Estimator）**：
  $$\text{pass@}k = \mathbb{E}_{\text{tasks}} \left[ 1 - \frac{\binom{n - c}{k}}{\binom{n}{k}} \right]$$
  - 其中对每个 Task 采样 $n$ 条轨迹（$n \ge k$），其中成功 $c$ 条。
- **何时使用**：Phase 5 预评估，在烧 GPU 训练 GRPO 前判断任务是否具备组内对比信号（$p=0.16, k=8 \implies \text{pass@8} \approx 0.752$）。

#### 5. Phase 5 Release Gate G2 分类校验指标（Precision / Recall / F1）
- **公式**：
  $$\text{Precision}(h) = \frac{TP_h}{TP_h + FP_h}, \quad \text{Recall}(h) = \frac{TP_h}{TP_h + FN_h}, \quad F_1(h) = \frac{2 \cdot \text{Precision}(h) \cdot \text{Recall}(h)}{\text{Precision}(h) + \text{Recall}(h)}$$
  - **样本粒度**：Stream ③ 标定的单条 Premise 句子。
  - **分母**：该假设下预测为正例的总数 $TP+FP$ 与真实为正例的总数 $TP+FN$。
  - **何时使用**：G2 门禁（13 个概念 P/R 全部 $\ge 0.90$）。

#### 6. Phase 4 Simulator 扩展指标
- **指令遵循率**：$\text{InstructionFollowingRate} = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\text{Simulator遵循人物设定与释放策略})$（门槛 $\ge 95\%$）；
- **RPCR 隐私无泄露率**：$\text{RPCR\_LeakFreeRate} = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\text{未发生未授权信息早泄})$（门槛 $\ge 90\%$）。

---

### 1.4 Q4: Token 序列渲染不一致（Token Skew）与 68.75% 崩溃根因

#### 面试口述版（1 分钟）
> “在 Phase 6 准备上线 vLLM 和 ART 强化学习时，我们做了一次极其关键的 `token_diff` 校验，发现了一个致命的**训推渲染不一致（Train-Infer Render Skew）**：
> 训练时 LLaMA-Factory 使用 Python 模板 `template: qwen` 拼装 Token；而推理时 vLLM 默认读取基座自带的 `chat_template.jinja`。
> 我们最初为了‘关掉 Qwen3 的思考标签’，在推理端传了 `enable_thinking=False`。结果直推 Baseline 的 **Hard Violation（硬违规率）从 0% 暴增到 68.75%，严格成功率腰斩**！
> 经深入排查发现：`enable_thinking=False` 在该 Jinja 里的实现竟然是在 Assistant 开头硬编码插入 `<think>\n\n</think>\n\n` 这一串 Token。而模型在 SFT 训练的全部 720 步中，在看到 `<|im_start|>assistant\n` 后 100% 紧接着生成 `<analysis>`，**从未见过前缀被强行插入 `<think>`**。
> 这种前缀控制 Token 错位破坏了模型自回归的上下文分布，导致后续 XML Envelope 全部解析失败，触发致命 Hard Violation。
> 这**绝对不是模型泛化能力差或过拟合，而是纯粹的 Token 级前缀引导分布偏移（Prefix Distribution Shift）**。我们手写等价 Jinja 修复并用 `token_diff` 做到 8/8 样本 100% IDENTICAL 逐 Token 对齐后，违规率立即归零。”

#### 详细技术版

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      Token Skew 与 68.75% Hard Violation 根因剖析                 │
│                                                                                  │
│  [训练侧真实 Token 序列 (LLaMA-Factory template: qwen)]                          │
│  ...<|im_start|>assistant\n<analysis>用户要办理租房...                           │
│     ↑ 模型学到: 在 assistant\n 之后，必须以 ~100% 概率预测 <analysis>             │
│                                                                                  │
│  [错误的推理端渲染 (传入 enable_thinking=False)]                                  │
│  ...<|im_start|>assistant\n<think>\n\n</think>\n\n[模型陷入 OOD 状态，格式崩溃]   │
│     ↑ 强行插入了训练中从未见过的 4 个 Token (151667, 271, 151668, 271)            │
│                                                                                  │
│  [后果]: 破坏了 Loss Masking 的前缀对齐 -> 模型输出乱码/丢失 <analysis>          │
│          -> L0 Parser 抛出 ParseError -> Hard Violation 从 0% 飙升至 68.75%!      │
│                                                                                  │
│  [手写等价 Jinja 修复]:                                                          │
│  1. 补齐 default_system: "You are Qwen, created by Alibaba Cloud..."             │
│  2. 彻底剔除 last_query_index / loop.last 下的全部 <think> 注入逻辑              │
│  3. token_diff_train_vs_infer.py 验收: 8/8 行 100% IDENTICAL!                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. **Hard Violation（硬违规）的精确工程定义**：
   - 区别于 Soft Penalty（如调错顺序、多问了一轮扣减效率分），Hard Violation 属于**不可挽回的致命违规**：
     1. XML Envelope 结构破损（无 `<analysis>`、无 `<action>`、游离文本、`<args>` 非合法 JSON）；
     2. 工具调用非法（未注册工具名 `UNKNOWN_TOOL`、在非 Call_API 动作中塞入参数）；
     3. 终态违规（终态动作 `Finish/Escalate` 后继续输出轮次）；
     4. 状态破坏（在不可写任务中擅自修改沙箱 DB，触发 `no_write_equality_violation`）。
   - 在 Reward 体系中，Hard Violation 触发即时熔断，整条轨迹直接判 0 分（$R_{\text{total}} = 0$），销毁全部过程引导梯度。

2. **为什么“语义类似的 Prompt”会引发 68.75% 行为崩溃？**：
   - **双 Renderer 机制分叉**（Experiment Note 011 §2）：
     - 训练侧：LLaMA-Factory 内部 `template.py` 中的 Python 代码 `encode_multiturn` 直接拼接 Token；
     - 推理侧：vLLM / HuggingFace 调用模型目录下的 `chat_template.jinja`。
   - **精确分叉点（Experiment Note 012 §2）**：
     - **分叉 A（`default_system` 缺失）**：训练时 `template: qwen` 自动注入 `"You are Qwen, created by Alibaba Cloud. You are a helpful assistant."`；推理时基座 Jinja 遇到无 system 样本直接拼 `# Tools`，丢了默认 System Prompt。
     - **分叉 B（末轮空 `<think>` 注入）**：基座 Jinja 在 `loop.last` 处强行插入 `<think>\n\n</think>\n\n`。
   - **`enable_thinking=False` 带来的灾难性放大**：
     当工程人员试图在推理端通过 `enable_thinking=False` 关闭思考标签时，基座 Jinja 并不是移除标签，而是在末尾硬编码输出了 Token 序列 `[151667, 271, 151668, 271]`（即 `<think>\n\n</think>\n\n`）。

3. **Loss Masking 与 Assistant Prefix 强对齐破坏原理解析**：
   - 在 SFT 微调时，框架对 User Prompt 执行 **Loss Masking（损失掩码）**，仅对 `<|im_start|>assistant\n` 之后的 Token 计算 Cross-Entropy 损失；
   - 经过 720 个 Step 的训练，模型在参数空间建立了极强的条件概率先验：
     $$P(\text{Token}_1 = \text{"<analysis>"} \mid \text{Prefix} = \text{"...<|im\_start|>assistant\textbackslash n"}) \approx 1.0$$
   - 当推理端在 Prefix 强制预填了 `<think>\n\n</think>\n\n` 时，模型接收到的 KV Cache 彻底脱离了训练分布（OOD）。自回归机制在未知的前缀引导下产生错乱，输出丢失了 `<analysis>` 标签或产生非法字符，被 `parse_analysis_action` 判定为 `ParseError`，直接落入 Hard Violation 惩罚桶。
   - **实证指标跳变**：
     - 未传 `enable_thinking` 时：Hard Violation 约为 $0.0\%$，Strict Success 为 $0.47$；
     - 传入 `enable_thinking=False` 后：**Hard Violation 飙升至 $68.75\%$，Strict Success 骤降至 $0.219$**！

4. **这是过拟合吗？测试是否表明语义理解能力退化？**：
   - **严谨结论：这绝非模型语义能力的“过拟合”或“能力退化”，而是纯粹的“控制 Token 前缀错位导致的格式诱导失败（Control Token Prefix Mismatch）”**。
   - **论证与实证依据**：
     1. 模型的业务逻辑推理、政策规则匹配和沙箱工具调用参数能力丝毫未损；
     2. 一旦我们在 `chat_template.qwen_lf_equivalent.jinja` 中移除了 `<think>` 注入逻辑并补齐了 `default_system`，通过 `token_diff_train_vs_infer.py` 实现 8/8 样本 **100% IDENTICAL 逐 Token 对齐** 后，直推 Baseline 和 Candidate 的 Hard Violation **立即重新归零（0.0%）**，严格成功率完全恢复。

---

## 2. 公式卡片

### 卡片 1: L1 格式合规率 (Format Compliance Rate)
- **公式**：
  $$\text{FormatComplianceRate} = \frac{1}{N_{\text{turns}}} \sum_{i=1}^{N_{\text{turns}}} \mathbb{I}\Big(\text{parse\_analysis\_action}(y_i) \text{ succeeds}\Big)$$
- **符号说明**：$y_i$ 为第 $i$ 个由 Agent 生成的原始文本；$\text{parse\_analysis\_action}$ 为 `agentic_gov.verifier.format` 的单点解析器。
- **计算粒度与分母**：单轮 Assistant Turn，分母为全量 Assistant 动作样本总数 $N_{\text{turns}}$。
- **项目位置**：`phase3/eval/l1_format_eval.py::evaluate_l1_format`。

---

### 卡片 2: L2 工具参数字段级 F1 (Tool Args Field F1)
- **公式**：
  $$\text{FieldF1} = \frac{1}{|\mathcal{S}_{\text{api}}|} \sum_{i \in \mathcal{S}_{\text{api}}} \frac{2 \cdot P_i \cdot R_i}{P_i + R_i}, \quad P_i = \frac{|\hat{K}_i \cap K_i^*|}{|\hat{K}_i|}, \ R_i = \frac{|\hat{K}_i \cap K_i^*|}{|K_i^*|}$$
- **符号说明**：$\mathcal{S}_{\text{api}}$ 为金标为 `Call_API` 的样本集合；$K_i^*$ 与 $\hat{K}_i$ 分别为金标与模型生成的工具参数 JSON Key 集合。若两集合均为空则单项得分为 1.0。
- **计算粒度与分母**：单步工具调用样本，分母为金标包含 `Call_API` 的总样本量 $|\mathcal{S}_{\text{api}}|$。
- **项目位置**：`phase3/eval/l2_static_eval.py::_field_f1`。

---

### 卡片 3: L3 脚本重放 / 自由 Rollout 严格成功率 (Strict Success Rate)
- **公式**：
  $$\text{StrictSuccessRate} = \frac{1}{M} \sum_{j=1}^M \mathbb{I}\Big( \text{Term}(\tau_j) = \text{ExpTerm}_j \land \Delta_{\text{DB}}(\tau_j, \text{task}_j) = 0 \land \neg \text{HardViol}(\tau_j) \land R_{\text{disc}}(\tau_j) = 1.0 \Big)$$
- **符号说明**：$\text{Term}(\tau_j)$ 为轨迹终止原因；$\text{ExpTerm}_j$ 为期望终局动作（`Finish/Escalate/FinishWithRefusal`）；$\Delta_{\text{DB}}$ 为基于 `compare_spec` 的沙箱最终状态与黄金状态字段级差异；$R_{\text{disc}}$ 为合规披露得分。
- **计算粒度与分母**：完整交互对话 Trajectory，分母为评测任务总数 $M$。
- **项目位置**：`phase3/eval/l3_scripted_rollout_eval.py::_strict_success`。

---

### 卡片 4: 强化学习可学性 pass@k (Empirical Pass@k)
- **公式**：
  $$\text{pass@}k = \mathbb{E}_{\text{tasks}} \left[ 1 - \frac{\binom{n - c}{k}}{\binom{n}{k}} \right] \approx 1 - (1 - p)^k$$
- **符号说明**：$n$ 为每个任务采样的 Rollout 轨迹总数；$c$ 为成功的轨迹数；$k$ 为评估的组大小（如 $k=8$）；$p$ 为单次采样成功率（pass@1）。
- **计算粒度与分母**：Task 级，衡量以组大小 $k$ 进行采样时组内产出至少 1 条成功正例的概率。
- **项目位置**：`docs/experiment-notes/007-sft-coldstart-vs-grpo-readiness-passk-analysis.md`。

---

### 卡片 5: GRPO 组内优势函数 (Advantage) 与策略梯度
- **公式**：
  $$A_i = \frac{R_i - \bar{R}}{\sigma_R + \epsilon}, \quad \bar{R} = \frac{1}{K} \sum_{i=1}^K R_i, \quad \sigma_R = \sqrt{\frac{1}{K} \sum_{i=1}^K (R_i - \bar{R})^2}$$
  $$\nabla_\theta \mathcal{L}_{\text{GRPO}} \propto - \sum_{i=1}^K A_i \cdot \nabla_\theta \log \pi_\theta(\tau_i)$$
- **符号说明**：$K$ 为同一 Prompt 采样的 Rollout 组大小；$R_i$ 为第 $i$ 条轨迹的总标量奖励；$A_i$ 为相对组内均值的优势值。
- **工程解释**：GRPO 无 Critic 网络，全部学习信号来自组内方差 $\sigma_R$。若组内全对或全错（$\sigma_R \to 0$），则 $A_i = 0$ 梯度消失。低 pass@1 + 高 pass@k 能够提供最大化的有效梯度。
- **项目位置**：`phase6/art/train_grpo.py`。

---

### 卡片 6: Phase 5 G2 判定器 Precision / Recall / F1
- **公式**：
  $$\text{Precision}_h = \frac{TP_h}{TP_h + FP_h}, \quad \text{Recall}_h = \frac{TP_h}{TP_h + FN_h}, \quad F_{1, h} = \frac{2 \cdot \text{Precision}_h \cdot \text{Recall}_h}{\text{Precision}_h + \text{Recall}_h}$$
- **符号说明**：$h \in \{\text{P-01}\dots\text{P-09}, \text{N1-01}\dots\text{N1-04}\}$ 为 13 个强制合规披露或安全红线假设；$TP/FP/FN/TN$ 基于 Stream ③ 标注真值与 Hybrid 判定器输出比对。
- **计算粒度与分母**：单条校准 Premise，分母分别为预测正例数与实际正例数。
- **项目位置**：`phase5/eval/phase5_release_gate.py::_metrics_for_rows`。

---

## 3. 事实与出处

### 3.1 代码路径与核心类/函数对照表

| 概念 / 模块 | 真实代码路径 | 核心函数 / 类 / 变量 |
|---|---|---|
| **L3 Tagger 纯规则实现** | `src/agentic_gov/l3_tagger/rules_v1.py` | `tag_trajectory_rules_v1()`, `tag_info_release_pattern()`, `tag_topic_drift()`, `tag_emotional_arc()` |
| **L3 Tagger 模型实现** | `src/agentic_gov/l3_tagger/model_v1.py` | `encode_texts_batch()`, `score_emotion_batch()` |
| **L3 Tagger 标签对齐** | `src/agentic_gov/l3_tagger/alignment.py` | `align_topic_drift()`, `align_emotional_arc()` |
| **L0-L5 Verifier 漏斗** | `src/agentic_gov/verifier/funnel.py` | `run_verifier_funnel()`, `_compute_l0()` ~ `_compute_l5()`, `_build_l6_frame()` |
| **家族 ID 派生** | `phase3/data/build_manifest.py` | `derive_family_id()`, `build_manifest_row()` |
| **家族切分与不变量** | `phase3/data/split_family.py` | `split_family_level()`, `assign_splits()`, `assert_family_split_invariant()` |
| **L1 格式评估** | `phase3/eval/l1_format_eval.py` | `evaluate_l1_format()` |
| **L2 静态下一动作评估** | `phase3/eval/l2_static_eval.py` | `evaluate_next_action_generation()`, `_field_f1()`, `_pair_metrics()` |
| **L3 脚本重放评估** | `phase3/eval/l3_scripted_rollout_eval.py` | `run_l3_eval()`, `_strict_success()`, `_summarize()` |
| **Phase 3 Exit Gate** | `phase3/eval/phase3_exit_gate.py` | `evaluate_phase3_exit_gate()` |
| **Token-diff 校验器** | `phase3/llamafactory/token_diff_train_vs_infer.py` | `compare_lf_vs_jinja()`, `compare_jinja_variants()` |
| **修正版等价 Jinja** | `phase3/llamafactory/chat_template.qwen_lf_equivalent.jinja` | 手写 Jinja 模板（补齐 default_system，剔除 `<think>`） |
| **Phase 5 Release Gate** | `phase5/eval/phase5_release_gate.py` | `evaluate_g1()`, `evaluate_g2()`, `evaluate_g3_cache_replay()` |

### 3.2 实验报告与核心数值来源

| 关键数值 / 事实 | 数值来源与出处文件 | 说明 |
|---|---|---|
| **L3 脚本评估各任务表现** | `docs/experiment-notes/003-phase3-loan-repayment-weakness-deferred-to-grpo.md` | `account_balance`: 87.1%, `withdrawal_rent`: 85.0%, `withdrawal_purchase`: 41.2%, `loan_repayment`: 16.1% (Hard Violation: 22.6%) |
| **pass@1=0.16 对应的 pass@8=0.752** | `docs/experiment-notes/007-sft-coldstart-vs-grpo-readiness-passk-analysis.md` | $1 - (1 - 0.16)^8 = 0.752$，证明组内方差充沛 |
| **Token Skew 导致的违规率激增** | `docs/experiment-notes/011-llamafactory-train-inference-template-consistency.md` & `012` | 开启 `enable_thinking=False` 导致 Hard Violation 0.0% $\to$ 68.75%，Strict Success 0.47 $\to$ 0.219 |
| **token-diff 8/8 IDENTICAL 验收** | `docs/experiment-notes/012-train-infer-render-skew-tokendiff-jinja-fix.md` | 手写 Jinja 修正后，Agent 与 Simulator 均达成 100% 逐 Token 一致 |
| **Phase 5 G2 Precision 修复数据** | `docs/experiment-notes/009-phase5-release-gate-g2-diagnosis-and-fix.md` | P-02: 0.821 $\to$ 0.978; P-07: 0.887 $\to$ 0.980; P-08: 0.794 $\to$ 1.000 |

---

## 4. 建议插入 recap 的补丁

### 补丁 1: 针对 Ch4.2 & Ch4.4（L3 Tagger 画像系统与全链路作用）

```markdown
### 4.2 L3 Tagger 行为特征画像与全链路作用机制

在数据治理体系中，`src/agentic_gov/l3_tagger` 承担了全链路行为画像提取的职责。需要特别澄清：**L3 Tagger 独立于 Verifier Funnel 中的 `L3_entity`（实体一致性硬校验），它是贯穿生成、过滤、抽样与强化学习的特征提取系统**。

系统支持 `rules_v1`（零显存纯规则，保障 CI 确定性）与 `model_v1`（MiniLM 语义相似度 + mDeBERTa 情绪 NLI）双后端，输出 6 维离散标签：
1. **`turn_count_bucket`**：`short` ($\le 5$ 轮), `medium` (6-10 轮), `long` (11-20 轮), `overlong` ($> 20$ 轮)；
2. **`info_release_pattern`**：`trigger_only`, `all_at_once`, `chunked_2_3`, `piecemeal_4+`；
3. **`topic_drift`**：`on_topic`, `vent`（情绪吐槽）, `chitchat`, `mid_clarify`（中途插入其他疑问）；
4. **`correction_pattern`**：`none`, `self_correction`, `agent_correction_accepted`, `agent_correction_refused`；
5. **`emotional_arc`**：`stable`, `de_escalation`（安抚平复）, `escalating_frustration`, `rising_anxiety`；
6. **`utterance_length_profile`**：`terse_avg` ($<15$ 字), `normal_avg` (15-60 字), `verbose_avg` ($>60$ 字)。

**L3 Tagger 的三大下游影响**：
- **漏斗审计抽样（L6 Audit Frame）**：`verifier/funnel.py` 的 `_build_l6_frame` 聚合 `RARE_L3_KEYS`（如 `piecemeal_4+`、`self_correction`），保证长尾稀有交互在质检抽样中被刚性保留；
- **分层采样多流分发（Stratified Sampling）**：在生成 Stream ①（Agent）与 Stream ②（Simulator）时固化画像标签，支撑下游针对性评测；
- **强化学习难度分级（RL Curriculum）**：在 Phase 6 中，依据交互复杂度实现从单轮直办到多轮纠偏长程交互的渐进式探索。
```

---

### 补丁 2: 针对 Ch5.1（家族级切分实例与防泄漏深度解析）

```markdown
#### 2. 家族级切分不变量（Family-Level Split Invariant）与防泄漏案例

在评测任务型智能体时，按行随机切分（Row-level split）会导致**数据事实记忆泄漏（Factual Memorization Leakage）与边界作弊（Shortcut Leakage）**。在 `split_family.py` 中，我们以不可分割的 `family_id` 为单位执行原子切分（92% train / 5% val / 3% eval_holdout）。

以下为两个必须严格同 Split 的真实业务案例：

- **案例 1：边界对比对与对抗派生（Contrast & Adversarial Derivation）**
  - **背景**：购房提取上限边界 `BD-N2`（限额 50 万元）。
  - **派生任务**：
    - Task A（准予提取）：张先生（身份证 `1101051988...`，账户余额 60 万，合同价 100 万），申请提取 47.5 万元，预期调用 `submit_purchase_withdrawal` 办结；
    - Task B（超限驳回）：同一张先生、同一套合同与账户底表，申请提取 52.5 万元（超限 5%），预期不调用写操作，直接 `FinishWithRefusal` 驳回；
    - Task C（对抗任务）：同一张先生诱导“免除身份证核验直接办”。
  - **泄漏风险**：若 Task A 进训练集、Task B 进测试集，模型在测试时只需复现训练时记住的张先生身份与合同先验，无需真正进行 $52.5\text{万} > 50\text{万}$ 的离散边界比较，造成边界泛化能力的虚假繁荣。

- **案例 2：跨业务类型但共享底层背景事实（Cross-Task Shared Identity Truth）**
  - **背景**：李女士（身份证 `3101041992...`，账户余额 8.5 万元，公积金贷款 `LN-8801` 剩余本金 20 万元）。
  - **派生任务**：
    - Task 1（纯查询任务）：`account_balance_query`，李女士查询公积金余额并打印明细；
    - Task 2（复杂还款写任务）：`loan_repayment_query`，李女士办理贷款提前还款 5 万元（需经历核身、试算、提交扣款）。
  - **泄漏风险**：两任务表面结构截然不同，但若 Task 1 进训练、Task 2 进测试，模型在微调中已经对李女士的证件号和账户背景产生了权重先验，测试 Task 2 时可能凭借记忆直接盲猜参数，掩盖了模型面对全新未见用户时调用工具查询沙箱的真实能力。

`derive_family_id` 通过对 `(task_type, persona_subgroup, policy_id, id_number)` 与对偶 `pair_id` 进行确定性哈希，并在 `assert_family_split_invariant` 中执行硬断言，彻底杜绝了跨 Split 事实泄漏。
```

---

### 补丁 3: 针对 Ch5.2（SFT 评估指标体系与严格合取公式补全）

```markdown
### 5.2 离线评测网格与指标体系

Phase 3 建立了覆盖格式（L1）、单步决策（L2）与端到端状态机重放（L3）的三层离线评测网格：

1. **L1 格式合规率（Format Compliance Rate）**：
   $$\text{FormatComplianceRate} = \frac{1}{N_{\text{turns}}} \sum_{i=1}^{N_{\text{turns}}} \mathbb{I}\Big(\text{parse\_analysis\_action}(y_i) \text{ succeeds}\Big)$$
   以单轮 Assistant 生成为粒度，检验 Envelope XML 与 JSON 语法（实测 **99.4%**，门槛 $\ge 98.0\%$）。

2. **L2 静态下一动作与参数指标**：
   - **动作类型准确率**：$\text{ActionTypeAcc} = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(\hat{a}_i^{\text{type}} = a_i^{*\text{type}})$（实测 **94.2%**）；
   - **工具参数完全匹配率与字段 F1**（仅在 Gold 为 `Call_API` 的子集 $\mathcal{S}_{\text{api}}$ 上计算）：
     $$\text{ToolArgsEM} = \frac{1}{|\mathcal{S}_{\text{api}}|} \sum_{i \in \mathcal{S}_{\text{api}}} \mathbb{I}(\hat{\theta}_i = \theta_i^*), \quad \text{FieldF1} = \frac{1}{|\mathcal{S}_{\text{api}}|} \sum_{i \in \mathcal{S}_{\text{api}}} \frac{2 P_i R_i}{P_i + R_i}$$
     实测 Tool Args EM 为 **91.5%**。

3. **L3 脚本重放严格成功率（Strict Success Rate）**：
   $$\text{StrictSuccessRate} = \frac{1}{M} \sum_{j=1}^M \mathbb{I}\Big( \text{Term}(\tau_j) = \text{ExpTerm}_j \land \Delta_{\text{DB}}(\tau_j, \text{task}_j) = 0 \land \neg \text{HardViol}(\tau_j) \land R_{\text{disc}}(\tau_j) = 1.0 \Big)$$
   以完整 Trajectory 为粒度（分母为任务数 $M$），要求终态匹配、沙箱状态逐字段匹配、合规告知无遗漏且全程零硬违规。实测 **62.2%**（门槛 $\ge 60.0\%$），硬违规率为 **4.5%**（门槛 $\le 5.0\%$）。
```

---

### 补丁 4: 针对 Ch5.3（Token Skew 根因、Control Token 错位与非退化实证剖析）

```markdown
### 5.3 决策插叙②：训练-推理模板 Token-diff 渲染偏差与 68.75% 崩溃剖析

在 Phase 6 对接 vLLM 与 ART 强化学习时，我们通过 `token_diff_train_vs_infer.py` 工具排查了一次严重的 **训推渲染分歧（Train-Infer Skew）**：

- **双 Renderer 机制分叉**：训练侧使用 LLaMA-Factory Python 模板 `template: qwen` 编码，推理侧使用基座自带的 `chat_template.jinja`。比对显示，8/8 行多轮带工具样本在 `index 3` 立即发生分叉。
- **差异根因**：
  1. **差异 A**：训练侧自动注入 `default_system`，推理侧 Jinja 丢失；
  2. **差异 B**：推理侧 Jinja 在 `loop.last` 处强制为最后一个 assistant 轮次包裹 `<think>\n\n</think>\n\n`。
- **`enable_thinking=False` 的灾难性误区**：
  在试图通过参数关闭思考时，基座 Jinja 实际在 Assistant 开头硬编码插入了 Token 序列 `[151667, 271, 151668, 271]`（即 `<think>\n\n</think>\n\n`）。
  由于微调阶段模型学到在 `<|im_start|>assistant\n` 后以近 100% 概率预测 `<analysis>`，且从未见过 `<think>` 标签，前缀控制 Token 错位使模型自回归陷入未知状态空间，**Hard Violation 违规率从 0.0% 暴增至 68.75%，Strict Success 从 0.47 骤降至 0.219！**
- **非语义退化实证**：
  这**不是模型语义理解能力退化或过拟合，而是纯粹的前缀控制 Token 分布偏移**。我们手写等价 Jinja（`chat_template.qwen_lf_equivalent.jinja`）覆盖后，`token_diff` 达到 **100% IDENTICAL（逐 Token 对齐）**，Hard Violation 立即重新归零，业务能力完全恢复。
```

---

## 5. 建议的伪代码补丁

### 伪代码 1: `agentic_gov.verifier.funnel._build_l6_frame` 稀有标签审计抽样

```python
def _build_l6_frame(records: list[dict[str, Any]], candidates: list[dict[str, str]]) -> dict[str, Any]:
    """构建用于 L6 离线审计的抽样分层帧，包含 RARE_L3_KEYS 稀有标签统计"""
    strata: dict[str, Counter[str]] = {
        "concept_primary": Counter(),
        "task_type": Counter(),
        "adversarial_flag": Counter(),
        "rare_l3_tags": Counter(),
        "vulnerable_persona": Counter(),
        "boundary_pair": Counter(),
    }
    for rec in records:
        task = rec["task"]
        md = task.get("metadata", {})
        strata["concept_primary"][md.get("concept_primary")] += 1
        strata["task_type"][task.get("task_type")] += 1
        strata["adversarial_flag"][md.get("adversarial_flag") or "none"] += 1
        
        # 统计弱势人群画像
        if md.get("persona_subgroup") == "vulnerable":
            strata["vulnerable_persona"]["vulnerable"] += 1
        else:
            strata["vulnerable_persona"]["other"] += 1
            
        # 统计 L3 Tagger 标记的稀有长尾行为
        tags = md.get("l3_tags") or {}
        for key, value in RARE_L3_KEYS:
            if tags.get(key) == value:
                strata["rare_l3_tags"][f"{key}={value}"] += 1
                
    return {
        "candidate_pipeline_ids": candidates,
        "strata_counts": {k: dict(v) for k, v in strata.items()},
    }
```

---

### 伪代码 2: `phase3.data.build_manifest.derive_family_id` 家族原子派生

```python
def derive_family_id(
    *,
    metadata: Mapping[str, Any],
    task_type: str,
    policy_id: str,
    hidden_truth: Mapping[str, Any] | None = None,
) -> str:
    """生成稳定的不可分割家族 ID，确保对偶样本与同事实样本共享相同的 family_id"""
    # 1. 显式指定的 family_id 优先
    fam = metadata.get("family_id")
    if isinstance(fam, str) and fam:
        return fam

    # 2. 对比对 (Contrast Pairs) 与口语化改写对 (Naturalized Pairs) 统一归纳为对偶锚点
    pair_id = metadata.get("pair_id")
    naturalization_of = metadata.get("naturalization_of")
    if isinstance(naturalization_of, str) and naturalization_of:
        pair_key = naturalization_of
    elif isinstance(pair_id, str) and pair_id:
        pair_key = pair_id[:-len("__nat")] if pair_id.endswith("__nat") else pair_id
    else:
        pair_key = ""
        
    if pair_key:
        digest = hashlib.sha1(f"pair_id={pair_key}".encode("utf-8")).hexdigest()
        return f"fam_{digest[:16]}"

    # 3. 普通样本基于底层物理四元组进行哈希绑定
    persona_subgroup = str(metadata.get("persona_subgroup") or "unknown")
    id_number = ""
    if isinstance(hidden_truth, Mapping):
        user_profile = hidden_truth.get("user_profile")
        if isinstance(user_profile, Mapping):
            id_number = str(user_profile.get("id_number") or "")

    key_parts = (
        f"task_type={task_type}",
        f"persona_subgroup={persona_subgroup}",
        f"policy_id={policy_id}",
        f"id_number={id_number}",
    )
    digest = hashlib.sha1("|".join(key_parts).encode("utf-8")).hexdigest()
    return f"fam_{digest[:16]}"
```

---

### 伪代码 3: `phase3.eval.l3_scripted_rollout_eval._strict_success` 严格成功合取判定

```python
def _strict_success(task: CanonicalTask, result: EpisodeResult) -> tuple[bool, float, list[str]]:
    """L3 严格成功布尔 AND 门判定逻辑"""
    reasons: list[str] = []
    
    # 1. 致命硬违规与发散阻断
    if result.terminated_by == "hard_violation":
        return False, 0.0, ["hard_violation"]
    if result.terminated_by == "divergent":
        return False, 0.0, ["divergent"]
    if result.terminated_by == "max_turns":
        return False, 0.0, ["max_turns"]
        
    # 2. 终局动作类型匹配
    expected_terminal = task.metadata.expected_terminal_action
    if result.terminated_by != expected_terminal:
        reasons.append("terminal_action_mismatch")
        return False, 0.0, reasons

    # 3. 沙箱数据库状态机字段级比对
    subset = task.compare_spec[expected_terminal]
    actual_state = _jsonable(result.actual_final_state)
    initial_state = _jsonable(task.db_init_state)
    
    # 无写操作任务必须保证数据库绝对零污染
    if not subset:
        is_clean = _strip_runtime_policy_table(actual_state) == _strip_runtime_policy_table(initial_state)
        if not is_clean:
            reasons.append("no_write_equality_violation")
        return is_clean, 1.0 if is_clean else 0.0, reasons

    # 需写操作任务必须与 Golden Final State 逐字段一致
    if task.golden_final_state is None:
        return False, 0.0, ["missing_golden_final_state"]
    mismatches = _compare_final_state_subset(actual_state, _jsonable(task.golden_final_state), subset)
    if mismatches:
        reasons.append("state_mismatch")
        return False, 0.0, reasons

    # 4. 全部合规通过
    return True, 1.0, reasons
```

---

## 6. 仍需谨慎的说法

1. **混淆 L3 Tagger 与 Verifier 中的 L3_entity**：
   - ⚠️ *错误说法*：“L3 Tagger 是过滤漏斗中的第 4 层，用来剔除坏数据。”
   - ✅ *准确说法*：“过滤漏斗中的第 4 层是 `L3_entity`（用于实体一致性校验）。L3 Tagger 是独立的特征画像系统，输出 6 维离散标签，主要用于 L6 审计抽样帧聚合、分层采样与强化学习难度分级。”

2. **将 pass@1=0.16 误判为“SFT 失败、必须补数据”**：
   - ⚠️ *错误说法*：“贷款还款 SFT 成功率只有 16%，必须回退 Phase 2 补几百条数据把 SFT 刷到 80% 才能开 RL。”
   - ✅ *准确说法*：“GRPO 的梯度来源于组内对比方差，而非绝对通过率。pass@1=0.16 在 $k=8$ 时对应的组内至少一次成功概率 $\text{pass@8} \approx 0.752$，正是 GRPO 组内方差最充沛的黄金工况。在 SFT 阶段强行刷到 pass@1=0.95 反而会导致组内方差塌缩为 0，失去学习信号。”

3. **将 68.75% 的崩溃归咎于“模型过拟合或推理能力退化”**：
   - ⚠️ *错误说法*：“直推测试 Hard Violation 飙到 68.75%，说明模型微调过拟合了，泛化能力很差。”
   - ✅ *准确说法*：“这是前缀控制 Token（`<think>`）在 Jinja 渲染端被硬编码插入导致的 Prefix Distribution Shift。模型在微调中从未见过该前缀，破坏了自回归生成分布。手写等价 Jinja 消除 Token 分叉后，违规率立即归零，证明模型底层语义与工具调用能力完好。”

4. **误以为“使用相同 Template 名字即代表训推一致”**：
   - ⚠️ *错误说法*：“训练和推理都配置了 `template: qwen`，所以渲染肯定是一致的。”
   - ✅ *准确说法*：“LLaMA-Factory 训练使用 Python 模板解析，推理使用模型自带的 Jinja 脚本。`qwen` 模板默认配置 `replace_jinja_template=False`，导出时根本不会改写 Jinja。必须通过 `token_diff` 工具对渲染后的 Token ID 序列进行逐位比对验收。”

5. **把 Simulator 的提示词设计差异当成渲染 Bug**：
   - ⚠️ *错误说法*：“Simulator 推理用的中文标题模板和训练用的 JSON 不一致，这是一个必须修复的渲染 Bug。”
   - ✅ *准确说法*：“Simulator 作为强化学习的‘环境’，追求的是稳定的拟真行为。其中文标题提示词是有意为之的设计选择，且已在 Phase 5 Gate 中全绿验收；需要严格一致的是 Jinja 格式包装（如去除末轮 `<think>`），而非 System Prompt 文本本身。”
