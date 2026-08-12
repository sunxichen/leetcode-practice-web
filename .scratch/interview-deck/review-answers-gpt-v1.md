# agentic-gov 面试回答稿独立审阅（GPT v1）

> 审阅对象：`agentic-gov-self-intro-answers.md`（34 题）  
> 对照题集：`agentic-gov-self-intro-questions.md`（v3）  
> 审阅日期：2026-08-11  
> 角色：高级 LLM / RL 面试官 + 研究审稿人  
> 结论：**CHANGES REQUIRED**

---

## 1. 总结与判定

这版回答稿的总体质量高：叙事清楚，能主动区分窄面正结果与全表面未证明，核心指标大多准确，reward、sandbox、对照臂与因果边界也基本沿用了 v3 的正确口径。34 题均没有明显超出 2 分钟的答案。

但当前不能直接批准制卡，原因不是结构问题，而是 **5 个局部事实错误/过时点会被卡片固化**：

1. **C3** 没有说出 v3 要求的完整 FWR 双口径：基础池 30 条不等于完整 Stream① 的 54/3996。
2. **C6** 把“每个终局每步出现”说成已执行机制；它是未来 P5-T4 的冻结要求，C0→C15 实际只证明全程累计 58/31/31，并非每步三类齐全。
3. **C7** 把 T2 故障简化成“永远未命中的空实现”；实际是 `_NoHitChecker + adjudicator=None`，随后仍有关键词 fallback。23%→77% 是同一 384 条 Finish episode 在修正 local-NLI 链下的 strict 重算，不是人工真值成功率。
4. **D4 / E2** 已被当日最新执行状态推翻：purchase×Escalate L1 的 80-episode 修复重测已经完成且 10/10 任务均 8/8 饱和；Wave2 11,520 已启动。不能继续说重测“待执行”或把完整 probe 都列为计划。
5. **D1** 说 Finish 与 Escalate “都在 85% 以上”不精确；Finish 是 84.5%，Escalate 是 93.5%。

这些都是有界修改，不需要重写整套回答。修正后可进入制卡，无需重新设计问题结构。

---

## 2. 证据截止点与层级

### 2.1 截止点

- committed HEAD：`85d4804`
- worktree：
  - `M phase6/plan030_p5_t3b_probe_analyze.py`
  - `?? phase6/handoff/p5_t3b_w10_r2_wave2_report.md`
- 当日未提交执行报告修改时间：2026-08-11 22:09:34

### 2.2 证据解释

本审阅同时报告两层状态：

1. **已提交科学基线**：以 `85d4804`、冻结 artifact、ADR、执行报告为主。
2. **当日实时执行状态**：未提交的 `p5_t3b_w10_r2_wave2_report.md` 是已发生的执行事实，但尚未进入 git 治理历史；因此可表述为“当日 worker 报告显示已执行/运行中”，不可表述为已完成最终判定。

未提交的 `plan030_p5_t3b_probe_analyze.py` 重构不改变科学状态。

---

## 3. 必须修改项

### M1 — C3 补齐 FWR 双口径

**当前问题**

回答只说：

> “明确拒绝类样本在基础池里一度只有 30 条、全是身份冒用、两个模板”

这句话本身对基础 main/adversarial 池成立，但容易让听者误以为完整发布语料也只有 30 条 FWR。v3 已明确要求分层口径：

- 基础 identity-impersonation FWR 信号：30 条、2 个字面模板；
- 完整 post-rescan Stream①：54/3996，约 1.3%；
- aligned 4B 实际训练：3840 条。

**建议替换**

> “完整 post-rescan Stream① 是 3996 条，其中 FWR 共 54 条、约 1.3%；更关键的是，基础 main/adversarial 池里真正承担身份冒用拒绝信号的只有 30 条，而且只有两个字面模板。4B 对齐训练实际使用 3840 条。”

**证据**

- `handoff/handoff-phase2-to-phase3-20260601.md`
- `docs/experiment-notes/030-phase6-rl-data-problem-map-and-remediation-plan-20260726.md` P2
- v3 题集 C3 锚点

---

### M2 — C6 不得把未来的每步终局覆盖写成既有训练事实

**当前问题**

> “外加分层采样保证每个终局类每步都出现。”

该机制是 P5-T4 长程训练的计划/冻结要求，T4 尚未执行。已经执行的 C0→C15 是自然循环式调度；形式化累计曝光为：

- Finish 58 groups
- Escalate 31 groups
- FinishWithRefusal 31 groups

这说明三类终局在整段训练中都出现，但不能推出“每一步三类都出现”。

**建议替换**

> “已执行的 C0→C15 只保证整段累计覆盖三类终局，实际曝光是 58/31/31，并不是每一步三类都齐。针对未来 P5 长程训练，我把‘每个终局每步都出现’预注册成分层批约束，目的是防止动作先验漂移；这项机制尚未进入已执行结果。”

保留前半段 `K=8`、组内相对优势、2–6/8 learnability 筛选与 async 工程对照即可。

**证据**

- `phase6/sr6_c0_range80_manifest_loader.py`：`FORMAL_C0_C15_ACTIONS = 58/31/31`
- `phase6/tickets/tickets-phase6-plan030-stage-p5-20260805.md`：T4 “分层批保证每终局每步出现”
- `docs/experiment-notes/024-phase6-strict-onpolicy-cispo-vs-grpo-and-async-drift.md`

---

### M3 — C7 精确描述 NoHitChecker 事故与 23%→77% 的分母

**当前问题**

> “实际是个永远返回‘未命中’的空实现，修正后该类任务的真实成功率从 23% 变成 77%。”

有两处过强：

1. `_NoHitChecker` 对 NLI hypothesis 恒 miss，但完整 disclosure resolver 仍可能通过关键词 fallback 命中；rent Finish 正是因此没有全部死掉。
2. 23%→77% 是 **Finish 层 384 episodes** 的 strict：89/384→294/384；它是修正 judge 链后的重算值，不宜叫“真实成功率”或人工真值。

**建议替换**

> “T2 receipt 声称使用 hybrid judge，但 executor 实际传入 `_NoHitChecker`、`nli_bundle=None`、`adjudicator=None`，所以 local NLI 恒 miss，只剩少量关键词 fallback。把同一批 384 条 Finish episode 接回真实 local-NLI 链后，strict 从 89/384，也就是 23%，重算为 294/384，也就是 77%。这证明原来的 Finish 死池主要是 judge 伪影，而不是模型全不会。之后我落地了 JRA 运行时证明；更强的 R3 差分审计仍只是 T4 预注册项。”

**证据**

- `phase6/plan030_p5_t2_executor.py:699-701`
- `phase6/handoff/p5_t3b_final_plan_20260809.md` §1
- `phase6/handoff/p5_t3b_w1_jra_report.md`：Finish 89/384→294/384
- `phase6/tickets/tickets-phase6-plan030-stage-p5-20260805.md` 记录 8/17

---

### M4 — D4 更新为 80 重测已完成、Wave2 运行中

**当前问题**

回答仍说：

> “修复假设还要等 80 个 episode 的重测确认……修复代码已经落码。”

当日最新 worker 报告已经前移：

- purchase×Escalate L1 修复重测 80/80 written、0 rejected；
- 10/10 任务均 strict 8/8，0 dead、0 learnable、10 saturated；
- 这确认了修复后的 frozen trigger 可被 ckpt720 解决，但 **没有命中字面 2–6/8 learnability 条件**，不能把 B4 宣布为通过；
- Wave2 11,520 已启动，只能说 running，不能说完成；
- T4 长程 GRPO 和 T5 最终评测仍未开始。

**建议替换 D4 的现状段**

> “截至 8 月 11 日晚，原 Wave1 的 2880 episode 和 7/8 B4 结果已经完成；随后我完成了 purchase×Escalate L1 的 80-episode 修复重测，80/80 写入、10 个任务全部 8/8。它证明原来的死区主要来自 manual trigger 配额错位，修复后的 frozen 任务模型能解；但它又从全败直接跳到全饱和，没有落进 2–6/8，因此字面 B4 learnability 门还不能宣布通过。当前 Wave2 11,520 已启动，合并终判仍待完成。长程 GRPO 和最终 1000-task held-out 评测都还没开始。”

**证据**

- committed：`phase6/handoff/p5_t3b_w10_wave1_report.md`
- committed：`phase6/handoff/p5_t3b_w12_repin_report.md`
- 当日未提交 live report：`phase6/handoff/p5_t3b_w10_r2_wave2_report.md`

---

### M5 — E2 更新规模账，区分历史 Wave1、修复重测与运行中 Wave2

**当前问题**

> “计划中的量：probe 全量 14400 episode……”

原始全 train K8 schedule 确实是 14,400，但现在不能把它整体列为“计划”：Wave1 2,880 已执行，额外修复重测 80 已执行，r2 Wave2 11,520 已启动。

**建议替换**

> “已执行的稳定口径包括：SFT 发布语料 3996、实际训练 3840；P5 冻结任务 3100；原 Wave1 2880 episode，约 6.4 GPU 小时；另外 purchase×Escalate 修复重测 80 episode 已完成。当前 11,520-episode Wave2 正在运行，尚不能报完成数。仍属未来计划的是 T4 约 32,000 rollout 和 T5 16,000 episode。”

不要在没有最终 worker ledger 的情况下自行把运行中 Wave2 的局部 written 数加入总账。

---

### M6 — D1 修正 84.5% 的表述

**当前问题**

> “办结和转人工都在 85% 以上”

当前 harness 数值为：

- Finish 0.845
- Escalate 0.935
- FWR 0.200

84.5% 可四舍五入说“约 85%”，但不是“85% 以上”。

**建议替换**

> “按终局看，Finish 是 84.5%，Escalate 是 93.5%，最弱的 FWR 只有 20%。”

**证据**

- `handoff/handoff-phase6-4b-agent-sft-vs-8b-eval-comparison-20260629.md`

---

## 4. 建议修改但不单独阻塞的 nits

### N1 — A1 同步一句实时状态

A1 的“正在……准备长程训练”不算严格错误，但以当日最新状态，建议改成：

> “当前有效任务已冻结，learnability probe 仍在收尾；修复重测已完成、Wave2 正在运行，长程训练尚未开始。”

这样与 D4/E2 不冲突，又不会让 90 秒自述陷入执行流水账。

### N2 — A2 不要把政策时效改写成“反馈”

仓库示例与 PRD 支持“预计 3 个工作日处理完成/到账”这一 disclosure concept，但题集要求避免把 submitted 说成已到账。当前“预计三个工作日反馈”不是主要证据里的原口径。更稳妥的说法是：

> “申请已提交，预计三个工作日处理完成，请留意系统或短信通知。”

或不锁死数值，只说“告知任务规定的预计处理时间和下一步”。

### N3 — A3 不要把全部延期几乎归为无效任务

“计划和实际的差基本就是发现并修复无效任务”有记忆点，但工程证据还显示数据合成、LoRA serving、训练稳定性、judge 接线和治理成本也占用了大量周期。建议收窄为：

> “最大的单一延期因素，是到 RL 阶段才暴露的测量面与无效任务问题。”

### N4 — E1 澄清“零语义风险”指训练语义，不指模型能力

从 8B 换 4B 显然有能力风险。建议说：

> “它不改变 rollout/reward/优化协议，工程语义风险低，但有模型能力风险，所以必须先做 aligned SFT 和同 harness gate。”

另外，`~1.5×` 是 speed probe / tail 口径；后续 non-zero LoRA serving 曾抵消尺寸优势，避免暗示所有运行都稳定快 1.5×。

### N5 — F3 把“借鉴 DAPO”与“已经动态执行”分开

DeepSeek-R1 使用 GRPO 路线、DAPO 包含 dynamic sampling，这两个 related-work 方向成立；但本项目当前真正执行的是 learnability probe/筛选，P5-T4 的持续 resampling 仍是计划。建议说：

> “数据筛选思想与 DAPO dynamic sampling 同向；目前已执行的是 K8 learnability 筛选，训练中的动态补采/重筛仍是 T4 计划，不是已完成结果。”

外部 primary source：

- DeepSeek-R1：<https://arxiv.org/abs/2501.12948>
- DAPO：<https://arxiv.org/abs/2503.14476>

### N6 — 短答案需要补到真实 1 分钟，而不是机械凑字数

没有任何答案明显超过 2 分钟；最长 A1 约 442 个非空白字符，仍可控。问题在另一端：**17/34 低于稿头自定的 250 字下限**，其中 E5、F4、F5、F6 尤其短，通常只有约 30–50 秒。

建议只给高频核心题补一个“证据/边界/落点”句，不必强行把全部 bonus 扩到 500 字：

- E5：补“上线前最低验证路径”，例如 shadow mode、小流量人工复核、政策回放测试。
- F4：补“为什么同源会削弱 RL 新信息量，以及 P5 如何按 family 隔离”。
- F5：补“这些门只能减少 simulator exploitation，不能证明真实用户外推”。
- F6：补“修正前后一个具体 episode 的得分变化”。

---

## 5. 逐题审阅

说明：`PASS` = 可直接保留；`NIT` = 建议精修；`CHANGE` = 制卡前必须修改。

| 题号 | 判定 | 事实与机制核验 | 1–2 分钟可讲性 / 修改要求 |
|---|---|---|---|
| A1 | NIT | 场景、模块、个人贡献、80% SFT、Escalate +9.2pp、全表面未证明均正确；当前 probe 状态略旧。 | 结构优秀，约 90 秒；末句同步“80 重测完成、Wave2 运行中、长训未开始”。 |
| A2 | NIT | verify→eligibility→submit、frozen→Escalate、observable impersonation→FWR 均成立。固定“三工作日反馈”不是主要 policy 原口径。 | 可讲；把“反馈”改为“处理完成/留意通知”，继续避免声称已到账。 |
| A3 | NIT | 独立项目与 4 月至今约四个月来自用户事实；原计划约 8 周有文档依据。 | 约 45–60 秒；将“延期基本全是无效任务”收窄为“最大单一因素”。 |
| A4 | PASS | 两类无效任务与 held-out +9.21pp 的一反一正均有证据。 | 聚焦一个贡献，适合开场。 |
| B1 | PASS | 失败模式被正确限定为项目目标模式，没有伪装成完备 benchmark。 | 简洁，可在追问时举一例。 |
| B2 | PASS | 单域四事项、policy card、precondition、golden state 三层强约束准确。 | 约 1 分钟，信息密度合适。 |
| B3 | PASS | 规则交 sandbox、策略交模型、outcome 可验证、arm C optional/descriptive 均正确。 | 逻辑完整，约 1–1.5 分钟。 |
| C1 | PASS | 四模块与闭环正确；simulator 是冻结环境，reward 为终态+hybrid disclosure。 | 可讲；“所有业务逻辑均插件注册”可保留。 |
| C2 | PASS | 五动作及三个合法终局、policy version 硬校验、12 cells 均准确。 | 约 1 分钟。 |
| C3 | CHANGE | 管线和 3996/3840、247 retired 正确；只报 30 条会丢失完整 Stream① 54/3996 的必要口径。 | 按 M1 补齐 30 vs 54/3996。 |
| C4 | PASS | v3 精确公式、terminal gating、hard-zero、子项信息源独立均与代码一致。 | 可讲；最好口头明确惩罚项是归一化 `P_turns/P_failed_calls`。 |
| C5 | PASS | 98.9/98.1/91.0/0/0 全部准确；1.9% 为残余泄漏。 | 略短但足够。 |
| C6 | CHANGE | GRPO-style K8 + ART token-level CISPO、zero variance、async 2×慢/44% discard 均准确；“每终局每步出现”尚未执行。 | 按 M2 区分 C0→C15 已执行累计覆盖与 P5-T4 计划约束。 |
| C7 | CHANGE | 防线总框架正确；NoHit 故障机制与 23→77 的语义被过度简化。 | 按 M3 写出 `_NoHitChecker + no adjudicator + keyword fallback` 与 89/384→294/384。 |
| D1 | CHANGE | 4B 0.801/HV0、事项分桶、FWR 0.200、8B recheck 0.776 均正确。 | 把“Finish/Escalate 都在 85%以上”改为 84.5%/93.5%。 |
| D2 | PASS | 53.9→61.7、69.74→78.95、+9.21pp、HV 3/1408→7/1408、全表面未证明均正确。 | 四层结构非常适合面试；保留安全 caveat。 |
| D3 | PASS | bridge 24/24、hard_train 72/300、两类根因、247 exact-hash retired、不加总均准确。 | 约 1–1.5 分钟；是高价值复盘题。 |
| D4 | CHANGE | committed Wave1 段准确，但 80 重测已不再 pending，Wave2 已运行。 | 按 M4 更新；尤其不能把 8/8 饱和误说成 B4 learnable PASS。 |
| D5 | PASS | validity 前置、JRA、26-task ±6.73pp underpowered、ADR 纪律均有证据。 | 约 1 分钟。 |
| E1 | NIT | 4B/8B 数值、r128、双 4090 当前执行、63% idle、约 1.5× probe 都有依据。 | 澄清能力风险与训练语义风险；1.5× 不要泛化到全部运行。 |
| E2 | CHANGE | 3996/3840、3100、Wave1 2880/6.4 GPU-h、T4/T5 计划正确；probe 状态已过时。 | 按 M5 更新为 Wave1+80 已执行、11,520 running。 |
| E3 | PASS | 五项局限与“4B 是边界但不是已知停滞根因”的区分合理。 | 约 45–60 秒；可接受。 |
| E4 | PASS | A=pre-RL SFT、B=rule-selected RL、其余冻结；A/B 不识别 GRPO-specific effect；C descriptive only。 | 因果口径准确，是整稿亮点。 |
| E5 | NIT | 产品缺口完整且不夸大。 | 仅约 30–40 秒；建议补最小上线验证路线。 |
| E6 | PASS | 框架层/插件层、11 步清单、subject binding、handler 封闭接触面均有依据。 | 略短但作为 bonus 合理；无需背全清单。 |
| F1 | PASS | golden state 自动生成、outcome-based、不锁路径、效率另计、R_exec 移除均准确。 | 可讲。 |
| F2 | PASS | PRECONDITION/参数 INVALID_FORMAT 为 efficiency；UNKNOWN_TOOL/TOOL_NOT_ALLOWED/输出协议失败为 hard-zero，和代码一致。 | 机制准确；避免把业务 unrecoverable error 误叫 hard violation。当前答案未犯此错。 |
| F3 | NIT | R1/GRPO 与 DAPO 动态筛选关系方向正确；项目并非 DAPO 复现。 | 补“已执行筛选 vs T4 动态重采计划”边界；当前答案约 40–50 秒。 |
| F4 | PASS | Range-80 FWR 16 中 14 与 SFT 同源；P5 新任务 family 隔离准确。 | 太短；补同源为何降低 RL 新信息量。 |
| F5 | PASS | family/skeleton/lexical 隔离、近重复门、R4 预注册、sim-to-real 不可消除均正确。 | 太短；补一句“只能缓解不能证明外推”。 |
| F6 | PASS | reward v2 tie→v3 terminal gating 的方向修正准确。 | 太短；加一个 no-write episode 前后得分例子会更有说服力。 |
| F7 | PASS | ART 选型约束、dual-GPU 限制、non-zero LoRA 约 6× 回退、no cheap fix、merged serving 路径均有证据。 | 约 1 分钟，trade-off 清楚。 |
| F8 | PASS | 内嵌思考、analysis/action envelope、非独立 Think 动作口径一致。 | 约 1 分钟。 |
| F9 | NIT | strict 41-step 后期格式/HV 上升、grad spike、10× median guard、LR decay、async 2×慢/44%丢弃均有依据。 | 建议把“稳住格式”改成“作为后续 Tier-0 控制落地”，避免暗示在原 41-step run 内完成修复。 |

---

## 6. 统计与口述性

### 6.1 数量

- 总题数：34
- 核心层：25
- 延伸层：9
- 回答映射：34/34，无缺题、无错位

### 6.2 长度

非空白字符范围约 140–442：

- 没有明显超过 2 分钟的题；
- 17/34 低于稿头声明的约 250 字下限；
- 最短：F4 约 140、E5 约 151、F5 约 174、F6 约 180；
- 最长：A1 约 442、A2 约 370、C6 约 371、D4 约 375、E4 约 367。

判断：**核心高频题总体具备 1–2 分钟可讲性；部分 common/bonus 更接近 30–50 秒。** 这不是全面阻塞，但制卡前至少应扩充 E5、F4、F5、F6，或把稿头规则改成“核心 1–2 分钟，延伸题 30–90 秒”。后者更符合真实面试。

---

## 7. 最终结论

# **CHANGES REQUIRED**

理由：当前存在会固化成错误卡片的局部事实问题，主要是 C3 双口径缺失、C6 执行/计划混淆、C7 judge 故障机制失真、D1 数值措辞，以及 D4/E2 已被当日最新执行状态推翻。

完成 M1–M6 后，本稿可直接进入制卡；不需要第四轮问题结构审阅。制卡时应把“证据截止日期”和“状态型答案需刷新”作为 metadata，尤其是 A1、D4、E2，避免运行中的 P5 状态再次过期。
