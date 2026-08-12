# agentic-gov 自述阶段问题题集第二轮审阅（GPT v2）

> 审阅日期：2026-08-11  
> 被审文件：`agentic-gov-self-intro-questions.md` v2  
> 对照文件：`review-expert-gpt-v1.md`  
> 事实基线：仓库最新有效 commit `85d4804`（P5 board 记录 18–21）；工作树另有 `phase6/plan030_p5_t3b_probe_analyze.py` 的未提交重构，但不改变本轮题集所引用的科学状态。

---

# 结论：CHANGES REQUIRED

v2 相比 v1 是一次**显著且方向正确的重构**：五组叙事线已经建立，绝大多数内部实现题已下沉，关键缺题均已补齐，F1/F4/F5/H3、D5、E4 等旧口径也大体完成更新。它已经不需要再次推倒重来。

但我仍不建议直接进入制卡，原因不是整体结构，而是有几项会被制成“错误答案卡”的事实问题：

1. 文件自报“32 题 / must 14”与实际内容不符；实际是 **34 题 / must 15 / common 14 / bonus 5**。
2. C9 把被 sandbox 拦下的 precondition 调用同时说成必然 `R_complete=0`，这是错误的：Agent 可以看到错误后恢复并最终完成，留下的必然影响只有 `P_failed_calls`；此外必须区分 sandbox `INVALID_FORMAT`（efficiency）与模型输出 envelope/parse/action-contract failure（hard-zero）。
3. E4 写“双臂同 checkpoint”，这是逻辑和事实错误：arm A 是 pre-RL SFT ckpt720，arm B 是 RL final，二者本来就必须是不同 policy checkpoint。当前 A/B 设计能证明“训练后 policy 在冻结评测口径下的效果”，但不能单独证明“GRPO 算法优于 filtered-SFT”；后者依赖可选 arm C。
4. C3 的“FWR 全库一度只有 30 条、2 个模板”混淆了两个数据口径：30 条是 main/adversarial 基础池中的 identity-impersonation FWR；完整 post-rescan Stream① 中 FWR 总计是 54 条。
5. D4 把 Wave1 缺口定性为“非模型能力”，结论过满；现有证据支持的是“更像 trigger allocation/distribution mismatch，而不是 cell-wide capacity wall”，修复假设仍待 80-episode 重测验证。

以上都是局部、可一次修完的问题，但在答案锚点型题集里属于阻塞项，因此判定为 **CHANGES REQUIRED**，而不是 APPROVE WITH NITS。

---

# 1. v1 关键意见逐条核对

## 1.1 结构重组为五组叙事线

**状态：已解决。**

v2 已从 A–H 的项目文档目录，改为：

1. 项目与本人；
2. 为什么这样做；
3. 方案全貌；
4. 结果与复盘；
5. 边界、选型与价值。

这比 v1 明显更符合真实面试路径：先建立用户与项目心智模型，再讲选择、闭环、结果和边界。D 组把 SFT 基线、RL 结果、误判、当前状态、重做反思放到一条线上，也解决了 v1 所说“结果需要面试官自行拼接”的问题。

**小修建议：**A1 的来源不应只指向早期《最终研究方案》。A1 里“窄面正结果、全表面仍在验证”是 2026-07/08 的当前结论，建议同时引用 `adr-phase6-rl-effectiveness-verdict.md`、Note 031 和 P5 board，而不是让早期蓝图看起来像当前结果的权威来源。

## 1.2 删除/下沉内部细节题

**状态：大部分解决。**

已正确下沉：

- 思考链/输出协议；
- Canonical Task 字段清单；
- contrast pair 构造；
- mandatory disclosure 的 NLI/JRA 细节；
- grad guard / async k=1 稳定性治理；
- ADR 偏离管理。

也已删除原来的 phase/exit 目录背诵题。这是本轮最成功的改动之一。

仍有少量阶段越界：

- **C5 golden_final_state / R_exec**：更像 reward 深挖的第一层追问；可从 opening core 下沉。
- **C9 subject-scoped precondition 与错误码分类**：问题本身真实，但答案必须进入 error taxonomy，已经超出“模块级广度”；建议下沉到 sandbox 深挖。
- **E7 SFT/RL 数据同源细节**：是数据泄漏/信号饥饿深挖题。
- **E9 skeleton/lexical pack/R4 扫描**：是 simulator/data overfitting 深挖题。
- **E11 ART 约束和 serving 坑**：已是框架选型深挖。

这些内容可以保留在总题库，但不应再计入 opening core。

## 1.3 新增案例题

**状态：已解决。**

A2 是有效的真实面试问题，且控制在 5–6 个节点。租房 happy path 的工具顺序与源码一致：`verify_identity → check_eligibility → submit_rent_withdrawal`，见：

- `src/agentic_gov/task_factory/golden.py:188+`
- `src/agentic_gov/task_types/housing_fund/withdrawal_for_rent.py`

**小修：**“告知到账时间”最好改成“告知处理时效/结果或下一步”。Policy card 强制 disclosure 是 `processing_time` 和 `result_or_next_step`，任务状态是 submitted/approved，不应默认承诺已经到账。

## 1.4 新增核心贡献题

**状态：已解决。**

A4 已要求候选人做优先级判断，而不是罗列模块。“终态可验证、终局可区分、可做 held-out 统计检验”是比“用了 GRPO”更有区分度的主张。

**小修：**题目问“一个点”，锚点却同时推荐“无效任务根因分析 + S1 正结果”。可以将其组织成一个完整点：**“构建并审计可信的 RL 测量面”**，无效任务与 S1 分别作为反例和正例，而不是展示两个项目贡献。

## 1.5 新增替代方案论证题

**状态：已解决。**

B4 已覆盖 workflow、prompt engineering、rejection-sampling SFT，并明确：

- 强规则放 sandbox；
- policy 学多轮非确定决策；
- rejection-sampling SFT 是合理基线；
- 当前只在 held-out Escalate 面有 RL 正证据。

这比 v1 单向论证“为什么 SFT 不够”成熟得多。

**小修：**“P5 评测已设计 arm C 对照”应明确 arm C 是 **optional + descriptive only**，不得改变 PASS/FAIL，见 `docs/decisions/adr-phase6-p5-t0-scope-and-gates-20260806.md` §7。

## 1.6 新增因果归因题

**状态：题已新增，但锚点有阻塞性错误。**

E4 的问题非常好，但答案中的“双臂同 checkpoint”必须修正。详见第 3.6 节。

## 1.7 新增生产缺口题

**状态：已解决。**

E6 覆盖 simulator-to-real、真实政策数据、版本更新、隐私合规、人工兜底、线上监控和跨事项流程，粒度合适，保留 `common` 合理。

## 1.8 F1 改成 4B 当前口径

**状态：已解决，事实准确。**

D1 与 `handoff/handoff-phase6-4b-agent-sft-vs-8b-eval-comparison-20260629.md` §9.3–9.5 一致：

- 4B overall strict 0.801；
- HV 0.000；
- account balance 1.000；rent 0.817；purchase 0.765；loan 0.613；
- Escalate 0.935；Finish 0.845；FWR 0.200；
- 8B current-harness recheck 0.776；
- 旧 8B 0.622 / HV 0.045 报告已判 stale/contaminated。

这是 v1 的关键时效问题，v2 已完整修复。

## 1.9 F4 无效任务数字修正

**状态：已解决，主数字准确。**

D3 使用的是 2026-08-06 T1 机械复验口径：

- bridge 24/24 invalid；
- hard_train_v2 72/300；
- pool_390 42/390；
- hard_val_v1 4/180；
- Range-80 0/80 invalid；
- exact-hash retirement 247 historical task rows。

来源：Note 030 的 D-1/D-3/D-10 勘误层，以及 P5 board 2026-08-06 执行记录。数字没有继续沿用 Note 031 早期局部“38 条”口径，修正到位。

**小修：**247 并不是把上面四个池的 invalid 简单相加；它是跨历史源按 exact hash 形成的 retirement 层。口述时应避免让面试官误以为这些数字可直接相加。

## 1.10 F5/H3 时效更新

**状态：已解决，但定性需收窄。**

D4 已正确更新为：

- Wave1 已执行 2,880 episodes；
- 3h13m、约 6.4 GPU-h；
- 0 judge infra failure；
- B4 初判 7/8；
- 唯一缺口 `withdrawal_for_purchase × Escalate`；
- owner-approved repair 已落地；
- 下一步是 80 episodes 修复重测 + Wave2 11,520 + merged B4；
- T4/T5 均仍待后续授权。

这些与 `p5_t3b_w10_wave1_report.md`、`p5_t3b_w12_repin_report.md` 和 board 记录 18–21 一致。

但“数据配比错误非模型能力”需要改为证据强度更合适的表达，详见第 3.4 节。

## 1.11 D5 hard violation 分类修正

**状态：只解决了一半。**

v2 已正确移除了“PRECONDITION_NOT_MET = hard violation”的旧错误，但 C9 又引入两个新问题：

1. 被拦调用不必然令最终 `R_complete=0`；Agent 可恢复。
2. “格式失败”必须区分 sandbox 参数格式错误与模型输出协议/解析失败。

因此该项仍属于必须修改，详见第 3.5 节。

## 1.12 E4 实测 1.5×

**状态：已解决。**

E1 已使用 handoff 的真实结论：4B 约 1.5× tail speedup，而不是理论 2×；采纳理由是 parity + safety floor + any measured speedup。4B 0.801 vs 8B 0.776、HV 均 0 也准确。

**小修：**“trainer/推理分卡，simulator 独立 HTTP vLLM 服务”是阶段性运行拓扑，不是所有 P5 probe/T4 都必然固定。建议改成“2×4090，具体卡位随训练/probe packet 冻结”，避免把历史拓扑说成系统不变量。

---

# 2. 指定事实抽查结果

## 2.1 D1：4B 数字

**结论：PASS。**

逐项与 current-harness apples-to-apples handoff 一致。无需修改数值。

## 2.2 D3：无效任务口径

**结论：PASS WITH NIT。**

五池数字和 247 exact-hash retirement 均可回源。唯一注意点是不同数字存在重叠/不同层级，不要口述成简单加总。

## 2.3 D4：Wave1/B4 状态

**结论：事实状态 PASS，因果定性需改。**

已执行/待执行边界准确。需要把：

> “根因是 L1 trigger 数据配比……而非模型能力”

改为：

> “现有证据更支持 trigger allocation/distribution mismatch，而不是该 cell 的整体能力墙：manual L1 全落 SFT 零供给类，L2/L3 又饱和，且历史 frozen pilot 有 10/12 learnable；但修复假设仍须由新 L1 的 80-episode 重测确认。”

另外：

> “manual→frozen 70 swaps”

不够精确。最新证据是 **70 rows replaced**，其中 48 个 task_id 内容变化、22 个新 task_id；新 quota 实现为 pur×Esc train L1 45 条 frozen。建议写“70 行替换/重生成以实现新配额”，不要把 70 行全称作 manual→frozen swaps。

## 2.4 C4：Reward v3 公式

**结论：PASS。**

源码 `src/agentic_gov/reward/aggregate.py` 当前实现确为：

```text
if hard_violation:
    R_total = 0
else:
    R_total = 0.65 * R_complete
            + 0.35 * R_disclosure
            - 0.10 * P_turns
            - 0.10 * P_failed_calls

R_complete = R_state * R_terminal
```

`R_escalate` 在 v3 中仅保留 telemetry，不进入训练总和。C4 事实准确。

## 2.5 C9：hard violation 分类

**结论：FAIL，必须修改。**

权威分类见 `research-proposal/adr-sandbox-error-hard-vs-efficiency.md` 与运行代码：

### Hard violation / hard-zero

- `UNKNOWN_TOOL`
- `TOOL_NOT_ALLOWED`
- 模型输出 envelope、parse、action-contract failure（runner 以 hard violation 结束，reward 另标 `format_failure`）

### Efficiency，不终止，可恢复

- `PRECONDITION_NOT_MET`
- `MISSING_REQUIRED_ARG`
- sandbox 参数层 `INVALID_FORMAT`

### 正常业务拒绝，不计 failed-call penalty

- `ACCOUNT_FROZEN`
- `ELIGIBILITY_FAILED`
- `CONTRACT_NOT_FOUND`
- `BANK_ACCOUNT_NOT_LINKED`
- 等业务 error code

C9 当前两处错误：

1. **“precondition 被拦 → R_complete=0”不成立。**Runner 允许 Agent 观察错误后继续；若后来核身、重试并正确完成，最终 state 和 terminal 均可正确，`R_complete` 仍可为 1，只是 `P_failed_calls > 0`。
2. **“格式失败类”过宽。**sandbox 的 `INVALID_FORMAT` 是 efficiency；模型输出 envelope/parse/action-contract failure 才是 hard-zero。

建议把 C9 锚点改成：

> “未核身写入先被 subject-scoped precondition 拦下，不落库；该次调用计入 `P_failed_calls`，episode 继续，Agent 若恢复成功仍可得到 `R_complete=1`。hard violation 是 UNKNOWN_TOOL/TOOL_NOT_ALLOWED，以及模型输出 envelope/parse/action-contract failure；注意 sandbox 参数 `INVALID_FORMAT` 属可恢复 efficiency error。”

若不想在开场讲这套 taxonomy，最佳处理是把 C9 下沉到 sandbox 深挖。

---

# 3. 额外发现的事实与表述问题

## 3.1 题数与 priority 统计错误——必须修改

文件正文实际题数是：

- A：4
- B：5
- C：9
- D：5
- E：11
- **合计 34**

实际 priority：

- **must 15**
- **common 14**
- **bonus 5**

而文件写的是“32 / 14 / 12 / 6”。这会直接污染后续制卡 metadata、抽题配额和覆盖统计，必须在制卡前修正。

建议不要只改统计数字，而应结合第 4 节先做一次下沉，再重算最终 core/overflow 数量。

## 3.2 C3 的 FWR “30 条全库”口径——必须修改

当前锚点：

> “FWR 全库一度只有 30 条、2 个模板”

回源后应区分：

- Note 030 的 **30 条**：Phase 2 基础 SFT pool 3806 行中，FWR 30 条，全部是 identity impersonation，且只有两个字面模板。
- Note 031 的 **54 条**：完整 post-rescan Stream① 3996 行中的 FWR 总量，约 1.3%；除基础 30 条外还包含 contrast 等行。

因此“全库 30 条”不准确。建议写：

> “基础 main/adversarial SFT pool 里只有 30 条 FWR，且全是 identity-impersonation、两个字面模板；把 contrast/naturalized 等完整 post-rescan Stream① 都算上，FWR 总量是 54/3996，仍只有约 1.3%。”

这样既保留“信号饥饿”的事实，也不混淆数据口径。

## 3.3 C7 的算法名需要更精确——建议制卡前修改

“为什么 GRPO”这个问题应保留，但当前锚点容易让候选人在 RL 面试里说成“项目跑的是 vanilla GRPO”。仓库自己的 ADR 已明确推荐对外表述：

> **GRPO-style group-relative advantages + ART CISPO loss**，不是 vanilla GRPO/PPO。

来源：`research-proposal/adr-phase6-rollout-throughput-4b-adoption-and-stop-infra-optimization.md` D6。

建议 C7 增加一句：

> “算法层是同 task K=8 的 group-relative advantage；ART 实际优化 loss 是 token-level CISPO，所以准确说法是 GRPO-style advantages + CISPO loss，不是 vanilla GRPO。”

另外，strict vs async 的 2×慢、44% drop 是**训练 orchestration/serving 对照**，不是 GRPO vs PPO/DPO 的算法选择证据。可以作为工程加分项，但不要拿它直接回答算法为什么选 GRPO。

## 3.4 D4 对 Wave1 根因的确定性过强——必须修改

见第 2.3 节。核心要求：把“已证明非模型能力”降为“现有证据支持数据分配假设，待修复重测确认”。

## 3.5 C8 混写已执行与计划——建议修改

C8 当前说：

> “此后有 JRA 运行时证明 + R3 差分审计进训练 checkpoint”

实际状态：

- JRA 已实现并在 A2/Wave1 实际运行；
- R3 差分审计被预注册到 T4 至少两个 checkpoint，但 T4 尚未授权/执行。

建议改成：

> “JRA 已落地并用于后续 probe；R3 差分审计已预注册为 T4 至少两个 checkpoint 的必做项，但尚未执行。”

同时，“信息源独立 → 单信号被 hack 只伤一项”应收窄成“降低单点 hack 风险并便于诊断”，不能表达成绝对隔离保证。

## 3.6 E4“双臂同 checkpoint”与因果主张——必须修改

这是除 C9 外最重要的事实问题。

当前锚点：

> “双臂同 checkpoint 同 judge……”

权威 P5 设计是：

- arm A = pre-RL SFT ckpt720；
- arm B = RL final；
- 两臂使用同一 final holdout、同 judge/JRA、同 simulator/runtime config、同评测采样和 counterbalance；
- arm C = optional rejection-sampling SFT，descriptive only。

所以正确表达应是：

> “A/B policy checkpoint 不同，其他评测条件冻结一致：A 固定为 pre-RL SFT ckpt720，B 是按预注册规则选出的 RL checkpoint；两臂同 holdout、同 judge/JRA、同 simulator 和采样口径。”

此外，问题问“提升来自 RL 本身”，需要诚实区分两种因果强度：

1. **A/B 能回答：**经过 T4 训练后的 policy 是否在冻结评测面优于起点。
2. **A/B 不能单独回答：**提升是否特异地来自 policy-gradient/GRPO，而不是相同成功轨迹做 filtered SFT 也能得到。
3. **arm C 才能补充第二问，且它当前是 optional、descriptive only。**若 arm C 不执行，面试回答必须承认算法特异性归因未被完整识别。

建议把 E4 锚点重写为上述三层，而不是宣称现有双臂已“证明来自 RL 本身”。

## 3.7 E5 related work 当前不够可制卡——建议下沉并先补研究

E5 自己已标注“仓库无系统 related-work survey”，但仍列为 `common`。这会鼓励制出一张依据不足的答案卡。

另外，“复用 GRPO 本体（DeepSeek-R1 路线）”不够精确：本项目实际是 group-relative advantages + CISPO loss；“DAPO-style filtering”更多是数据动态过滤/零方差组处理的借鉴，不应说成完整复现 DAPO。

建议：

- 从 opening deck 下沉到 RL theory/related-work deck；
- 在制卡前单独回 primary papers/source code 做一次 related-work note；
- 准备对 DeepSeek-R1/GRPO、DAPO dynamic sampling、CISPO 的明确异同，再生成卡片。

---

# 4. 规模评估：34 题是否适合自述阶段

## 4.1 判断

**作为“所有可能广度追问的来源池”，34 题可以接受；作为“开场自述阶段直接制成同层卡片的核心题集”，不可接受。**

原因：

1. 实际是 34 题而非 32，且 must 已达 15。
2. A1–D4 已经形成一套完整面试主线；E5–E11 中多数是条件式追问，不应和核心问题同层抽取。
3. 制卡后如果所有卡片拥有近似学习权重，候选人仍会回到 v1 的问题：花大量时间背术语和历史工程细节，而不是练习前两分钟的主叙事。

建议不是删掉所有内容，而是显式分成：

- **Opening Core：20–22 题**
- **Opening Overflow / Follow-up：8–12 题**
- **Deep Dive：其余机制题**

这样既保留覆盖，又符合“自述阶段”的认知负荷。

## 4.2 建议下沉或删除的题

### 必须从 opening core 下沉

| 题号 | 建议去向 | 理由 |
|---|---|---|
| C5 | reward 深挖 | golden state / R_exec 属 outcome verifier 细节。 |
| C9 | sandbox 深挖 | 必须讲 error taxonomy，已超出模块广度。 |
| E7 | 数据深挖 | 14/16 FWR 同源是信号饥饿/数据泄漏追问。 |
| E9 | simulator/data overfitting 深挖 | skeleton/lexical pack/R4 是第二层机制。 |
| E11 | RL 工程深挖 | ART mask/serving/dual-GPU trade-off。 |
| E5 | related-work 深挖 | 需要单独 primary-source research，当前不宜制答案卡。 |

### 建议合并/删除独立卡

| 题号 | 处理 | 理由 |
|---|---|---|
| B2 | 并入 B1/A2 | 场景定义后自然追问失败模式，不需独立核心卡。 |
| B5 | 并入 B3 或 C1 | policy card/sandbox/golden state 可作为“为什么该域可验证”的三点。 |
| E10 | 并入 D3/D5 | “方向修正”与“最大误判”“如果重做”高度重合。 |

只做以上处理，核心层即可从 34 降到约 25；再将部分 bonus 明确标为 overflow，就能把实际高频 core 控制在 20–22。

## 4.3 Must 数量

15 个 must 对“总候选池”不算灾难，但对 opening core 仍偏多。建议下调：

- **C8 reward hacking：must → common**。RL 面试高频，但普通大模型应用面试不一定开场就问。
- **C7 为什么 GRPO：must → common 或按岗位动态升 must**。RL 研究岗为 must，应用/Agent 岗为 common。
- **A4 核心贡献：可保留 must**，但与 A1 共用答案素材。

建议最终静态 must 约 12–13；岗位配置再动态提升 C7/C8/E4。

---

# 5. 必须修改项清单

以下修改完成后，题集可进入一次轻量复核，无需第三轮全面重审。

## M1. 修正题数与 priority 统计

当前实际是 34 / 15 / 14 / 5。先完成下沉/合并，再机械重算，确保文件统计与真实表格一致。

## M2. 修正 C3 FWR 数据口径

把“全库 30”改为：基础 main/adversarial FWR 30 条、两个 identity 模板；完整 post-rescan Stream① FWR 54/3996。

## M3. 修正 C9 precondition 与 hard-violation 分类

必须明确：

- precondition failure 可恢复，不必然 `R_complete=0`；
- 必然计入的是 `P_failed_calls`；
- sandbox `INVALID_FORMAT` 是 efficiency；
- envelope/parse/action-contract failure 是 hard-zero。

或者直接将 C9 下沉，不在开场卡里展开 taxonomy。

## M4. 收窄 D4 的根因结论与修复数字

- “非模型能力”改为“证据支持数据分配假设，待 80-episode rerun 确认”；
- “70 swaps”改为“70 rows replaced/re-generated；新 L1 45 frozen tasks”。

## M5. 修正 E4 对照臂与因果识别

- 删除“双臂同 checkpoint”；
- 写清 A=ckpt720、B=RL final，其他评测条件一致；
- 区分“RL 后 policy effect”与“GRPO 相对 filtered-SFT 的算法特异性 effect”；
- arm C 是 optional/descriptive，未执行时不能声称第二层因果已证明。

## M6. 给 C7 补充真实算法口径

写成“GRPO-style group-relative advantages + ART token-level CISPO loss”，避免把实际实现说成 vanilla GRPO。strict/async 对照只能作为工程选择素材。

---

# 6. 不阻塞的小修（Nits）

1. **A1 来源更新**：早期最终方案 + 最新 verdict/Note/P5 board 并列。
2. **A2 用词**：“到账时间”改为“处理时效/结果或下一步”。
3. **A4 单点化**：把无效任务与 S1 组织为“可信测量面”一个贡献。
4. **B4 arm C**：标明 optional/descriptive only。
5. **C8 执行状态**：JRA 已执行；R3 仅预注册、尚未执行。
6. **C8 防 hacking 语气**：“只伤一项”改为“降低单点风险、便于定位”。
7. **E1 拓扑**：2×4090 是当前硬件；卡位随 packet，不必说成固定系统结构。
8. **D3 数字关系**：提醒 247 retirement 不是五池 invalid 的简单加总。
9. **E5**：若保留，降为 bonus 并在 related-work note 完成后再制卡。
10. **优先级动态化**：C7/C8/E4 可按 RL 研究岗升 must，而不是所有岗位静态 must。

---

# 7. 最终评价

v2 已经解决了 v1 的绝大多数结构性问题：它现在有明确的用户案例、个人贡献、替代方案、算法选择、可信测量、真实结果、失败复盘、当前状态和生产边界，面试叙事线也基本成立。

剩余问题不需要再次重写框架，主要是**制卡前的事实清洁与层级收口**。其中 C9 和 E4 会直接教给候选人错误的 reward/因果表述；C3、D4、C7 则会在资深 RL 面试官追问时暴露口径不严；题数统计错误会污染制卡流程。因此本轮结论为：

> **CHANGES REQUIRED — 做一轮局部 v2.1 修正后即可进入制卡，不需要重新设计题集。**
