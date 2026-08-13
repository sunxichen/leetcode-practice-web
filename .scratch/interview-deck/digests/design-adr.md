# 项目面试深问素材 Digest：agentic-gov 研究方案与 ADR

> 来源：explorer 对 `/Users/sunxichen/Projects/agentic-gov/research-proposal/` 下主设计文档 + 16 份 ADR + 专题讨论稿的消化（2026-08-12）。

## 1. 主线深挖素材

### 主线 A：Reward 分解与 v1 → v2 → v3 演化

- **v1（终稿方案 §6.2 / `phase5-reward-pipeline.md` §4.7）**：`R_total = 0.50·R_complete + 0.25·R_disclosure + 0.05·R_escalate − 0.10·P_turns − 0.10·P_failed_calls`，hard violation 直接归零。设计原则三件套：信息源独立、建模对象独立、对 GRPO 组内能产生方差。
- **v1 的"语义瑕疵"**（`adr-phase6-grpo-reward-v2-quality-ceiling-1.md` §1）：penalty 权重计入总预算，但正常成功 episode 中 penalty=0，质量上限不是 1.0 而是 Escalate 0.80 / Finish 0.75。"不是代码 bug，方案原文就写了'最好情况 0.80'，但 reward 语义不自然"。
- **v2（方案 A）**：质量项 ceiling 归一到 1.0（Escalate: 0.60/0.30/0.10；Finish: 0.65/0.35），penalty 保持外部扣分。被否决的 alternative：
  - *纯 normalization（除以 0.75/0.80）*：对 GRPO group-wise advantage 基本是 no-op，"只让 metric 好看"，且 full raw scaling 会放大 penalty 等效值——收益零、成本非零。
  - *更激进 shaping（speed bonus、continuous R_complete、judge margin）*：reward hacking 风险 + 需更多验证，park。
  - 关键反直觉点：**"把 max reward 从 0.8 调到 1.0"被正式否决**（`adr-phase6-grpo-sampling-frontloading` §4.3）——GRPO advantage 组内相对，线性缩放下全 0.8 的组变全 1.0 仍是零方差，对 drop rate 毫无影响。
- **v2 counterfactual 证据**：Step-1 保存的 728 rollout / 91 groups 重算，mean group std +30%（loan/Finish 0.2325→0.3036），但 zero-var groups 数量不变——v2 放大已有方差信号，不能为饱和组创造新方差。
- **v3（`adr-phase6-grpo-reward-v3-terminal-gated-outcome.md`，纯前瞻、未授权实现）**：诊断出 v2 没修的洞——`R_complete` 只比 final state，而 Escalate/FinishWithRefusal 常以空 compare_spec（no-write equality）表示，于是"正确的 FinishWithRefusal"与"错误的 no-write Finish/Escalate"在同一 final state 上打平（state/action tie）。修法：`R_complete = R_state × R_terminal`，`R_terminal = 1[actual == expected]`，三值精确对称比较、fail-closed（缺失/未知/malformed → 0，**绝不从 final state 反推终局动作**），三个终局共用同一公式，并**把 R_escalate 从训练总和移除**（否则对 Escalate 重复奖励、对 FWR 非对称补丁）。配套：v3 config 必须 canonical JSON + SHA-256 hash-bind 到 run manifest，preflight 重算不匹配即 fail-closed；历史 v1/v2 artifact 不可追溯改写。
- **v3 被拒替代方案**：(A) 保留 R_escalate 再加 R_fwr（两个 terminal-specific bonus 把同一终局 correctness 拆成非对称补丁）；(D) 纯二值 R_total（丢掉 disclosure/efficiency 连续 shaping 与可诊断性）；(E) 用文本/LLM judge 推测 terminal action（结构化动作已是 protocol-level 可观测结果）。

### 主线 B：终局统一结算 vs 过程奖励

- **决策**：所有 reward 子项 episode 结束统一计算（terminal-only），唯一例外 hard violation 即时终止归零（方案 §6.1）。选型维度 D7 要求框架支持 trajectory-level reward（`技术选型` §5.1）。
- **`<think>` 不设独立 reward 子项**（方案 §6.5）：推理质量通过动作错误自然投影到 R_complete / R_disclosure / P_failed_calls；直接给中间推理文本打分诱发 reward hacking（"看起来正确但实际无用"的推理）。
- **过程 reward 子项被系统性移除的考古**（方案 §6.8）：R_exec（工具选择/参数/时序准确率——全被 R_complete + P_failed_calls + P_turns 覆盖，且依赖 golden_chain 路径比对，与 outcome-based 原则矛盾）、R_recover（与 R_complete 在恢复维度完全重叠）、P_redundant（被 P_turns 覆盖，V1 工具数少独立方差有限）——全部降级为 eval-only 指标。
- **为什么过程奖励有害**：`golden_chain` 终稿 §三——outcome-based reward 容忍"同一参考业务空间内的多样过程"：可先问身份证再问金额、可试错恢复、可插入只读查询，只要终态对+告知全+该升级升级就得高分；路径比对会把"更长但正确"的路径误判为差。

### 主线 C：Sandbox 错误分类学（hard vs efficiency）

锚点：`adr-sandbox-error-hard-vs-efficiency.md`。

- **三分类**：
  - Hard violation（立即终止、R_total=0）：`UNKNOWN_TOOL`（编程级错误）、`TOOL_NOT_ALLOWED`（越权红线）——"做了不该做的事"。
  - Efficiency penalty（不终止、计 P_failed_calls）：`PRECONDITION_NOT_MET` / `MISSING_REQUIRED_ARG` / `INVALID_FORMAT`——"做了对的事但方式不对"，agent 可见错误 JSON 后自我修正。
  - 业务逻辑拒绝（不罚 agent）：`ELIGIBILITY_FAILED` / `AMOUNT_EXCEEDS_LIMIT` / `ACCOUNT_FROZEN` 等 14 种——sandbox 正确工作的结果，agent 需据此向用户解释。
- **理由**：(1) 与方案 §6.8 拆分 unsafe_call_ratio 意图一致；(2) **GRPO 需要 trial-and-error 学恢复——首次参数错就终止 episode，agent 永远学不到恢复路径**；(3) Phase 3 exit gate `hard_violation ≤ 5%` 不被效率问题污染。
- **被否决**：全部 hard（过严）；全部 efficiency（TOOL_NOT_ALLOWED 越权必须硬零）；运行时可配置（Phase 3/6/7 需一致判定，固定分类更可复现）。
- **下游推论**（`adr-phase5-reward-divergence` 决策四）：方案 §6.4 的语义型硬违规（未核验即写入、无资格仍受理）被 subject-scoped precondition（§5.5）**写入前结构性拦截**，永远落不了库——"终态 forbidden_side_effects 扫描器"是结构上永远扫不到东西的死代码，不建，改用不可达断言测试固化该保证。

### 主线 D：Simulator 信息边界与泄漏

- **信息边界**（`adr-simulator-information-boundary.md`）：simulator 训练与推理**只看 agent/user 自然语言 turn，跳过所有 tool/observation turn**（连续 agent turn 合并）。理由：真实群众看不到工作人员在哪个系统查的、API 返回的 JSON；若 simulator 看 tool result，会学到从 JSON 提取信息的快捷路径，且 **Agent 会学到"只要调了工具就行，不用好好说结果"**——GRPO 环境保真度崩塌；RPCR 评估虚高（simulator 对"agent 已知道什么"的感知不再来自对话本身）。对比：Agent 看得到 tool result（它自己调的），Simulator 看不到（它是对面群众）。
- **泄漏处理**（`adr-simulator-delayed-reveal-not-blocking-phase6.md`）：opening 泄漏已归零（修法：首轮用户话用 canonical `opening_message` 播种），剩余泄漏全集中在 `reveal_when_requested_after_delay`——simulator 把"被问后要再拖一轮"塌缩成"被问即答"（答太快）。**决策：不阻断 Phase 6**。判据不是"simulator 是否完美"而是"会不会污染 GRPO 信号或教坏 Agent"：(1) leak monitor 是 telemetry 不进 reward；(2) 非 unprompted leak，不教 Agent 跳过追问；(3) 占比仅 10-14%；(4) simulator **一致地**秒答（低方差），组内基线一起平移、相对 advantage 几乎不受影响——真正伤 P_turns 的是高方差。写下四条**反转条件**（变 unprompted / 占比 >30% / reward 改依赖 reveal 时机 / leak 进 reward → 任一成立即改判阻断）。
- **simulator 信号绝不进 reward**（`phase5-reward-pipeline.md` §1 + 方案 §7.1）：reward 只读 Agent 动作 + sandbox 终态。

### 主线 E：golden_chain 的角色边界

锚点：`golden_chain的角色、边界与设计权衡（终稿）.md`。

- **角色定位**：golden_chain 是**数据合成阶段的确定性参考执行器**（`db_init_state` → 执行参考 API 链 → 导出 `golden_final_state`），服务对象是 **reward 的参考真值，不是 Agent 的过程模仿**。一个 task_type 对应一个"以 task 为输入的确定性函数"，不是"永远只有一条静态 API 列表"。
- **关键区分**：outcome-based reward 保留对话层与局部策略层泛化，但**不能天然吸收业务骨架本身的多样性**——容忍"同一骨架内不同走法"，不能容忍"骨架本身已不同"（如账户冻结需先解冻的合法分支若未建模进参考终态，更贴近真实业务的路径反被误判）。
- **"提前构建骨架"的辩护**：政务规则不是工程师发明的镣铐，是外部世界本已存在的约束（政策条文、前置条件、合规审计）的显式化投影。覆盖增长 = 参考业务空间更丰富，不是骨架消失。
- **LLM 生成 golden_chain**：技术可行（离线生成 + 冻结绑定 task_id，不会天然 reward 漂移），但**研究含义变了**——从"验证可解释 RL 训练路线"变成"teacher-generated executable supervision / 蒸馏式数据合成"；student 上限受 teacher 质量约束。真正判据不是"LLM 会不会漂"而是"LLM 之外有没有独立验证层兜底"。术语上不等同 RLAIF（LLM 不直接当 judge 打分）。
- **演进路线**：单一 golden_final_state → 多终态等价类 → 声明式断言 → rubric-based evaluation；V1 位于确定性终态一端，因当前场景骨架刚性足够高。

### 主线 F：Think 内嵌 vs 独立动作

锚点：`Think机制方式对比.md` + 方案 §3.2 + `adr-phase3-chat-template-qwen-not-qwen3.md`。

- **决策**：方式二（内嵌）——每个 assistant turn 先 `<think>/<analysis>` 再 `<action>`，Think 不是独立 action type。方式一被否：模型要学"要不要想"+"想什么"两个问题；Think turn 拉长 episode、与 P_turns 冲突；reward 要为 Think 单独建模校准；流程固定场景增加不必要的策略自由度。
- **关键判断**：政务边聊边办的核心难点是"每步是否想对"，不是"是否多插入一轮思考"。
- **chat template 联动决策**：Qwen3 基座但刻意用 `template: qwen`（纯 ChatML，无 thinking 控制 token），不用 `qwen3`/`qwen3_nothink`——自定义 `<analysis>/<action>` envelope 本身就是思考区，原生 `<think>` 通道冗余且破坏格式契约；Qwen3 原生模板有已知训推 token 不一致问题（LLaMA-Factory #10530）。**反向证据**：推理端强加 `enable_thinking=False` 后 hard_violation 0→0.6875、strict_success→0.22。核心原则："约束我们的是训推一致性，而非模板名称"。

### 主线 G：GRPO 分组与 contrast pair

锚点：`adr-phase6-contrast-pair-grpo-grouping.md`。

- **决策一**：A/B 两侧**各自成组、绝不混进同一 GRPO 组**。数字论证：混组后基准线变"两个不同问题的混合平均"——A 简单（该 Finish，~0.8）B 难（该 Escalate，~0.3），组均 0.525 → **做错的 A（0.75）在均线上被强化、做对的 B（0.30）被抑制**，学到"像 A 那样做就对" = 最怕的过度 Finish 偏置。一句话："GRPO 的对比发生在同一任务的多次尝试之间，不是成对任务的两侧之间；contrast pair 是数据层的对照，不是 advantage 层的对比。"
- **决策二**：不做"A/B 强制同 step 共调度"——收益是未经证实的二阶效应，代价是调度约束 + 给消融引入混杂变量（损害"RL 是否有效"的可归因性）。留为"边界塌缩才重启"的触发项。
- **决策三**：子采样必须**成对**（pair-aware）；拆对后残留的多半是 Finish 侧，制造过度 Finish 偏置，与 Exit"hard violation 不上升"直接冲突，且污染 264 boundary budget 配对统计。
- **contrast pair 的价值渠道**（不依赖同组/同 step）：(1) 训练池覆盖边界两侧（curriculum 层）；(2) 评测期 contrast-set bucket 度量边界区分能力（evaluation 层）。

### 主线 H：采样器设计（frontloading bug → variance-aware mixture）

- **Front-loading bug**（`adr-phase6-grpo-sampling-frontloading-and-loan-escalate-floor.md`）：正式 run drop_rate ≈ 0.94 的根因**不是 reward 饱和**而是采样顺序 bug——`loan_escalate_min_fraction=0.20` 把 loan+Escalate 单元堆到池子最前，顺序消费导致 36 步 100% 只采到 loan（91% reward 钉在 0.8），而该桶 val strict=1.0 已饱和（零信号）。三路独立证据：(A) 1192 条 rollout 全是 loan；(B) 本地重建池子首个非 loan 在 index 334 = step 41；(C) 分桶画像显示真正有信号的是 loan/Finish（val 0.25）和 purchase/Finish（0.735）。修法：**floor 与顺序解耦**（flatten 前洗牌，presence ≠ position）+ floor 默认归零（它在保护饱和桶；ADR-C 设 floor 的原始理由是拿到 SFT 分桶数据前的对冲，已过时）。
- **Step 2 variance-aware mixture sampler**（`adr-phase6-grpo-step2-variance-aware-mixture-sampler.md`）：Step 1 后 drop 降到 43%，但后 10 步升到 52.5%、`rent/Finish` 贡献 54% dropped groups（val strict 99% 近饱和）。决策：mixture 而非硬切换 = reduced-natural baseline（排除 drop≥0.90 且 val strict≥0.95 的零信号桶）+ variance-targeted slots（loan/Finish 0.74 : purchase/Finish 0.26，来自实测 K=8 trainability 而非 val proxy 猜测）+ boundary canary（每 4 步 1 个 Escalate group 轮转，职责是监控边界塌缩而非贡献梯度，被 drop 是预期行为）。
- **承重原则**：**按方差（实测 drop）加权，严禁按难度加权**——GRPO 梯度来自组内方差，p≈1 饱和桶和 p≈0 全失败桶同为零方差，方差在 p≈0.5 最大；inverse-pass-rate 启发式会扎进 p≈0 死区。
- **train 分布 ≠ eval 分布查证结论**（§6.1）：train 偏斜（rent 48%）是合成副产品（Stream① 预算单位是 decision concept 而非 task_type，task_type 占比是派生量），eval 均衡是刻意的——采样层重加权是"纠正合成副产品"，不违背既定分布设计目标，无需池层再造数据。
- **v1 不做自动在线调权**：人工/离线 adaptive；自动调权留 v2——数据量小、在线调权易被短窗口噪声带偏、增加论文归因难度。

### 主线 I：KL penalty 取舍

- **演进**：GRPOTrainConfig 默认 `KL_PENALTY_COEF=0.04`（`adr-phase6-rollout-throughput` D6）→ Tier 0 止血提出 0.04→0.08/0.1 对照（`adr-phase6-rl-effectiveness` H1）→ 后续 T4 contract 冻结 KL=0.08。
- **定位**：KL 是**防遗忘/防语气崩坏的锚**（把 RL 分布锚定在 SFT 模型上，"用 SFT 的自然语气达成 RL 探索出的高效策略"，对应风险文档"复读机"防御），也是 async k=1 的约束之一（"不跑 naked off-policy，必须保留 CISPO correction 与 KL 约束"）。
- **明确不做**：不用训练数据配比防遗忘（零方差组不产生梯度）；调优顺序"KL/entropy/grad_norm 不稳先降 target fraction，不先动 reward 或 LR"。
- **熔断分层**（`adr-phase6-rl-effectiveness` D7）：质量信号（format_failure/hard_violation）才有停训权；优化统计信号（grad_norm/entropy）只告警 + 触发 confirm-before-kill mini-val probe——"宁可漏杀不可错杀：false positive 成本 = 丢失学习机会 + 幸存者偏差"。

### 主线 J（工程向高价值素材）：吞吐、serving 与 async gates

- **batched runner 永久废弃**：实测严格更慢（2.1x）——vLLM 已做 continuous batching，client 端 wave 加 barrier 反而 serialize 了跨阶段异步 overlap。
- **LoRA serving 6x 退化无 cheap fix**：vLLM Triton JIT LoRA kernel 在 r=128 non-zero delta 下从 1511 tok/s 跌到 ~250；enforce_eager/no_chunked_prefill/no_cudagraph 全 <11%。4B 尺寸优势被 kernel 退化吸收。
- **merged serving 架构边界**（`adr-phase6-rl-effectiveness` D4）：merged 模式 vLLM 只有一份全量权重，训练后旧 policy 消失 → PipelineTrainer stale discard 是"先采完再算账"，但 merged 下 in-flight episode **采到一半 model not found**——"merged + 原样 k=1"不存在安全组合；k=0 + merged + stock worker loop 也不自动安全。选项：multi-LoRA（慢）/ merged+drain-barrier（退化 strict-like）/ merged+turn-level mixed-policy（新训练语义，需单独 ADR）。
- **CISPO 源码验证**：`backend.train()` 做 1 epoch（TRL num_train_epochs 被 queue bypass）、gradient_accumulation_steps=1；CISPO detached ratio + clip [0,5] 在 strict 下几乎不触发 ≈ vanilla GRPO；CISPO 不杀低概率关键 token 梯度（PPO clip 会杀），对 agentic 长序列是净收益。async k=1 staleness 是"drift 翻倍"而非"on-policy 跳到 off-policy"。
- **判定器同源与漂移治理**（`adr-phase5-p02-p08` 决策七）：修复判定器 bug（prompt v1→v2 + force-review）造成与 Phase 2 SFT 数据过滤口径漂移——**接受漂移、不回扫**，核心理由"偏差方向是收窄而非扩大"（新判定器更保守更准，只纠正旧 FP）；G1"同源"重新解读为"frozen NLI hash + adjudicator 关键配置同源，prompt_version 允许随质量修复前进但须 ADR 留痕"。

## 2. 权衡与反直觉点

| # | 看起来应该 X | 实际选了 Y | 出处 |
|---|---|---|---|
| 1 | 把 max reward 从 0.8 调到 1.0 "更符合常理" | 否决：GRPO 组内相对 advantage 下线性缩放是空操作，零方差组缩放后仍零方差 | adr-frontloading §4.3 |
| 2 | contrast pair 放同一组"对比更直接" | 各自成组：混组基准线被任务难度污染，奖励错的 A、惩罚对的 B，放大过度 Finish 偏置 | adr-contrast-pair §4.1 |
| 3 | 首次调错工具就该终止 episode（严格） | 参数级错误降级为 efficiency penalty、episode 继续：GRPO 要靠 trial-and-error 学恢复 | adr-sandbox-error |
| 4 | simulator 看得越多越聪明（给它 tool result） | 只看自然语言：否则 agent 学到"调了工具就行不用好好说"，RPCR 虚高 | adr-simulator-info-boundary |
| 5 | simulator reveal 偏急是环境 bug，应阻断训练 | 不阻断：不进 reward、非 unprompted、低方差一致偏移不伤组内 advantage；写下四条反转条件 | adr-delayed-reveal |
| 6 | 越难的任务越该多采（inverse pass rate） | 严禁难度加权：p≈0 与 p≈1 同为零方差死区，按实测 K=8 方差加权瞄准 p≈0.5 | adr-step2 §5.5 |
| 7 | 保底配额 floor=20% 保护重要桶 | floor 归零：它在保护已饱和（零信号）的桶，且 floor 被误用成排序键造成 front-loading | adr-frontloading |
| 8 | 格式失败应拒采重采（保住其余信号） | 维持 hard-zero：DeepSeek-R1 先例证明简单硬零可行；实测 format_failure 合计 2.08% < 5% | adr-format-failure |
| 9 | 纯 NLI 判定 disclosure（原方案） | NLI+LLM adjudicator 混合：中文政务 hypothesis 上纯 NLI 不可达 90%（P-07/N1-03 任何阈值做不出） | adr-phase5-divergence 决策一 |
| 10 | 建终态 DB 扫描器检测违规写入 | 不建：subject-scoped precondition 写入前结构性拦截，扫描器永远扫不到东西→死代码；改不可达断言测试 | adr-phase5-divergence 决策四 |
| 11 | Qwen3 基座配 qwen3 原生模板 | 用 `template: qwen` 纯 ChatML：自定义 envelope 已是思考区；hard-switch 实测 hv 0→0.6875 | adr-phase3-chat-template |
| 12 | 并发/批处理提升 rollout 吞吐 | batched runner 实测 2.1x 更慢，永久废弃；瓶颈是 serial 8-turn + completion long tail + LoRA kernel | adr-rollout-throughput D1/D3 |
| 13 | NLI premise 用 full dialogue 更全 | per-assistant-message + max score：mDeBERTa 512 token 截断恰丢最后几轮 disclosure（0.0032 vs 0.9971） | adr-l2-nli |
| 14 | SFT 数据 concept 欠配就 top-up | 不 top-up：precondition 链学习信号在 RL rollout 中天然存在（调错→报错→修正），SFT 只打底 | adr-stream1-no-topup |
| 15 | 熔断阈值越灵敏越好（grad_norm>2 即停） | 质量信号才有停训权，优化统计只告警+probe 确认：宁可漏杀不可错杀，错杀造成幸存者偏差 | adr-rl-effectiveness D7 |
| 16 | reward 该给思考过程打分 | `<think>` 不设独立 reward：直接给推理文本打分诱发 reward hacking | 方案 §6.5 |
| 17 | eval 均衡所以 train 也该均衡 | train 偏斜是 concept-密度派生的合成副产品，采样层重加权即够，不动池 | adr-frontloading §6.1 |
| 18 | merged serving 更快就直接配 async k=1 | merged 下旧 policy 消失，in-flight episode 中途 404；"merged+原样k=1"不存在安全组合 | adr-rl-effectiveness D4 |
| 19 | v2 与 sampler 分开跑干净消融 | 同轮启用、接受归因不干净：有限算力下终局效果优先，用 v1 shadow logging 补可解释性 | adr-reward-v2 决策二 |
| 20 | no-adjudicator 时 force-review 槽位应判负 | 保持 local hit：没有 adjudicator 无从复核，"不能凭空护负" | adr-phase5-p02-p08 决策四 |

## 3. 候选深问问题（只列问题）

**Reward 设计：**
1. reward 五项子项如何论证"信息源独立、不重叠"？R_complete 真覆盖不到 disclosure 吗？（方案 §6.1/§6.3）
2. v1→v2 把质量 ceiling 归一到 1.0，为什么"纯 normalization"被否？GRPO group-wise advantage 对常数缩放的敏感性？（adr-reward-v2 §3.1/§3.2）
3. v2 与 variance-aware sampler 同轮启用，归因不干净怎么处理？shadow logging 记了什么、能回答什么？（adr-reward-v2 决策二/五）
4. v3 为什么用 gating（R_state × R_terminal）而不是给 FinishWithRefusal 加对称的 R_fwr 项？（adr-reward-v3 §10-A/B）
5. v3 fail-closed 为什么"绝不从 final state 反推 terminal action"？no-write equality 下 state/action tie 的机制？（adr-reward-v3 §1.2/决策二）
6. hard violation 为什么是归零而不是负分？（adr-reward-v2 决策三、adr-format-failure）
7. 格式失败也归 hard-zero，和"参数错误算 efficiency"的分类标准自洽吗？边界画在哪？（adr-format-failure vs adr-sandbox-error）
8. 终局统一结算如何解决 credit assignment？多轮里哪一步做错怎么定位？（方案 §6.1 + golden_chain 终稿 §三）

**Sandbox / 环境：**
9. hard / efficiency / 业务拒绝三分类的依据？为什么业务逻辑拒绝不罚 agent？（adr-sandbox-error）
10. subject-scoped precondition 是什么？cross-subject leakage 怎么污染 RL 训练信号？（方案 §5.5）
11. 为什么 handler 拿不到 runtime_flags？handler/引擎接触面封闭防什么？（方案 §5.6）
12. sandbox/golden_chain 的 bug 就是模型上限——Agent 会抓住 verifier bug 拿高分，怎么防？（风险文档 §一.2）

**Simulator：**
13. simulator 不看 tool result，它怎么知道 agent 查到了什么、该不该配合？训推一致性怎么保证？（adr-simulator-info-boundary）
14. `reveal_when_requested_after_delay` 偏急为什么不阻断训练？"一致地错"vs"高方差地错"对 GRPO 的影响差异？（adr-delayed-reveal §理由 4）
15. simulator 泄漏监控为什么不进 reward？agent 学会 prompt-injection 套 simulator 底牌怎么办？（adr-simulator-info-boundary + 风险文档 §二.3）
16. frozen simulator 也是 LLM，行为分布漂移怎么监控、上线门槛是什么？（方案 §7.3）

**GRPO / 采样 / 训练：**
17. contrast pair 为什么必须异组？用具体数字说明混组如何"错的被奖励、对的被惩罚"。（adr-contrast-pair §4.1）
18. 不做 A/B 同 step 共调度的理由？"触发再议"的触发条件？（adr-contrast-pair §4.3）
19. drop_rate 0.94 的排查过程：怎么定位到采样顺序 bug 而非 reward 饱和？三路证据分别是什么？（adr-frontloading §1）
20. variance-aware sampler 为什么严禁按难度加权？p≈0.5 方差最大的推导和实测依据？（adr-step2 §5.5）
21. boundary canary 被 dynamic filter drop 是"预期行为"——那它怎么起 tripwire 作用？（adr-step2 决策五）
22. train 分布偏斜为什么不修池子只修采样？"concept 密度预算是派生量"是什么意思？（adr-frontloading §6.1）
23. loan/Escalate "train 饱和但 holdout 弱"为什么 GRPO 够不到？sampler 为什么解决不了？（adr-step2 §5.6 / spec §7-O6）

**框架与吞吐：**
24. 为什么选 ART 而不是 VERL/OpenRLHF/AReaL？11 个需求维度里 ART 唯一全过的关键项？（技术选型 §5）
25. CISPO 和 PPO clip 的本质区别？为什么说 strict + CISPO ≈ vanilla GRPO？（adr-rollout-throughput D6）
26. merged serving 为什么不能配 PipelineTrainer k=1？in-flight episode 失效时间线？（adr-rl-effectiveness D4）
27. batched runner 为什么实测更慢？vLLM continuous batching 与 client wave barrier 的冲突机制？（adr-rollout-throughput §1.2）
28. LoRA serving 6x 退化的根因定位过程？为什么 4B 采纳后 wall/step 没改善还要采纳？（adr-rollout-throughput §1.5/D2/D4）
29. KL penalty 0.04→0.08 的演进依据？为什么"防遗忘靠 KL 不靠训练数据配比"？（adr-frontloading §4.1 / adr-rl-effectiveness H1）
30. 熔断为什么"宁可漏杀不可错杀"？质量信号 vs 优化统计信号的分层逻辑？（adr-rl-effectiveness D7）

**数据与判定器：**
31. 纯 NLI 为什么不可达 90%？hybrid 判定链的分层结构？（adr-phase5-divergence 决策一）
32. "判定器漂移"和"判定器质量修复"如何区分？为什么接受 v2 漂移不回扫 SFT 数据？（adr-phase5-p02-p08 决策七）
33. NLI premise 为什么从 full dialogue 改 per-message？为什么 last-turn-only 和 all-concat 都不行？（adr-l2-nli）
34. golden_chain 为什么不锁轨迹顺序？业务骨架有多种合法拓扑怎么办？（golden_chain 终稿 §三/§十）
35. LLM 生成 golden_chain 为什么"技术可行但研究含义变了"？和 RLAIF 的区别？（golden_chain 终稿 §七/§九）

## 4. 已知失败 / 教训（设计中承认的 negative 结果）

1. **Front-loading 采样 bug**（note 021 / adr-frontloading）：正式 run 36 步只训到 loan+Escalate 一个饱和角落，drop 0.94，1681 组只有 24 组可训、约 10 次有效梯度更新。教训："presence ≠ position"。
2. **Batched turn-boundary runner 严格更慢（2.1x）**：client 端 wave 同步破坏 legacy 路径相位异步 overlap；vLLM continuous batching 下 client co-submit 不增吞吐。永久废弃。
3. **LoRA serving 6x 退化无 cheap fix**：Triton JIT kernel r=128 non-zero delta，4B 尺寸优势被完全吸收，wall/step 仍 8-9 min。分支终止。
4. **Strict 4B run 后期效果退化**（adr-rl-effectiveness §1.2）：val strict_success 0.844→0.804，hv/format_failure 0→3-4.5%，grad_norm/entropy 尖峰——"没东西可学 + 优化不稳定"。
5. **Async k=1 速度验收失败**：median wall ≈1356s vs strict 696s（慢约 2x）；44% rollout 未进训练；drift 持续上行（lad_mean 0.023→0.048，ratio_max 3.09）。
6. **chat template hard-switch 灾难**：`enable_thinking=False` 使 hard_violation 0→0.6875、strict 0.47→0.22——训推 token 不一致的实测代价。
7. **旧 merged_lf seed parity 失败**：异环境 merge 的 artifact 在 ART env 下 HF logits max_abs 6.58-8.40，L3 hard_violation 0.34——seed 必须在目标环境内 merge 并验收。
8. **纯 NLI 假设被证伪**：P-07/N1-03 任何阈值下 NLI 做不出 P≥0.5；mDeBERTa 中文政务短文本结构性过触（P-08 13 个 FP 全是 local_nli_hit）；frozen_v1 阈值实际从未真正校准。
9. **P-02 gold 标注自相矛盾**：近义句标注不一致，temperature=0 的 adjudicator 会把近义句判一样，prompt 修改只是在 FP/FN 间移动误差——唯一根治是重标 gold（5 行）。
10. **Simulator free-rollout 播种 bug**：simulator 在空 history 下重新生成首轮用户话导致 opening 泄漏 9.80%——首轮必须用 canonical opening_message 播种。
11. **Scripted replay 人为压低分数**：21% divergent，loan 0.16/purchase 0.41 conflate"真失败"与"剧本跟不上合理路径"——不能凭 scripted replay 拍 top-up 决策。
12. **loan_repayment_query target_turns=16 基于 n=5**：统计脆弱性被明示登记为 follow-up（F1）。
13. **train 饱和但 holdout 弱的可达性盲区**：loan/Escalate train/val strict=1.0 但 holdout 0.29/hv 12.9%；dynamic filter 丢零方差组 → GRPO 结构上够不到 OOD 弱点——数据覆盖问题，加步数和采样器都解决不了。
14. **top-up 触发器迟检**（adr-stream1 addendum）：Phase 3 exit gate 只查聚合门槛，三个触发器"算了没判"——治理洞，后改为接进 Phase 5 显式诊断。
15. **风险文档预告的负面涌现**（方案潜在风险与负面涌现预测 §二）：格式崩溃（RL 忘闭合标签）、"没有感情的复读机"（为 R_disclosure + P_turns 把话一次性砸给用户，防御 = KL 锚定 SFT）、把 sandbox 当探雷器（故意发空参数请求利用报错列表让用户填空，防御 = 监控 P_failed_calls）、对 simulator 的 prompt injection 咒语（防御 = 抗越狱 system prompt + 正则拦截）。

**一句话总纲**：最硬的叙事线是"**每个设计决策都有 ADR + 实测证据 + 被否决的 alternative**"——reward 演化（v1 语义瑕疵→v2 ceiling→v3 terminal gate）、采样器（front-loading bug→方差加权 mixture）、错误分类学（hard/efficiency/业务拒绝）、信息边界（simulator 不看 tool result）四条线最适合展开；反直觉点表（第 2 节）是应对"为什么不做 X"类追问的直接弹药。
