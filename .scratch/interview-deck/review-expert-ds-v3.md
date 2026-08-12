# agentic-gov 自述阶段题集 · 第三轮（最终确认）审阅意见

> 审阅人：大模型/RL 方向技术面试官视角（独立评审，与 v1/v2 同一评审人）
> 审阅对象：`agentic-gov-self-intro-questions.md` v3（核心层 25 + 延伸层 9 = 34 题）
> 审阅基线：2026-08-11 仓库最新状态（git HEAD `85d4804` + 当日 purfix/probe commits）
> 范围：按委托聚焦核验 8 项改动是否落实、有无新的事实错误、统计行与正文是否一致；不做全面重审。
> 核验方法：逐项回源（ADR/board 记录/commit message/发布数据直接计数）。

---

## 结论

# ✅ APPROVE WITH NITS

v3 的 8 项改动**全部正确落实**，其中 4 项我做了比"读文档"更硬的核验（直接数发布数据、直接读 commit message），全部吻合。**未发现任何新引入的事实错误**。统计表与正文逐题清点一致。仅剩 2 个文档内部的小账目瑕疵（1 个自查清单残留旧数字、1 个 RL 岗口径的说明遗漏），一行即可修掉，均不阻塞制卡。

---

## 一、8 项改动逐条核验

### 1. 统计行修正 — ✅（但自查清单有一处残留，见 Nits-1）

逐题清点与统计节完全一致：
- 核心层 25 = A4 + B3 + C7 + D5 + E6 ✓；must 15（A1-A4、B1、B3、C1、C3、C4、C6、C7、D2-D4、E3）✓；common 9（B2、C2、C5、D1、D5、E1、E2、E4、E5）✓；bonus 1（E6）✓
- 延伸层 9 = F1-F9；common 2（F1、F2）+ bonus 7（F3-F9）✓
- 合计 34 = 25 + 9，must 合计 15 ∈ [12, 15] ✓

**唯一残留**：自查清单第 1 行仍写"must 14"（v2 遗留），与统计节的 must 15 矛盾。见 Nits-1。

### 2. C6（原 C7）算法口径 — ✅ 已回源核验

- "ART 实际优化的 token-level CISPO loss"：核验通过——4B 采纳 ADR 存在 **D6 决策节**（L234"strict on-policy + token-level CISPO 作为必做前置 baseline"），且 D6 内含 CISPO 源码验证（`src/art/loss.py:187-193`，clip [0,5]、不杀梯度）。题集引文 `adr-phase6-rollout-throughput-4b-adoption... D6` 准确。
- "不是 vanilla GRPO"：与 Note 024 结论一致（loss 公式层面成立）。一个可选补充的 nuance：ADR D6 同时指出 strict on-policy 下 CISPO clip 几乎不触发、**行为近似 vanilla GRPO**——若面试官追问"那实质区别是什么"，仓库里的诚实答案是"loss 公式不同、strict 下行为接近；这是语义澄清不是我们跑过的实验"。见 Nits-3。
- 零方差组 →"配套地有 learnability 2-6/8 带筛选与分层采样" ✓（因果链措辞已修正）。
- "工程实证加分项（不是算法选型证据）：async off-policy 管线（k=1）实测 2× 更慢 + 44% rollout 丢弃 → 暂停" ✓（Note 025/ADR 2026-07-07），定位标注正确。

### 3. D4 根因定性收窄 + 70 行替换口径 — ✅ 双重回源

- "现有证据支持 trigger 配额/分布假设……修复假设待 80-episode 重测确认（不要说'已证明非能力问题'）"：与 board 记录 18/21 完全一致（E07200 轨迹实证 L1 全落 manual；重测 80 episodes 是待办）。这个"证据支持假设、结论待确认"的定性是科学的，比 v2 的"根因是数据配比而非能力"更严谨。
- "70 行替换/重生成 = 48 内容变更 + 22 新 id，新 L1 45 条 frozen，r2 repin"：**逐字核验 commit `a3f6c8e` message 与 board 记录 19/20**——"70 条 pur×Esc L1 manual→frozen（48 content-changed + 22 new id）"、"产出 L1=45 frozen"、"freeze_v2（r2，sha `ed50ebbb…`，pur×Esc L1 = 45 frozen 任务）"全部吻合 ✓。

### 4. D3 修复收尾 + 数字不可加总提醒 — ✅

- "以修复收尾：有效性硬门已接线 + 247 行退役 + 复验全数一致（P5-T0）" ✓（P5-T0 ADR 复验表 + 退役记录）。
- 新增"这些数字跨池重叠，不能简单加总"：这是对 030/031 三口径教训（38 vs 65 vs 42 vs 41）的正确防御性指令，防止候选人被追问"总共多少条无效"时加出 142 来。✓

### 5. D4 成功判据备询行 — ✅

"aggregate superiority + 各终局/各 task_type NI + 无塌方 + HV≤1% + judge audit clean" = D-P5-7 G1-G8 的忠实简化，无错误。

### 6. A1 阶段骨架 — ✅

"范围冻结 → sandbox → 数据合成 → 双 SFT → reward 管线 → GRPO → 验证" 与 最终研究方案 §9 Phase 0-7 一致（"双 SFT"正确合并 Phase 3/4，"reward 管线"为并行 Phase 5，一句粒度下可接受）。

### 7. E4 对照臂修正 — ✅ 本轮质量最高的修正

- "arm A = pre-RL SFT ckpt720 / arm B = 按预注册规则选出的 RL checkpoint；两臂 policy 本来就不同，冻结的是其他一切（同 holdout/judge/JRA/simulator/采样口径、一次预指定 look 不 re-cut、分层报告）"——与 P5-T0 ADR 决策 4/8 + D-P5-7 一致。
- **因果两层区分**（A/B 只能回答"训练后 policy 是否优于起点"，不能单独回答"提升特异于 GRPO"；后者靠 optional arm C descriptive only）——这是对 v2 隐含过度归因的诚实修正，正确且专业。✓

### 8. C3 FWR 口径分层 — ✅ 直接数据计数核验（最硬的一处）

对 `phase2/releases/phase2_v1.0-rc4/stream1/` 四个文件逐行计数：
- 完整 Stream① 发布 = **4,110 行，其中 FWR 恰 54 条**（main 0 / adversarial 30 / contrast_pairs 18 / naturalized_pairs 6）；
- `rescan_diff.jsonl`（rc4 diagnostics）全部 322 条状态变更记录中 **0 条含 FinishWithRefusal** → post-rescan 3996 行保留全部 54 条 FWR；
- **54/3996 = 1.351% ≈ 1.3%** ✓；
- "基础 main/adversarial 池 30 条、全是 identity-impersonation、两个字面模板" ✓（adversarial 恰 30 条；Note 030 P2）。
- 顺带破案：Note 030 的"3806 行"= main 3656 + adversarial 150，正是题集所称"基础池"——三层口径（30 / 3806 / 54 / 3996）现在互相自洽，无冲突。

**其余抽查**（非委托但顺带）：C7 的"R3 差分审计已预注册为 T4 ≥2 checkpoint 必做项（T4 尚未执行，不许说已做）" ✓（board L322 + T4 未授权）；F2 错误分类学（precondition 可恢复 ≠ R_complete 必然 0；INVALID_FORMAT 属 efficiency；envelope/parse/action-contract 失败 hard-zero）✓（sandbox-error ADR + 决策四 + format-failure ADR 三方一致）；E1 卡位拓扑措辞 ✓；F3 related-work 制卡前警告 ✓。

## 二、NITS（2 条必改 + 1 条可选，均一行级）

1. **自查清单第 1 行"must 14"→"must 15"**（v2 残留，与统计节矛盾）。这是题集自己最强调的"账目一致"纪律，虽然只在文档内部，还是改掉。
2. **统计节括号只写"C6/C7 为 RL 岗弹性 must"，漏了 E4**——顶部岗位弹性说明和 E4 行都写了"RL 岗 must"。补上后顺带说明：**RL 岗口径 must = 16**（15 + E4），比共识上限 15 多一题；建议在统计节注明"RL 岗口径含 E4 为 16，属弹性增量，上限为参考线"或把 A4 在 RL 岗降 common，二选一即可，不阻塞。
3. **（可选）C6 补半句 nuance**："strict on-policy 下 CISPO clip 几乎不触发、行为近似 vanilla GRPO（ADR D6），所以这是 loss 级口径、不是我们跑过的对比实验"。防面试官追问时措辞被动。不加也不算错。

## 三、结论

- 8/8 改动落实正确，其中 D4（48+22/45 frozen）、C3（54/3996）、C6（D6 引文）、E4（因果分层）经最硬证据核验；
- 无新引入的事实错误；统计表与正文一致（唯一不符是自查清单一行残留）；
- 剩余 nits 为文档内部一行级问题，不阻塞制卡。

**可以制卡。** 制卡时顺手修：自查清单"must 14"→"must 15"、统计节括号补 E4；A3 角色边界与 F3 related-work note 按题集已标注的待办执行。
