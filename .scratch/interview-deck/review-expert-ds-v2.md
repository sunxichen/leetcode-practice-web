# agentic-gov 自述阶段题集 · 第二轮独立审阅意见（v2）

> 审阅人：大模型/RL 方向技术面试官视角（独立评审，与 v1 同一评审人）
> 审阅对象：`agentic-gov-self-intro-questions.md` v2（34 题，五组叙事线）
> 审阅基线：2026-08-11（board 记录 18–21 之后的最新仓库状态；git HEAD `85d4804`）
> 方法：① 逐条核对 v1 提出的"必须修复"项是否落实；② 用户指定的 5 处抽查锚点全部回仓库源文件/机器产物核验；③ 结构重组评估（对照 v1 意见与题集自述的变更摘要）。

---

## 结论先行

# ✅ APPROVE WITH NITS

v1 的全部"必须修复"项均已正确落实，且落实质量高——不是只改了措辞，而是**数字与出处全部回源到了正确的新事实**（抽查 5 处 + 变更摘要 9 处，全部与仓库证据一致）。结构重组方向正确，五组叙事线与 v1 建议吻合，无覆盖倒退、无粒度反弹。剩余问题全部为不阻塞的小修（nits），其中最需要动手的只有一条**题集自身统计行的账目错误**（实际 34 题 / must 15，题集自述 32 题 / must 14）。逐项明细如下。

---

## 一、v1"必须修复"项逐条核对（12/12 落实）

| v1 要求 | v2 落实位置 | 核验结果 |
|---|---|---|
| F5/H3 时效（Wave1 完成、B4 7/8、pur×Esc 缺口） | D4 | ✅ 与 board 记录 18–21 逐项一致：Wave1 2,880 episodes / 3h13m / 0 infra；B4 初判 7/8、唯一缺口 purchase×Escalate；根因 = L1 配额全落 SFT 零供给的 manual 类（trajectory E07200 实证）；修复 manual→frozen 70 swaps（commit `a3f6c8e`）+ r2 repin（`8b19a32`）已批准落码；待执行链 pur×Esc 重测 80 episodes → Wave2 11,520 → B4 终判 → T4 ~32,000 rollouts/4-8 周（未授权）→ T5 16,000 一次预指定 look |
| N1 为什么 GRPO | C7（must） | ✅ 组内相对优势、无 critic、2×4090 匹配；零方差组现象真实（Note 031：all-fail 1 组 / all-pass 6 组）；2-6/8 带（B4 判据）真实。⚠ 一处措辞见 Nits-2 |
| N2 reward hacking | C8（must） | ✅ T2 NoHitChecker 勘误 = board 记录 8（executor 实传 `_NoHitChecker()`+`nli_bundle=None`，receipt 声称 hybrid；真链重算 Finish strict 23%→77%）；JRA 前门 + Wave1 实跑 ~2,840 adjudicator calls；R3 差分审计进 ≥2 训练 checkpoint（board L322）；v3 修 rare-action tie |
| A3 引文 | A3 | ✅ 改为 `技术选型` §5.1 D11 行 + §6.4（L140 原文"求职+学习目的，总时间有限（~8 周）"）；时间线口径（2026-04 启动 ~4 个月）合理 |
| G1 引文 | D5 | ✅ 26-task 面板出处改为 `expert-review-p5-plan-20260805.md`（L39："±6.73pp 半宽和两个 UNDERPOWERED_FOR_BLOCKING"），表述改为"被判 UNDERPOWERED_FOR_BLOCKING"而非简单 fail |
| C3 动作数口径 | C2 | ✅ "5 种枚举动作，后 3 种是合法终局，P5 按 4×3=12 cell 判定；早期'4 种'是 2026-04 旧口径"（trajectory.py 枚举 + §3.1 原文对照） |
| D1 "terminal-only"措辞 | C4 | ✅ 改为 v3 全式：`0.65×R_complete + 0.35×R_disclosure − 0.10×P_turns − 0.10×P_failed_calls`，R_complete = R_state × R_terminal，R_escalate 移出训练总和，并补了 rare-action tie 动机（v3 ADR §1.2 + Note 031 §3 一致） |
| F4 数字口径 | D3 | ✅ 改全量口径：bridge 24/24、hard_train_v2 72/300、pool_390 42/390、hard_val_v1 4/180、247 行 exact-hash 退役——与 P5-T0 ADR 复验表逐数一致（含 390 池 T3b 勘误后的 42 口径） |
| D3 双口径 | C3 | ✅ "Stream① 4110→3996（post-rescan）+ 实际 SFT train 3840 条"——3840 已回源核验（4B/8B 对齐 SFT handoff §9.2："3840 examples, 720 steps"） |
| F1 8B stale 撤回 | D1 | ✅ 4B 口径全部回源 handoff §9.4：overall 0.801 / HV 0.000 / abq 1.000 / rent 0.817 / purchase 0.765 / loan 0.613 / Esc 0.935 / Finish 0.845 / FWR 0.200；8B 重测 0.776；0.622/0.045 旧报告被判 stale/contaminated（§9.3） |
| E4 实测加速 | E1 | ✅ "实测 ~1.5× 加速（非理论 2×）"——§9.1：速度探针仅 ~1.5× tail speedup、低于 §3.2 的 ~2× 门槛、owner 以"parity+any speedup"放行 |
| E3 4B 措辞自洽 | E3 | ✅ "4B 是边界但已证明不是本次 RL 停滞的根因，别说自相矛盾的话"——与 P5 方案"不是 4B 容量墙"修正口径一致 |
| C9（v1 D5）precondition≠HV | C9 | ✅ 与 `adr-sandbox-error-hard-vs-efficiency.md` + `adr-phase5-reward-divergence` 决策四一致：HV 仅 UNKNOWN_TOOL / TOOL_NOT_ALLOWED / 解析或格式失败（+action 缺失）；PRECONDITION_NOT_MET 等 = efficiency penalty（P_failed_calls，episode 继续）；语义型违规结构性拦截故不建终态扫描器 |
| 预算标"预估" | E2 | ✅ "早期预算表（¥450-750）是 2026-04 的方案预估，不要当实际支出报" |
| D2（v1 F3）P4 双因 | D2 | ✅ 双因齐备（无效任务主导测量面 + booster 安全/格式跷跷板）+ HV caveat（3/1408→7/1408，+0.2841pp）+ "不是 GRPO 算法失败也不是 4B 容量墙" |

**额外抽查（用户指定 5 处 + 顺带）**：B3 的难度星级（phase0-scope L261-263：rent ⭐⭐ / purchase ⭐⭐⭐ / loan ⭐⭐⭐⭐，查询最低）✅；E9 "R4 退化扫描"（board L322："R3 差分审计 + R4 退化扫描在 ≥2 checkpoint"）✅；C7 零方差组 ✅；E2 规模数字（6.4 GPU-h / 14,400 / 32,000 / 16,000）✅；E7 同源数据（030 P2：16 条 FWR 中 14 条同源）✅；C8 "P5 board 记录 8/17" 引文 ✅（记录 8 = NoHitChecker 勘误，记录 17 = probe receipt JRA hybrid 链）。

## 二、结构重组评估

**五组叙事线（A 项目与本人 → B 为什么这样做 → C 方案全貌 → D 结果与复盘 → E 边界选型价值）是正确的一步**。v1 的 A–H 按项目文档章节分组，会让候选人在"章节"而非"叙事"里组织答案；v2 的分组顺序恰好对应面试官自然的追问路径（是什么→为什么→怎么做→做出什么→边界在哪），E 组作为收尾的杂项池也符合真实面试节奏。

**v1 建议的执行情况**：删 A2/G2 ✅、下沉 C4/C6/D4/D6/G3 到深挖卡 ✅（比 v1 建议的"删 C6"更温和，正确）、合并 B3+B5 / C2+C3 / D7+F2 / E1+E4 ✅（四组合并全部合理，无信息丢失）、新增 8 题全部到位（案例走查 A2、核心贡献 A4、替代方案论证 B4、GRPO C7、reward hacking C8、因果归因 E4、规模 E2、上线缺口 E6）✅。

**没有覆盖倒退**：v1 的 must 级话题在 v2 中全部有对应题（SFT 结果→D1、RL 证明/未证明→D2、最大失败→D3、当前状态→D4、局限→E3、reward→C4、golden state→C5、防违规→C9、simulator→C6）。两处主动降级（D1 must→common、E8 common→bonus）都有充分理由：8B exit-gate 数字撤回后，SFT 故事的重心本来就在 D2；E 组已 11 题，扩展题放 bonus 合理。

**两点小建议**（均不阻塞）：
1. v1 建议的"成功标准"题没有单独成题（可以接受——D2/D4 已覆盖大部分），但建议在 **D4 锚点补一行成功判据**："成功 = P5 acceptance G1–G8（aggregate superiority + 3 终局 marginal NI(−5pp) + ≥2/3 广度 + 8 稀有 cell NI + ≥6/8 广度 + 塌方否决 + HV≤1% + judge audit clean）"。面试官问"做到什么算成"时答案现成。
2. v1 的"分几个 phase"题被删除而非改写（可接受——重写版会与 D4 重叠），但建议在 **A1 锚点的 30s 方案段里加一句阶段骨架**（"Phase 0 范围冻结 → sandbox → 数据合成 → 双 SFT → reward → GRPO → 验证"），否则"这个项目是怎么推进的"这个常见问题没有现成落点。

**题集统计行账目错误（必须修，虽然只是账目）**：题集自述"共 32 题：must 14 / common 12 / bonus 6"、变更摘要写"must 控制在 14 题"——**实际表格是 34 题：must 15 / common 14 / bonus 5**（A4 + B5 + C9 + D5 + E11；must = A1-A4, B1, B4, C1, C3, C4, C7, C8, D2-D4, E3 = 15）。15 仍在 v1 建议的 12–15 上限内，不构成治理违约，但自查清单与正文不符会显得不严谨——这恰是这个题集自己的卖点。改法：统计行改 34 / 15 / 14 / 5；若想保持"must 14"，把 A4 降为 common（见 Nits-5）。

## 三、NITS 清单（全部不阻塞，按重要性排序）

1. **C7 "实证加分项"措辞（唯一需要认真改的一句）**：C7 锚点写"实际对比过 strict on-policy（CISPO 风格）与 async pipeline"。仓库事实是：**CISPO-vs-GRPO 是 Note 024（2026-07-03）的语义澄清学习笔记，不是跑过的算法对比实验**；真正实证过的是工程路线对比——strict 基线 vs async k=1 管线（2× 更慢 + 44% 丢弃，Note 025/ADR 2026-07-07）。现在的写法会让候选人在面试官追问"CISPO 对比实验你们发现了什么"时露怯。改法："工程实证：async off-policy 管线（k=1）实测 2× 更慢 + 44% rollout 丢弃 → 弃用；CISPO vs vanilla GRPO 是 ART 训练语义的澄清（Note 024），我们实际跑的是 ART 的 CISPO loss + GRPO 组内 advantage，不是教科书 vanilla GRPO"。后者反而是一个更专业的答案。
2. **C7 因果链"所以才有 learnability 2-6/8 带筛选与分层采样"**：2-6/8 带是 B4 的 eval cell 判据（保证有 learnable signal），"零方差组"是 GRPO 训练侧的组丢弃现象，两者相关但不是直接因果。改"对应地"或"配套地"，避免面试官追问因果时解释不清。
3. **D4 锚点密度**：已执行 3 点 + 待执行 4 点、每点带数字，1-2 分钟会紧。建议把待执行链压缩为 2 点："B4 收尾（pur×Esc 重测 80 → Wave2 11,520 → B4 终判）" + "T4 长程 GRPO → T5 全表面评测（16,000 episodes）"，数字留到被追问时给。
4. **C3 锚点密度**：管线 5 步 + 规模 3 个数字 + 2 个诚实细节 ≈ 8 点。建议答题引导写成"管线 5 步 → 一个口径数（3996/3840 说一个即可）→ 两个诚实细节（FWR 30 条 / 247 退役）"，4110→3996 的中间数等追问再给。
5. **A4 标 must 可商榷**："只展示一个点"不是高频原话，但它的答案（核心贡献陈述）确实是 A1 的组成部分，作为 must 有存在意义。若你想把 must 压回 14，第一个降的就是它（common），否则保留也说得过去。
6. **C9 补一个"action 缺失"**：决策四原文 HV = UNKNOWN_TOOL / TOOL_NOT_ALLOWED / 解析或格式失败 / **action 缺失**。现有"等"字已覆盖，不修也行；若追求精确可在锚点括号里加上。
7. **D3 建议补一句修复后的状态**：锚点现在以历史缺陷为主（"防线存在但从未接线"），建议末句补"修复路径 = 有效性硬门接线 + 247 行退役 + 复验全数一致（P5-T0）"，让答案以"现在修好了"收尾而非以缺陷收尾。这正好呼应 D4 的"已执行"。

## 四、结论

- v1 的必须修复项：**全部落实且回源正确**（12/12 核对通过）。
- 抽查锚点：**5/5 与仓库最新事实一致**（D1 4B 数字、D3 无效任务口径、D4 Wave1/B4 状态、C4 v3 公式、C9 HV 分类）。
- 结构重组：**成功**，无覆盖倒退、无粒度反弹、优先级错标仅 A4 一处可商榷。
- 唯一实质错误：题集统计行账目（34 vs 32、must 15 vs 14、common 14 vs 12、bonus 5 vs 6）——账目级，一行修复。
- 唯一措辞风险：C7 把"语义澄清"写成"实证对比"（Nits-1）——建议制卡前改掉，其余 nits 可在制卡时顺手处理。

**可以进入制卡阶段。** 制卡时记得：① 修统计行；② 改 C7 一句话；③ A3 角色边界等用户本人确认后再回填。
