# agentic-gov 项目深问阶段 · 问题集（v3，三方一致定稿）

> 用途：T14 第二批——面试**深问阶段**的问题清单。前置文档：`agentic-gov-self-intro-questions.md`（v3，自述阶段 34 题已定稿）。
> 与自述阶段的关系：自述题回答"做了什么、为什么、结果如何"（广度）；本文件回答"机制怎么运转、为什么这么设计、踩过什么坑、和业界什么关系"（深度）。
> **去重原则**：自述 34 题已覆盖的命题不再出题；同源主题在锚点里写死答案边界（见各题锚点首行"边界"标注）。
>
> 事实基线日期：**2026-08-12**。每题附「锚点」标注答案应落在哪个当前有效的事实上（含来源文件）。
> **凡标注"计划/待执行/预注册/历史设计"的量，答题时不许与"已执行/当前有效"混说。**
>
> 粒度规则：每题 1-2 分钟可口述完，对应答案 3-6 条原子要点；超出的题拆概述卡+深挖卡。
> priority：must = 深问高频 / common = 常见 / bonus = 加分项。
> 岗位弹性说明：G2-1、G5-1 表中标 common——RL/数据方向岗位按 must 准备；G4-1 表中标 common——系统/infra 岗按 must 准备。
> 本文件只列问题，不给详细答案。
>
> 版本史：v1（52 题七组）→ v2（两位独立专家审阅后：合并 9 组重复卡、删 3 题、新增 4 条主线、修正 2 处事实错误与 10 余处表述收窄，总量 41 题，must 15）→ v3（收敛轮：两位专家均有条件同意，修掉三个阻塞项——G5-6↔E4 边界、G1-6↔F2 边界、G5-3 CE 方向歧义——后定稿）。
> 审阅记录：`reviews/expert-ds-review-v1.md`、`reviews/expert-gpt-review-v1.md`。

## 深问的四种典型路径（用户定义）

1. **沿着某条主线深挖** → G1/G2/G3
2. **由点扩充到面**（相关优化方案、相似技术路线、DL/LLM/Agent/RL 基础） → G5、G7
3. **遇到的难题**（分析、发现、印证、方案、结果） → G4
4. **业界最新技术 → 对本项目的启发** → G6

---

## G1 Reward 与判定设计（7 题）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G1-1 | 你的 reward 从 v1 改到 v3，每一版在修什么问题？为什么上一版不够？ | must | 答案聚焦**各版的反例**而非背公式：v1  ceiling 语义瑕疵（penalty 占预算，完美 episode 最高 0.75-0.80）；v2 质量项归一到 1.0 但没修终局动作排序（no-write 任务 state/action tie）；v3 `R_complete = R_state × R_terminal` 门控修 tie。v2 counterfactual：728 rollout 重算 mean std +30% 但零方差组数不变。口径提醒：v3 **已实现且现役**（`reward/aggregate.py`、`v3_config_binding.py`），但 T2 probe 时代曾以错误的 NoHitChecker 运行（见 G4-6）——说"当前 v3"时不混入事故期读数。（`adr-phase6-grpo-reward-v2-quality-ceiling-1.md`；`adr-phase6-grpo-reward-v3-terminal-gated-outcome.md`） |
| G1-2 | 为什么终局正确性用乘法门控（R_state × R_terminal）而不是给 FWR 加一个对称的奖励项？R_escalate 为什么被移出训练总和？ | must | 两个维度是"且"的关系，加法在 state 对/动作错时给部分分、重现 tie；terminal-specific bonus 会把同一终局 correctness 拆成非对称补丁。R_terminal 三值精确对称比较、fail-closed（缺失/异常 → 0，绝不从 final state 反推）。被拒方案含纯二值 R_total（丢连续 shaping 与可诊断性）。（`adr-phase6-grpo-reward-v3` 决策三/五、§10） |
| G1-3 | 有人说"把 reward 线性归一化到 [0,1] 更自然"，为什么这对 GRPO 基本是空操作？它和你们实际做过的 v2 ceiling 修正有什么区别？ | common | 被否决的是**对整个 raw reward 做纯线性除法**：advantage 是组内相对量，线性缩放下零方差组仍零方差，对 drop rate 零影响。而 v2 做的是**重新分配正向质量项权重**（让完美 episode 可达 1.0），改变了组内相对结构，不是空操作——v2 counterfactual 实测 mean group std +30%。（`adr-phase6-grpo-sampling-frontloading` §4.3；`adr-phase6-grpo-reward-v2` §3） |
| G1-4 | 为什么 reward 在 episode 结束统一结算？这种 terminal-only 设计在多轮信用分配上的优势和局限分别是什么？ | common | 优势：outcome 信号可信、低 hack 风险（过程奖励三连否：R_exec 路径比对惩罚"更长但正确"的路径、R_recover 与 R_complete 重叠、P_redundant 被 P_turns 覆盖；思考链不打分防"看起来正确"的 hacking）。**局限要诚实**：实际仍是 episode 级 Monte Carlo return，advantage 广播到整段 assistant token，定位不了"哪一轮导致成败"——分解子项 + 组内对比只改善可诊断性与方差，没解决 temporal credit assignment。（`最终研究方案.md` §6.1/6.5/6.8；`golden_chain终稿` §三） |
| G1-5 | disclosure（"说到位"）为什么纯 NLI 做不下去？hybrid 判定链怎么分层？NLI 的 premise 为什么按每条 assistant 消息取 max？ | must | 纯 NLI 结构性失败：最优阈值跨三个数量级，P-07/N1-03 任何阈值做不出；mDeBERTa 512 token 截断恰丢最后几轮 disclosure（full-dialogue 0.0032 vs per-message 0.9971）。hybrid 三层：local NLI → deterministic keyword fallback → LLM adjudicator，且方向不对称（P-02 local hit 要复核防安慰话术过触；N1 local miss 即安全、hit 才终裁防否定语境假阳性）；N1 一票否决、P 槽按命中率。rc-3 校准集曾退化（1 句复制 100 遍 → F1=1.0 假象），靠对抗审计证伪。（`adr-phase5-reward-divergence` 决策一；`adr-l2-nli-premise-per-message.md`；Note 008/009） |
| G1-6 | 同样一个失败动作，你们的处理有 hard-zero、负分、拒采重采三种候选——为什么最终是"hard 归零 + efficiency 继续"？这三种处理在 reward 几何和责任归属上差别在哪？ | must | **边界：自述 F2 已答结构性安全与恢复流程（subject-scoped precondition 写入前拦截、恢复后仍可 R_complete=1、不建终态扫描器），本卡只答分类依据与三种处理的取舍。** 三分类判据："做了不该做的事"（UNKNOWN_TOOL/TOOL_NOT_ALLOWED）→ hard；"方式不对"（PRECONDITION_NOT_MET/MISSING_REQUIRED_ARG/INVALID_FORMAT）→ efficiency；业务拒绝（14 种）是 sandbox 正确工作，不罚。恢复设计的 RL 理由：GRPO 靠 trial-and-error 学恢复，首次参数错就终止则永远学不到。hard-zero vs 负分 vs resample：归零 = 语义上"该 episode 无可接受贡献"的绝对门控；负分幅度是额外设计自由度且跨版本不可比（不声称"负分扭曲 baseline"是普遍数学定理）；resample 让 policy 永不为格式失败负责。实测依据：format_failure 2.08% < 5% 门、DeepSeek-R1 硬零先例。（`adr-sandbox-error-hard-vs-efficiency.md`；`adr-format-failure-hard-zero-vs-resample.md`） |
| G1-8 | 0.65/0.35/0.10 这些权重是怎么定的？做过敏感性分析吗？ | common | 诚实答案：继承 v1 主比例约 2:1（complete:disclosure），R_escalate 0.05→0.10 是为加强边界信号（v3 已移出）；**无系统敏感性分析**——算力约束下优先把 GPU 花在终局效果上，且 v2 与 sampler 同轮启用、归因不干净已书面承认（用 v1 shadow logging 补可解释性）。这是"知道哪里不严谨"比"假装严谨"更重要的例子。（`adr-phase6-grpo-reward-v2` §3.2、决策二/五） |

## G2 环境、数据与 Simulator（6 题）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G2-1 | contrast pair（只差一个边界因子、正确动作相反的 A/B 对）在 GRPO 里起什么作用？为什么 A、B 绝不能混进同一个组？ | common | 组内基准线公平性：混组后基准线是"两个不同问题的混合平均"——数字例：A 简单（~0.8）B 难（~0.3）组均 0.525 → 做错的 A（0.75）被强化、做对的 B（0.30）被抑制，学到过度 Finish 偏置。pair 的价值在数据层（边界双侧覆盖）与评测层（contrast-set bucket），不在 advantage 层；子采样必须成对，拆对残留多是 Finish 侧。（RL/数据岗按 must 准备）（`adr-phase6-contrast-pair-grpo-grouping.md` §4） |
| G2-2 | simulator 为什么看不到工具的返回结果？给它看会怎么样？ | must | 信息边界：真实群众看不到工作人员在哪个系统查了什么。若 simulator 看 tool result：(1) 学到从 JSON 抄信息的快捷路径；(2) agent 学到"调了工具就行、不用好好说结果"——环境保真度崩塌；(3) RPCR 泄漏评估虚高。实现：history 只保留 user/assistant 自然语言 turn，连续同 role 合并。（`adr-simulator-information-boundary.md`；`frozen_simulator_backend.py::_normalize_history`） |
| G2-3 | simulator 的 reveal 偏急（被问即答而非拖一轮，残余泄漏 10-14%）为什么不阻断训练、也不把泄漏做成负 reward？什么情况会改判？ | common | 两问一答：判据是"会不会污染 GRPO 信号"——泄漏不进 reward（simulator 是冻结环境，罚 agent 管不了的事只会注入噪声梯度）、非 unprompted（不教 agent 跳过追问）、占比低；组内影响成立有条件：偏差须在 K 条 rollout 间近似一致、不改变 agent 后续行为、不与 reward 耦合，才能近似看作组内共同平移——目前审计显示它是低频一致偏移而非高方差污染。写了四条反转条件（变 unprompted / 占比>30% / reward 依赖 reveal 时机 / 泄漏进 reward）。（`adr-simulator-delayed-reveal-not-blocking-phase6.md`；`phase5-reward-pipeline.md` §1） |
| G2-4 | 数据全合成，凭什么敢用？一条任务从生成到进训练池要过哪些关？ | must | 两层回答。单样本正确性：L0-L5 六个自动层（format → sandbox 重放 → NLI → entity → RPCR 泄漏 → judge）+ L6 分层人工抽检。数据集层可信度：family/skeleton/lexical pack 跨 split 隔离 + near-dup 门（cell×level 内 >0.90 reject）；P5 holdout 刻意 n_families == n_tasks（每 family 恰一条，DEFF≈1）——注意这是 P5 holdout 的特殊设计，别泛化成所有历史数据。外加任务有效性硬门（见 G4-7）。承认 synthetic-to-real gap 不可消除只能监测。（`phase2-verifier-pipeline.md`；`funnel.py`；P5 方案 §3-4） |
| G2-5 | contrast pair 是怎么构造出来的？怎么保证 A/B 真的"只差一个关键事实"？ | common | boundary factor 选取（该 Finish vs 该 Escalate 的最小对立面）；entity-preserving 校验保证两侧实体一致；naturalized pair（`__nat` 后缀，不占 canonical 预算）做表述多样化；评测期 contrast-set bucket 度量边界区分能力。pair 是数据层的对照设计，不是 advantage 层的（与 G2-1 呼应）。（`phase2-contrast-set-spec.md`；`entity_preserving/`；`adr-phase6-contrast-pair` §4.2） |
| G2-6 | Policy Card、API Spec、sandbox precondition 和 reward 分别管什么？为什么不能把所有规则塞进 prompt、或全写死成 workflow？ | common | 职责分层：Policy Card = agent 可见的业务决策知识（该学什么）；required_slots = 对话侧应主动收集什么；API Spec required_args = 工具执行侧参数契约；sandbox precondition = 不可绕过的结构性约束（不该学什么——强规则结构性保证）；reward = 对合法行为的质量排序。塞 prompt 无强制力且占上下文；写死 workflow 则模型学不到非确定决策（追问、终局判断）。policy_id/version 在合成期与运行期硬绑定。（`最终研究方案.md` §5.5；`Policy Card与Agent Skills讨论总结.md`） |

## G3 训练、采样与稳定性（6 题）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G3-1 | 你说用 GRPO，但 ART 实际优化的 loss 不是教科书 GRPO——准确口径是什么？CISPO 和 PPO clip 的梯度行为差在哪？ | must | 口径：GRPO-style 组内相对优势（同 task K=8、无 critic）+ ART token-level CISPO loss：ratio 先 detach 再 clip 成 IS 权重（默认 ε=1.0/ε_high=4.0），梯度只走 new_logprobs。PPO 对比要按 advantage 方向说：surrogate 在不利于 trust region 的越界方向进入 clipped branch，相关 token 的 policy-gradient 路径饱和；CISPO 被 clip 的 token 仍保留 REINFORCE 式梯度——对 multi-turn 长序列的稀疏关键 token 是净收益。strict on-policy 下 clip 几乎不触发（实测 clip_frac_high ≤6.8e-6），行为近似 vanilla。（Note 024；`ART/src/art/loss.py:188`） |
| G3-2 | 组内全对或全错的 rollout 组怎么办？为什么"越难越该多采"被明确禁止？采样预算按什么定？ | must | 零方差组无梯度方向：全对（饱和）与全错（死区）一样被 dynamic filter 丢弃（省的是无效 optimizer 更新与统计污染；注意外层过滤发生在 reward 结算之后，省不了已发生的 judge 成本）。advantage 方差在 p≈0.5 最大，按难度倒数加权会扎进 p≈0 死区；按实测 K=8 组内方差加权（learnability 2-6/8 核心带、0-1 待复测、7-8 饱和做 canary——canary 被 drop 本身就是边界塌缩的 tripwire 读数）。（`adr-phase6-grpo-step2-variance-aware-mixture-sampler.md` §5.5；`learnability_pool_v2.py`；`train_grpo.py::filter_zero_variance_groups`） |
| G3-3 | 你们最终的长程 GRPO 训练 schedule 是怎么设计的？怎么防止终局动作偏科（只学好 Finish、Escalate/FWR 退化）？ | must | 当前 P5/T4 设计（**设计已冻结、T4 未执行，不许说成已跑过**）：12-cell 表面（4 task_type × 3 终局）上按 rare-action core + Finish anchors + breadth 分层组合；rare-action 零方差组同 cell 补位（collect-until-target + gather cap）；Finish anchor 即使全对也不强行制造梯度。对比历史设计：Step-2 固定配比 sampler（loan/Finish 0.74 : purchase/Finish 0.26 + 每 4 步 canary）是**历史诊断期设计**，讲它时必须标"历史"，别拿旧配比概括正式训练。（`expert-consult-p5-t4-planning-20260812.md`；`expert-consult-p5-t4-r2-scheme-20260812.md`；P5 board） |
| G3-4 | 任务的训练顺序和难度递进怎么安排？有没有任务被判定"梯度够不到"？ | common | curriculum：L1→L3 难度阶梯 + learnability 分桶联动；阶梯资格要求经验单调性——purchase×FWR 被判 NOT_ELIGIBLE_AS_MONOTONIC_LADDER（L1 全落 SFT 零供给的 manual 类），这是 curriculum/route 层 blocker，reward 版本变化解不了（修复假设待 80-episode 重测确认，不许说已证明）。调权纪律：v1 只做离线人工调权，自动在线调权留 v2（小数据+短窗噪声+归因难度）。（Note 027/028；`adr-phase6-grpo-reward-v3` §8；P5 board 记录 18-21） |
| G3-5 | KL penalty 在你们项目里防的具体是什么？为什么不在 GRPO 池里多混 SFT 数据来防遗忘？ | common | 防"政务复读机"：R_disclosure + P_turns 双重压力下模型会用压迫性长句一次性倾倒告知，KL 锚把 RL 分布拉回 SFT 语气。池配比为什么不够：往 rollout 池混更多已饱和样本不等于 rehearsal——零方差组不产生 policy gradient；要靠数据保留能力需要显式 auxiliary SFT/replay objective，本项目当前用 KL anchor（0.04→0.08，T4 冻结 0.08）。（`方案潜在风险与负面涌现预测.md`；Note 025；P5 T4 packet） |
| G3-6 | 长程训练的熔断/停训契约是什么？哪些信号有权直接停训、哪些只能告警？ | must | 按当前 T4 契约（**不是早期 Tier0 三分法，别混说**）：自动 hard-stop 只有确定性污染——NaN/Inf、JRA 确定性失败、split 污染、judge silent fallback 进入梯度路径；prob_ratio_max>4 是 hard pause + owner gate（历史最大 1.726），不等于科学判死；train-batch format/HV >5% 先告警并触发固定 confirmation probe（60 任务单侧 99% 精确二项下界，≥8/60 才确认），不直接杀 run；dev 指标主要控制 checkpoint promotion eligibility。不对称分级的理由：错杀 multi-week run 的代价远高于延迟发现温和问题（小样本告警噪声大：n=50 真率 2% 也有 7.8% 概率 ≥3 失败）。（`expert-consult-p5-t4-nonr2-hardstops-20260812.md`；`adr-phase6-rl-effectiveness` D7） |

## G4 难题复盘（7 题）

> STAR 结构：症状 → 假设树 → 定位 → 根因 → 修复 → 验证。面试官追的是排查方法论，不是背数字。

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G4-1 | rollout 吞吐的瓶颈是怎么一层层定位的？"busy-time 98% 在 agent"和"GPU 63% 空闲"矛盾吗？ | common | 三层：P1 GPU 拓扑（trainer/simulator 相位互斥可同卡）；P2 客户端并发（AGENT_MAX_CONCURRENT=4 串行化 64 条 rollout）；P3 真瓶颈 = 串行 8 轮 ping-pong + completion 长尾（9/64 条 38s 完成、最后一条 14min）。busy-time 是 per-trajectory await wall 之和，必须和相位条件 GPU util 联合解读。口径纪律：这是**跨阶段、跨配置的工程演进**（20min→2-3min 里各改动的硬件/packet 不同），别说成单硬件受控 benchmark；分阶段注明各改动的相对改善。（系统/infra 岗按 must 准备）（Note 021/022；throughput handoff §11） |
| G4-2 | 你们自己实现的 batched turn-boundary runner 实测慢了 2.1 倍，为什么？vLLM 的 continuous batching 和客户端攒批冲突在哪？ | common | 假设：同步成 all-agent→all-simulator 波次提 batching。实测更慢（538s→1127s）：vLLM 服务端已做 token 级 continuous batching（完成即换出、新请求即插入），客户端 co-submit 无增益；wave barrier 等最慢 completion；同相波次破坏多阶段流水线的相位错开。教训：先测后优化；生产级 serving 栈下客户端批处理通常负优化。已 revert 并永久废弃。（throughput handoff §10；ADR-interim 20260628） |
| G4-3 | LoRA 为什么训练省显存、serving 却可能更慢？你们那次 6 倍回归（1511→250 tok/s）怎么定位的？ | common | LoRA 原理一句：冻结主干只训低秩增量，优化器状态按 r 缩放。回归定位：World A（prefix cache 失效）被实测证伪（稳定 94%）；cheap-fix triage（enforce_eager/chunked_prefill/cudagraph 各 +3/6/11%）判定 NO CHEAP FIX；根因**收窄表述**：定位到 non-zero LoRA serving kernel path（r=128），cheap config 世界被排除；是否某个具体 Triton kernel 的固有瓶颈缺内核级因果验证，但工程上已足够支持切换 merged serving（训练仍 LoRA、serving 推全量权重）。注意该实验硬件是 2×A6000，与当前 2×4090 不同。（Note 023；lora-triage handoff） |
| G4-4 | async pipeline（k=1）为什么失败？"off-policy 一步"到底差在哪？ | common | 症状：比 strict 慢 2×、44% rollout 被丢。双层根因：(1) rollout 本身是瓶颈时 overlap 无收益前提不成立；(2) merged serving 下只有一份在线权重，in-flight episode 采到一半旧 model name 404——k 管"到达后的训练资格"，不管"采到一半旧模型消失"（LoRA mode 能跑是因为 max_loras=2 让旧 policy 存活）。语义层补充：strict 下一轮 train() 内部中位 40-48 次 optimizer step 本就复用同批 old_logprobs（PPO 式 minibatch drift）；该 run 中 k=1 的 drift 约为 strict 的 1.8-2×——是这次的历史观测，不是普遍定律。教训：语义兼容性（权重版本生命周期）要在实施前读源码验证。（Note 024/025；async handoff §4） |
| G4-5 | 训练中后期 val strict 从 0.844 掉到 0.804、grad_norm 尖峰 34.98——怎么区分"没东西可学"和"优化不稳定"？为什么局部修复全生效后 run 仍被 reject？ | common | 判别：format_failure 从 0 出现（缺闭合标签、幻觉 user 轮）且 truncated=0 排除截断；entropy 尖峰与 grad 尖峰时间对齐 → 两者叠加（饱和桶零信号 + 短轨迹 loss 分母过小）。T4-R 切片：seq_len 4096 padding 下 assistant token 仅 139-241 → token-mean 分母过小 → grad 尖峰；分母 floor 选 2560 而非 4096（4096 会把正常 control 压到 32-42% 被拒）；修复后 grad guard 0/823 全绿但 late residual −0.1087<0 仍 rejected——**局部修复全对 ≠ 全局通过**，验收门要用实际 batch 几何做可达性推演。熔断阈值追问素材：grad guard 用 max(2.0, 10×rolling median) 而非固定阈值——自适应各阶段正常波动、median 对尖峰稳健。（Note 025/026；t4r-rca handoff） |
| G4-6 | NoHitChecker 事故后你们上了 JRA。JRA 能证明什么、不能证明什么？为什么还需要独立的语义审计？ | must | JRA 证明**运行时身份**：checker 类/模型快照/threshold bundle/adjudicator 开关/prompt/endpoint 逐字段一致（config_sha256 只绑定配置身份，不绑定运行时实例——这就是事故机制：receipt 声称 hybrid 实际接 NoHitChecker，rent Finish 靠 keyword fallback 幸存 82/96 反而掩盖事故）。JRA **不能**证明：judge 的语义判定本身正确，也防不了 policy 学会 judge-specific wording 骗过正确运行的 judge → 需要 blinded 差分语义审计（R3，预注册为 T4 必做项、**未执行不许说已做**）。（`expert-consult-p5-t3b-planning-20260809.md` §1-2；`plan030_p5_jra.py`） |
| G4-7 | 什么样的任务才有资格进 RL 的梯度面/评测面？你们的任务有效性契约是什么？ | must | **边界：自述 D3 已答事故叙事（怎么发现、247 条退役），本卡只答方法论与机理。** 有效性契约五问：(1) 正确标签有可观测证据吗；(2) 证据可由 allowed tools 或对话到达吗；(3) policy card 支持该终局动作吗；(4) golden chain、环境与 terminal label 一致吗；(5) reward 真能区分对错行为吗。两个反例机理解释契约的每一条：frozen×loan Escalate（工具读不到冻结状态 + 政策不含 + simulator 不主动透露 → 完美 agent 必得 0，违反 2/3）；impersonation 幽灵（adversarial flag 只写 metadata 从未注入 opening → 无可对抗信号，违反 1/5）。治理教训：invariant 注册了但 `validate_task_instance()` 从不运行完整 registry → 有效性硬门 fail-closed 接线，**测量面有效性门必须在任何 milestone 之前**。（Note 029/030/031；P5-T0） |

## G5 由点扩面：RL/LLM 基础（结合项目，6 题）

> 面试官从项目聊回基础的典型路径。每题的答案都要能落回项目里的对应点。

| # | 问题 | priority | 锚点（基础点 + 项目落点） |
|---|---|---|---|
| G5-1 | GRPO 用组内均值当 baseline，相比 PPO 的 critic 放弃了什么、换来了什么？K=8 怎么定的？ | common | **边界：自述 C6 已答"为什么选 GRPO"（选型理由），本卡只答机制权衡。** critic 能跨任务学习共享价值函数、给单条轨迹绝对信号，组内 baseline 只在同任务内有意义；换来：省掉 value network（2×4090 装不下第二个大模型 + agentic 长轨迹 value 估计难）、无 critic 训练不稳定源。代价：零方差组无信号（配 dynamic filtering）、K 决定基线质量（K=8 是算力/方差折中，K 8→16 ≈ 任务数 +54% 的成本）。（RL 岗按 must 准备）（Note 024；power-sizing consult §3.5c） |
| G5-2 | DAPO、GSPO、CISPO 分别改了 GRPO/PPO 训练中的哪个环节？你们为什么停在 CISPO 不再换算法？ | common | 按三条轴答而不是背谱系：采样/过滤轴（DAPO dynamic sampling 补采零方差组）；IS 粒度轴（GSPO 序列级比率，治 token 级比率长序列方差大）；clip/梯度路径轴（CISPO detach-clip 保低概率 token 梯度）。停在 CISPO：strict 下≈vanilla 且实测稳定，项目瓶颈在任务有效性/测量面而非算法——换算法是打在错误靶子上。（Note 024/031；survey 文档） |
| G5-3 | SFT 的交叉熵和 RL 里的 KL anchor 在优化目标上有什么区别？为什么防跑偏用 KL 而不用 CE 当惩罚项？ | common | 两个方向的 CE 别混：SFT 最小化 CE(p_data, π) = H(p_data) + KL(p_data‖π)，前项是常数 → 等价 forward KL 拟合数据分布（mode-covering）。惩罚项场景里的 CE 是另一个方向：CE(π, π_ref) = H(π) + KL(π‖π_ref)（在策略自身分布下对参考分布的交叉熵）——它含 H(π) 项，最小化它会附带压策略熵 → mode collapse；而 KL(π‖π_ref) 不含熵项，只罚偏离参考策略的部分。答这题必须先声明 CE 的方向，否则"CE 压熵"的结论不成立。落点：KL anchor 防复读机（G3-5）。（`cross-entropy-vs-kl-diverge.md`；OPD survey §2） |
| G5-4 | 判断一个任务桶"RL 学不学得动"为什么看 pass@k 不看 pass@1？pass@k 怎么算？ | common | 两种估计别混：iid 近似 1−(1−p)^k（pass@1=0.16 → pass@8≈0.75，说明组内大概率有对比信号）；有限样本无偏估计 1−C(n−c,k)/C(n,k)（从 n 条已有采样 c 条成功估 pass@k）。两个真死区：pass@k≈0（无正例可对比）与 hard-zero 平零桶（全组同分 0）。落点：SFT coldstart 判据与 learnability 分桶（G3-2）都基于 K=8 probe。（Note 007；`free_rollout_eval.py` sidecar） |
| G5-5 | on-policy 和 off-policy 的界线在哪？staleness 怎么度量、为什么需要 importance sampling 修正？ | common | 行为策略 ≠ 目标策略即 off-policy；staleness = 数据由 k 步前 policy 采；旧/新概率比率失真使梯度有偏，IS 比率修正（clip 后是近似）。落点：strict 主线 vs async k=1 实验（G4-4）；CISPO 的 detach-clip 就是 IS 修正的宽容忍版。（Note 024；throughput survey §3） |
| G5-6 | 你报的 +9.21pp 在统计上站得住吗？主分析为什么用 paired delta + clustered bootstrap？ | must | **边界：自述 E4 已答对照设计与因果分层（arm A/B/C、冻结什么、一次预指定 look），本卡只答统计推断口径；因果分层被追问时一句话交叉引用 E4。** 三层：(1) 比较单位是同一 task 上两 checkpoint 的 paired delta（消任务难度异质性）；(2) 同 family 任务相关（共享骨架/词汇），IID 假设低估方差 → family-clustered bootstrap；DEFF 只做设计期精度近似、不替代正式推断，holdout 设计 n_families == n_tasks 把 DEFF 压到 ≈1；(3) CI 解读：S1 +9.21pp、family-clustered CI [+3.29,+15.13] 全正，一次预指定 look 不 re-cut 防多重比较。（`expert-consult-p5-power-sizing-20260806.md`；`adr-phase6-p5-t0-scope-and-gates-20260806.md` §7） |

## G6 业界动向与启发（4 题）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G6-1 | 业界 agentic RL 的工作里，哪几个直接改变了你们的设计？ | common | 讲"机制改变了哪个设计"，不背精确数字（精确百分点制卡前须回 primary source 二次核对指标定义与口径）：AReaL-SEA——user simulator 不微调会让 RL 显著退化 → Phase 4 单列 simulator SFT + 五门槛验收；dynamic filtering 与按方差筛任务 → 零方差丢弃 + learnability 带。CoVe——constraint fuzzification（用户不会一次报全字段）→ ambiguity_profile/reveal_policy 显式建模；verifier 验终态+关键约束而非唯一轨迹。（`方案评估报告.md`；`phase2-scenario-design.md`） |
| G6-2 | on-policy distillation 最近很热，为什么不做你们的主线？蒸馏和 RL 在你们项目里怎么分工？ | common | OPD 两要件：学生自采样 + 教师 per-token 信号；本项目无合格教师（外部模型不懂 sandbox 协议/hidden_truth，教师 template 还会拽偏学生格式），ground truth 来自可执行环境 → 天然 RLVR。exposure bias 关系：teacher forcing 的 O(T²ε) 累积正是 OPD 要治的，但自由 rollout 的 RL 训练本就在真实分布上跑。分工："蒸馏压缩已知、RL 探索未知"；遗忘恢复预案：KL anchor（已在线）→ IF-eval 监控 → Phase 6.5 self-distill（GRPO 前的自己当教师，同 tokenizer 绕开 cross-tokenizer 问题）作为 gated 选项，默认不执行（RL's Razor：on-policy 遗忘更少）。（`on-policy-distillation-applied-to-this-project.md`；OPD survey §1.3/§5） |
| G6-3 | 业界解 RL rollout 吞吐的路线有哪几类？async 的立场分裂（AReaL 说 staleness 可控、RollMux 说伤收敛）你怎么看？ | bonus | 一张地图：算法层减少 turn 数（PivotRL 只在高方差 turn 做 RL）、多 job 复用（RollMux）、async 流水线（AReaL/StreamRL/Laminar）、框架工程（verl/ReaLHF 参数重放置）。2×4090 单 job 下有效的只有框架工程 + 客户端并发，其余要么无 bubble 可填要么前提不满足（G4-4）。立场分裂根源是 staleness 敏感度任务相关；本项目 HV 安全约束硬、归因要求强 → strict 主线，切换条件见 G4-4 答案尾。（`rl-rollout-throughput-survey.md`） |
| G6-4 | 你的 reward 走规则+verifier 可验证路线，和 reward model / LLM-as-judge 路线怎么分工？judge 怎么防成为单点？ | must | 可验证优先：终局可程序化验证的场景里 RM 是不必要的近似；"说到位"不可规则化 → adjudicator 只做精准兜底（local NLI + keyword fallback 先挡）。三层防线：可验证规则优先（结构性减少 judge 暴露面）→ JRA 保证实际运行的 judge 身份（G4-6）→ blinded 独立语义审计防 judge gaming（R3 预注册、未执行）。判定方向不对称设计（G1-5）也是防单点的一部分。（`phase5-reward-pipeline.md`；Note 030/031） |

## G7 代码实现卡（5 题）

> 结合项目真实实现的"手写/走查代码"类题。制卡时带 codeSnippet（语言按实现：Python/PyTorch）。

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| G7-1 | 手写你们实际优化的 loss：给定同组 K 条 rollout 的 reward 和 per-token 新旧 logprob，写出 advantage 和 token-level loss，并指出它和标准 PPO surrogate 差在哪几行。 | must | 组内 `(r−mean)/(std+eps)`；zero-advantage 轨迹丢弃；CISPO 实际形态：`−mean(mask × clip(ratio.detach()) × adv × new_logprob)`——ratio detach 后 clip 成权重、梯度只走 new_logprob，被 clip token 仍有 REINFORCE 式梯度；PPO 是 `min(ratio·A, clip(ratio)·A)`、ratio 不 detach、越界方向梯度饱和；ε 量级差（0.2 vs 1.0/4.0）。（`ART/src/art/loss.py:188`；`tokenize.py:264-275`；项目镜像 `s4r2_sr5_art_weighting_contract.py`） |
| G7-2 | KL 散度的三种常用估计子（k1/k2/k3）写一下，各有什么偏差/方差性质？ | bonus | 题面先冻结符号：令 x = logπ_new − logπ_ref，从 π_new 采样估计 KL(π_new‖π_ref)。k1 = x（无偏、方差大、可取负）；k2 = ½x²（非负但有偏）；k3 = e^(−x)−1+x 即 (π_ref/π_new)−1−log(π_ref/π_new)（无偏非负）。落点：KL penalty 与 drift telemetry 的估计选择。（`cross-entropy-vs-kl-diverge.md`；`patches/art/phase6-cispo-drift-telemetry.patch`） |
| G7-3 | 多轮 agent 轨迹的 loss mask 怎么构造？你们项目里这个 mask 依赖什么容易踩的坑？ | common | 只对 assistant token 计 loss：逐 turn 记录 assistant 消息 token span 置 1，user/observation/tool 置 0。坑：rollout 必须保留原始 Choice 对象（含 logprobs），字符串重建 assistant message 会丢 logprobs 被 mask 掉；observation role 要归一化成 tool role 否则 chat template 丢工具观察。（`trajectory_adapter.py`；`rollout.py`） |
| G7-4 | 走查你们的 reward 结算：一个 episode 结束后从轨迹到 R_total 的完整数据流是什么？ | common | 配置先过 sha256 binding 校验（fail-closed）→ actual_final_state 导出 → compare_spec 子集比对（exact/exact:/in_set: 操作符，剥 runtime_policy 影子表）得 R_state → 结构化终局动作双重核对（reported label vs 最后一个结构化 action）得 R_terminal → 门控 R_complete → NLI/hybrid 得 R_disclosure（N1 一票否决）→ 效率罚（目标轮次用冻结的 phase3 回放中位数）→ hard 归零门 → 加权求和。不背公式，按函数与数据对象走。（`reward/aggregate.py`；`terminal.py`；`complete.py`） |
| G7-5 | 你们的输出协议（envelope）和训推一致性怎么保证？chat template 上踩过什么坑？ | common | 私有 `<analysis>/<action>` envelope（不用 Qwen3 原生 think 通道：自定义 envelope 已是思考区，原生通道冗余且破坏格式契约）；全库唯一 parser、fail-closed。坑链：训练用 LLaMA-Factory `template: qwen` vs 推理用 Qwen3 自带 jinja → token-diff 定位两处差异（default_system 缺失、末轮注入空 think 块）；`enable_thinking=False` 不是"关思考"而是插空 think 块（hard_violation 0→0.6875 实测）；修复 = 手写等价 jinja + token-diff gate 逼到 IDENTICAL。原则："约束我们的是训推一致性，不是模板名称"。（`adr-phase3-chat-template-qwen-not-qwen3.md`；Note 011/012；`verifier/format.py`） |

---

## 与自述集的边界核对（制卡时逐条检查）

- G1-1 ↔ C4/F6：C4 只有一行演进史，本卡要各版反例与证据。
- G4-6 ↔ C7：C7 = 防线清单 + 事故一句话；本卡 = config 哈希为何不绑定运行时身份 + JRA 边界 + 语义审计。
- G4-7 ↔ D3：D3 = 事故叙事；本卡 = 有效性契约方法论 + 两反例机理。**已在锚点首行写死。**
- G5-1 ↔ C6：C6 = 选型理由；本卡 = baseline 机制权衡。**已在锚点首行写死。**
- G5-6 ↔ E4：E4 = 对照设计与因果分层（arm A/B/C）；本卡 = 统计推断口径（paired delta / clustered bootstrap / CI 解读）。**已在锚点首行写死。**
- G1-6 ↔ F2：F2 = 结构性安全与恢复流程；本卡 = 分类依据 + hard-zero/负分/resample 取舍。**已在锚点首行写死。**
- G4-4/G4-5 ↔ F9：F9 = 现象+处置（bonus）；本卡 = 判别方法与语义兼容性。
- G7-5 ↔ F8：F8 = 为什么内嵌 Think；本卡 = 训推一致性链路与 template 坑。
- golden_chain 不锁轨迹（自述 F1）：不单列深问题，素材并入 G1-4 追问与 G7-4 走查。
- dl-basics 29 卡已覆盖通用 DL 基础 → G5/G7 只出 RL/LLM 训练相关、与项目耦合的基础。

## 统计（v3 定稿，逐题清点）

- G1: 7 题（must 4：G1-1/2/5/6；common 3：G1-3/4/8）
- G2: 6 题（must 2：G2-2/4；common 4：G2-1/3/5/6）
- G3: 6 题（must 4：G3-1/2/3/6；common 2：G3-4/5）
- G4: 7 题（must 2：G4-6/7；common 5：G4-1/2/3/4/5）
- G5: 6 题（must 1：G5-6；common 5：G5-1/2/3/4/5）
- G6: 4 题（must 1：G6-4；common 2：G6-1/2；bonus 1：G6-3）
- G7: 5 题（must 1：G7-1；common 3：G7-3/4/5；bonus 1：G7-2）
- 合计 **41 题：must 15 / common 24 / bonus 2**
- 岗位弹性：RL/数据岗 G2-1、G5-1 升 must（RL 岗口径 17）；系统/infra 岗 G4-1 升 must。

## 自查清单（v3）

- [x] 统计行与实际表格一致（41 = 7+6+6+7+6+4+5；must 15 / common 24 / bonus 2）
- [x] G5-3 CE/KL 公式方向修正，且"CE 当惩罚压熵"结论显式限定方向（CE(π,π_ref) = H(π) + KL(π‖π_ref)）
- [x] G5-6 收窄为纯统计推断卡，边界对 E4 写死（收敛轮 ds/gpt 共同阻塞项）
- [x] G1-6 收窄为分类依据 + hard-zero/负分/resample 取舍，边界对 F2 写死（收敛轮 gpt 阻塞项）
- [x] G5-4 区分 iid 近似与组合无偏估计
- [x] G1-3 区分"纯线性缩放否决"与"v2 质量项重分配"
- [x] G1-4 不声称信用分配已解决
- [x] G1-6 删除"负分扭曲 baseline"绝对说法
- [x] G2-3 低方差偏移论断加限定条件
- [x] G2-4 L0-L5 自动层 + L6 人工审核；n_families==n_tasks 标明 P5 特有
- [x] G3-1 PPO clip 按 advantage 方向描述
- [x] G3-2 删除"外层过滤省 judge 结算"不实陈述
- [x] G3-3 标注当前设计未执行、历史配比标"历史"
- [x] G3-5 收窄为"GRPO 池配比 ≠ rehearsal objective"
- [x] G3-6 按当前 T4 契约重写（confirmation probe / NaN-Inf 自动停 / promotion eligibility）
- [x] G4-1 标注跨阶段跨配置、不说成单硬件 benchmark
- [x] G4-3 LoRA 根因收窄为"non-zero LoRA kernel path，cheap fixes 排除"
- [x] G4-4 drift 1.8-2× 标注为历史观测
- [x] G6-1 精确数字纪律（制卡前回 primary source）
- [x] G7-2 题面冻结符号约定
- [x] G4-6/G4-7/G5-1 与自述集边界写死进锚点
- [x] 两位专家收敛轮均有条件同意，三个阻塞项已全部修复
- [ ] G6-1 制卡前回 primary source 核对论文数字口径（沿用自述集 F3 的同类纪律）
- [ ] G3-3 的 T4 schedule 锚点来自 2026-08-12 专家咨询文档，制卡前对照最新 P5 board 确认设计未再变

## Errata（2026-08-13，答案评审阶段发现，制卡时以本 errata 为准）

1. **G1-2 锚点**"R_terminal 三值精确对称比较"易误读：三值指三种合法终局动作之间的对称精确比较；R_terminal 分值本身是**二值 {0,1}**（v3 ADR 决策二），不存在 0.5 平局档。
2. **G3-4 锚点**根因写串：pur×FWR 的 NOT_ELIGIBLE_AS_MONOTONIC_LADDER 根因是 Wave-1 L1/L2 **同一套 recipe**（concept DC-22、boundary BD-C1:not_filed、同一 persona，差异仅措辞），无冻结难度干预（`handoff-phase6-sr5-purchase-fwr-l1l2-redesign-generation-20260723.md`）；"L1 全落 SFT 零供给的 manual 类（DC-23）"是 **pur×Esc L1** 的根因，且已于 2026-08-11 修复（manual→frozen）、2026-08-12 经 80-episode（10 任务×K8）重测确认，B4 终判 8/8 PASS、pur×Esc 从 0 恢复为 9 条 learnable——锚点中"修复假设待 80-episode 重测确认"已过时。
3. **G4-5 追问素材**梯度守门员倍数：当前代码 `phase6/art/tier0_stability.py` 为 `max(2.0, 7×rolling_median)`（multiplier 7.0、abs_floor 2.0）；笔记口径 10×，以代码为准。
4. **G2-3 锚点**"残余泄漏 10-14%"准确口径：after_delay 规则任务约占任务池 10-14%（nonloan 26/180、purchase 6/60）；实测泄漏率 purchase ≈10%（6/60）、nonloan ≈2.78%（5 起）。另：泄漏存在经 P_turns 的间接 reward 通道，"不进 reward"应限定为"核心 outcome/disclosure 分量不依赖 reveal 时机"。
5. **G3-2 锚点**"canary 被 drop 是 tripwire"易误读：饱和全对组被零方差过滤是正常且预期的；真正的 tripwire 是 canary 成功分布从全对发生迁移。
