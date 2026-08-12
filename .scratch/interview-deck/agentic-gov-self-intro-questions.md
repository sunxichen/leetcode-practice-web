# agentic-gov 项目自述阶段 · 问题题集（v3，三方一致稿）

> 用途：T14 第一批——面试**开场自述阶段**的问题清单。重点是广度：项目做什么、为什么这么做、
> 做成了什么。机制深挖题（reward 子项推导、sandbox 错误分类学、contrast pair 构造、NLI/JRA 判定链、
> 训练稳定性治理、框架选型细节、related work 等）在「延伸层」或后续深挖卡，不与核心层同权重学习。
>
> 事实基线日期：**2026-08-11**（含当日 P5 board 记录 18-21）。项目文档随实验演进，早期设计可能已被
> ADR 推翻；每题附「锚点」标注答案应落在哪个**当前有效**的事实上（含来源）。
> **凡标注"计划/待执行/预注册"的量，答题时不许与"已执行"混说。**
>
> 粒度规则：每题 1-2 分钟可口述完，对应答案 3-6 条原子要点。
> priority：must = 高频必答 / common = 常见 / bonus = 加分项。
> 岗位弹性说明：C6 / C7 表中标 must——对**大模型/RL 方向**岗位按 must 准备，纯应用岗可按 common 准备；
> E4 表中标 common——RL 研究岗可按 must 准备（RL 岗口径 must 实为 16）。priority 列保持 must/common/bonus
> 纯枚举，岗位弹性只在本说明与锚点中表达。
> 本文件只列问题，不给详细答案。
>
> 版本史：v1（36 题八组，按文档章节）→ v2（五组叙事线，吸收两位独立专家意见）→ v3
> （修正 6 项阻塞事实问题：统计账目、FWR 口径、C9 错误分类学、D4 根因定性、E4 对照臂因果、
> C7 算法口径；并按"核心层 / 延伸层"分层）。

---

## 核心层（Opening Core，25 题）

### A. 项目与本人

| # | 问题（面试官原话） | priority | 锚点（答案应落到的当前事实） |
|---|---|---|---|
| A1 | 请用一分半钟介绍一下这个项目：解决什么问题、怎么做的、你做了什么、结果如何。 | must | 90 秒结构：场景 20s（政务"边聊边办"，对话驱动工作流）→ 方案 30s（阶段骨架一句："范围冻结 → sandbox → 数据合成 → 双 SFT → reward 管线 → GRPO → 验证"；技术线一句：SFT 打底 + frozen simulator rollout + 可验证终局 reward + GRPO）→ 贡献 25s → 结果 15s（诚实口径：窄面正结果已证明，全表面仍在验证）。（`最终研究方案.md` §1-2；`adr-phase6-rl-effectiveness-verdict.md`；Note 031；P5 board） |
| A2 | 你能用一个具体的用户案例，把系统从开场到终局走一遍吗？ | must | 以租房提取为例：用户只说"取点钱交房租" → Agent 追问身份证/金额 → verify_identity → check_eligibility → submit → 告知**处理时效与结果/下一步**（不承诺"已到账"，终态是 submitted/approved）；异常分支（账户冻结 → Escalate；身份冒用 → FinishWithRefusal）。只讲 5-6 个节点，不展开 handler 细节。（`最终研究方案.md` §3-5；`withdrawal_for_rent.py` golden_chain） |
| A3 | 这个项目里你本人负责什么？做了多久？ | must | ⚠️ 角色边界需用户本人确认后回填。时间线口径：2026-04 启动至今约 4 个月，原计划 ~8 周（`技术选型-模型与RL框架.md` §5.1 需求表 D11 行、§6.4）；多出来的时间大头花在 Phase 2 数据工程与 Phase 6 测量面修复——"计划 vs 实际的差就是发现无效任务的过程"。 |
| A4 | 如果只能向面试官展示这个项目的一个点，你展示什么？ | must | 一个点：**构建并审计可信的 RL 测量面**。无效任务根因分析（Note 031：逐轮抽读 episode、防线接线审计）是反例，S1 held-out +9.21pp 是正例，两者合起来是一个贡献而非两个。 |

### B. 为什么这样做

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| B1 | 政务"边聊边办"是什么场景？通用大模型直接做会怎么失败？ | must | 对话驱动的工作流决策（意图识别、缺参追问、工具调用、合规办理、结果告知、异常升级），不是开放聊天；失败模式挑 3 个讲：缺参猜测而非追问、遗漏法定告知、该拒办/升级时不拒。口径注意：这是项目定义的**目标**失败模式，不是对通用大模型做过完备实证。（`最终研究方案.md` §2） |
| B2 | 为什么从公积金单域、4 个 task_type 开始？你说的"强约束"具体指什么？ | common | 目标是可验证、可审计、可扩展的训练体系，单事项证明方法后按规范扩展；公积金规则强约束、事项同构（查询/租房提取/购房提取/贷款还款，难度 ⭐→⭐⭐⭐⭐）。"强约束"= policy card 把政策规则显式化给 Agent 看 + sandbox precondition 结构性拦截 + golden_final_state 终局可程序化验证。（PRD §2；`phase0-scope-housing-fund.md`；`最终研究方案.md` §4.2、§5.5） |
| B3 | 为什么不是规则 workflow、prompt engineering 或 rejection-sampling SFT，而要引入 RL？ | must | 强规则交给 sandbox 结构性保证，不让模型学；模型负责非确定的多轮决策（追问、动作选择、终局判断、告知完整）；outcome 可验证使 RL 有可靠信号；承认 rejection-sampling SFT 是合理基线——P5 评测设计了 arm C 对照（**optional、descriptive only**，不改变 PASS/FAIL），且 RL 目前只在 Escalate 面有 held-out 正证据，不能把"用了 RL"当先验正确。（`最终研究方案.md` §1、§6；Note 007；`adr-phase6-p5-t0-scope-and-gates-20260806.md` §7） |

### C. 方案全貌（模块级广度）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| C1 | 整个系统有哪些核心模块？它们怎么连成一个训练闭环？ | must | policy agent + 通用 sandbox 引擎 + frozen user simulator + reward 管线（终态比对 + NLI/LLM hybrid 判定）；只讲模块与信息流，不背 schema 字段；框架层/插件层分层一句带过。（`最终研究方案.md` §5、§13） |
| C2 | 一次 RL rollout 是怎么跑的？Agent 能做哪些动作？ | common | task 装入 sandbox（policy 版本硬校验）→ opening → 多轮交互 → 终局导出 actual_final_state → 统一算 reward。动作口径：**5 种枚举动作** Ask_User / Call_API / Finish / Escalate / FinishWithRefusal，其中后 3 种是合法终局（P5 按 4 task_type × 3 终局 = 12 cell 判定）；早期设计文档写"4 种"是 2026-04 的旧口径。（`src/agentic_gov/schemas/trajectory.py`；`最终研究方案.md` §4.4） |
| C3 | 训练数据从哪来？全是合成的，怎么保证质量？ | must | 全合成管线：task factory 采样 → golden_chain 自动算终态 → teacher（deepseek-v4-flash）生成轨迹 → verifier 多层过滤 → 有效性硬门 fail-closed。规模口径：Stream① 4110→3996（post-rescan），实际 SFT train 3840 条。诚实细节：基础 main/adversarial 池里 FWR 仅 30 条、全是 identity-impersonation、两个字面模板；完整 post-rescan Stream① 算上是 54/3996 ≈ 1.3%——信号饥饿是真实的；247 条历史任务因有效性门退役。答题节奏：管线 5 步 → 一个口径数 → 两个诚实细节。（`handoff-phase2-to-phase3-20260601.md`；Note 030 P1/P2；Note 031） |
| C4 | reward 是怎么设计的？怎么把"办成事、终局对、说到位、别违规、别低效"统一起来？ | must | 终局统一结算；当前 v3：hard violation → 0，否则 `0.65×R_complete + 0.35×R_disclosure − 0.10×P_turns − 0.10×P_failed_calls`，其中 **R_complete = R_state × R_terminal**（终态对但终局动作选错不得分，修 v2 的 rare-action tie）；R_escalate 已移出训练总和（仅 telemetry）；每子项信息源独立。（`adr-phase6-grpo-reward-v3-terminal-gated-outcome.md`；`src/agentic_gov/reward/aggregate.py`） |
| C5 | user simulator 为什么单独训练并冻结？验收结果如何？ | common | simulator 是环境不是 policy；独立训练+冻结+上线门槛防 reward 污染。实测 5 门槛全过：指令遵循 98.9%、释放时机（RPCR 泄漏自由率）98.1%、persona 91.0%（贴线）、过早终止/扯话均 0%；残余 1.9% 泄漏集中在延迟/受迫披露。（`最终研究方案.md` §7；Note 006） |
| C6 | 为什么用 GRPO，而不是 PPO / DPO？ | must | 准确的算法口径：**GRPO-style 组内相对优势（同 task K=8、无 critic）+ ART 实际优化的 token-level CISPO loss**，不是教科书 vanilla GRPO（`adr-phase6-rollout-throughput-4b-adoption...` D6）；nuance：strict on-policy 下 CISPO clip 几乎不触发、行为近似 vanilla GRPO——这是 loss 级口径澄清，不是我们跑过的算法对比实验。组内相对优势与 2×4090 算力匹配。已知风险是零方差组（全对/全错无梯度），配套地有 learnability 2-6/8 带筛选与分层采样。工程实证加分项（不是算法选型证据）：async off-policy 管线（k=1）实测 2× 更慢 + 44% rollout 丢弃 → 暂停。（Note 024/025；ADR 2026-07-07） |
| C7 | 怎么防止模型钻 reward 的空子（reward hacking）？ | must | 分解式子项信息源独立——降低单点 hack 风险并便于诊断（不是绝对隔离）；hard violation 绝对零门；disclosure 双判定（NLI + LLM adjudicator）；simulator 冻结 + 泄漏监测。反面教材真实发生：T2 probe 的 judge 链实际接了 NoHitChecker（receipt 声称 hybrid），Finish 死池是 judge 伪影（真链重算 23%→77%）→ 此后 JRA 运行时证明已落地并用于后续 probe；R3 差分审计已**预注册**为 T4 ≥2 个 checkpoint 的必做项（T4 尚未执行，不许说已做）。（Note 030/031；P5 board 记录 8/17） |

### D. 结果与复盘（诚实口径）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| D1 | SFT 阶段做到了什么水平？ | common | **当前口径（现役 4B ckpt720，当前 harness 复测）**：overall strict 0.801、hard violation 0.000；分格：abq 1.000 / rent 0.817 / purchase 0.765 / loan 0.613；按终局：Escalate 0.935 / Finish 0.845 / **FWR 0.200（最弱格）**。历史口径：8B Phase 3 exit gate 62.2%/4.5% 已被判 stale/contaminated 并撤回，8B 重测 0.776。（`handoff-phase6-4b-agent-sft-vs-8b-eval-comparison-20260629.md` §9.3-9.5） |
| D2 | RL 到底证明了什么、没证明什么？ | must | 四段结构：① 训练分布内 C0→C15 +7.8pp；② 干净 held-out：Escalate +9.21pp（0.6974→0.7895，family-clustered CI [+3.29,+15.13] 全正）；③ 安全 caveat：同一 S1 上 HV 3/1408→7/1408（+0.2841pp），"HV 不升"未证明；④ 全表面 well-rounded **未证明**（P3 NOT_PROVEN、P4 NOT_PROVEN_FINAL，根因 = 无效任务主导测量面 + booster 安全/格式跷跷板，不是 GRPO 算法失败也不是 4B 容量墙）。（adr-phase6-rl-effectiveness-verdict.md；Note 031；P5 方案 §0/§5） |
| D3 | 项目里最严重的一次误判是什么？后来怎么证明原结论不成立？ | must | "RL 零进度"曾是测量伪影：全池复验发现结构性无效任务遍地——bridge 24/24、hard_train_v2 72/300、pool_390 42/390、hard_val_v1 4/180 无效（frozen×loan 不可观测 + impersonation 幽灵两类根因；注意这些数字跨池重叠，**不能简单加总**），247 条历史任务行被 exact-hash 退役；invariants 防线存在但 `validate_task_instance()` 从未执行完整 registry。以修复收尾：有效性硬门已接线 + 247 行退役 + 复验全数一致（P5-T0）。（Note 030/031；P5-T0） |
| D4 | 项目现在进行到哪一步了？哪些是结果、哪些只是计划？ | must | 已执行：P5 有效性硬门落地；3,100 条有效任务生成冻结（train 1800/dev 300/holdout 1000，8,252 calls / 0 阈值放宽）；learnability probe Wave1 已完成（2,880 episodes，3h13m，0 infra 故障），B4 初判 7/8——唯一缺口 purchase×Escalate：**现有证据支持 trigger 配额/分布假设**（L1 全落 SFT 零供给的 manual 类、L2/L3 饱和、历史 frozen pilot 10/12 可学），**修复假设待 80-episode 重测确认**（不要说"已证明非能力问题"）；修复已落码（70 行替换/重生成 = 48 内容变更 + 22 新 id，新 L1 45 条 frozen，r2 repin）。待执行：B4 收尾（pur×Esc 重测 80 → Wave2 11,520 → 合并终判）→ T4 长程 GRPO（~32,000 rollouts / 4-8 周，未授权）→ T5 全表面评测（16,000 episodes，一次预指定 look）。成功判据备询：P5 acceptance = aggregate superiority + 各终局/各 task_type NI + 无塌方 + HV≤1% + judge audit clean。（P5 board 记录 18-21；`adr-phase6-p5-t0-scope-and-gates-20260806.md`） |
| D5 | 如果重做一遍，你会最先改什么？ | common | 三件事：任务有效性门前置到数据合成期，而不是 RL 卡了近两个月才补；judge 链路 runtime attestation（JRA）从第一天接线（T2 NoHitChecker 教训）；holdout power 预算提前声明（26-task 面板 ±6.73pp 半宽被判 UNDERPOWERED_FOR_BLOCKING 的先例）。附带素材：每次方案偏离都落 ADR。（`expert-review-p5-plan-20260805.md`；P5 方案 §4；Note 031） |

### E. 边界、选型与价值（核心部分）

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| E1 | 模型和算力是什么配置？中途为什么把 policy 从 8B 换成 4B？ | common | 现役：policy Qwen3-4B + LoRA r128（ckpt720），simulator Qwen3-4B 冻结，AutoDL 2×4090（**卡位拓扑随训练/probe packet 冻结**，不是固定系统结构；曾有 trainer/推理分卡 + simulator 独立 HTTP vLLM 服务的形态）。换 4B 的决策链：rollout 是瓶颈且 agent GPU 63% 空闲（串行 8 轮+长尾）→ 4B 是语义零风险杠杆 → 先对齐 SFT 再同 harness 对比：4B 0.801 vs 8B 0.776、HV 均 0、实测 ~1.5× tail 加速（非理论 2×）→ safety-floor-first 采纳。（`adr-phase6-rollout-throughput-4b-adoption...`；上述 handoff §9） |
| E2 | 这个项目做到什么规模？多少数据、多少 rollout、多少算力？ | common | 已执行：SFT 语料 3996（train 3840）；P5 任务 3,100；Wave1 2,880 episodes ≈ 6.4 GPU-h。计划/待执行：probe 全量 14,400、T4 ~32,000 rollouts、T5 16,000 episodes——**说计划时必须带"计划"二字**。早期预算表（¥450-750）是 2026-04 的方案预估，实际已多轮 GPU 执行，不要当实际支出报。 |
| E3 | 这个项目目前最大的局限是什么？ | must | 单 domain 4 个 task_type；数据全合成、无真实分布校验（synthetic-to-real gap）；frozen simulator 长程保真度风险（P5 R4）；模型规模只验证到 4B（口径：4B 是边界但**已证明不是本次 RL 停滞的根因**，别说自相矛盾的话）；全表面 well-rounded 尚未证明。（P5 方案 §2、§7） |
| E4 | 怎么证明看到的提升来自 RL 本身，而不是换了数据、judge 漂移或动作先验重排？ | common | 对照设计：arm A = pre-RL SFT ckpt720，arm B = 按预注册规则选出的 RL checkpoint——**两臂 policy 本来就不同**，冻结的是其他一切：同 holdout、同 judge/JRA、同 simulator/采样口径、一次预指定 look 不 re-cut、分层报告 safety/Finish retention。诚实的因果分层：A/B 能回答"训练后 policy 是否优于起点"；**不能单独回答**"提升特异于 GRPO 而非 filtered-SFT"——后者靠 optional 的 arm C（rejection-sampling SFT 对照，descriptive only），未执行时须承认算法特异性归因未完整识别。（P5 方案 §4 Step 4；`adr-phase6-p5-t0-scope-and-gates-20260806.md` §7） |
| E5 | 如果把它做成真实政务产品，离上线还差什么？ | common | simulator-to-real gap；真实用户分布与政策数据接入；政策版本更新机制；隐私/合规审计与人类兜底；线上安全监控；跨事项与异步流程。 |
| E6 | 怎么扩到第二个事项或第二个 domain？ | bonus | 框架层（sandbox 引擎/reward 计算器/数据管线/eval）不动，新 task_type 注册插件（policy_card、API specs+handlers、golden_chain、compare_spec）；不背 11 步 checklist，讲"哪些复用、哪些必须重写"。（`最终研究方案.md` §13） |

---

## 延伸层（Opening Overflow，9 题）

> 条件式追问：面试官主动深挖到对应方向时才用，不与核心层同权重学习。制卡时这些题照常成卡，
> 但建议在题集配置/学习计划上按低优先处理。

| # | 问题 | priority | 锚点 |
|---|---|---|---|
| F1 | 什么是 golden_final_state？为什么不拿 golden 轨迹逐步比对？ | common | 合成期跑 golden_chain 得到的数据库快照，零人工标注；outcome-based 不锁定轨迹顺序——走不同的正确路径不判错（但效率仍由 P_turns/P_failed_calls 计分）；过程比对版 R_exec 因与该原则矛盾被移除。（`最终研究方案.md` §6.3、§6.8） |
| F2 | 怎么防止 Agent 违规操作，比如没验身份就动钱？ | common | subject-scoped precondition 在写入前拦下（验 A 写 B 过不了），不落库；**被拦调用计入 P_failed_calls，episode 继续，Agent 恢复后仍可使 R_complete=1**——不是必然归零。hard violation（即时归零）只剩 UNKNOWN_TOOL / TOOL_NOT_ALLOWED / 模型输出 envelope、parse、action-contract 失败（含 action 缺失）；注意 sandbox 参数层 INVALID_FORMAT 属**可恢复 efficiency**，不属 hard。语义型"已落库违规"结构上产生不出来，故不建终态扫描器。（`adr-sandbox-error-hard-vs-efficiency.md`；`adr-phase5-reward-divergence-from-final-proposal.md` 决策四） |
| F3 | 你的工作和 DeepSeek-R1 / DAPO 这些业界工作什么关系？ | bonus | 复用 GRPO-style 组内相对优势（DeepSeek-R1 路线），ART 实际 loss 是 CISPO；借鉴 DAPO 式动态过滤思路（非完整复现 DAPO）；差异点：我们的结论是瓶颈在任务有效性/测量面而非算法本身。⚠️ 仓库无系统 related-work survey——**制卡前先回 primary source 做一份 related-work note**，不临场硬编。（`art-framework-deep-dive.md`；`expert-consult-20260805.md`） |
| F4 | RL 训练用的数据和 SFT 是同一批吗？ | bonus | 部分同源是真实缺陷：C0-C15 的 Range-80 里 16 条 FWR 中 14 条直接来自 SFT 训练行（信号饥饿链条的一环）；P5 的 3,100 条是全新生成、与 eval/holdout family 隔离。（Note 030 P2；Note 029） |
| F5 | 合成数据 + frozen simulator，会不会让模型只学会模板和 simulator 的怪癖？ | bonus | family/skeleton/lexical pack 跨 split 隔离 + 近重复门 + holdout family 唯一；R4 退化策略扫描（检测 simulator-exploiting 策略，预注册进 T4）；承认 sim-to-real 风险不可消除只能监测。（P5 方案 §3-4；T3b 分区断言） |
| F6 | 项目里最重要的一次方向修正是什么？ | bonus | 挑一个讲透（推荐三选一：reward v1→v3 的 terminal gating；纯 NLI→hybrid 判定链；从"堆 infra 优化"到"4B 采纳+停止 infra"），讲清旧设计→证据→修正。（各 ADR） |
| F7 | 选 RL 框架时最关键的几个约束是什么？ART 的实际代价是什么？ | bonus | 三个决定性约束：多轮 rollout+工具调用原生、per-token mask 自动、2×4090 dedicated 可行；代价：框架新、dual-GPU/LoRA serving 等坑都要自己绕（batched runner 回退、merged serving）——讲 trade-off 而不是背 11/11 评分表。（`技术选型-模型与RL框架.md` §5；Note 021/022） |
| F8 | 思考链是怎么设计的？为什么不把 Think 做成独立动作？ | bonus | 内嵌思考：信息流相同，优化目标从"要不要想"变成"想什么"；不占轮次。注意口径：实现已是 `<analysis>/<action>` envelope（PR-6.2.4），早期文档的 `<think>` 示例是旧设计。（`Think机制方式对比.md`；README） |
| F9 | 训练中出现过哪些稳定性问题？怎么处理的？ | bonus | format 坍缩（step 30+ grad_norm 尖峰）→ Tier 0 grad guard + LR decay；async pipeline 2× 更慢 + 44% rollout 丢弃 → 暂停不废弃。（Note 025；ADR 2026-07-07） |

---

## 已移出本阶段的题（深挖卡候选，保留记录）

- Canonical Task 字段清单（原 v1 C6）→ 数据建模深挖
- contrast pair 构造（原 v1 D4）→ 数据合成深挖
- mandatory_disclosures 的 NLI+LLM 判定细节（原 v1 D6）→ reward/judge 深挖
- ADR 偏离管理（原 v1 G2）→ 素材并入 D5 答案
- phase 目录与 exit 标准背诵（原 v1 C5）→ 删除，阶段骨架并入 A1

## 统计（v3 实际账目，逐题清点）

- 核心层 25 题：must 15（A1、A2、A3、A4、B1、B3、C1、C3、C4、C6、C7、D2、D3、D4、E3）/ common 9（B2、C2、C5、D1、D5、E1、E2、E4、E5）/ bonus 1（E6）。
- 延伸层 9 题：common 2（F1、F2）/ bonus 7（F3-F9）。
- 全文件 34 题 = 核心 25 + 延伸 9；must 合计 15，符合专家共识上限（12-15）；RL 岗口径含 E4 弹性提升为 16（弹性增量，上限为参考线）。

## 自查清单（v3）

- [x] 统计行与实际表格一致（34 = 25 + 9；must 15）
- [x] priority 列为 must/common/bonus 纯枚举，岗位弹性只在文件头与锚点表达
- [x] C3 FWR 口径分层（基础池 30 条/2 模板 vs 完整 Stream① 54/3996）
- [x] F2（原 C9）错误分类学修正：precondition 可恢复 ≠ R_complete 必然 0；INVALID_FORMAT 属 efficiency；envelope/parse/action-contract 失败才是 hard-zero
- [x] D4 根因定性收窄（证据支持配比假设，待 80-episode 重测确认）+ 70 行替换口径（48 变更 + 22 新增）
- [x] E4 对照臂修正（A=ckpt720 / B=RL final，其余冻结）+ 因果两层区分 + arm C optional
- [x] C6 算法口径（GRPO-style advantages + ART CISPO loss，非 vanilla GRPO）+ async 仅为工程对照
- [x] A2 用词（处理时效/结果，不承诺到账）；A4 单点化；C7 执行状态（JRA 已落地 / R3 仅预注册）
- [x] E1 拓扑措辞、D3 数字不可加总提醒、F3 related-work 前置研究警告
- [ ] A3 角色边界仍待用户本人确认
- [ ] F3 制卡前需先完成 related-work note（primary source）
