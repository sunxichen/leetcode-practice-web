## 总体判断

这份草案的专业度很高，绝大多数锚点都来自真实实验和代码，不是泛泛的 RL 八股；尤其 reward 演化、judge 事故、无效任务、训练稳定性和 serving 性能几条线，很有项目辨识度。主要问题不是“深度不够”，而是**过度贴合仓库考古细节**：历史 sampler 配比、局部阈值和若干算法名词占比偏高，反而漏了面试官最可能追问的三条主线——**如何证明提升来自 RL、什么样的任务才构成有效 RL 测量面、当前长程训练如何防止终局动作偏科**。52 题作为第二阶段主问题集偏多，加上自述 34 题后已经达到 86 题，候选人很容易背成碎片。我的建议是定稿为 **42 题左右：12 must、22 common、8 bonus**，并把“历史方案”与“当前有效方案”明确分开。

---

# 一、覆盖度

## 1. 漏掉了最重要的“效果归因与评测设计”主线

- **涉及：G5-10，但覆盖不足；建议新增 must。**
- 目前只有 G5-10 讲 family clustering，却没有一题完整回答：
  - 为什么比较单位应是同一 task 上的 checkpoint 间 paired delta；
  - 为什么 arm A/B 必须冻结 simulator、judge、reward、采样温度和任务；
  - 一次预指定 holdout look 防什么；
  - A/B 能证明“训练后 policy 优于起点”，为什么不能单独证明“GRPO 特异性优于 filtered-SFT”；
  - optional arm C 在因果识别中起什么作用。
- 这是 RL 面试官看到“held-out +9.21pp”后几乎必问的内容，也是当前项目最有研究含量的一条线。不能只放在自述 E4；深问阶段必须有机制版。

**建议新增问题：**

> 你如何证明提升来自 policy update，而不是任务重切、judge 漂移、随机采样或终局动作先验重排？为什么主分析用 task-level paired delta + family-clustered bootstrap，arm C 又补了什么因果缺口？

---

## 2. “任务有效性”只作为事故复盘出现，没有上升为通用方法

- **涉及：G4-8、G2-6。**
- G4-8 很好，但当前问法仍是“那两类坏任务是什么”。真正有价值的深问应该进一步抽象为：

  1. 正确标签是否有可观测证据；
  2. 证据是否可由 allowed tools 或用户对话到达；
  3. policy card 是否支持该动作；
  4. golden chain、环境和 terminal label 是否一致；
  5. reward 是否真的能区分正确与错误行为。

- 这五项实际上构成了项目最核心的 **RL measurement validity contract**。它比 L3 tagger、具体配额或某个 sampler 权重重要得多。

**建议把 G4-8 改成 must：**

> 什么样的任务才有资格进入 RL 梯度或评测面？你们后来建立的“可观测性—可达性—政策一致性—终局可区分性”有效性契约是什么？

原来的 frozen×loan 和 impersonation 幽灵作为两个反例放在答案里，而不是继续当题目的全部。

---

## 3. Judge 线缺少“运行时正确”和“语义正确”的区分

- **涉及：G4-7、G6-6。**
- G4-7 已覆盖 NoHitChecker 与 JRA，但还缺一个重要层次：
  - **JRA 只能证明运行的是声明的 judge；**
  - 它不能证明 judge 的语义判定本身正确，也不能防 policy 学会 judge-specific wording。
- 当前项目后续设计里的差分 disclosure audit/R3，本质是在回答：JRA 给分的文本，人类或独立强 judge 是否也认为真正履行了告知义务。
- 这是非常真实的 reward hacking 追问，也是 G6-6 所说“防单点”的关键补充。

**建议将 G4-7 改成：**

> NoHitChecker 事故后，JRA 解决了什么、没解决什么？为什么还需要 blinded differential audit 来防止模型学会“骗过正确运行的 judge”？

---

## 4. 训练采样组过度停留在 6 月的历史 Step-2 sampler，缺少当前 P5/T4 设计

- **涉及：G3-2、G3-3、G3-4、G3-6。**
- G3-3 的 `0.74:0.26`、每四步一个 Escalate canary，是某轮历史 sampler 的合理设计，但不是当前最值得候选人主讲的训练方案。
- 当前更重要的是：
  - 12-cell 平衡表面；
  - 每步 rare-action core、Finish anchors、breadth 的组合；
  - zero-variance rare-action group 的同 cell replacement；
  - collect-until-target 和 gather cap；
  - Finish anchor 即使全对也不强行制造梯度；
  - dev look、R2 tripwire、futility gate 和正式 T5 的职责分离。
- 面试官问“你们最终怎么跑长程 GRPO，如何防偏科”时，候选人若只回答旧 `loan/Finish 0.74` 会显得没有掌握项目当前状态。

**建议新增 must：**

> 你们当前长程 GRPO 为什么采用“rare-action core + Finish anchors + breadth”的分层 schedule？zero-variance 组怎么补位，又怎么防止为制造方差而破坏自然分布？

---

## 5. Policy Card—API Spec—Sandbox—Reward 的职责边界值得单独成题

- **涉及：G1-6、G2-7，但目前没有完整覆盖。**
- 面试官很可能问：“既然规则这么强，哪些规则交给模型，哪些写死在环境里？”
- 应让候选人能清晰讲出：
  - Policy Card：Agent 可见的业务决策知识；
  - `required_slots`：人机对话侧应主动收集什么；
  - API Spec `required_args`：工具执行侧参数契约；
  - Sandbox preconditions：不可绕过的结构性约束；
  - Reward：对合法但质量不同的行为排序；
  - `policy_id/version`：合成期与运行期的硬绑定。
- 这是架构能力题，比 G2-7 单独问 subject-scoped flag 更真实。

**建议新增 common/must：**

> Policy Card、API Spec、Sandbox precondition 和 reward 分别管什么？为什么不能把所有规则都塞进 prompt，或者全部写死成 workflow？

---

## 6. 输出协议与训推一致性值得有一题，L3 tagger/entity preserving 不值得单列

- **涉及：G7-4，但尚未覆盖 `<analysis>/<action>` 和 chat template 决策。**
- 项目里 format collapse 是真实训练失败，因此面试官可能追问：
  - 为什么不用 Qwen3 原生 `<think>`；
  - 为什么冻结私有 `<analysis>/<action>` envelope；
  - train/inference chat-template skew 如何污染格式；
  - parser 为什么 fail-closed；
  - observation/tool role 和 loss mask 如何保持一致。
- 这是 LLM 训练与 Agent runtime 的交叉题，很适合代码方向岗位。
- 相比之下，**entity-preserving、L3 tagger 不建议各自单列**。它们适合作为 G2-6“合成数据质量漏斗”的一个例子，否则太像仓库内部实现问答。

---

# 二、真实感

## 很像真实面试官会问的题

以下问题既能顺着项目自然追问，又能检查候选人是否真的做过：

- **G1-1 / G1-2**：reward 为什么演化、terminal gate 为什么用乘法。
- **G1-5**：NLI 为什么失败、为什么 per-message max、hybrid 如何分层。
- **G1-6**：hard/efficiency/业务拒绝三分类。
- **G2-1**：contrast pair 为什么不能混 GRPO group。
- **G2-2**：simulator 为什么看不到工具返回。
- **G2-6**：全合成数据如何建立可信度。
- **G3-1**：实际是 GRPO-style advantage + CISPO，而不是 vanilla GRPO。
- **G3-2**：全对/全错组怎么办，什么叫 learnability。
- **G3-5**：KL 在这个项目里具体防什么。
- **G3-6**：训练告警、停训和误杀代价。
- **G4-1 / G4-3 / G4-4 / G4-5**：吞吐、LoRA serving、async、稳定性，都是完整的工程诊断故事。
- **G4-7 / G4-8**：测量面事故与任务有效性事故，是项目最有价值的复盘。
- **G5-1 / G5-6 / G5-10**：GRPO baseline、on/off-policy、聚类评估。
- **G6-6**：verifiable reward 与 RM/LLM judge 如何分工。
- **G7-4 / G7-6**：loss mask 和 reward 数据流，代码面很真实。

这些题建议作为主体保留。

---

## 偏碎、偏仓库考古或偏“自嗨”的题

### G2-4

“泄漏为什么只是 telemetry”本身只有一个核心结论：**不能惩罚 agent 无法控制的 simulator 行为**。单独成题太薄，应并入 G2-3。

### G2-7

subject-scoped precondition 是好设计，但“连终态扫描器都不用建”太像代码评审中的局部结论。真实面试更可能问职责边界，应并入 G1-6 或新增的 Policy Card/API Spec/Sandbox 分工题。

### G3-3

精确背 `loan/Finish 0.74 : purchase/Finish 0.26`、每四步一个 canary，历史痕迹太重。保留原则，不要把具体比例当主要考点；否则项目迭代后答案很快陈旧。

### G3-4

“rent 占 48% 为什么不重造数据”属于特定历史数据分布，信息增量低。它可以作为 sampler 题中的一个例子，不值得独立卡。

### G4-6

`2560` 而不是 `4096`、`−0.1087` 等数字很适合复盘笔记，不像高概率面试题。并入 G4-5，候选人只有被追问时再讲。

### G5-2

“PPO → GRPO → DAPO → GSPO → CISPO”像知识谱系背诵，而且它们并不是严格的单线演化关系。真实面试官更可能让候选人比较项目用到的两三个关键差异，而不是要求一分钟讲完五个算法。

### G6-4

“业界 rollout 吞吐四类路线”太像 survey 汇报。可以放 bonus 素材，不建议占正式题位。

### G6-5

灾难性遗忘是合理主题，但当前题的“RL’s Razor + self-distill”过度依赖业界名词，且与 G3-5、G5-7、G6-2 重复。

### G7-3

KL 三种 estimator 对纯算法研究岗是好题，对一般 LLM/Agent/RL 工程岗位概率较低。保留 bonus 即可，不应 common。

### G7-7

rolling median grad guard 很具体，适合稳定性故事的代码追问，而不是独立主问题。

---

## 有“名词先行”风险的题

- **G5-2、G6-1、G6-3、G6-4、G6-5。**
- 这几题容易让回答变成“我看过哪些论文”，而不是“论文里的什么机制改变了我的设计”。
- 特别是 G6-1 中 AReaL-SEA 的精确百分点，如果不能在面试前用 primary source 再核对一次，不建议背数字。回答应以“采用了什么设计原则、为什么适合本项目”为主，论文名和数字只作佐证。

---

# 三、粒度

## 太大，1–2 分钟难以讲清

### G1-4

当前同时问了：

1. 为什么 terminal-only；
2. 为什么不给过程奖励；
3. 为什么不给 CoT 打分；
4. 多轮信用分配怎么解决。

这是四个问题。建议收窄为：

> 为什么 reward 主要在 episode 结束统一结算？这种设计在多轮信用分配上的优势和局限是什么？

R_exec/R_recover/P_redundant 和 CoT reward 作为答案中的 rejected alternatives 即可。

### G2-6

同时包含“合成数据可信度”“六层漏斗”“split 隔离”“near-dup”“OOD gap”。建议答案严格限制为两个层次：

1. 单条样本正确性：schema、sandbox replay、disclosure/entity/leak/judge；
2. 数据集层可信度：family split、near-dup、holdout、synthetic-to-real 限制。

如仍超过两分钟，可以拆成两题，但不要继续扩张总量。

### G3-1

“准确算法口径”和“CISPO vs PPO clip”都很深。建议：

- 主卡：实际优化口径是什么；
- 代码追问：ratio detach 后梯度路径与 PPO 有什么不同。

不要在两处分别出现 G3-1、G7-2 的完整重复。

### G5-2

五个算法无法在两分钟内讲清。建议改成：

> DAPO/GSPO/CISPO 分别修改 GRPO/PPO 训练中的哪个环节？你们为什么没有继续做算法替换？

答案只讲三条轴：采样/过滤、IS 粒度、clip/梯度路径。

### G5-3

同时问 forward/reverse KL、SFT、RLHF KL/CE，过大。建议只保留：

> SFT 的交叉熵与 RL 中的 KL anchor 在优化目标上有什么区别？

forward/reverse KL 几何可作为追问。

### G7-5

把 zero-variance filter 和 pass@k 无偏估计放在同一题，没有内在统一性，应拆散：

- zero-variance filter 并入 G3-2；
- pass@k estimator 并入 G5-5。

---

## 太碎，应合并

- **G2-3 + G2-4**：simulator 偏差为何不阻断、为什么不进 reward。
- **G1-6 + G2-7**：sandbox 错误分类、结构性安全、可恢复错误。
- **G3-2 + G3-3**：learnability、zero variance、targeted sampling、canary。
- **G3-7 + G4-4**：async 的算法 staleness 与工程权重生命周期。
- **G4-5 + G4-6**：format collapse、grad spike、loss normalization、最终验收失败。
- **G4-3 + G5-8**：LoRA 为什么省训练显存，但 serving 为什么可能变慢。
- **G4-2 + G5-9**：continuous batching 为什么让客户端波次批处理变慢。
- **G5-7 + G6-2 + G6-5**：RL、蒸馏、遗忘恢复的职责边界。
- **G3-1 + G7-2**：CISPO 与 PPO 的公式及梯度路径。
- **G7-5 → G3-2/G5-5**：拆掉这张混合卡。

---

# 四、与自述集的重叠

主题相关不一定有问题，但以下题已经接近“同一个问题换种说法”，需要重写深问角度。

## 高度重复，应删或彻底改写

### G2-5 ↔ 自述 F1

两题几乎都是“golden_final_state 为什么不锁轨迹”。建议删除 G2-5；深问素材放进 G1-4 或 G7-6。

### G4-8 ↔ 自述 D3

自述 D3 已经问了两类无效任务、invariant 未接线和退役修复。G4-8 若保持原样就是重复。应改成通用的“RL 任务有效性契约”，具体事故只作例子。

### G4-7 ↔ 自述 C7

C7 已经完整讲了 NoHitChecker、23%→77%、JRA 落地和 R3 预注册。深问应改为“JRA 能证明什么、为什么仍挡不住语义 reward hacking”。

### G2-7 ↔ 自述 F2

都是 subject-scoped precondition、被拦后可恢复、无需终态扫描器。建议并入 G1-6，不保留独立题。

---

## 中度重复，但可以保留机制下钻

### G1-1 ↔ 自述 C4/F6

可以保留，但不要再花一半时间复述公式。深问重点应放在每一版的**反例**：

- v1：ceiling 语义；
- v2：状态对、动作错仍 tie；
- v3：terminal gate。

### G1-6 ↔ 自述 F2

自述讲“怎么防违规”，深问讲“错误分类的判据和为什么允许恢复”，边界尚可。

### G3-1 / G5-1 ↔ 自述 C6

C6 已讲为什么选 GRPO；深问必须集中在准确 loss 口径、group baseline、零方差和实现细节，不要再回答 PPO/DPO 选型。

### G3-5 / G4-5 ↔ 自述 F9

F9 只讲症状与处理，深问可继续讲证据链和根因分解，合理。

### G4-4 ↔ 自述 C6/F9

可以保留，但问题应聚焦 async 的权重生命周期和 in-flight episode，而不是再次说“2× 更慢、44% 丢弃”。

### G5-8 ↔ 自述 E1/G4-3

独立基础题价值有限，建议与 G4-3 合并。

### G6-2 ↔ G5-7

这不是仅与自述重叠，而是深问题集内部重复，应合并。

### G7-6 ↔ 自述 C4

可以保留，因为代码走查与模块概述不同；但不要再次背 reward 公式，要按函数和数据对象走一遍。

---

# 五、priority 标定

## 建议降级

| 题号 | 当前 | 建议 | 原因 |
|---|---:|---:|---|
| G1-3 | must | common | 纯线性 normalization 是好数学追问，但不是高频主线；且题目表述容易与已采用的 v2 ceiling normalization 混淆。 |
| G1-4 | must | common | 重要但问题过大；终局 reward 的主结论已在 C4 出现。 |
| G2-1 | must | common | 对数据/RL 研究岗很重要，但一般面试官未必进入 contrast-pair grouping。 |
| G4-1 | must | common | 系统/infra 岗可升 must，纯 RL/算法岗不是必问。 |
| G5-2 | must | common 或 bonus | 五算法谱系太像 survey 背诵。 |
| G7-1 | must | common | 研究/训练框架岗可 must；一般候选人更可能被要求解释公式而非现场完整手写。 |
| G7-3 | common | bonus | KL estimator 属较偏的算法细节。 |
| G2-7 | common | 并入后不单列 | 独立题太局部。 |
| G3-4 | common | 删除 | 历史分布数字不是长期主线。 |

## 建议升级

| 题号 | 当前 | 建议 | 原因 |
|---|---:|---:|---|
| G1-5 | common | must | hybrid judge 是 reward 中唯一不可完全程序化的核心，且发生过真实测量事故。 |
| G2-6 | common | must | 全合成数据的可信度是几乎必问项；应加入任务有效性门。 |
| G3-6 | common | must，但需改事实 | 长程 RL 如何停损、避免误杀，是当前训练设计核心。 |
| G5-10 | common | must | 项目最强结果依赖 clustered/paired 口径；不懂这一题就无法可靠陈述 +9.21pp。 |
| G4-7 | must | 保持 must，重写 | 从“事故复述”升级为 JRA 与语义审计。 |
| G4-8 | must | 保持 must，重写 | 从“坏任务复述”升级为测量有效性方法论。 |
| 新增效果归因题 | — | must | 当前最大的覆盖缺口。 |
| 新增当前 schedule 题 | — | must | 避免候选人只会讲已经过时的历史 sampler。 |

总体上，**15 个 must 数量本身不离谱，问题是分配错了**：当前把 reward normalization、吞吐和算法谱系放得偏高，而效果归因、任务有效性、judge 语义审计和当前训练 schedule 没占到相应位置。

---

# 六、事实核对

以下是我结合 ADR、实验笔记、当前代码和 P5/T4 handoff 抽查后，建议修正或收窄的地方。

## G1-1：总体正确，但锚点的“当前状态”需换来源

v1→v2→v3 的机制描述基本正确。需要注意：

- v3 ADR 文件头仍保留早期“前瞻、未授权实现”的历史状态；
- 但当前 `src/agentic_gov/reward/aggregate.py`、`terminal.py` 以及 P5 handoff 已表明 v3 已实现并实际绑定使用。
- 制卡时应引用当前代码/P5 handoff 证明“现役”，ADR 用来解释设计理由，否则候选人会遇到文档自相矛盾。

---

## G1-3：题目措辞容易造成事实矛盾

当前题写：

> 为什么把 reward 上限从 0.8 归一到 1.0 被正式否决？

但项目实际上采用过 **v2 quality ceiling = 1.0**。被否决的是：

> 对整个 raw reward 做纯线性除法 normalization，并指望它降低 zero-variance/drop。

建议改成：

> 为什么“把整个 reward 线性除以 0.75/0.8”对 GRPO 基本是空操作，而重新分配正向质量项权重又不是空操作？

这样才能区分被否决的 pure scaling 与实际采用过的 v2 方案 A。

---

## G1-4：信用分配表述过强

当前锚点说信用分配靠：

> 分解式子项 + 组内相对对比 + golden_final_state。

这些东西改善了**目标可诊断性和 baseline 方差**，但没有真正解决多轮 temporal credit assignment。实际仍是：

- episode-level Monte Carlo return；
- 同一 trajectory advantage 广播到被 mask 的 assistant token；
- 很难知道究竟哪一轮、哪个 token 导致最终成败。

建议诚实回答：

> terminal-only 换来了可信、低 hack 风险的 outcome 信号，但牺牲了精细时间信用分配；分解 reward 和组内对比只能缓解诊断与方差问题，不能定位因果动作。

这是更成熟的答案。

---

## G1-7：负 reward 的数学理由不准确

“一个负样本会压低全组 baseline、扭曲 advantage 分布”不是充分理由。对组内标准化 advantage：

- 整组加常数基本不改变 advantage；
- 整组正比例缩放也基本会被标准化抵消；
- 负值本身并不天然有害。

更准确的 hard-zero 理由应是：

1. 语义上把该 episode 定义为无可接受贡献；
2. 保持 safety/format failure 的绝对门控；
3. 让 policy 对格式失败负责，不通过重采隐藏失败；
4. 避免额外设计负分幅度和跨版本可比性问题。

如果主张“负分会造成异常强的相对惩罚”，应明确这是**特定 reward geometry 的选择**，不是 GRPO 的普遍数学定理。

---

## G2-3：低方差偏差“几乎不影响 advantage”需要加条件

只有当 simulator 偏差在：

- 同一 task 的 K 个 rollout 中近似一致；
- 不改变 agent 可采取的后续行为；
- 不与 reward 条件耦合；

才可以近似看作组内共同平移。若 reveal 时机在不同 rollout 中随机变化，或改变 agent 是否继续追问，就会改变 reward 方差和策略梯度。

建议把“一致地错几乎无影响”改为“在现有审计下主要表现为可监测、低频且未进入 reward 的环境偏差，尚未显示为高方差污染”。

---

## G2-6：漏斗层数表述需更精确

仓库完整 verifier 叙述包含 **L0–L6**：

- L0–L5 为自动层；
- L6 是分层人工抽检/审核层。

因此不要简单说“L0–L5 六层漏斗”后又暗示这是完整体系。可以说：

> 六个自动层 L0–L5，加 L6 分层人工审核。

另外，“holdout `n_families == n_tasks`”是当前 P5 holdout 的特殊设计，不应泛化成所有历史合成数据都如此。

---

## G3-1：PPO clip 的梯度描述需带 advantage 方向

“PPO clip 会让被 clip 的 token 梯度清零”方向大体对，但不是所有超界 token 一律清零；是否进入 clipped branch 取决于：

- advantage 正负；
- ratio 向上还是向下越界。

建议说：

> PPO surrogate 在不利于 trust region 的超界方向进入 clipped branch，相关 token 的 policy-gradient 路径会饱和；CISPO 把 clipped、detached ratio 作为权重，梯度仍沿 `∇logπ_new` 传播。

这样更严谨。

---

## G3-2：dynamic filter 节省 adjudicator 成本的说法与当前实现不一致

当前流程通常需要先完成 rollout 和 reward 结算，才知道组内 reward 是否零方差；`filter_zero_variance_groups()` 位于 reward 已附着之后。因此它主要节省：

- optimizer 计算；
- 无效梯度更新；
- 部分下游训练统计污染。

它**不能普遍节省已经发生的 NLI/adjudicator 结算成本**。只有另加基于廉价信号的前置过滤时才可能省 judge 成本。建议删掉该句。

---

## G3-3：历史 sampler 与当前训练方案不能混说

`0.74:0.26` 和每四步 canary 是历史 Step-2 的固定权重方案，事实基本正确，但不是当前 P5/T4 的最终 schedule。卡片必须标“历史诊断设计”，并追加：

> 当前长程 packet 已改为跨终局/任务面的结构化 schedule 与 rare-action replacement，不再以这组历史比例概括正式训练。

---

## G3-5：关于“数据配比防不了遗忘”需要收窄

如果“数据配比”指的是在纯 GRPO 中多采已饱和政务任务，那么零方差确实不会产生 retention 梯度。但如果加入：

- auxiliary SFT loss；
- replay CE；
- mixed-objective regularization；

数据配比当然可以防遗忘。

建议改成：

> 单纯往 GRPO rollout 池里混更多已饱和样本不等于 rehearsal，因为 zero-variance group 不产生 policy gradient；若要靠数据保留能力，需要显式 auxiliary SFT/replay objective，而本项目当前主要用 KL anchor。

---

## G3-6：当前 hard-stop 分类已经过时

草案写：

> A 类 format/HV 有停训权，B 类 grad/entropy 告警，C 类 prob_ratio>4 硬熔断。

当前 P5/T4 契约更细：

- train-batch format/HV 超 5%：**先告警并触发固定 confirmation probe，不直接杀长程 run**；
- entropy/finite grad norm excursion：主要 monitor/probe；
- NaN/Inf：自动 hard stop；
- `prob_ratio_max > 4`：hard pause + owner gate，不等于科学失败；
- JRA identity/parity、split contamination、silent judge fallback 进入梯度：确定性污染，自动停并使 segment 无效；
- dev HV/format 更多是 checkpoint promotion eligibility，不是训练中即时科学 verdict。

这题值得升 must，但锚点必须按当前 T4 contract 重写。

---

## G3-7：把“drift 翻倍”说成一般结论过强

约 1.8–2× 是历史 async run 的观测结果，不是 k=1 的理论定律。CISPO 宽 clip 也不是“专门为本项目吸收 async staleness 设计”的。建议表述为：

> 在那次 run 中，k=1 的 drift 约为 strict 的 1.8–2×，与预期量级相符；是否可接受仍应由 ratio、KL、clip fraction 和效果对照判断。

---

## G4-1：吞吐数字需要绑定硬件和配置

从 20 min/step 到 2–3 min 涉及多轮改动和不同运行形态。尤其 Note 023 的 LoRA 回归实验硬件是 **2×A6000**，当前正式目标机器是 2×4090。不要将全链路改善表述成一个严格同硬件、同模型、同 serving 配置的单因素 benchmark。

建议回答时说“跨阶段工程演进”，并分别注明：

- 并发修复带来的相对改善；
- merged serving 的相对改善；
- 最终 wall time 所在硬件和 packet。

---

## G4-3 / G5-8：根因结论应收窄

现有证据强力排除了 prefix cache、admission、chunked prefill、eager、CUDA graph 等 cheap fixes，并将问题定位在 **non-zero LoRA serving kernel path**。但“已证明 Triton JIT r=128 intrinsic overhead 是最终根因”略过度，因为没有看到内核级 profiler 或替换 kernel 的因果验证。

建议说：

> 根因被定位到 non-zero LoRA kernel path，且 cheap config 世界被排除；是否是某个具体 Triton kernel 的固有瓶颈仍缺少内核级因果验证，但工程上已足够支持切换 merged serving。

---

## G5-3：SFT 与 KL 的公式方向写反了

若数据分布为 \(p_{\text{data}}\)、模型为 \(q_\theta\)，SFT 交叉熵是：

\[
H(p_{\text{data}},q_\theta)
=H(p_{\text{data}})
+KL(p_{\text{data}}\|q_\theta)
\]

不是锚点中的：

\[
H(\pi)+KL(\pi\|\text{data})
\]

这是需要修正的明确事实错误。

RL 中常见的 policy/reference penalty 是 \(KL(\pi_\theta\|\pi_{\text{ref}})\) 的采样估计。它与直接对 reference token 做 CE 的差异之一，确实是 CE 包含不同的熵效应，但回答时必须先写对分布方向。

---

## G5-5：`1-(1-p)^k` 是独立近似，不是一般无偏估计

`pass@1=0.16 → pass@8≈0.75` 假设各次采样近似独立同分布。代码题里的无偏 estimator：

\[
1-\frac{\binom{n-c}{k}}{\binom nk}
\]

则是从已有 \(n\) 个样本、其中 \(c\) 个成功时估计 pass@k。两者不要混成同一个“精确公式”。

---

## G5-8：LoRA 的一般计算解释不足以解释 6× 回归

“每 token 多一次低秩分支”只能说明有额外开销，无法解释为什么会慢六倍；正常情况下低秩分支的 FLOPs 远小于主干。项目中的关键是 serving 实现路径、kernel launch/fusion 和 batch shape，而不是 LoRA 数学本身必然慢。

另外，“zero-delta 被短路”如果没有明确代码或 profiler 证据，建议改成“step0 zero-delta 路径显著更快，观测与快捷路径/内核差异一致”，不要说成已证实机制。

---

## G5-10：方向正确，但应强调 paired design

不是简单“不能用 t 检验”，而是：

- outcome 是二值 episode/task 结果；
- 两 checkpoint 在同 task 上应形成 paired delta；
- 同 family 任务相关；
- 正式推断应用 task/family-clustered bootstrap；
- DEFF 主要用于设计和精度近似，不应取代正式 clustered inference。

这题非常值得升 must。

---

## G6-1：精确论文数字应二次核对

“95.6%→75.6%”这类数字面试时风险很高。除非制卡前回 primary source 确认：

- 指标定义；
- 模型/任务；
- ablation 改了什么；
- 是绝对值还是百分点；

否则建议只讲方向，不背精确数字。真实感来自“它改变了我哪个设计”，不来自数字密度。

---

## G7-3：KL estimator 必须声明采样分布和 log-ratio 定义

`k1/k2/k3` 的正负号取决于定义：

\[
x=\log p-\log q
\]

还是反过来。制卡时必须先冻结：

- 从 \(p\) 还是 \(q\) 采样；
- 估计的是 \(KL(p\|q)\) 还是 \(KL(q\|p)\)。

否则公式看似正确，口述时很容易整体反号。

---

# 七、总量与建议结构

## 52 题是否过多

**作为资料库不算多，作为候选人需要系统准备和复述的“第二阶段题集”偏多。**

原因是：

- 自述已有 34 题；
- 深问又有 52 题；
- 其中不少题共享同一份实验故事，只是从算法、系统和代码三个角度重复；
- 1–2 分钟 × 52 已接近 1.5 小时纯口述，更不用说每题还要准备追问。

建议不要追求“所有仓库知识都有独立卡”。真实面试一般只沿 2–3 条主线连续追问，题集应优化的是**高质量分叉能力**，不是文件覆盖率。

## 我建议的定稿规模

**42 题：must 12 / common 22 / bonus 8。**

建议结构：

| 组 | 题数 | 重点 |
|---|---:|---|
| Reward 与 Judge | 7 | v1→v3、terminal gate、hybrid、JRA、语义 audit、错误分类 |
| 环境、数据与 Simulator | 7 | 信息边界、任务有效性、合成可信度、contrast、架构职责 |
| 优化、采样与稳定性 | 8 | GRPO/CISPO、zero variance、当前 schedule、KL、熔断、async |
| 测量与效果归因 | 4 | paired A/B、clustered inference、holdout、checkpoint selection/arm C |
| 难题复盘 | 6 | 吞吐、batch runner、LoRA、async、format collapse、测量面事故 |
| 基础与代码 | 7 | GRPO baseline、on/off-policy、pass@k、loss mask、reward flow、协议一致性 |
| 业界动向 | 3 | 直接影响设计的工作、async/OPD 取舍、verifiable reward vs RM |
| **合计** | **42** | |

---

# 如果由我定稿：增删改清单

## ADD

1. **ADD-M1（must）效果归因与 paired evaluation**  
   新增“如何证明提升来自 policy update；paired task delta、family-clustered bootstrap、一次 holdout look 和 arm C 分别解决什么问题”，补上当前最大的主线缺口。

2. **ADD-M2（must）当前长程训练 schedule**  
   新增“rare-action core + Finish anchors + breadth + zero-variance replacement”的当前方案，避免候选人只会讲历史 `0.74:0.26` sampler。

3. **ADD-M3（common/must）Policy Card/API Spec/Sandbox/Reward 分工**  
   新增架构 seam 题，检查候选人是否理解哪些约束应由模型学习、哪些应由环境结构性保证。

4. **ADD-M4（common）输出协议与训推一致性**  
   新增 `<analysis>/<action>`、Qwen ChatML、原生 `<think>` 冲突、tool role、parser fail-closed 与 format collapse 的完整链路。

---

## DELETE

1. **DELETE G2-5**  
   与自述 F1 几乎完全重复；golden trajectory/outcome-based 素材并入 G1-4 或 G7-6。

2. **DELETE G3-4**  
   rent 48% 是一次历史分布现象，适合作为 sampler 答案中的例子，不值得独立题。

3. **DELETE G6-4**  
   四类吞吐路线更像 survey 汇报，2×4090 的项目决策已可由 G4-1/G4-2/G4-4 覆盖。

---

## MERGE

1. **MERGE G2-3 + G2-4**  
   合成“simulator 的可接受偏差是什么，为什么只监控而不进 reward”。

2. **MERGE G1-6 + G2-7**  
   合成“sandbox 错误分类、subject-scoped safety 和可恢复 trial-and-error”。

3. **MERGE G3-2 + G3-3**  
   合成“zero variance、learnability、targeted sampling 与 canary”；删掉对历史精确配比的背诵要求。

4. **MERGE G3-7 + G4-4**  
   同一题讲清 async 的算法 staleness、CISPO 修正和 merged serving 权重生命周期。

5. **MERGE G4-5 + G4-6**  
   保留 format collapse 主故事；2560 floor 和 residual gate 作为追问素材。

6. **MERGE G4-3 + G5-8**  
   一题同时回答 LoRA 训练显存收益与 serving kernel 回归，避免理论题和事故题重复。

7. **MERGE G4-2 + G5-9**  
   用 batched runner 失败解释 continuous batching、barrier 和流水线相位错开。

8. **MERGE G5-7 + G6-2 + G6-5**  
   合成“RL、OPD/self-distill 与遗忘恢复的职责边界”，避免同一观点出现三次。

9. **MERGE G3-1 + G7-2**  
   主卡讲实际算法口径，代码追问讲 PPO/CISPO 的 detach、clip 与梯度路径。

10. **MERGE G7-5 into G3-2 and G5-5**  
    zero-variance filter 放训练题；pass@k 无偏估计放 learnability 基础题，删除混合卡。

---

## EDIT

1. **EDIT G1-1**  
   保留版本演化，但答案聚焦各版反例；现役状态引用当前 reward 代码/P5 handoff，不只引用仍写“prospective”的旧 ADR 头部。

2. **EDIT G1-3**  
   明确被否决的是 pure raw linear scaling，不是“所有 ceiling=1.0 设计”；priority 改 common。

3. **EDIT G1-4**  
   改为 terminal-only reward 的收益与信用分配局限；不要声称分解 reward 已解决 temporal credit assignment。

4. **EDIT G1-7**  
   删除“负样本压低 baseline 因而数学上扭曲”的绝对说法，改为安全语义、责任归属和 reward geometry 取舍。

5. **EDIT G2-6**  
   加入任务有效性门；区分单样本 correctness、数据集 isolation 和 synthetic-to-real gap；明确 L0–L5 自动层 + L6 审核。

6. **EDIT G3-1**  
   PPO clip 的梯度饱和需按 advantage 方向描述；priority 保持 must，但不再和 G7-2 重复。

7. **EDIT G3-2**  
   删除“外层过滤节省 NLI/adjudicator 结算”的当前实现不实陈述；强调主要节省无效 optimizer 更新。

8. **EDIT G3-3**  
   标明是历史 sampler，并补充当前 P5 schedule；不要求背 0.74/0.26。

9. **EDIT G3-5**  
   改成“纯 GRPO 池配比无法替代显式 rehearsal objective”，不要泛化为所有数据配比都防不了遗忘。

10. **EDIT G3-6**  
    按当前 T4 契约重写：质量指标先 confirmation probe，NaN/Inf 和确定性测量污染才自动硬停，dev 指标主要控制 promotion eligibility。

11. **EDIT G4-1**  
    标明跨阶段、跨配置的工程演进，不包装成单硬件受控实验；priority 改 common，系统岗可 must。

12. **EDIT G4-3**  
    将“固有 Triton 根因”收窄为“定位到 non-zero LoRA kernel path，cheap fixes 被排除”。

13. **EDIT G4-7**  
    从事故复述改为“JRA 证明 runtime identity，但为何仍需 blinded semantic audit”；保持 must。

14. **EDIT G4-8**  
    从两个坏任务复述改为通用 RL task validity contract；保持 must。

15. **EDIT G5-2**  
    去掉五算法流水账，按“采样过滤、importance-sampling 粒度、clip/梯度路径”三轴比较；priority 降 common。

16. **EDIT G5-3**  
    修正 SFT CE 的 KL 方向，并缩小为 SFT CE 与 RL KL anchor 的目标差异。

17. **EDIT G5-5**  
    区分独立近似 `1-(1-p)^k` 与有限样本无偏 estimator。

18. **EDIT G5-10**  
    加入 paired delta 和 holdout/arm-C 关系；priority 升 must。

19. **EDIT G6-1**  
    删除未经 primary source 二次核对的精确百分点要求，只保留“哪些机制实际改变了设计”。

20. **EDIT G6-6**  
    明确三层防线：可验证规则优先、JRA 保证实际运行身份、独立语义 audit 防 judge gaming。

21. **EDIT G7-1**  
    priority 改 common；要求写项目实际 CISPO objective，同时能指出它与标准 GRPO/PPO surrogate 的差别。

22. **EDIT G7-3**  
    priority 改 bonus；题面预先声明 log-ratio 定义和采样分布，避免符号歧义。

23. **EDIT G7-4**  
    扩展到 observation/tool role、Choice/logprobs 保留、chat-template 训推一致性；与新增协议题形成“概述卡 + 代码追问卡”。

24. **EDIT G7-7**  
    不再独立背 rolling-median 阈值；作为 G4-5 或 G3-6 的代码追问，重点解释为什么固定阈值容易误杀。

---

最终来看，这份草案不需要推倒重来。它已经有非常好的真实证据底座；定稿工作的核心是：**删掉历史局部参数和重复卡，把“任务有效性—judge 可信度—RL 效果归因—当前长程训练”提升为四条同等重要的主线。**这样候选人面对真实面试时，既能讲算法，也能讲实验科学性和系统诊断，而不是只表现为“对自己仓库非常熟”。