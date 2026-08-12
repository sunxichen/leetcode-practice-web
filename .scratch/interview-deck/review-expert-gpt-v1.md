# agentic-gov 自述阶段问题题集专家审阅（GPT v1）

> 审阅日期：2026-08-11  
> 被审文件：`agentic-gov-self-intro-questions.md`  
> 调研原则：先独立阅读仓库的最新 ADR、实验记录、P5 board、2026-08 专家咨询、Phase 6 handoff 与机器证据，再读取题集。对事实冲突按“最新、已执行、可复验的证据优先于早期规划文档”处理。

---

# 总体评价

## 结论

这份题集的**知识覆盖很全，但面试真实性和阶段边界控制不够好**。它更像“按仓库目录做的一份答辩提纲”，还不像真实大模型应用/RL 面试中，面试官听完 1–2 分钟项目自述后自然追问的题集。

主要问题有五个：

1. **过度围绕系统内部名词组织**：Canonical Task、contrast pair、subject-scoped precondition、NLI hypothesis、ART 评分表、ADR 管理等占比偏高；真实面试官更先问“具体解决什么问题、你的贡献是什么、为什么非得用 RL、结果到底怎样、怎么证明不是测量假象”。
2. **缺少能让外部面试官迅速建立心智模型的问题**：没有“举一个完整用户案例走一遍”，也没有“这个项目相对普通 workflow/prompt/SFT 的核心增量是什么”。
3. **结果叙事被拆散**：SFT、simulator、RL、失败、当前状态分别成题，但缺少一个统一的“基线—干预—结果—限制”主线。面试官很可能只给 2 分钟让候选人说清结果，不会逐题替候选人拼起来。
4. **“自述开场阶段”混入了明显的后续深挖题**：C4、C6、D4、D5、D6、E2、G2、G3 等更适合作为第二层技术深挖卡。
5. **若干锚点已过时或表述不准确**：尤其是 C3、C5、D5、E3、F1、F4、F5、H3。F1 使用了已被 2026-06-29 apples-to-apples 复测判为 stale/contaminated 的旧 8B 指标；F5/H3 也落后于 2026-08-11 已完成的 learnability Wave 1。

## 建议的整体重构

不建议继续以 A–H 八个“项目文档章节”组织开场题集。建议重构为五组、总计约 **18–22 题**：

1. **项目与本人**：项目一句话、用户案例、个人职责、核心贡献。
2. **为什么这样做**：业务难点、为什么 RL、为什么 simulator、为什么从公积金单域开始。
3. **方案全貌**：系统闭环、数据、reward/验证、GRPO 选择，只讲模块级广度。
4. **结果与复盘**：SFT 基线、RL 窄正结果、全表面未证明、最大失败、当前进度、重做会改什么。
5. **边界与价值**：局限、生产化缺口、扩展方式、研究结论能诚实声称到什么程度。

建议开场题集中只保留约 **10–12 个 must、6–8 个 common、3–5 个 bonus**。其余问题移入“技术深挖题集”，不要删除知识，只删除其在当前阶段的独立卡位。

## 我对项目当前状态的独立理解

为避免以下审阅建立在题集自身叙事上，先给出我根据最新仓库证据形成的项目摘要：

- 项目目标是在公积金 4 个 task type 的强约束、多轮工具调用场景里，构建 **SFT policy + frozen user simulator + deterministic sandbox + terminal-gated decomposed reward + GRPO** 的可验证训练闭环。
- 当前合法动作不是四种，而是 **5 种**：`Ask_User / Call_API / Finish / Escalate / FinishWithRefusal`；其中终局动作是后三种。
- 当前 Reward v3 的核心是 `R_complete = R_state × R_terminal`，总式为 hard violation 归零，否则 `0.65 R_complete + 0.35 R_disclosure - 0.10 P_turns - 0.10 P_failed_calls`；`R_escalate` 已移出 v3 训练总和。
- 当前主 policy 起点是 **Qwen3-4B SFT checkpoint-720**。采用当前 harness 的同条件复测中，4B strict success 0.801、hard violation 0，8B 为 0.776、hard violation 0；4B 主要因 parity + 约 1.5× 速度被采用。
- 已证明的最强 RL 正结果是 S1 family-disjoint held-out Escalate：0.6974 → 0.7895，+9.21pp，95% CI `[+3.29,+15.13]`；但同一 S1 上 hard violation 从 3/1408 到 7/1408，+0.2841pp，因此不能说“性能提升且安全不变”已被完整证明。
- P3/P4 没有证明全表面净收益。原因不能归纳成“GRPO 失败”：历史测量面存在结构性无效任务；两次 SFT booster 又出现 terminal-prior、format/HV 的安全跷跷板。
- 最新 P5 已生成并冻结 3,100 条任务（train 1,800 / dev 300 / holdout 1,000）。截至 2026-08-11，learnability probe 的 **Wave 1 已执行 2,880 episodes**，B4 初判 7/8：`withdrawal_for_purchase × Escalate` 没有 2–6/8 带内任务。随后已做 owner-approved 的该 cell L1 trigger 修复，并完成新 freeze/跨 freeze 合并分析的 CPU 准备；修复后 GPU 重跑与 Wave 2 尚未完成。因而不能再说“14,400 episodes probe 尚未发射”。

---

# a. 覆盖度：缺了哪些真实面试官会问的话题

## a-1. 缺少“用一个例子把项目讲明白”——应为 must

现有 B1、C1、C2 都是抽象定义，外部面试官听完仍可能不知道系统实际在做什么。

**建议新增：**

> **“你能用一个具体用户案例，走一遍 Agent 从开场到终局的完整流程吗？”** `must`

建议锚点：以租房提取或购房提取为例，用户缺身份证/金额 → Agent 追问 → 核身 → 资格检查 → 写 API → 告知结果；再用账户冻结或身份冒用说明为什么会走 Escalate/FWR。只讲 5–6 个节点，不展开 handler 细节。

为什么重要：真实面试官通常先用例子验证候选人是否真的理解系统，而不是只会复述架构名词。

## a-2. 缺少“项目的核心创新/最难部分是什么”——应为 must

题集有很多设计点，但没有要求候选人做优先级判断。面试官会直接问“最难的是哪一块”“你觉得项目最有价值的贡献是什么”。

**建议新增：**

> **“这个项目最核心的技术贡献是什么？如果只能讲一个点，你讲什么？”** `must`

建议答案不要说“用了 GRPO”。更有区分度的主张是：把政务多轮 Agent 任务变成**动作—证据可蕴含、终态可验证、终局动作可区分、可做 held-out 统计检验**的 RL 训练与测量体系；同时诚实说明这一体系仍在验证全表面泛化。

## a-3. 缺少“为什么不是 workflow / prompt engineering / rejection sampling SFT”——应为 must/common

B4 只问“SFT 不够吗”，但真实面试官会把替代方案问得更完整：

- 规则 workflow 已经很强，为什么还要模型？
- prompt + tool schema 是否足够？
- 既然 outcome 可验证，为什么不采样 K 个、筛成功轨迹再 SFT？
- RL 到底增加了什么？

**建议把 B4 改为：**

> **“为什么不是规则工作流、prompt engineering 或 rejection-sampling SFT，而要引入 RL？”** `must`

回答应承认：强规则部分交给 sandbox，不让模型学；RL 只优化仍需策略决策的多轮追问、动作选择、终局判断和告知完整性。还应承认 rejection-sampling SFT 是合理基线，当前 P5 也把 arm C 设计成 descriptive control；不能把“用了 RL”当作先验正确。

## a-4. 缺少“为什么选 GRPO，而不是 PPO/DPO”——应为 common

项目名称里直接出现 GRPO，真实 RL 面试官大概率会问算法选型。可保持广度，不进入 ART 工程细节。

**建议新增：**

> **“为什么选 GRPO？它和这个任务的 reward/采样形态哪里匹配？”** `common`

锚点：同一 task 采 K 条 rollout、可验证终局 reward、组内相对优势避免单独 critic；同时说明零方差组/全成全败组是实际风险，所以项目才有 learnability 2–6/8 筛选与分层采样。

## a-5. 缺少“怎么证明提升来自 RL，而不是数据、judge 或动作先验漂移”——应为 must/common

F3 给结果，但没有专门问因果归因。项目历史恰恰多次遇到测量链污染、无效任务、judge mismatch，因此这是最有价值的面试问题之一。

**建议新增：**

> **“你怎么证明看到的提升真的是 RL 学到能力，而不是换了数据、judge 漂移或动作先验重排？”** `common`（RL 研究岗可升 `must`）

锚点：同 checkpoint/同 judge/runtime attestation、family-disjoint held-out、SFT 对照、action/cell 分层、HV/format/Finish retention 同时报、冻结 verdict function、一次预指定 holdout look。

## a-6. 缺少“项目规模与实际工作量”——应为 common

E3 问的是早期预算，不是规模。真实面试官更关心：多少任务、多少轨迹、多少 rollout、多少模型、多久、两卡怎么跑。

**建议新增：**

> **“这个项目做到什么规模？数据量、rollout 量、模型和算力分别是什么量级？”** `common`

锚点应使用已执行/冻结事实，而不是早期总预算预测：SFT corpus 3996 total / 3840 train；4B policy、4B simulator；P5 3100 tasks；T3b Wave 1 2880 episodes；计划 train probe 14400、最终双臂 holdout 16000。未执行的量必须明确说“计划”，不能和已执行混写。

## a-7. 缺少“如果要上线，还缺什么”——应为 common

H2 只问研究局限，没有从生产视角追问。

**建议新增：**

> **“如果把它做成真实政务产品，离上线还差哪些关键环节？”** `common`

锚点：真实用户分布与政策数据、线上安全审计、人类兜底、政策版本更新、隐私/合规、simulator-to-real gap、跨事项与异步审批、线上监控。这样能把研究原型与生产系统边界讲清楚。

## a-8. 缺少“你本人做出的关键决策”——A3 不够

A3 只问“你负责什么”，容易回答成模块列表。应补一个行为证据问题：

> **“项目里哪一个关键判断是你做的？当时证据是什么，结果怎样？”** `common`

可用案例：发现 8B 旧报告 stale 后重跑并采用 4B；发现无效任务主导测量面；推翻不可达统计 gate；发现 T2 receipt 声称 hybrid、实际却是 NoHitChecker，推动 JRA。

---

# b. 粒度：哪些题太大、哪些太小

## b-1. 太大，1–2 分钟难以完整回答

| 题号 | 问题 | 问题所在 | 可执行修改 |
|---|---|---|---|
| C5 | 训练管线分几个 phase？每个 phase 的 exit 标准是什么？ | 同时要求 8 个 phase + 每个 exit，且历史 exit 已被 P5 重设；像项目答辩目录题。 | 删除独立题。若保留，改成“训练闭环分哪三段？”只答 SFT 冷启动、frozen-simulator rollout、RL+held-out eval。 |
| D8 | 有哪些设计后来被推翻或修正？ | 一题要求罗列多条 ADR，容易变成背书清单。 | 改成“讲一次最重要的方向修正：你为什么改、证据是什么？”只讲一个案例。 |
| E2 | ART 为什么选？对比了什么？ | 11 维 × 多框架无法在 2 分钟真实讲清；容易背评分表。 | 改成“选 RL 框架时最关键的 3 个约束是什么？ART 的主要代价是什么？” |
| H1 | 怎么扩第二事项/domain？ | 锚点要求 11 步 checklist，超出开场粒度。 | 改成“架构上哪些模块复用、哪些必须重做？”答 framework/plugin 两层即可。 |
| G1 | 怎么保证统计可信？ | 若展开所有 bootstrap/power/gates 会超时。 | 限定为“讲 3 个最关键措施”：family-disjoint、预注册/功效、双臂同口径。 |
| A1 | 介绍项目 | 若按题集所有锚点讲，会膨胀成 3–5 分钟。 | 明确 90 秒结构：场景 20 秒、方案 30 秒、结果 25 秒、反思/现状 15 秒。 |

## b-2. 太小或与邻题重复，不值得单独成题

| 题号 | 问题 | 建议 |
|---|---|---|
| A2 | 一句话说清项目 | 与 A1 高度重复。作为 A1 答案第一句，不单独成题。 |
| C3 | Agent 动作空间是什么 | 可并入 C2 rollout 流程；且当前事实是 5 种动作。 |
| C4 | Think 为什么不做独立动作 | 典型二级追问，移入“模型输出协议/推理格式”深挖卡。 |
| C6 | Canonical Task 装什么 | schema 记忆题，除非候选人主动提 task factory，否则不应独立。 |
| D4 | contrast pair 是什么 | 数据深挖子题；开场只需在 D3 中一句说明“用 minimal pairs 覆盖政策边界”。 |
| F2 | simulator 达标了吗 | 可并入 D7“为什么训练并冻结 simulator”，把指标作为证据，不必独立。 |
| E3 | 算力与成本 | 早期成本估计已过时；改成“项目规模”后才值得独立。 |
| G2 | 偏离如何管理 | 过于仓库治理化。可作为“研究严谨性”答案中的一个要点，不独立。 |

## b-3. 应拆成“主问题 + 可选追问”

### D1 / D2

D1 现在同时含 reward 公式、硬门、分解理由、版本演化；D2 又含 golden state、路径自由度、R_exec 移除。建议：

- 主问题：**“reward 怎么把‘办成事、说到位、别违规、别低效’统一起来？”**
- 可选追问：**“golden final state 如何产生？为什么不做轨迹逐步匹配？”**

### F3

F3 一题塞了最强正结果、P3/P4 负结果、根因判断。建议固定 4 段：

1. 训练分布内：C0→C15 +7.8pp；
2. 干净 held-out：Escalate +9.21pp，CI 全正；
3. 安全 caveat：HV +0.2841pp，未证明“不升”；
4. 总结：全表面 well-rounded 尚未证明。

这样 1–2 分钟能答完，且不会把“窄正结果”夸成“项目已成功”。

---

# c. Priority 标注：哪些标高、哪些标低

## c-1. 标高了

| 题号 | 当前 | 建议 | 理由 |
|---|---:|---:|---|
| A2 | must | 删除/并入 A1 | 面试官不会在问完“介绍项目”后再机械问一句话版。 |
| B3 | must | common | 会问，但通常在项目全貌或 domain 选择之后；不如“为什么 RL”高频。 |
| C3 | common | bonus/并入 C2 | 动作枚举是小细节。 |
| C5 | common | 删除/bonus | phase/exit 是文档结构，不是自然开场问题。 |
| D2 | must | common | golden state 很重要，但需候选人先提“可验证终态”；没有 D1/D3/F3 高频。 |
| D5 | common | common（保留但重写） | 真实问题，但当前答案错误；不是优先级问题而是事实问题。 |
| D6 | common | bonus/移深挖 | NLI+adjudicator 属 reward 深挖，开场不应占独立 common 卡。 |
| D8 | common | bonus/改写 | “列举所有修订”不自然；讲一个重大转向才有价值。 |
| E2 | common | bonus | 只有明确追问框架选型才会问，且当前题像选型报告答辩。 |
| F1 | must | common | 面试官更关心最终 RL-over-SFT 结论；SFT 数字是支撑材料。 |
| F2 | common | bonus/并入 D7 | simulator 指标通常是追问，不是开场主问题。 |
| H1 | common | bonus | 求职面试中可能问扩展性，但概率低于结果、贡献、替代方案、局限。 |

## c-2. 标低了

| 题号 | 当前 | 建议 | 理由 |
|---|---:|---:|---|
| B4 | common | **must** | 只要项目叫 Agentic RL，面试官几乎必问“为什么 SFT 不够/为什么 RL”。 |
| B5 | bonus | common | 为什么选公积金、为什么只做 4 个 task type，是理解 scope 的自然问题。 |
| C2 | common | common，或与案例题组合后升 must | 面试官需要确认 rollout 闭环是否真实存在。 |
| D3 | common | **must** | 合成数据来源、真实性与泄漏风险是大模型应用/RL 高频问题。 |
| D7 | common | common，RL 面试可升 must | frozen simulator 是本项目和普通离线 SFT 最大的结构差异之一。 |
| F5 | common | **must** | 项目仍在进行中，面试官必问“现在做到哪、哪些是结果、哪些只是计划”。 |
| G1 | common | common，研究岗可升 must | 项目历史有无效任务和 judge mismatch，统计与测量可信性是核心。 |
| H3 | common | common | 当前计划本身不必 must，但必须与 F5 一起保证时效准确。 |

## c-3. 建议新增的 must

- 具体用户案例。
- 核心贡献/创新点。
- 为什么不是 workflow/prompt/rejection-sampling SFT。
- 你本人负责什么、关键决策是什么。
- 一句话诚实结果：证明了什么、没证明什么。

---

# d. 问题真实性：哪些不像真实面试官会问

## d-1. 太像背书提纲/项目目录

### C5：训练分几个 phase、每个 phase exit 是什么

真实面试官不会替候选人按 Phase 0–7 过项目文档目录。更自然的问法是：

> “你的训练闭环分哪几步？每一步解决什么问题？”

### D8：有哪些设计被推翻或修正

当前问法像让候选人背 ADR 清单。更自然：

> “项目里你做过最重要的一次方向调整是什么？为什么？”

### G2：方案和实施偏离时怎么管理

“ADR、未提交草案 superseded”是仓库治理语言，不是大多数技术面试官的自然首问。可改为：

> “你怎么防止实验过程中不断改口径，最后只挑对自己有利的结果？”

这样既真实，也能自然答预注册、冻结 holdout、additive evidence、近 miss 不重切数据。

## d-2. 太迂腐/过度精细

- C6：一条 Canonical Task 有哪些字段。
- D4：contrast pair 定义和 264 条数量。
- D6：mandatory disclosure 的 NLI+LLM 细节。
- E2：逐框架 11 维评分。
- G3：step 30+ grad norm 与 async 44% 丢弃。

这些内容都可以是后续追问，但不应预设为自述阶段独立卡。

## d-3. 太像“诱导候选人说漂亮话”

### E2 当前锚点：“ART 11/11 全过，其他框架各有硬伤”

真实面试更重视 trade-off。建议改成：

> “ART 满足了哪些关键需求？实际使用中暴露了哪些代价？”

答案必须同时讲优势与运行时/接口/serving glue 的工程成本，不能只背选型胜利表。

### F4 当前锚点：“最大的失败就是 38 条无效任务”

题目允许讲失败，但锚点把答案预先锁死且数字过时。更真实的问法：

> “项目里最严重的一次误判是什么？你后来怎么证明原结论不成立？”

候选人可讲无效任务，也可讲 T2 judge attestation mismatch；关键是证据链。

---

# e. 准确性与时效：逐题锚点审计

## e-1. 明确错误或已过时，必须修改

| 题号 | 判定 | 问题 | 最新事实与修改建议 |
|---|---|---|---|
| C2 | **错误/不完整** | rollout 动作只列 Ask/Call/Finish/Escalate。 | 当前 schema 是 5 种动作，必须加入 `FinishWithRefusal`。终局动作是 Finish/FWR/Escalate。来源：`src/agentic_gov/schemas/trajectory.py`、`reward/terminal.py`。 |
| C3 | **错误** | 说“4 种，另有 FWR”。实现层 FWR 不是附注，而是正式第五种 action。 | 改成“五种动作、三种终局”；最好并入 C2。 |
| C5 | **过时** | 以早期《最终研究方案》Phase 0–7 exit 为当前口径。 | 当前 Phase 6 的 P5 已重设 acceptance，旧 P4 gate 被正式退休；不能说每个 phase exit 仍按早期方案有效。来源：`adr-phase6-p5-t0-scope-and-gates-20260806.md`、P5 board D-P5-7。 |
| D2 | **表述不准确** | “走更长的正确路径不被惩罚”。 | 终态比对不锁定具体轨迹顺序，但更长路径仍可能受 `P_turns` 和失败调用惩罚。应改为“不因与 golden chain 路径不同而直接判错，但效率仍评分”。 |
| D5 | **实质错误** | 把“未核身就写入”说成 sandbox 拦截 + reward hard violation 归零的双保险。 | subject-scoped precondition 会拦截写入；这类 `PRECONDITION_NOT_MET` 通常是 efficiency failed-call，不是语义型 hard-zero。hard violation 主要由未知/禁用工具、格式/action contract 等分类触发。来源：`adr-phase5-reward-divergence-from-final-proposal.md` 决策四。 |
| E1 | **过时/需重写** | 先写 Agent 8B，再说 Phase 6 切 4B；“SFT 用 LLaMA-Factory”也过度概括。 | 当前 P5 起点是 4B ckpt720；4B 是同条件重训并与 8B 复测后正式采用。主 SFT 用 LLaMAFactory，后续小 patch 有 ART-native SFT。应以当前 checkpoint 为主句。 |
| E3 | **过时** | “全程预算 ¥450–750”、固定 GPU0 trainer/GPU1 inference+simulator。 | 这是早期估计，已不适用于 P5 的约 68k+ episode 规划和多轮已执行 GPU/probe。拓扑也随阶段变化。删除金额，改问实际规模与已执行/计划算力。 |
| E4 | **夸大** | “4B 权重减半≈每 token 2×”。 | apples-to-apples handoff 的实际结论是约 **1.5× faster**，且采用理由是 parity + 同安全地板；不要用理论 2× 代替实测。4B 0.801 vs 8B 0.776、HV 均 0 是可用事实。 |
| F1 | **严重过时** | 使用 strict 62.2%、HV 4.5%、loan 16.1/22.6 的旧 8B Phase 3 harness。 | 2026-06-29 已明确该 8B 报告 stale/contaminated，并用当前 harness 重跑。当前采用的 4B ckpt720：overall strict 0.801、HV 0、loan 0.613、FWR 0.200。来源：`handoff-phase6-4b-agent-sft-vs-8b-eval-comparison-20260629.md` §9.3–9.5。 |
| F4 | **数字过时/范围错误** | “38 条结构性无效任务”只是 Note 031 某个 promotion 子面的早期拆分，不代表全仓影响面。 | 最新复验：bridge 24/24 invalid、hard_train_v2 72/300、hard_val_v1 4/180、pool_390 42/390、Range-80 0/80；247 历史 task rows 被 exact-hash 退役。建议不以“38”作为项目最大失败的当前总量。 |
| F5 | **已过时** | 说 learnability probe 14,400 episodes “待发”。 | 截至 2026-08-11，Wave 1 已完成 2,880 episodes，B4 初判 7/8；失败 cell 为 purchase×Escalate。该 cell L1 trigger 已 owner-approved 修复，新 freeze/合并分析 CPU 就绪，修复后重跑与 Wave 2 待执行。来源：`p5_t3b_w10_wave1_report.md`、`p5_t3b_w12_repin_report.md`、最新 git log。 |
| H3 | **已过时** | 下一步仍写“learnability probe → 长程 GRPO”。 | 应写“修复后重跑 purchase×Esc L1 的 80 episodes + Wave 2 11,520 → 合并 B4 判定 → 通过后才冻结 T4 GPU-E 长程 GRPO packet”。 |

## e-2. 方向正确，但必须补 caveat

| 题号 | 判定 | 建议补充 |
|---|---|---|
| A1/A2 | 基本正确 | 不要让“一分钟定义”暗示全闭环已最终成功。应说“已跑通并验证了部分闭环；全表面 well-rounded 仍在验证”。 |
| B2 | 方向正确 | 这五项首先是项目定义的目标失败模式，不应笼统说成已对“通用大模型”做过完备实证。 |
| B4 | 方向正确但论证偏单向 | 应承认 SFT、规则 workflow、rejection-sampling SFT 都是合理替代；当前只证明了 RL 在一个 held-out Escalate 面上有增益，尚未证明所有面都需要 RL。 |
| C1 | 基本正确 | 当前 judge 链必须加 JRA/runtime attestation；项目历史证明“配置文件写 hybrid”不等于运行时真的接入 hybrid。 |
| C4 | 事实演进基本正确 | 当前正式 envelope 是 `<analysis>/<action>`；不要继续引用早期 `<think>` 示例作为实现事实。 |
| C6 | 大体正确 | 若保留，应补 `policy_id/version`、`db_init_state`、expected terminal、compare_spec 的 terminal/flow 条件化；但不建议在开场独立问。 |
| D1 | 基本正确 | 必须明确当前 v3 是 `R_state × R_terminal`；`R_escalate` 已退出训练总和。hard violation 是 hard-zero，但不是所有业务 precondition 错误都叫 hard violation。 |
| D3 | 基本正确 | 区分 3996 total post-rescan corpus 与 4B 实际 train examples 3840。另需承认 synthetic-to-real gap。 |
| D6 | 基本正确 | 最新事实不只“hybrid”，还包括 JRA：checker 类、bundle、adjudicator、prompt/model/runtime hash 都要被运行时证明。T2 曾出现 receipt 声称 hybrid、实际 NoHitChecker 的断线。 |
| D7/F2 | 基本正确 | simulator 五门全过，但 persona 91.0%贴线，RPCR 仍有 1.9% 泄漏，且 vulnerable/低素养覆盖有盲区；不能说“完全可靠”。 |
| D8 | 例子大体正确 | “chat template qwen3→qwen”要说明是训练/推理模板一致性修订，不是模型从 Qwen3 换成 Qwen。 |
| F3 | 核心结论正确但不完整 | 必须把 S1 HV +0.2841pp 与 Escalate +9.21pp 并列；P4 负结果还包括 SFT booster 的 HV/format powered fail，不能只归因无效任务。 |
| F6 | 方向正确 | “reward v1 就 terminal gate”是 hindsight；更有力的重做项是 validity gate、judge attestation、power/可达性计算前置。 |
| G1 | 基本正确 | seed pairing 只能算评测卫生，P5 sizing 明确按 0% 方差收益记账；不能把“paired”说成已保证强配对降方差。 |
| H2 | 大体正确 | “4B 容量上限”应改为“模型规模仅验证到 4B，外推受限”；当前失败不能归因于 4B capacity wall。 |

## e-3. 当前可保留的锚点

以下题目的核心事实基本可用，但仍建议按本审阅的阶段/真实性意见调整：

- A3（角色边界仍必须本人确认）
- B1、B3、B5
- D4（事实可用，但移深挖）
- E2（选型事实可用，但需讲 trade-off）
- F2（指标可用，建议并题）
- G2、G3（大体可用，移深挖）
- H1（插件化思想可用，但不要背 11 步）

---

# f. 应删的题：哪些不该出现在自述阶段

这里的“删”指从**自述开场题集**删除，不代表从全部面试准备中删除。

## f-1. 建议直接移入后续技术深挖

| 题号 | 原因 | 适合归入的深挖专题 |
|---|---|---|
| C4 | 输出协议/推理格式的局部设计 | 模型输出格式与 mask/template |
| C6 | schema 记忆与 task factory 内部字段 | 数据建模与任务生成 |
| D4 | minimal pair 构造细节 | 数据合成/边界数据 |
| D5 | subject-scoped precondition 有价值，但属于 sandbox 安全细节 | sandbox 与安全机制 |
| D6 | NLI/LLM hybrid 与 hypothesis 校准 | reward/judge 深挖 |
| E2 | 多框架逐项选型 | RL 工程与框架选型 |
| G2 | ADR、supersession、additive evidence | 研究治理/可复现性 |
| G3 | grad guard、async k=1、drop rate | GRPO 稳定性与系统优化 |

## f-2. 建议删除独立卡、并入其他题

- **A2** → 并入 A1 的第一句话。
- **C3** → 并入 C2 rollout。
- **F2** → 并入 D7 simulator 设计与验收。
- **E3** → 删除旧预算，改成新的“项目规模”问题。
- **D8** → 不保留列表题，改成一个“最大方向修正”问题。
- **C5** → 删除 phase 目录背诵题。

---

# 建议新增的问题清单

| 新编号 | 问题 | priority | 建议锚点 |
|---|---|---:|---|
| N1 | 你能用一个具体用户案例走一遍完整流程吗？ | must | 租房/购房提取：opening→追问→核身→资格/合同→提交→告知；异常时 Escalate/FWR。 |
| N2 | 这个项目最核心的技术贡献是什么？ | must | 把多轮政务 Agent 变成动作—证据可蕴含、终态与终局可验证、能做 held-out 统计检验的 RL 任务。 |
| N3 | 为什么不是规则 workflow、prompt engineering 或 rejection-sampling SFT？ | must | 规则交给 sandbox；模型负责非确定的多轮决策；RL 有窄 held-out 正证据，但 rejection-sampling 仍是应有基线。 |
| N4 | 为什么选 GRPO，而不是 PPO/DPO？ | common | K-way 同任务采样、相对优势、无需 critic；风险是零方差组，因此要 2–6/8 learnability 筛选。 |
| N5 | 你怎么证明提升来自 RL，而不是 judge/data 漂移？ | common/must | 同口径双臂、JRA、family-disjoint、冻结 verdict、分层报告 safety/Finish retention。 |
| N6 | 项目做到什么规模？哪些已经执行，哪些只是计划？ | common | 3996 corpus/3840 train；4B+4B；P5 3100；Wave1 2880 已执行；后续 11520/GRPO/T5 属计划或待执行。 |
| N7 | 项目里最关键的一个个人决策是什么？ | common | stale 8B 重评、无效任务审计、P5 gate power 重设、JRA 等任选一个，讲证据与结果。 |
| N8 | 如果要上线，最大的三个缺口是什么？ | common | simulator-to-real、真实分布与政策更新、隐私/人工兜底/线上安全监控。 |
| N9 | 合成数据会不会让模型只学会模板或 simulator quirks？ | common | family/skeleton/split 隔离、near-dup gate、holdout family unique、R4 扫描；承认仍未消除 sim-to-real 风险。 |
| N10 | 目前你能最诚实地声称什么研究结论？ | must | RL 在有效 held-out Escalate 上有统计显著增益；全表面 well-rounded、HV 不升、真实政务泛化均未证明。 |

---

# 建议删除/修改的问题清单

## 1. 建议形成的开场题集骨架（约 20 题）

### Must（建议 11 题）

1. A1 改写：**“请用 90 秒介绍项目：问题、方案、你的贡献、结果。”**
2. A3：你负责什么、哪些是你亲自完成的？
3. N1：用一个用户案例走一遍。
4. B1：边聊边办与开放聊天/普通问答的区别。
5. N3/B4 改写：为什么不是 workflow/prompt/SFT，而要 RL？
6. C1 改写：系统闭环有哪些核心模块？
7. D3：数据从哪里来，如何避免合成数据失真？
8. D1 改写：reward 如何同时评价办成、终局动作、告知、安全和效率？
9. F3 改写：RL 到底证明了什么、没证明什么？
10. F4 改写：最严重的一次误判/失败是什么，怎么纠正？
11. F5/H2 合并：现在进行到哪，最大局限是什么？

### Common（建议 7 题）

1. B3+B5 合并：为什么从公积金单域、4 个 task type 开始？
2. C2+C3 合并：一次 rollout 如何运行，动作空间是什么？
3. D7+F2 合并：为什么训练并冻结 simulator，怎么验收？
4. N4：为什么 GRPO？
5. E1+E4 合并：为什么最终采用 4B policy？
6. G1/N5 合并：怎么保证统计与测量可信？
7. F6/N7：如果重做，最先改哪三件事？

### Bonus（建议 4 题）

1. H1 改写：怎么扩到第二事项/domain？
2. N8：离生产上线还差什么？
3. E2 改写：ART 的关键优势和实际代价。
4. N9：怎么处理 simulator/data/reward overfitting 风险？

## 2. 各原题的具体处理

| 原题 | 动作 | 建议新题/去向 |
|---|---|---|
| A1 | 修改 | 限定 90 秒，必须包含诚实结果和本人贡献。 |
| A2 | 删除独立卡 | 作为 A1 第一句。 |
| A3 | 保留 must | 回填本人真实角色、时间投入、代码/实验职责边界。 |
| B1 | 保留 must | 最好配 N1 具体案例。 |
| B2 | 降 common | 改成“这个场景最关键的三种失败是什么”，不要背五条。 |
| B3+B5 | 合并 common | “为什么选公积金单域作为第一验证场？” |
| B4 | 升 must 并重写 | 加 workflow/prompt/rejection-sampling SFT 替代方案。 |
| C1 | 保留 must | 只讲模块与信息流，不讲 schema 字段。 |
| C2+C3 | 合并 common | 明确 5 actions / 3 terminal actions。 |
| C4 | 移深挖 | 输出协议。 |
| C5 | 删除 | 不背 phase exit。 |
| C6 | 移深挖 | Task schema。 |
| D1 | 保留 must，修锚点 | 明确 v3 `R_state×R_terminal` 和统一公式。 |
| D2 | 降 common | 修正“路径不同不判错，但效率仍惩罚”。 |
| D3 | 升 must | 增加 synthetic-to-real、family/split isolation。 |
| D4 | 移深挖 | 数据合成专题。 |
| D5 | 移深挖或重写 | 若留开场，只答“sandbox 结构性拦截 + reward/telemetry”，不要说 precondition=hard-zero。 |
| D6 | 移深挖 | judge/NLI/JRA 专题。 |
| D7+F2 | 合并 common | 同时讲设计理由、5 项 gate 和残余泄漏/覆盖盲区。 |
| D8 | 改为 bonus | “讲一次最重要的设计修正”。 |
| E1+E4 | 合并 common | 以当前 4B ckpt720 为主，讲 parity、HV=0、约1.5×速度。 |
| E2 | 降 bonus并重写 | 讲 3 个关键约束 + ART 代价。 |
| E3 | 删除原题 | 换 N6 项目规模；不要使用 ¥450–750。 |
| F1 | 重写 common | 使用 current-harness 4B SFT：strict 0.801、HV 0、FWR 0.200；必要时说明旧 8B 报告已撤回。 |
| F2 | 并入 D7 | 不独立。 |
| F3 | 保留 must，补 caveat | +9.21pp 与 HV +0.2841pp 并列；全表面未证明。 |
| F4 | 保留 must，修数字 | 用全池复验数据，不用“38 条”代表总影响。 |
| F5 | 升 must，更新到 Wave1 后 | 2,880 已执行、B4 7/8、purchase×Esc 修复后待重跑/Wave2。 |
| F6 | 保留 common | validity、JRA、power 三项即可。 |
| G1 | 保留 common | 限定三项；seed pairing 不算预期方差收益。 |
| G2/G3 | 移深挖 | 治理与训练稳定性专题。 |
| H1 | 降 bonus并缩短 | framework 复用 vs domain plugin 新增。 |
| H2 | 保留 must并修措辞 | 不把当前失败归因 4B capacity；强调单域、synthetic、frozen sim、全表面未证。 |
| H3 | 与 F5 合并/更新 | 先修复后 probe/Wave2/B4，再谈 T4 GRPO。 |

---

# 最终判断

这份题集**不需要推倒重来知识内容，但需要推倒重来组织方式**。当前最大风险不是“漏题”，而是候选人在面试里被题集训练成按仓库章节背诵：讲了很多组件和 ADR，却没有在前两分钟清楚回答四件事：

1. 用户到底在办什么；
2. 为什么这里需要 Agentic RL；
3. 你本人真正做了什么；
4. 到今天为止，哪些结果已证明、哪些仍未证明。

如果只做一轮修改，我建议优先：

- 删除/下沉 12–15 个内部细节题；
- 新增具体案例、核心贡献、替代方案、因果归因、生产缺口；
- 修正 F1/F4/F5/H3 等时效错误；
- 把 F3 打磨成全套题集中最稳、最诚实的一张 must 卡。
