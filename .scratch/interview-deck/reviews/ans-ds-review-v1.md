# 答案集审阅意见：`agentic-gov-deep-dive-answers.md`（v1 草稿）

> 审阅人：资深 LLM/RL 面试官与技术评审（独立审阅，未参与制卡）
> 审阅对象：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-deep-dive-answers.md`（v1，41 题全）
> 对照基准：`agentic-gov-deep-dive-questions.md`（v3 定稿）＋ 仓库 `/Users/sunxichen/Projects/agentic-gov` 实际源文档（ADR / experiment notes / handoff / src 代码，全部实际打开核对）
> 事实基线日期：2026-08-12（与题目集一致）
> 审阅维度：① 事实准确性 ② 口径纪律 ③ 风格达标 ④ 内部一致性 ⑤ 完整性

---

## 零、总体判断

**结论：需修订（修订后可入库使用）。**

答案集整体质量显著高于一般草稿：41 题全有答案、每题标注依据、黑话控制与同事口吻到位、"计划/预注册"与"已执行"的口径标注基本自觉（G3-3、G4-6、G6-2 均正确标注）。我按题目集标注的锚点文件逐题抽查了全部重点数字与机制描述（G1 的 reward 三版数字、G3-3 的 T4 schedule 全部细节、G4 各题的工程数字、G5-6 的统计口径、G7 的公式与代码卡），**绝大多数与仓库源文档逐字吻合**（详见"已核实无误项"清单）。

但存在 **3 个阻塞级问题**，均为可被面试官当场戳穿的事实性错误或与仓库最新记录相矛盾的表述，其中 1 个（G3-4）还牵出题目集锚点自身的混淆，需要答案与题目集协同修订。修订量很小（3 处改写 + 若干补充），不涉及结构重写。

---

## 一、阻塞级问题清单（须修订后方可使用）

### B1【事实错误】G1-2：`R_terminal` 被写成"0、0.5、1 三值，0.5 留给合法的平局（不写数据库的任务）"——仓库中不存在 0.5 取值

- 答案原文："R_terminal 本身的设计也配合这个思路：它只取三个值（0、0.5、1），0.5 专门留给'合法的平局'——也就是这个任务本来就不写数据库，最终状态天然没法区分动作对错的情况，这时双方各拿一半，谁也不占便宜。"
- 仓库事实：`research-proposal/adr-phase6-grpo-reward-v3-terminal-gated-outcome.md` **决策二**明确定义 `R_terminal = 1[actual_terminal_action == expected_terminal_action]`（二值 {0,1}），**决策三**写明"两项均为 {0, 1}，故 R_complete ∈ {0, 1}"；§3 的语义表里 R_terminal 只出现 1 或 0；决策二还写明"actual 缺失、None、未知值、非三值 enum、解析/格式异常或无法可靠取得时，R_terminal = 0"。实现 handoff（`handoff/handoff-phase6-grpo-reward-v3-terminal-gated-outcome-20260722.md`）同样只有 `R_terminal = 1[actual == expected]`。全文检索 `0.5` 无任何命中。
- 语义上更严重的是：v3 的设计动机恰恰是 no-write 任务"状态对但终局动作错"必须得 0（状态与动作 tie 是 v2 没修的问题，见 ADR §1.2）——不存在"平局各拿一半"；0.5 的说法与 v3 的整个动机矛盾，也与本答案 G1-1 自己写的"终局动作错了，状态分再高也清零"自相矛盾。
- 混淆来源：题目集锚点里的"R_terminal **三值**精确对称比较"指的是三种合法终局动作（Finish/FWR/Escalate）的**三值比较**，不是分值三值。答案把"三值"误译成了"0/0.5/1 三档分"。
- 修改建议：改为"R_terminal 是二值门：实际终局动作与期望动作精确相同得 1，否则得 0；所谓三值指的是三种合法动作（Finish/FinishWithRefusal/Escalate）之间的对称精确比较，任何动作都没有特权；缺失/异常按 0 处理（fail-closed），绝不从最终状态反推"。
- 同时建议给题目集 G1-2 锚点加一个括注，明确"三值 = 三种动作的三值比较，R_terminal 本身二值 {0,1}"，防止二刷时再次误译。

### B2【事实错误 + 口径混淆】G3-4：`NOT_ELIGIBLE_AS_MONOTONIC_LADDER` 的根因张冠李戴，且"待 80-episode 重测确认"与 P5 board 记录矛盾

- 答案原文："确实有任务被正式判定'梯度够不到'：公积金购房提取的'带拒绝办结'这一类，标记为 NOT_ELIGIBLE_AS_MONOTONIC_LADDER……原因很具体：它的 L1 桥本应是最简单的同类任务，但实测发现 L1 全落在一个监督微调从没供给过样本的手工构造类里……修复假设有（重新组织桥接层），但还在等一轮 80 episode 的重测确认，目前不能说已证明。"
- 仓库事实分两条，属于**两个不同的 cell、两个不同的原因**：
  1. `withdrawal_for_purchase × FinishWithRefusal`（购房提取×带拒绝办结）的 `NOT_ELIGIBLE_AS_MONOTONIC_LADDER` 原始依据是：**Wave-1 的 L1 与 L2 是同一套 recipe**（concept DC-22、boundary BD-C1:not_filed、合成维度 contract_mismatch、同一 persona），差异只是措辞与 incidental 歧义，"not eligible as a monotonic L1→L2 ladder"——**没有冻结的难度干预**（`handoff/handoff-phase6-sr5-purchase-fwr-l1l2-redesign-generation-20260723.md` §1；`docs/experiment-notes/028`；spec A8-3）。与"手工构造类、SFT 零供给"无关。
  2. "L1 全落 SFT 零供给的 manual 类（DC-23）"是 **`withdrawal_for_purchase × Escalate`（购房提取×转人工）L1** 的根因（P5 board record 19，2026-08-11：trajectory 实证"pur×Esc L1 配额全落 manual（DC-23，SFT 0 供给）"）。该问题已于 2026-08-11 修复（owner 批准 L1 trigger manual→frozen），并在 **2026-08-12（即事实基线日）的 r2 重测中确认**：10 任务 × K=8 = **80 episodes** 重测 10/10 饱和，pur×Esc 从死池变为 9 条 learnable，B4 终判 8/8 PASS（P5 board record 21/665；`phase6/handoff/p5_t4_handoff.md` 的 B4 终判行）。
- 因此答案有两处问题：(a) 把 pur×Esc 的根因安到了 pur×FWR 的 blocker 头上；(b) "还在等 80-episode 重测确认"与 board 记录（重测已完成且确认生效）直接矛盾——这属于把"已确认"说成"待确认"的口径错误，恰好是题目集最忌讳的那一类。
- 修改建议：按仓库事实拆开讲两件事——(1) pur×FWR 的 NOT_ELIGIBLE：Wave-1 L1/L2 同 recipe、无难度干预，阶梯结构不成立（2026-07-23 判定），属 curriculum/route 层 blocker，reward 版本变化解不了；(2) 顺带可讲 pur×Esc L1 曾因 manual 类（DC-23）SFT 零供给不可学，2026-08-11 修成 frozen 类、2026-08-12 的 80-episode（10×K8）重测 10/10 饱和确认修复生效、B4 8/8 PASS——这条是"已执行已确认"的事实，不要再说"待确认"。若面试想展示最新状态，B4 8/8 是比"待重测"强得多的弹药。
- ⚠️ 提示：题目集 G3-4 锚点本身包含同样的混淆（把 manual 类根因写进了 pur×FWR 的括注里，且说"修复假设待 80-episode 重测确认"）。**建议题目集发一条 errata**：把 pur×FWR 的括注改为"Wave-1 L1/L2 同 recipe 无难度干预"，"80-episode 重测"移到 pur×Esc 语境并标注"已完成确认（2026-08-12，B4 8/8）"。否则答案改对了也会被锚点带回去。

### B3【事实错误】G7-1（连带 G5-5）：CISPO 的 ratio 裁剪上界写错——`clamp(max=4.0)` / "到 4 倍"应为 [0, 5]（1+ε_high=5）

- 答案原文（G7-1 伪代码）：`weight = ratio.detach().clamp(max=4.0)  # 关键行：detach 后再裁剪`；正文"裁剪范围量级不同：PPO 习惯 0.2 左右，我们宽松得多（到 4 倍）"。G5-5 同源："CISPO 可以理解为'重要性权重裁剪到 4 倍以内'的宽容版修正"。
- 仓库事实：`docs/experiment-notes/024` 的对照表明确写"clip range | CISPO 默认 `[0, 5]`（`epsilon=1.0`, `epsilon_high=4.0`）"，且 `clip_frac_high # ratio > 1 + epsilon_high`——即 ε_high=4.0 是**加性边界**，ratio 上限 = 1+4 = 5（下限 = 1−1 = 0）。"到 4 倍"是把 ε_high 误当成了直接上限。
- 影响：G7-1 是 must 级手写代码卡，面试官若按 Note 024 对质（"你们自己写的 clip range 是 [0,5]"），当场穿帮；G5-5 的同一错误会互相印证而非互相掩盖。
- 修改建议：G7-1 伪代码改为 `weight = ratio.detach().clamp(0.0, 5.0)`（或 `clamp(1-epsilon, 1+epsilon_high)`），正文"到 5 倍（1+ε_high=5，ε=1.0 时下限为 0）"；G5-5 同步改为"裁剪到 [0,5] 区间内"。注意题目集锚点写的是"ε=1.0/ε_high=4.0"，本身无误，是答案翻译时引入的错误。

---

## 二、已核实无误项（抽查通过，列出供放心使用）

以下各项已逐一与仓库源文档核对，数字、文件名、机制描述一致：

- **G1-1**：v1 ceiling 0.75（Finish/FWR）/0.80（Escalate）✓；728 条 rollout / 91 组重算，mean group std 0.1077→0.1397（+30%）✓；零方差组 0/91→0/91 不变 ✓；v3 现役（`src/agentic_gov/reward/aggregate.py`、`v3_config_binding.py` 均存在）✓；T2 probe 曾接 NoHitChecker 的口径提醒 ✓。
- **G1-3**：纯线性缩放对组内 advantage 是空操作的论证 ✓（frontloading ADR §4.3："一个全 0.8 的组缩放后变全 1.0，仍是零方差、仍被丢"）；v2 是重分配质量项权重 ✓；v2 与 Step-2 sampler 同轮启用、归因不干净书面承认、v1 shadow logging ✓（v2 ADR 决策二/五）。
- **G1-4**：R_exec（路径比对惩罚"更长但正确"）✓、R_recover（与 R_complete 重叠）✓、P_redundant（被 P_turns 覆盖）✓（最终研究方案 §6.8）；思考链不设独立 reward、防"看起来正确"的 hacking ✓（§6.5）；诚实承认 terminal-only 是 episode 级 Monte Carlo、未解决 temporal credit assignment ✓。
- **G1-5**：最优阈值跨三个数量级（0.0037–0.997）✓；P-07（抽象）/N1-03（两侧分布完全重叠）结构性无能、任何阈值做不出 ✓；full-dialogue 0.0032 vs per-message 0.9971（P-01 hit row, premise 1385 chars）✓；mDeBERTa 512 token ✓；rc-3 退化（1 句复制 100 遍、F1=1.0 假象、对抗审计证伪）✓。
- **G1-6**：三分类判据（UNKNOWN_TOOL/TOOL_NOT_ALLOWED→hard；PRECONDITION_NOT_MET/MISSING_REQUIRED_ARG/INVALID_FORMAT→efficiency；业务拒绝恰 14 种）✓；format_failure 合计 2.08% < 5% ✓；DeepSeek-R1 格式失败直接归零先例 ✓；"负分扭曲 baseline 不是普遍定理"的收窄表述 ✓；恢复设计 RL 理由（首次参数错就终止则学不到恢复）✓。
- **G1-8**：0.65/0.35 主比例继承 v1（v1 为 0.50/0.25，2:1）✓；R_escalate 0.05→0.10 ✓；无系统敏感性分析 ✓；与 sampler 同轮启用的归因账 ✓。*（一处措辞见非阻塞建议 N7。）*
- **G2-1**：混组数字例（A 对 0.80/A 错 0.75/B 对 0.30/B 错 0.25、组均 0.525、错 A 被强化、对 B 被抑制）与 ADR §4.1 逐行一致 ✓；"拆对残留多为 Finish 侧"✓（§4.3）。
- **G2-2**：`frozen_simulator_backend.py::_normalize_history`（line 173，"Keep only dialogue turns visible to the simulator and merge same-role runs"）✓；信息边界论证（JSON 捷径、反向激励、RPCR 虚高）✓。
- **G2-3**：10–14% ✓（ADR：after_delay 占任务池 10–14%，nonloan 26/180、purchase 6/60）；四条反转条件（unprompted / >30% / reward 依赖 reveal 时机 / 泄漏进 reward）✓；"不进 reward、非 unprompted、组内共同平移"论证与前提限定 ✓。
- **G2-4**：L0–L5 六自动层 + L6 人工抽检与 `funnel.py` 的 `LAYERS = ("L0_format","L1_sandbox","L2_nli","L3_entity","L4_rpcr","L5_judge")` 完全一致 ✓；cell×level 内 >0.90 reject ✓；P5 holdout 1,000 族 1,000 任务、DEFF≈1 ✓；"P5 特有设计勿泛化"的标注 ✓。
- **G2-5**：数值型 7 类（BD-N1..N7）+ 类别型 8 类（BD-C1..C8）✓；persona 9 维 ✓；opening 一字节不差、boundary 定义在 state 层 ✓；naturalized pair `__nat` 后缀、不占 canonical 预算 ✓；B 侧"先错后恢复"两步剧本（BD-N1 over 示例）✓。
- **G2-6**：四层职责（Policy Card/required_slots/API Spec required_args/sandbox precondition/reward）与最终研究方案 §4.2/§4.3 一致 ✓；policy_id/version 合成期与运行期硬绑定 ✓。
- **G3-1**：GRPO-style 组内优势 + ART token-level CISPO 的口径 ✓；ε=1.0/ε_high=4.0 ✓（注意：上界换算见 B3）；clip_frac_high 历史最大 6.83e-6 ✓；strict 下近似 vanilla ✓；"PPO 被 clip 的 token 梯度饱和、CISPO 保留 REINFORCE 式梯度"按 advantage 方向描述 ✓。
- **G3-2**：零方差组丢弃、过滤发生在 reward 结算之后省不了 judge 成本 ✓；方差在 p≈0.5 最大、"越难越该多采"被禁 ✓（frontloading ADR §4.5 承重原则 + step2 ADR §5.5）；learnability 2–6/8 核心带、0–1 待复测、7–8 饱和 canary ✓。
- **G3-3**：T4 schedule 全部细节与 `expert-consult-p5-t4-planning-20260812.md` 一致——8 组/步（4 rare-action core + 2 Finish anchors + 2 breadth）✓；滚动 50 步窗口 12 cell 各 5–15%、终局 25–35%/30–40%/30–40%、单任务 ≤4、单族 ≤8 ✓；每步 ≥6 有效组、补 ≤2/步、500 步 ≤200 ✓；CELL_FUTILITY 判据（3 连 0 或 20 次 <25% 产出）✓；lr 1e-5→3e-6 余弦、KL 0.08、K=8、seed 20260609、ckpt 50/dev 100 ✓；"唯一有成功背书组合"的表述 ✓；Step-2 历史配比 0.74/0.26 + 每 4 步 canary 且明确标"历史" ✓；"设计已冻结、T4 未执行"口径 ✓。
- **G3-4**（除 B2 外）：L1→L2→L3→Target 阶梯、2–6/8 才进梯度、7–8/8 退监控 ✓；K=16 砍掉（无 accepted 加权合同）✓；K=32 仅留给最易 L1 的 0/8 终裁、只产证据不更新模型 ✓；C15/C30 固定换包边界 ✓；自动在线调权留 v2 ✓。
- **G3-5**：防"政务复读机"机制链（R_disclosure+P_turns 双压→长句倾倒）✓；"混 SFT 数据≠rehearsal，饱和样本零方差无梯度"✓；KL 0.04（Note 024 默认）→0.08（C0→C15 执行值、T4 冻结值）✓；分层预案（KL 在线→IF-eval 监控→自蒸馏 gated 选项默认不执行）✓。
- **G3-6**：四类 auto hard-stop（NaN/Inf、JRA 确定性失败、split 污染、judge silent fallback 进梯度）✓（nonr2-hardstops consult：split/gradient isolation 行、JRA 行、SILENT_ERROR_FALLBACK_REACHES_GRADIENT 行）；prob_ratio_max>4 = HARD PAUSE + owner gate、历史最大 1.726 ✓；60 任务单侧 99% 精确二项、≥8/60（13.3%）才确认 ✓；n=50 真率 2% 时 P(≥3 失败)≈7.8%（我独立复算 0.0784，吻合）✓；dev 只控 promotion eligibility ✓；"不是早期 Tier0 三分法"的口径 ✓。
- **G4-1**：AGENT_MAX_CONCURRENT_REQUESTS=4→24→64、20min→2–3min ✓；busy-time 98% vs GPU1 闲置 63%、相位条件采样 ✓；9/64 于 00:38、64/64 于 14:13 ✓；串行 8 轮乒乓 ✓；跨阶段跨配置口径纪律 ✓。
- **G4-2**：538s→1127s、2.1×（Node A）✓；vLLM 已做 continuous batching、客户端攒批无增益、wave barrier 等最慢、破坏相位错开 ✓；revert 并永久废弃 ✓。
- **G4-3**：LoRA 原理 ✓；1511→250 tok/s（6.0×，Note 023 表）✓；prefix cache 稳定 94% 证伪 World A ✓；cheap fixes 各 +3/+6/+11% → NO CHEAP FIX ✓；根因收窄为 non-zero LoRA kernel path（r=128）、缺内核级因果验证的诚实边界 ✓；2×A6000 与当前 2×4090 不同 ✓；"训练仍 LoRA、serving 全量 merged"✓。
- **G4-4**：比 strict 慢 2×、44% 丢弃（87/199）✓；双层根因（rollout 本就是瓶颈 + merged 下旧 model 404）✓；"k 管到达后的训练资格、不管采到一半旧模型消失"✓；max_loras=2 让旧 policy 存活 ✓；intra-step 中位 40–48 次 optimizer step ✓；drift 1.8–2× 标注为历史观测 ✓。
- **G4-5**：val strict 0.844→0.804（step10→40）✓；step 37 grad_norm 34.98 与 entropy 1.84 时间对齐 ✓；format_failure 从 0 出现（缺 `</action>`、幻觉 `<user>` 轮）✓；T4-R 切片 seq 4096、assistant tokens 仅 139–241 ✓；分母 floor 2560 采纳、4096 把正常 control 压到三到四成（median ratio 0.423/0.324/0.397）被拒 ✓；修复后 grad guard 0/823 全绿、late residual −0.108705 < 0 仍 rejected ✓；"局部修复全对≠全局通过"的教训 ✓。
- **G4-6**：T2 executor 传 `_NoHitChecker()`/`nli_bundle=None`/`adjudicator=None` ✓；config_sha256 只绑配置身份不绑运行时实例 ✓；rent Finish 82/96 strict 靠 keyword fallback 幸存掩盖事故 ✓；JRA 字段清单（checker 类/模型快照/threshold bundle/adjudicator 开关/prompt/endpoint）✓；JRA 证明不了语义正确性、防不了 judge gaming ✓；R3 预注册为 T4 必做、未执行 ✓。
- **G4-7**：247 条退役 = `plan030_archival_retirement_v1`（IMPERSONATION_GHOST 162 + FROZEN_UNOBSERVABLE_LOAN_QUERY 85）✓；五问契约 ✓；frozen×loan Escalate 反例（工具读不到、政策不含、simulator 不透露→完美 agent 必得 0）✓；impersonation 幽灵反例（adversarial_flag 只写 metadata、从未注入 opening）✓；invariant 注册了但 `validate_task_instance()` 从不跑完整 registry ✓（Note 030/031，代码级确认）；"测量面有效性门先于 milestone"✓。
- **G5-1**：critic 机制权衡、零方差组代价、K=8 折中 ✓；K 8→16 ≈ 任务数 +54% ✓（power-sizing consult）。
- **G5-2**：三条轴（采样过滤/DAPO、IS 粒度/GSPO、clip 梯度路径/CISPO）✓；"停在 CISPO 因为瓶颈在任务有效性与测量面"✓。
- **G5-3**：两个方向 CE 的分解（SFT 的 CE = H(p_data)+KL(p_data‖π) forward KL mode-covering；惩罚项 CE(π,π_ref)=H(π)+KL(π‖π_ref) 夹带压熵项）✓；必须先声明方向的纪律 ✓。
- **G5-4**：pass@1 0.16 → pass@8 ≈ 0.75（1−0.84^8≈0.752）✓；iid 近似与组合无偏估计 1−C(n−c,k)/C(n,k) 的区分 ✓；两个真死区（pass@k≈0、hard-zero 平零桶）✓。
- **G5-5**：on/off-policy 界线、staleness 定义、IS 修正与 clip 的近似关系 ✓（clip 上界错误见 B3）。
- **G5-6**：S1 +9.21pp、family-clustered bootstrap CI [+3.29, +15.13] ✓（SFT 0.6974→C15 0.7895，held-out Escalate）；paired delta 消任务异质性 ✓；DEFF 仅设计期近似、正式推断不用 ✓；holdout n_families==n_tasks 把 DEFF 压到 ≈1 ✓；一次预指定 look 不 re-cut ✓；边界交叉引用 E4 ✓。
- **G6-1**：AReaL-SEA（simulator 不微调 RL 显著退化→Phase 4 simulator SFT + 五门槛；dynamic filtering→零方差丢弃+learnability 带）✓；CoVe（约束模糊化→ambiguity_profile/reveal_policy；数据质量>数量）✓；没有背精确百分点的纪律 ✓。
- **G6-2**：OPD 两要件、无合格教师（外部模型不懂 sandbox 协议/hidden_truth）、RLVR 天然领地 ✓；"蒸馏压缩已知、RL 探索未知"分工 ✓；Phase 6.5 self-distill 预案默认不执行、RL's Razor ✓。
- **G6-3**：四类路线地图（PivotRL/RollMux/AReaL·StreamRL·Laminar/verl·ReaLHF）✓；2×4090 单 job 下仅框架工程+客户端并发有效 ✓；立场分裂=任务敏感度不同 ✓。
- **G6-4**：可验证优先、adjudicator 精准兜底、三层防线（可验证规则→JRA→blinded 语义审计）✓；判定方向不对称也是防单点 ✓。
- **G7-1**（除 B3）：advantage 公式、zero-advantage 丢弃、`−mean(mask × clip(ratio.detach()) × adv × new_logprob)` 形态、PPO 三行差异（不 detach / min 结构 / ε 量级）✓；`tokenize.py:264-275` 引用与 deck 一致。
- **G7-2**：符号冻结约定 ✓；k1=x 无偏方差大可负、k2=½x² 非负有偏、k3=e^(−x)−1+x 无偏非负且 x 很负时数值爆炸 ✓；落点与 `patches/art/phase6-cispo-drift-telemetry.patch`（approx_kl_old_new = (−diffs).mean()，k1 族）一致 ✓。
- **G7-3**：assistant-only mask、Choice 对象保留 logprobs（`trajectory_adapter.py` docstring 原话"Reconstructing assistant messages from strings would drop rollout logprobs and make ART mask them out"）✓；observation→tool 角色归一（`normalize_messages_and_choices_for_art`）✓。
- **G7-4**：数据流与 `reward/aggregate.py` 一致（先 `validate_v3_config_binding` fail-closed → hard violation 判定 → v1/v2/v3 分支加权求和；terminal.py/complete.py 分工）✓；compare_spec 操作符、runtime_policy 影子表剥离、目标轮次用冻结回放中位数 ✓。
- **G7-5**：`<analysis>/<action>` 私有 envelope、全库唯一 parser fail-closed ✓；LLaMA-Factory `template: qwen` vs Qwen3 jinja 两处差异（default_system 缺失、末轮空 think 注入）✓；`enable_thinking=False` 是插空 think 块、hard_violation 0.0→0.6875 ✓；手写等价 jinja + token-diff gate ✓；"约束我们的是训推一致性，不是模板名称"✓。

---

## 三、口径纪律核查（计划/预注册/待执行 vs 已执行）

- 通过项：G3-3（"设计冻结、T4 未执行"+"Step-2 是历史设计"双标注）✓；G4-6（R3 预注册未执行）✓；G6-2（自蒸馏预案默认不执行）✓；G1-1（T2 事故期读数不混入"当前 v3"）✓；G4-1（跨阶段跨配置，不包装成单硬件 benchmark）✓；G4-4（drift 1.8–2× 标为历史观测）✓；G2-4（n_families==n_tasks 标明 P5 特有）✓。
- 未通过项：仅 B2（G3-4 把已确认的修复说成"待重测确认"）——已列入阻塞清单。

---

## 四、风格达标核查

- 黑话控制：advantage、零方差组、dynamic filter、DEFF、pass@k、KL 锚、staleness、importance sampling、CISPO/PPO clip、continuous batching、prefix cache、LoRA kernel、exposure bias、RLVR、pre-registration 等首次出现均有大白话解释，无未解释黑话残留。G7-1/G7-2 题面先冻结符号，符合"手写代码卡"的规范。
- 口吻：同事交流式（"这不是工程优化，是救命""我们没做，这一点我不打算包装""知道哪里不严谨比假装严谨重要"），符合要求。
- 完整性：每题 2-4 分钟口述体量，逻辑链完整（背景→机制→取舍→证据→边界），足以支撑第一次记忆；"依据"文件均标注。

---

## 五、内部一致性核查

- 答案之间无互相矛盾（B1 中 G1-2 与 G1-1 的轻微张力已并入 B1 一并修订；B3 中 G7-1 与 G5-5 是同一错误的两处出现，非互相矛盾）。
- 与题目集锚点无冲突，除 B2 一处：答案忠实复述了题目集 G3-4 锚点中的混淆——该处是题目集自身的问题，答案修订时应同步提请题目集发 errata（见 B2 末尾）。

---

## 六、完整性核查

- **41/41 题全部有答案**：G1 7 题（G1-1/2/3/4/5/6/8）、G2 6 题、G3 6 题、G4 7 题、G5 6 题、G6 4 题、G7 5 题，无缺题。
- 每题答案体量均足以支撑第一次记忆（全部超过"3-6 条原子要点"的下限，多数达到完整口述级）。
- 一个轻微缺口：G4-5 未覆盖题目集锚点中的追问素材"grad guard 用 max(2.0, 10×rolling median) 而非固定阈值"。建议补一句。⚠️ 注意：仓库内该乘数存在两个版本——题目集与 Note 025/026 侧记为 10×，`expert-consult-p5-t4-nonr2-hardstops-20260812.md` 描述现有代码为 `max(2.0, 7×rolling_median)`。补这句之前必须回 `phase6/art/tier0_stability.py` 与 t4r-rca handoff 核实当前实际值，否则会引入新的不一致。

---

## 七、非阻塞建议清单（按优先级排序）

1. **N1（配合 B3）**：G7-1 伪代码里顺手把注释写全："clip 成 [0,5] 的权重（ε=1.0/ε_high=4.0 → 下限 1−1=0、上限 1+4=5）"，面试官追问 clip_frac 定义时可直接背出 `ratio > 1 + epsilon_high`。
2. **N2（配合 B2）**：G3-4 修订后建议把"pur×Esc 修复已确认（80-episode 重测 10/10 饱和、B4 8/8 PASS，2026-08-12）"作为加分弹药保留——这是题目集事实基线当日的最新状态，比"待确认"更有说服力；同时 G3-3 中"比如某类稀有任务全池只有两条可学的"（lrq×Esc 恰为 2 条 learnable，T4 planning §2.3）可点名，展示对 learnability 地图的掌握。
3. **N3**：G4-6 的"82/96"建议点名"rent Finish 格"（92/96 complete、82/96 strict，fallback 恰好覆盖其 P-01/P-02），面试官追问"哪一类任务"时不需要现场回忆；G4-6 答案目前"有一类任务拿了 82/96"偏模糊。
4. **N4**：G2-3 的"残余泄漏 10-14%"口径建议微调。ADR 原文是"after_delay 规则任务约占任务池 10–14%（nonloan 26/180、purchase 6/60）"，泄漏率实测为 purchase 10%（6/60，全为该规则）、nonloan 2.78%（5 events）。口述时说"该规则任务占比 10–14%，其中该规则的泄漏集中且一致（被问即答）"更经得起对质。题目集锚点同口径，可一并考虑。
5. **N5**：G5-6 报数时点名"S1 held-out Escalate 面板（SFT 0.6974 → C15 0.7895）"，避免面试官追问"哪个切片"时卡壳；同时把"paired delta + clustered bootstrap + 一次预指定 look"三件套的因果分层一句交叉引用 E4 已做，保持。
6. **N6**：G4-1 的环境变量全名是 `AGENT_MAX_CONCURRENT_REQUESTS`（Note 021），答案与题目集均写作 AGENT_MAX_CONCURRENT；口语无碍，若在代码卡/白板场景建议用全名。
7. **N7**：G1-8 的"观察到模型在该升级时犹豫"无文档出处（v2 ADR §3.2/§5.4 的动机是"Step-2 将更多预算投向 loan/Finish 与 purchase/Finish，提高 Escalate 权重以对冲终局边界塌缩风险"）。建议改为文档化理由，避免面试官问"犹豫的数据在哪"。
8. **N8**：G7-2 的落点"监控里更在意非负性"表述偏松——实际 patch 同时记录有符号的 approx_kl（k1 族）与非负的 logprob_abs_diff/prob_ratio 类指标。建议表述为"惩罚项用 k1 族（配合系数），监控同时看有符号漂移与绝对值幅度两类指标"。
9. **N9**：G2-4 的"247 条坏题"可补构成（IMPERSONATION_GHOST 162 + FROZEN_UNOBSERVABLE_LOAN_QUERY 85），展示对退役层构成的掌握；注意与 G4-7 中"247"的引用保持一致（G4-7 已正确声明叙事在自述 D3，OK）。
10. **N10**：每题"依据"文件建议补小节号/决策编号（如 G1-2 已带"决策三、决策五、§10"的写法），其余题多为裸文件名；第一次记忆回查时小节号能显著加速定位。

---

## 八、结论

修订 B1–B3 三处（合计约 200 字改动）后，本答案集可以作为第一次记忆的正式底稿使用。已核实项覆盖了题目集标注的全部重点抽查面（G1-5 NLI 数字、G3-3 T4 schedule、G4 各题工程数字、G7 公式），无一遗漏、无一不实；口径纪律与风格达标度高，主要风险集中在 B2 这一处"题目集自身混淆被答案继承"的问题上，建议与题目集 errata 同步处理。
