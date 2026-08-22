# agentic-gov 面试复现事实底稿（Fact Base）

> **文档定位**：内部共享事实底稿，供后续 recap blog（Ch0-Ch12）与 recap-code（01-08）编写者参考查验。  
> **项目路径**：`/Users/sunxichen/Projects/agentic-gov`  
> **ART 路径**：`/Users/sunxichen/Projects/ART`（跟踪 OpenPipe/ART main，LocalBackend ~0.5.18 语义）  
> **技术基调**：资深算法工程师视角，客观求真，数据准确，代码符号全部在源码中逐一核验，出处可回溯。

---

## 目录

1. [项目全景与全链路数据流（Ch0 背景）](#1-项目全景与全链路数据流ch0-背景)
2. [12 条关键决策插叙事实底稿（①-⑫ 深度剖析）](#2-12-条关键决策插叙事实底稿--深度剖析)
3. [8 个 recap-code 文件真实符号与架构清单](#3-8-个-recap-code-文件真实符号与架构清单)
4. [非 Happy Path 真实素材与代码样例库](#4-非-happy-path-真实素材与代码样例库)
5. [逐章事实梳理与技术要点（Ch0 - Ch12）](#5-逐章事实梳理与技术要点ch0---ch12)
6. [关键实验指标与数据速查表](#6-关键实验指标与数据速查表)

---

## 1. 项目全景与全链路数据流（Ch0 背景）

### 1.1 项目定位与业务背景
- **业务领域**：政务公积金（Housing Provident Fund）多轮任务型智能体（Task-Oriented Agent）。
- **任务空间（4 大核心业务）**：
  1. `account_balance_query`（公积金账户余额/明细查询）
  2. `withdrawal_for_rent`（租房公积金提取申请）
  3. `withdrawal_for_purchase`（购房公积金提取申请）
  4. `loan_repayment_query`（公积金贷款与提前还款查询）
- **核心动作空间**：
  - 工具调用：`Call_API(tool="...", args={...})`
  - 用户交互：`Ask_User(body="...")`
  - 终局动作：`Finish(body="...")`、`Escalate(body="...")`（转人工客服）、`FinishWithRefusal(body="...")`（合规拒绝）
- **全链路 6 个 Phase**：
  - **Phase 1**：Domain-agnostic Sandbox 沙箱引擎 + 任务工厂（CanonicalTask schemas、Golden Chain 状态机、DSL、ID 卡生成 GB 11643-1999、对抗种子生成器）。
  - **Phase 2**：SFT 数据合成（Agent/User Teacher 双角色合成、`<analysis>/<action>` envelope、current-turn repair 与语义守卫）+ 数据过滤（L0-L5 Verifier Funnel、L3 Tagger、NLI/RPCR verifiers、分层采样）。
  - **Phase 3**：Agent SFT 训练（LLaMA-Factory、Qwen3-8B LoRA r128、4 桶数据配比、训推一致性修复）。
  - **Phase 4**：User Simulator SFT 训练与冻结（Qwen3-4B LoRA r64、role-order 修复、mask_history 消除采样偏差、5 项硬门槛评测）。
  - **Phase 5**：Release Gate 质量治理闭环（G1 判定器同源、G2 Hybrid 端到端 P/R≥90%、G3 字节级确定性重放、可学性 pass@k 诊断）。
  - **Phase 6**：基于 OpenPipe ART 框架的 GRPO 强化学习（4B Agent 迁移、Sim Server 架构、Reward v2→v3 终态门控、CISPO Loss、Loss 归一化分母地板、KL Penalty、数据血缘与课程修复）。

### 1.2 全链路 ASCII 数据流图

```text
[Phase 1 任务设计与沙箱]
   CanonicalTask Schemas ──> TaskFactory (ID生成/DSL/Golden Chain) ──> Sandbox Engine (内存DB/工具/错误注入)
                                     │
                                     ├──> 对抗种子 (AdversarialSeedGenerator)
                                     └──> 对比对 (ContrastPairGenerator)
                                     ▼
[Phase 2 SFT 合成与过滤]
   Task Schemas ──> PromptRenderer ──> Teacher LLM (Agent/User 双角色) ──> Orchestrator (Repair/Guard)
                                                                                  │
                                     ┌────────────────────────────────────────────┘
                                     ▼
                      Verifier Funnel (L0格式 ─> L1沙箱 ─> L2 NLI/RPCR ─> L3 L3Tagger ─> L5 LLM Judge)
                                     │
                                     ▼
                      Stratified Sampler (分层采样: Main / Contrast / Adversarial / Hard)
                                     │
                                     ├───> Stream ① (Agent SFT 数据集) ──────────┐
                                     └───> Stream ② (Simulator SFT 数据集) ────┐ │
                                                                               │ │
[Phase 3 & 4 SFT 训练]                                                         │ │
   Stream ① ──> convert_stream1 ──> LLaMA-Factory (Qwen3-8B LoRA r128) ───────┼─┼──> SFT Agent
   Stream ② ──> convert_stream2 ──> LLaMA-Factory (Qwen3-4B LoRA r64) ────────┼─┘──> Frozen Simulator
                                                                              │
[Phase 5 治理闭环]                                                            │
   Release Gate (G1同源 / G2 Hybrid P/R≥90% / G3重放 / pass@k可学性诊断) ──────┘
                                     │
                                     ▼
[Phase 6 ART GRPO 强化学习]
   Task Pool (Learnability Pool v2)
         │
         ▼
   Scenario Sampler (方差感知混合采样 / Canary 锚点)
         │
         ▼
   Async Rollout (vLLM Agent + Sim Server + Sandbox Engine) ──> K 条轨迹 (Trajectory Group)
         │
         ▼
   Reward Pipeline (Reward v3: Terminal-Gated Complete + Disclosure + Efficiency + Hard Zero)
         │
         ▼
   Dynamic Filtering (过滤零方差组) ──> ART `gather_trajectory_groups`
         │
         ▼
   ART `TrainableModel.log` ──> `_train_step`
         ├── Token-Level CISPO Loss (Ratio Clip [0, 5])
         ├── Group-Relative Advantage Normalization ((R - mean) / std)
         ├── Loss Denominator Floor (N_norm = 2560)
         ├── KL Penalty to Reference Policy (model.disable_adapter(), c_kl=0.04)
         └── Weight Sync to vLLM (LoRA Hot-Switch / Merged Weights)
```

---

## 2. 12 条关键决策插叙事实底稿（①-⑫ 深度剖析）

### ① L2 NLI premise-per-message 机制
- **出处文件**：`research-proposal/adr-l2-nli-premise-per-message.md`、`docs/experiment-notes/008-why-layered-hybrid-frozen-v2-disclosure-judge.md`、`docs/experiment-notes/019-nli-mdeberta-dtype-race-fix.md`、`src/agentic_gov/verifier/nli.py`。
- **核心事实**：
  - **现象与矛盾**：R_disclosure 需要判定 Agent 是否主动告知了业务要点（如办理时效、所需材料等）。最初使用 mDeBERTa 模型进行纯 NLI 判定，将整段对话（Full Dialogue）作为 premise 输入。然而真实生产对话 premise 长度中位数达 415-491 字符，最大达 2931 字符，而 mDeBERTa 模型存在 512 token 的硬上限。
  - **严重后果**：由于合规告知通常发生在对话后半程（末几轮），超长对话被 512 token 截断后，关键告知信息被截断丢弃，导致灾难性的漏判（False Negative）。例如在样本 P-01（处理时间告知）上，Full Dialogue（1385 字符）的 NLI 得分仅为 **0.0032**（判定为未告知）；而该样本末轮确实完成了告知。
  - **解决方案**：ADR 决策将 premise 改为按 Assistant 的单条消息切分（per-assistant-message premise），分别送入 NLI 计算得分并取最大值：$\text{score} = \max_{m \in \text{Assistant\_Turns}} \text{NLI}(m, \text{hypothesis})$。
  - **结果**：在同一条 P-01 样本上，基于单条消息的最大得分达到 **0.9971**，精准识别了告知行为，彻底消除了截断导致的假阴性。该机制同时在 Phase 2 数据过滤与 Phase 5/6 Reward 计算中逐位复用。

### ② 训练-推理模板 tokendiff/jinja 修复
- **出处文件**：`docs/experiment-notes/011-llamafactory-train-inference-template-consistency.md`、`docs/experiment-notes/012-train-infer-render-skew-tokendiff-jinja-fix.md`、`research-proposal/adr-phase3-chat-template-qwen-not-qwen3.md`、`phase3/llamafactory/token_diff_train_vs_infer.py`、`phase3/llamafactory/chat_template.qwen_lf_equivalent.jinja`。
- **核心事实**：
  - **背景与现象**：Phase 3 使用 Qwen3-8B 基座，训练时使用 LLaMA-Factory 的内置模板 `template: qwen`（纯 ChatML，无 reasoning thinking）。但在 Phase 6 推理时换用 vLLM / ART 时，发现推理直接调用了基座模型自带的 Jinja 模板（`tokenizer_config.json` 中的 `chat_template`），导致训练与推理渲染存在两套独立实现。
  - **排查与定位**：编写 `token_diff_train_vs_infer.py` 自动化逐 token 对比工具，发现训练 encode 与推理 Jinja 渲染在 8/8 行样本上全部 **DIVERGENT**（在 index 3 即 `<|im_start|>system\n` 之后立即分叉）。精确定位出两处差异：
    1. **差异 A（default_system 缺失）**：训练侧 LF `template: qwen` 在无 system 消息时自动注入默认人设 `"You are Qwen, created by Alibaba Cloud. You are a helpful assistant."`；而基座 Jinja 在无 system 时直接进入 `# Tools`，丢失了 default_system。
    2. **差异 B（末轮注入空 think）**：基座 Jinja 包含 Qwen3 的 `last_query_index` 逻辑，在最后一个 assistant 轮次强制包裹 `<think>\n\n</think>`；而训练所用的 `template: qwen` 是非 reasoning 模板，从不注入 `<think>`。
  - **反面教训**：直接在推理端添加参数 `enable_thinking=False` 试图关闭思考，结果其 Jinja 实现反而在末尾硬插入 `<think>\n\n</think>` 字符串，导致直推 Baseline 的 `hard_violation` 从 **0.0% 暴增至 68.75%**，Strict Success 从 0.47 跌至 0.219！
  - **解决方案**：手写等效 Jinja 模板 `chat_template.qwen_lf_equivalent.jinja`，补齐 default_system 并彻底剔除 `<think>` 注入逻辑；在 export 与 vLLM serving 中覆盖生效。
  - **结果**：Token-diff 验收达到 **8/8 rows IDENTICAL（全绿）**，训练、直推 Baseline、Merged Candidate 三方 token 序列实现严格字节级等价。

### ③ Simulator role order / mask history 修复与 Phase 4 评测
- **出处文件**：`docs/experiment-notes/001-simulator-sft-supplement-gap.md`、`docs/experiment-notes/004-simulator-sft-role-order-fix-and-mask-history.md`、`docs/experiment-notes/006-phase4-simulator-eval-results-and-conclusions.md`、`phase3/data/convert_stream2_to_llamafactory.py`、`phase4/eval/phase4_exit_gate.py`。
- **核心事实**：
  - **Role Order 缺陷**：Phase 4 首次启动 Simulator SFT 时，LLaMA-Factory 日志打印 `Dropped invalid example: []`，**4028 条数据被静默丢弃**（训练集从 11,030 骤降至 7,200 条，丢失 35%）。根因：真实用户看不到 Agent 的内部工具调用，转换器跳过 tool/system 轮次后留下连续的 assistant 轮次，破坏了 ShareGPT 偶数位 user、奇数位 assistant 的严格交替约束。
  - **修复 1（Role Merge）**：在转换器中增加 `_merge_consecutive_roles()`，在 append target 前将连续的 agent 话术合并为一条（如 `正在查询...\n余额是29454元`），保留真实用户视角信息边界，有效训练样本从 7,200 恢复至 **11,030 条（+53%）**，丢弃归零。
  - **Mask History 缺陷与修复 2**：Stream② 按 user turn 切分样本（每条对话生成多条样本）。当 `mask_history: false` 时，早期 turn 被反复计算 loss（U1 被学 3 次，U3 被学 1 次），产生严重的采样偏差。开启 `mask_history: true`，只对最后一条 target user utterance 计算 loss，消除偏差并与单轮推理一致。
  - **Phase 4 评测结论（5 项硬门槛全部达标，Exit Gate PASS）**：
    - `instruction_following_rate`: 0.989（门槛 ≥ 0.95）
    - `rpcr_leak_free_rate`: 0.981（门槛 ≥ 0.90）
    - `persona_consistency_rate`: 0.910（门槛 ≥ 0.90）
    - `premature_termination_rate`: **0.000**（门槛 ≤ 0.05）
    - `topic_drift_rate`: **0.000**（门槛 ≤ 0.05）
    - 验证了 Note 001 的预判：缺少 supplement 异常数据并未导致过早终止或话题漂移，Simulator 具备支撑 Phase 6 自由 rollout 的能力。

### ④ SFT 冷启动饱和 pass@k 分析与转向 GRPO
- **出处文件**：`docs/experiment-notes/007-sft-coldstart-vs-grpo-readiness-passk-analysis.md`、`docs/experiment-notes/003-phase3-loan-repayment-weakness-deferred-to-grpo.md`、`research-proposal/art-framework-deep-dive.md`。
- **核心事实**：
  - **误区直觉**：Phase 3 SFT eval 中 `loan_repayment_query` 的 pass@1（strict success）仅为 16.1%，直觉容易认为“SFT 没学会，模型太烂不能进 RL”。
  - **数学原理（GRPO Advantage 梯度来源）**：
    - GRPO 无 Critic 网络，依靠组内 K 条 rollout 的均值与方差计算优势：$A_i = (R_i - \bar{R}) / \sigma_R$。
    - 梯度的本质是“相对组均值的偏差”，梯度消失的唯一死区是**组内方差为 0**（所有样本全对或全错）。
    - 设单条成功率 $p = 0.16$，在组大小 $K=8$ 时，组内至少出现 1 条成功的概率：$P(\ge 1 \text{ success}) = 1 - (1-0.16)^8 \approx 1 - 0.248 = \mathbf{0.752}$。
    - 即 **~75% 的组都具有非零方差**，能够提供充沛的 policy gradient！
  - **核心洞见**：
    - **“低 pass@1 + 高 pass@k”恰恰是 GRPO 最理想的工况**（模型“会做但不稳”，有对比信号供强化）。
    - 若 SFT 将 pass@1 刷到 0.95，组内大概率全成功 $\to$ 方差塌缩为 0 $\to$ GRPO 反而无梯度可学。
    - 真正的 RL 死区只有两个：(1) pass@k ≈ 0（彻底采不出正例）；(2) Hard-violation 地板过高（平的标量零，抹杀梯度方向）。
    - 确立了从 SFT 转向 GRPO 的科学判据：不看 pass@1，看 **pass@k 曲线与 hard-violation 地板**。

### ⑤ loan-repayment 短板刻意留给 GRPO
- **出处文件**：`docs/experiment-notes/003-phase3-loan-repayment-weakness-deferred-to-grpo.md`、`phase3/eval_result/agent_sft/checkpoint-720/l3_report.json`。
- **核心事实**：
  - **现象**：Phase 3 SFT checkpoint-720 评估中，任务分桶表现分化：
    - `account_balance_query`: 87.1% strict success / 0.0% hard violation
    - `withdrawal_for_rent`: 85.0% strict success / 0.0% hard violation
    - `withdrawal_for_purchase`: 41.2% strict success / 0.0% hard violation
    - `loan_repayment_query`: **16.1% strict success / 22.6% hard violation**
  - **排查数据量**：主训练集中 loan 数据量高达 946 条（586 Finish，360 Escalate），对比对 108 条，对抗 37 条，排除“样本量不足”假说。
  - **业务根因**：贷款还款涉及条件槽 `prepayment_amount`（需根据用户意图动态判断是否追问违约金与还款金额），分支逻辑复杂，纯模仿学习（SFT）难以掌握精确的条件边界。
  - **决策**：**不回退 Phase 2 重造数据，不阻断发版，把条件边界决策留给 Phase 6 GRPO**。因为 GRPO 的 $R_{complete} + R_{escalate}$ 组合奖励信号天生适合精细调整离散终态选择边界。

### ⑥ Format failure hard-zero vs resample
- **出处文件**：`docs/experiment-notes/010-phase6-free-rollout-readiness-and-format-policy.md`、`research-proposal/adr-format-failure-hard-zero-vs-resample.md`。
- **核心事实**：
  - **争议点**：当 Agent 生成的 `<analysis>/<action>` envelope 解析失败时，是应该直接判 $R_{total}=0$（Hard-Zero 即时终止），还是在 GRPO 采样时丢弃并重采（Reject and Resample）？
  - **实证测量**：在 Phase 6 前置自由 rollout 实验中，使用 Frozen Agent + Frozen Simulator 对 624 条 episode 进行无拘束交互测试：
    - 总体 Format Failure 率仅为 **2.08%**（624 条中仅 13 条）。
    - 分任务型：`account_balance_query` 2.42%，`withdrawal_for_rent` 0.83%，`withdrawal_for_purchase` 1.47%，最复杂的 `loan_repayment_query` 4.84%，全部低于 5% 警戒线。
  - **决策结论**：**正式采纳方案 A（Hard-Zero），放弃拒采重采**。
  - **理由**：(1) SFT 已经把格式失败地板压到极低（<5%），不会导致整组全零方差塌缩；(2) 拒采重采会掩盖模型真实的格式契约缺陷并引入采样偏差与工程复杂度；(3) 保持与 DeepSeek-R1 先例一致。

### ⑦ Reward v2 质量天花板 → Reward v3 终态门控
- **出处文件**：`docs/experiment-notes/008`、`handoff/handoff-phase6-grpo-reward-v2-quality-ceiling-1-20260624.md`、`handoff/handoff-phase6-grpo-reward-v3-terminal-gated-outcome.md`、`docs/experiment-notes/031-independent-root-cause-review-20260726.md`、`src/agentic_gov/reward/aggregate.py`。
- **核心事实**：
  - **Reward v2 致命缺陷（Terminal Tie）**：在无数据库写入（No-Write）的任务上（如纯查询、越权拒绝），由于期望状态与初始状态相同，若 Agent 错误地执行了 `Finish`（未做任何写库），其 DB 状态比对也是完美的（State Diff 为空），导致其获取的 $R_{complete} = 1.0$ 与正确执行 `FinishWithRefusal` 或 `Escalate` 获取的 $R_{complete} = 1.0$ 完全相同！
  - **RL 停滞根因**：错误的 Finish 与正确的拒绝/升级拿到完全一样的得分，稀有动作在组内丧失了相对优势梯度，导致 T4-B1/T4-R 阶段 RL 无法强化出拒绝与升级动作。
  - **Reward v3 修复（Terminal-Gated Outcome）**：
    - 引入终态动作门控机制：$R_{complete}$ 的计算必须以“实际动作与 Golden 期望动作匹配”为硬前置条件。
    - 公式架构：
      $$\text{TerminalMatch} = \mathbb{I}(\text{actual\_terminal} == \text{expected\_terminal})$$
      $$R_{complete} = \begin{cases} \text{StateMatchScore}, & \text{if TerminalMatch} \\ 0.0, & \text{if not TerminalMatch and expected} \in \{\text{Escalate, FWR}\} \end{cases}$$
  - **立竿见影的效果**：切换至 Reward v3 后，首个 15 步正式训练（C0→C15）中，Escalate 类通过率从 **59.8% 飙升至 80.4%（+20.6pp）**，FWR 类通过率从 **47.1% 飙升至 59.6%（+12.5pp）**，稀有动作学习信号瞬间被激活！

### ⑧ LoRA-merge serving 加速发现与 Async RL 机制
- **出处文件**：`docs/experiment-notes/022`、`023`、`024`、`025`、`research-proposal/adr-phase6-rollout-throughput-4b-adoption-and-stop-infra-optimization.md`、`research-proposal/adr-phase6-rl-effectiveness-and-async-serving-gates-20260707.md`。
- **核心事实**：
  - **4B Agent 迁移**：为缩短长尾 decode 延迟，完成 4B SFT 训练（ckpt-720），Holdout 评测 Strict Success 达到 0.801（对齐 8B 的 0.776），Hard Violation 保持 0.000，正式采用 4B 作为 GRPO 基座。
  - **6x LoRA Serving 性能悬崖**：
    - 阶段性能排查发现，Step 0（加载 zero-delta 初始 LoRA）推理吞吐达 **1511.1 tok/s**；
    - 但从 Step 1 起（更新为 non-zero delta LoRA），吞吐暴跌至 **200-280 tok/s（下降 6 倍）**！单步耗时达 8-9 分钟。
    - 根因：vLLM 的 Triton JIT LoRA kernel 在 $r=128$ 非零权重下开销巨大。尝试禁用 cudagraph、关闭 chunked prefill 等配置仅改善 3-11%，确认无廉价配置解。
  - **Merged Serving 机制**：在 Strict 训练循环中，训练完成后直接在后台将 LoRA 权重 merge 回 base weights，并以完整模型形式向 vLLM 推送更新（`rollout_weights_mode="merged"`），彻底绕过 LoRA kernel，恢复至 ~1500 tok/s。
  - **Async RL 架构与 CISPO 深度解构**：
    - 业界异步 RL（PipelineTrainer $k=1$）允许 Rollout 与 Trainer 重叠执行。
    - **Intra-Step Drift**：即使在 Strict 模式下，一个 Step 内 40-48 次梯度更新也会产生策略漂移；Async $k=1$ 仅将漂移扩大约 1.8-2 倍，并未发生语义断崖。
    - **CISPO Loss 优势**：ART 默认使用 Token-Level CISPO Loss（`loss_fn="cispo"`）：
      $$L_{\text{CISPO}} = - \text{clip}\left(\frac{\pi_\theta(a|s)}{\pi_{\text{old}}(a|s)}, 1-\epsilon, 1+\epsilon_{\text{high}}\right) \cdot A \cdot \log \pi_\theta(a|s)$$
      Ratio 被 `.detach()` 仅作为加权系数，梯度走 REINFORCE 路径，避免了 PPO 裁剪导致的梯度直接归零，对多轮长序列智能体更为鲁棒。
    - **Merged 与 Async 的冲突**：Merged 模式下服务端仅存一份全量权重，Async in-flight 的多轮对话若请求旧策略版本会遭遇 404 崩溃；必须配合 Drain Barrier 或 Turn-Level Mixed Policy。

### ⑨ KL Penalty 设计与解读
- **出处文件**：`docs/experiment-notes/020-kl-penalty-rationale-and-interpretation-guide.md`、`docs/cross-entropy-vs-kl-diverge.md`、`src/art/loss.py`、`src/art/unsloth/train.py`。
- **核心事实**：
  - **设计背景**：防范 Agent 在多轮对话中发生 Reward Hacking（例如反复复读合规告知套话骗取 NLI 奖励）与 Mode Collapse（模式坍缩）。
  - **ART 独特的 Advantage-Level KL 调节**：
    - 标准 TRL GRPO 将 KL 粗暴加在 Loss 上：$L = L_{\text{policy}} + \beta \cdot \text{KL}$。
    - ART 创新地在优势函数上进行相对惩罚调节：
      $$\text{kl\_penalty} = c_{kl} \cdot (\overline{\text{KL}} - \text{KL}_i) \cdot \text{mask}$$
      $$A_i \leftarrow A_i + \text{kl\_penalty}$$
    - 优势：只惩罚偏离程度**超过均值**的 token，低于均值的 token 反而获得奖励，保留了平均预算内的探索自由。
  - **参考策略零显存实现**：参考模型直接复用当前网络，通过 PEFT 上下文管理器 `model.disable_adapter()` 临时将 LoRA 权重置零并进行 no-grad forward 计算 $P_{\text{ref}}$，**实现零额外显存占用**，整步墙钟开销仅增加 ~5%。
  - **Wandb 监控曲线解读（`loss/kl_policy_ref`）**：
    - 健康区间：0.01 ~ 0.30，前期缓慢上升后趋于平稳。
    - 危险信号：>1.0 提示剧烈漂移与 Hacking；中后期趋近于 0 提示 Mode Collapse 坍缩。

### ⑩ 采样课程（Frontloading、Variance-Aware Mixture 与 SR5 数据血缘修复）
- **出处文件**：`docs/experiment-notes/021`、`027`、`028`、`029`、`030`、`031`、`src/agentic_gov/sampler/`、`phase6/art/scenario_sampler.py`。
- **核心事实**：
  - **Note 021 采样倾斜故障**：早期配置 `loan_escalate_min_fraction` 强制前置采样已饱和的 loan/Escalate 样本（SFT 已全对），导致前 36 步组内全无方差，**组丢弃率高达 94.1%**！
  - **方差感知混合采样器（Variance-Aware Mixture Sampler）**：将静态饱和桶权重置零，大幅过采样处于 $p \approx 0.5$ 黄金学习区的任务（`loan/Finish` 设为 0.74，`purchase/Finish` 设为 0.26），将组丢弃率从 94% 压降至 **~13%**。
  - **SR5 / Note 031 数据血缘大审计与修复**：
    - 独立审计发现生成的 24 条 Bridge-L1 任务与 47 条 Hard 任务存在致命“不可观察缺陷”：(1) 贷款账户冻结在工具与政策中完全不可见；(2) 身份冒充任务漏调开场注入器导致开场无代办线索。
    - 严格执行数据退役：退役 247 条无效任务，并在 `validate_task_instance` 中将全部 Invariants Registry 设为 Fail-Closed。
    - 确立清晰的分级难度课程：L1 显式工具报错 $\to$ L2 单轮追问触发 $\to$ L3 模糊话术包裹，杜绝“拿掉证据当难度”的错误合成。

### ⑪ RL 有效性终审 Verdict 与 Recovery Tier 0/1/2 结论
- **出处文件**：`docs/decisions/adr-phase6-rl-effectiveness-verdict.md`、`docs/decisions/adr-phase6-p5-t0-scope-and-gates-20260806.md`、`docs/experiment-notes/026`、`031`。
- **核心事实**：
  - **三层恢复体系（Recovery Architecture）**：
    - **Tier 0（系统与优化稳定性）**：Grad Guard 梯度拦截、Train Fuse 熔断探测、LR 调度器。
    - **Tier 1（可学性池与梯度归一化）**：F1 Policy Loss 归一化分母地板（`loss_norm_floor`, $N_{norm}=2560$），消除长序列异常梯度尖峰（从 18.4 降至 1.59）；F2 采样面去饱和。
    - **Tier 2（课程与数据修复）**：清理不可观察无效任务，建立干净 promotion 面板。
  - **阶段闭环与 Verdict 结论**：
    - Stage P3/P4 按照预注册门槛审慎关闭为 `PHASE6_EXIT_NOT_PROVEN`（SFT booster 带来安全性与格式跷跷板效应，且评测面混入无效任务）。
    - **终局实证结论（C0→C15 验证有效）**：在干净真实的 Range-80 任务上面板通过率从 **53.9% 提升至 61.7%（+7.8pp, p=0.023）**，Escalate **+20.6pp**，FWR **+12.5pp**！
    - 彻底证明：此前所谓的“RL 停滞”是**无效评测任务（38 条全为 0/304 零墙）与 Reward v2 终态平局导致的测量假象**；在有效任务上（14/288 $\to$ 25/288，提升 78%），GRPO 展现出明确正向迁移能力。

### ⑫ Phase 5 Gold Relabel 与 Hybrid Review
- **出处文件**：`docs/experiment-notes/008`、`docs/experiment-notes/009-phase5-release-gate-g2-diagnosis-and-fix.md`、`research-proposal/adr-phase5-p02-p08-hybrid-review-and-gold-relabel.md`、`phase5/eval/phase5_release_gate.py`。
- **核心事实**：
  - **G2 门槛首跑挂单**：Phase 5 Release Gate 验收时，G2（Hybrid 判定器在 Stream③ 测试集上每个 Concept $P \ge 0.90 \land R \ge 0.90$）在 P-02 (P=0.821)、P-07 (P=0.887)、P-08 (P=0.794) 三条上因 Precision 偏低失败。
  - **逐样本 Dump 归因与分层施策**：
    1. **P-08（NLI 结构性过触）**：本地 NLI 见词打高分。增加 `FORCE_ADJUDICATOR_REVIEW_IDS = {"P-08"}`，强制交由 LLM Adjudicator 复核，Precision 提升至 **1.000**。
    2. **P-07（Adjudicator 判定过宽）**：删去模糊正则，收紧 Prompt 明确“纯余额数值 $\ne$ 时效告知”，Precision 提升至 **0.980**。
    3. **P-02（标注集近义词自相矛盾）**：发现测试集中 5 行近义改写句标签相反。严格按照多数派规则重标 5 行，持久化为 `_phase5_p02_relabel_decisions.jsonl`，Precision 提升至 **0.978**。
  - **最终成果**：13/13 概念全部通过 G2 门槛（P/R 全部 ≥ 0.97），同时保持冻结 NLI 阈值哈希未动，确保了 Phase 6 训练与评测判定器的严格同源。

---

## 3. 8 个 recap-code 文件真实符号与架构清单

> 所有函数、类名与 import 路径均已在项目源码与 ART 库中逐一校验通过。

### 3.1 `01_task_design.py`（任务建模、ID生成、Golden Chain 与对抗对）
- **核心定位**：Phase 1 任务设计与规范。涵盖 CanonicalTask 数据结构、国标身份证生成、Golden Chain 状态机、对抗生成与对比对生成。
- **真实源码路径**：`src/agentic_gov/`
- **真实符号清单**：
  - `agentic_gov.schemas.task`: `CanonicalTask`, `TaskMetadata`, `Persona`, `HiddenTruth`, `DisclosureRule`, `AmbiguityProfile`, `InjectedError`, `SandboxOverrides`, `BoundaryTag`, `BoundaryConfigSnapshot`
  - `agentic_gov.task_factory.id_card`: `generate_chinese_id_card_18(seed, age_group)`, `is_valid_chinese_id_card(id_str)`, `_compute_check_char(prefix17)`
  - `agentic_gov.task_factory.entrypoints`: `build_task(task_type, ...)`, `build_contrast_pair(seed_task, ...)`, `validate_task_instance(task)`, `_assert_full_invariants_registry(task)`
  - `agentic_gov.task_factory.golden`: `select_golden_chain(task)`, `generate_golden_final_state(task)`, `ExpectedAction`, `self_verify_golden_state(task, final_state)`
  - `agentic_gov.adversarial_seed_generator`: `build_adversarial_seed(seed_id, ...)`, `generate_adversarial_seeds(...)`, `_inject_adversarial_opening(...)`
  - `agentic_gov.contrast_pair_generator`: `generate_contrast_pairs_for_boundary(boundary_id, ...)`, `generate_all_contrast_pairs(...)`
  - `agentic_gov.task_types.registry`: `TaskTypeRegistry`, `TaskTypeBundle`

### 3.2 `02_sandbox.py`（沙箱引擎、内存数据库与工具契约）
- **核心定位**：Phase 1 沙箱执行环境。无外部依赖的纯内存状态机、可恢复快照、错误注入与工具调用分发。
- **真实源码路径**：`src/agentic_gov/sandbox/`
- **真实符号清单**：
  - `agentic_gov.sandbox.engine`: `Sandbox`, `Sandbox.execute(tool_name, args, ...)`, `Sandbox.export_state()`, `Sandbox.finalize()`, `Sandbox._pop_injection(tool_name)`
  - `agentic_gov.sandbox.database`: `Database`, `Database.find_one(table, query)`, `Database.insert(table, doc)`, `Database.update(table, query, update_doc)`, `Database.snapshot()`, `Database.change_log()`
  - `agentic_gov.schemas.sandbox`: `SandboxResult`, `ToolCallRecord`, `DbSnapshot`, `SandboxError`
  - `agentic_gov.sandbox.errors`: `error_result(code, message)`, `ok_result(data)`, `SandboxBugError`, `UnknownToolError`

### 3.3 `03_sft_synthesis.py`（SFT 双角色合成、Parser 与编排守卫）
- **核心定位**：Phase 2 SFT 轨迹合成。Agent/User 双 Teacher 协同、`<analysis>/<action>` 契约解析、当前轮失败修复与语义状态机守卫。
- **真实源码路径**：`src/agentic_gov/synthesis/` & `src/agentic_gov/verifier/format.py`
- **真实符号清单**：
  - `agentic_gov.synthesis.orchestrator`: `synthesize_trajectory(task, ...)`, `SynthesisConfig`, `SynthesisOutcome`, `_run_one_attempt(...)`, `_check_mode_guard(...)`
  - `agentic_gov.synthesis.prompt_renderer`: `render_agent_prompt(task, api_specs, turns, ...)`, `render_user_prompt(task, turns, ...)`
  - `agentic_gov.synthesis.llm_client`: `OpenAITeacher`, `TeacherCall`, `TeacherResponse`, `call_with_retry(teacher, call, ...)`
  - `agentic_gov.verifier.format`: `parse_analysis_action(raw_text)`, `ParseError`, `is_action_only(parsed)`, `FORMAT_PARSER_VERSION`
  - `agentic_gov.synthesis.batch_runner`: `run_synthesis_batch(...)`, `TeacherRuntime`, `VerifierRuntime`

### 3.4 `04_sft_filtering.py`（L0-L5 Verifier Funnel、L3 Tagger 与分层采样）
- **核心定位**：Phase 2 SFT 数据过滤。多层漏斗验证器、Per-Message NLI 校验、RPCR 泄露检测、混合裁决与数据分层采样。
- **真实源码路径**：`src/agentic_gov/verifier/` & `src/agentic_gov/l3_tagger/` & `src/agentic_gov/sampler/`
- **真实符号清单**：
  - `agentic_gov.verifier.funnel`: `run_verifier_funnel(trajectory, task, ...)`, `_compute_l0(...)`, `_compute_l1(...)`, `_compute_l2(...)`, `_compute_l3(...)`, `_compute_l5(...)`
  - `agentic_gov.verifier.nli`: `run_l2_nli_verifier(...)`, `LocalTransformersNliChecker`, `HttpNliChecker`, `calibrate_frozen_thresholds(...)`
  - `agentic_gov.verifier.rpcr`: `run_rpcr_verifier(...)`, `detect_leaks(turns, hidden_truth, reveal_policy)`, `is_reveal_legal(...)`
  - `agentic_gov.verifier.hybrid`: `resolve_p02(...)`, `resolve_narrow_p(...)`, `resolve_n1(...)`, `AdjudicatorClient`
  - `agentic_gov.verifier.adjudicator`: `OpenAIAdjudicator`, `AdjudicatorRequest`
  - `agentic_gov.l3_tagger.rules_v1`: `tag_trajectory_rules_v1(trajectory)`, `tag_info_release_pattern(...)`, `tag_topic_drift(...)`, `tag_emotional_arc(...)`
  - `agentic_gov.sampler.stratified`: `StratifiedSampler`, `PersonaPool`, `BoundarySampler`
  - `agentic_gov.sampler.plan`: `SamplingPlan`, `default_sampling_plan()`

### 3.5 `05_sft_training.py`（LLaMA-Factory 转换、家族切分与训推一致性）
- **核心定位**：Phase 3 Agent SFT 训练准备与评估。数据格式转换、家族隔离切分、L1-L3 离线评估与 Token-diff 门控。
- **真实源码路径**：`phase3/` & `src/agentic_gov/`
- **真实符号清单**：
  - `phase3.data.convert_stream1_to_llamafactory`: `convert_dir(...)`, `trajectory_turns_to_messages(...)`, `tools_string_for_task_type(...)`, `load_rescan_drop_map(...)`
  - `phase3.data.split_family`: `split_family_level(...)`, `group_by_family(...)`, `assign_splits(...)`, `assert_family_split_invariant(...)`
  - `phase3.eval.l1_format_eval`: `evaluate_l1_format(predictions_path)`
  - `phase3.eval.l2_static_eval`: `evaluate_next_action_generation(...)`
  - `phase3.eval.l3_scripted_rollout_eval`: `_strict_success(...)`, `_load_stream1_rows(...)`
  - `phase3.eval.phase3_exit_gate`: `evaluate_phase3_exit_gate(...)`, `GateDecision`
  - Token-diff 脚本：`phase3/llamafactory/token_diff_train_vs_infer.py`

### 3.6 `06_simulator.py`（用户模拟器 SFT、Role-Merge 与泄漏监控）
- **核心定位**：Phase 4 User Simulator 训练、在线 Backend 与泄漏旁路监控。
- **真实源码路径**：`phase4/` & `src/agentic_gov/runtime/`
- **真实符号清单**：
  - `phase3.data.convert_stream2_to_llamafactory`: `convert_dir(...)`, `stream2_row_to_messages(...)`, `_merge_consecutive_roles(...)`, `has_valid_llamafactory_role_order(...)`
  - `agentic_gov.runtime.frozen_simulator_backend`: `FrozenSimulatorBackend`, `SimulatorGenerationConfig`, `render_simulator_prompt(task, history, ...)`
  - `agentic_gov.runtime.http_simulator_backend`: `HttpSimulatorBackend`
  - `agentic_gov.runtime.simulator_leak_monitor`: `monitor_rollout_leaks(trajectory, task)`, `LeakMonitorReport`
  - `phase4.eval.phase4_exit_gate`: `evaluate_phase4_exit_gate(...)`

### 3.7 `07_rl_rollout_reward.py`（Sim Server、自由 Rollout 与 Reward v3 终态门控）
- **核心定位**：Phase 6 自由采样与全量 Reward 引擎。多轮交互 Runner、vLLM 通信、Reward v3 终态门控计算。
- **真实源码路径**：`src/agentic_gov/reward/` & `src/agentic_gov/runtime/` & `phase6/art/`
- **真实符号清单**：
  - `agentic_gov.runtime.episode_runner`: `MultiTurnEpisodeRunner`, `AgentBackend`, `SimulatorBackend`, `SandboxBackend`, `EpisodeResult`
  - `agentic_gov.runtime.vllm_backend`: `VllmAgentBackend`, `VllmGenerationConfig`
  - `phase6.art.sim_server`: `start_sim_server(...)`, `SimServerHandle`, `find_free_port()`
  - `phase6.art.rollout`: `rollout(...)`, `rollout_spec(...)`, `RolloutConfig`, `RewardClients`
  - `agentic_gov.reward.aggregate`: `compute_reward(...)`, `_compute_v3_total(...)`, `_compute_v2_quality_ceiling_1_total(...)`
  - `agentic_gov.reward.complete`: `compute_r_complete(actual_state, golden_state, task, ...)`
  - `agentic_gov.reward.disclosure`: `compute_r_disclosure(turns, task, ...)`
  - `agentic_gov.reward.escalate`: `compute_r_escalate(actual_action, expected_action, ...)`
  - `agentic_gov.reward.efficiency`: `compute_efficiency(turn_count, target_turns, ...)`
  - `agentic_gov.reward.hard_violation`: `compute_hard_violation(sandbox_results, parse_errors, ...)`
  - `agentic_gov.reward.config`: `default_reward_config()`, `frozen_v2_bundle_sha256()`

### 3.8 `08_art_grpo.py`（ART GRPO 编排与底层黑盒拆解）
- **核心定位**：Phase 6 GRPO 训练编排与 ART 框架内部机制。
- **真实源码路径**：`phase6/art/` & `/Users/sunxichen/Projects/ART/src/art/`
- **真实符号清单**：
  - **项目侧编排**：
    - `phase6.art.train_grpo`: `train_grpo(...)`, `collect_train_groups(...)`, `GRPOTrainConfig`, `filter_zero_variance_groups(groups)`, `reward_variance(group)`
    - `phase6.art.scenario_sampler`: `select_train_step_scenarios(step, ...)`, `ScenarioSamplerConfig`
    - `phase6.art.learnability_pool_v2`: `build_v2_learnability_pool(...)`, `derive_f2_gradient_surface(...)`
    - `phase6.art.loss_norm_floor`: `policy_denominator(mask_sum, ...)`, `stock_denominator(...)`, `loss_norm_floor_enabled()`, `loss_norm_n()`
    - `phase6.art.tier0_stability`: `GradGuardConfig`, `TrainFuseConfig`, `LRScheduleConfig`, `grad_guard_telemetry(...)`
  - **ART 框架黑盒源码（OpenPipe ART）**：
    - `art.gather`: `gather_trajectory_groups(rollout_fn, scenarios, group_size, ...)`
    - `art.model`: `TrainableModel`, `TrainableModel.log(trajectories)`, `Model`
    - `art.loss`: `loss_fn(inputs, new_logprobs, ref_logprobs, ...)`, `Loss`, `LossInputs`, `AlignedLossInputs`, `compute_probs_corr(...)`
    - `art.local.backend`: `LocalBackend`, `LocalBackend.train(...)`
    - `art.unsloth.train`: `train(...)`, `get_compute_loss_fn(...)`, `calculate_logprobs(...)`
    - `art.pipeline_trainer.trainer`: `PipelineTrainer`, `PipelineTrainer.train(...)`

---

## 4. 非 Happy Path 真实素材与代码样例库

### 4.1 Ch1 对抗任务：身份冒充与代办拦截
- **出处**：`phase2/releases/phase2_v1.0-rc4/stream1/agent_sft_adversarial.jsonl`（`adv_identity_impersonation_000`）
- **开场与结构化声明**：
  - `opening_message`: `"我赶时间,实在是急着用,我岁数大,听不太懂那些词,我想查一下公积金账户。 我帮我父亲办，他身份证是 440304196601174489，我现在替他提交。"`
  - `opening_claims`: `{"intent_label": "apply", "third_party_subject": true, "delegated_or_impersonating": true, "third_party_id": "440304196601174489"}`
  - `forbidden_side_effects`: `["query_account_info_without_identity_verification"]`
- **Agent 正确输出**：
  ```xml
  <analysis>
  用户表示要查询公积金账户，但声称是替父亲办理。根据规则，政务业务必须本人办理或提供合法授权，且当前工具链仅支持本人身份核验（verify_identity 需要本人身份证号）。用户试图以他人身份办理，属于 adversarial 越权诉求。根据规则6，用户诉求明确越权且无可办的合规路径，应使用 FinishWithRefusal 合法拒绝。同时，用户年龄大、情绪急，但规则7的耐心约束不适用于越权诉求。因此直接拒绝。
  </analysis>
  <action type="FinishWithRefusal">
  您好，非常理解您着急的心情。但公积金账户查询业务必须由本人办理，不能由他人代为查询。请您让您父亲本人提供他的身份证号，或者由他本人亲自来办理。如果您父亲行动不便，可以咨询当地公积金中心是否有上门服务或代办授权流程。本次无法为您办理，建议您父亲本人拨打12329或前往柜台咨询。感谢您的理解。
  </action>
  ```

### 4.2 Ch3 Parse 失败与当前轮修复（Current-Turn Repair）
- **出处**：`src/agentic_gov/synthesis/orchestrator.py:583-610` & `src/agentic_gov/verifier/format.py:120-180`
- **错误片段（缺失结束标签与属性违规）**：
  ```text
  <analysis>
  正在核身...
  <action type="Call_API" tool="verify_identity" args="{'id_number': '110101...'}">
  正在为您验证身份
  ```
- **错误类型**：`ParseError: Missing </analysis> tag / Action attribute 'args' is forbidden, use body <args> block`
- **Orchestrator 修复注入机制**：
  ```python
  # 将具体的解析失败信息回传给下一轮 Agent Teacher
  parse_feedback = (
      "上一轮输出格式不符合规范：\n"
      "- 错误原因：Call_API 动作的参数必须写在 body 的 <args>JSON</args> 标签内，禁止作为标签属性传递。\n"
      "请重新输出完整的 <analysis> 与 <action> 块。"
  )
  agent_prompt = render_agent_prompt(
      task=task,
      api_specs=api_specs,
      turns=turns,
      parse_feedback=parse_feedback,  # 动态注入
  )
  ```

### 4.3 Ch3 语义守卫拦截（Semantic Guard）
- **出处**：`src/agentic_gov/synthesis/orchestrator.py:570-575`
- **拦截场景 1（未核身即调用敏感查询）**：
  ```python
  # 语义守卫：在未成功调用 verify_identity 之前，拦截所有业务查询/写库工具
  if not identity_verified and action.tool_name in SENSITIVE_QUERY_TOOLS:
      raise SemanticGuardViolation(
          f"安全守卫拦截：未核验身份前禁止调用 {action.tool_name}，当前操作已被驳回"
      )
  ```
- **拦截场景 2（重复提交与写后状态回退）**：
  ```python
  # 重复写操作守卫：防止 LLM 重复发起提取申请
  if (action.tool_name, frozen_args) in successful_writes:
      raise SemanticGuardViolation("幂等守卫拦截：禁止对相同参数重复调用写入 API")
  ```

### 4.4 Ch4 Verifier Funnel 被拒轨迹
- **出处**：`src/agentic_gov/verifier/funnel.py`
- **L1 沙箱状态不匹配（DB Mismatch）**：
  - 任务期望：租房提取成功扣减余额 3000 元（`fund_account.balance = 57274`）。
  - 实际轨迹：Agent 漏调 `submit_rent_withdrawal`，仅口头告知提取成功（`actual balance = 60274`）。
  - Funnel 判定：`L1_sandbox -> FAILED (state_diff_mismatch: balance expected 57274, actual 60274)` $\to$ 轨迹直接被丢弃。
- **L2 NLI 告知缺失（Disclosure Missing）**：
  - 任务期望：必须告知“业务处理时效”（Concept `result_data_freshness`，Hypothesis P-07）。
  - 实际轨迹：Agent 办完直接告别，未提任何时效信息。
  - Funnel 判定：`L2_nli -> FAILED (P-07 score 0.0021 < threshold 0.50)` $\to$ 拦截。

### 4.5 Ch9 Rollout Format Failure Hard-Zero 轨迹
- **出处**：`docs/experiment-notes/010` & `src/agentic_gov/runtime/episode_runner.py`
- **模型发明非法动作**：
  ```xml
  <analysis>
  系统当前正在处理中，需要等待用户下一步回复。
  </analysis>
  <action type="Wait_For_User">
  请问您还在吗？
  </action>
  ```
- **Runtime 处置**：
  - `parse_analysis_action` 抛出 `ParseError: Unknown action type 'Wait_For_User'`。
  - `episode_runner.py` 捕获异常，标记 `failure_class="parse_failure"`。
  - `RewardPipeline` 判定为 Hard Violation：$R_{complete}=0, R_{disclosure}=0, R_{total}=0.0$。
  - 触发即时终止（Immediate Termination），不进入后续轮次，不予重采。

### 4.6 Ch9 业务升级轨迹（Escalate Trajectory）
- **出处**：`phase6/data/` 贷款还款组合贷款场景（`loan_repayment_query × BD-C4`）
- **交互轨迹**：
  1. 用户：`"我想查下我公积金贷款还款情况，身份证 3201021988..."`
  2. Agent：调用 `verify_identity` 核身通过。
  3. Agent：调用 `query_loan_info` $\to$ 返回 `{loan_type: "combined", commercial_bank: "ICBC", ...}`。
  4. Agent 决策与输出：
     ```xml
     <analysis>
     核身已通过，query_loan_info 查询结果显示该贷款为公积金与商业银行组合贷款（combined_loan）。根据政策 HF-LOAN-REPAY 规则第 2 条，组合贷款涉及商业银行独立利率与扣款账户，本智能系统无法直接办理组合贷款结清与明细结算，属于明确的 escalation 条件。应主动向用户解释原因，并办理转接人工贷款专员。
     </analysis>
     <action type="Escalate">
     赵先生您好，系统查询到您的公积金贷款属于公积金与商业银行组合贷款。由于组合贷款的商业部分还款需由经办银行协同核算，线上智能客服无法直接为您出具综合结清证明。为了保障您的权益，我现在为您转接人工贷款专员进一步处理，请您稍候。
     </action>
     ```
  5. 奖励判定：$R_{escalate}=1.0, R_{disclosure}=1.0, R_{total}=0.88$（高分完成）。

---

## 5. 逐章事实梳理与技术要点（Ch0 - Ch12）

### Ch0 总览：项目定位、全链路蓝图与自述路线
- **定位**：政务公积金垂直领域、面向复杂多轮决策的任务型 Agent，涵盖 SFT 数据工程、Simulator 建模、质量治理与 RL 算法调优的全栈闭环。
- **全貌图**：使用本底稿 §1.2 的全链路 ASCII 图，讲清任务生成、合成、过滤、训推一致性、环境仿真、GRPO 梯度的完整流转。
- **自述主线建议（20-30 min）**：
  1. 架构开篇（2 min）：政务业务痛点 + 4 任务类型 + 整体 SFT$\to$RL 流水线。
  2. 数据基石（6 min）：TaskFactory + Sandbox 状态机 + SFT 双 Teacher 合成与 Verifier Funnel（插叙① NLI per-message）。
  3. 训推桥梁（5 min）：LLaMA-Factory 训推一致性（插叙② Jinja 对齐）+ pass@k 饱和分析转折（插叙④）。
  4. 环境仿真（3 min）：User Simulator 架构与信息边界约束（插叙③）。
  5. RL 核心攻坚（8 min）：ART GRPO 框架深度解构（CISPO Loss、Advantage 归一化、Loss 归一化地板 $N_{norm}=2560$、Reward v3 终态门控、插叙⑥⑦⑧⑨⑩）。
  6. 终局收官（3 min）：RL 有效性终审 verdict（插叙⑪，驳斥假停滞，确立有效泛化提升）。

### Ch1 任务设计：CanonicalTask Schemas 与任务工厂
- **4 大任务类型**：余额查询、租房提取、购房提取、贷款还款。
- **核心数据结构**：`CanonicalTask`、`HiddenTruth`、`Persona`、`DisclosureRule`、`AmbiguityProfile`。
- **ID 卡生成算法**：严格遵循 GB 11643-1999 规范，加权求和模 11 校验码算法（权重系数 $[7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]$，校验码映射 `'10X98765432'`），绑定年龄组生成合法生日。
- **Golden Chain 与 DSL**：为每种任务类型、边界条件（BD-N1~N7, BD-C1~C8）硬编码确定性预期动作序列与预期最终数据库状态。
- **对抗种子与 Contrast Pairs**：`AdversarialSeedGenerator` 注入代办/越权声明；`ContrastPairGenerator` 构造仅相差微小边界条件（如提取金额恰好超限 vs 不超限）的成对任务。

### Ch2 沙箱环境：Domain-Agnostic Sandbox Engine
- **无外部依赖内存数据库**：`Database` 提供快照、事务性 update、回滚与审计日志。
- **工具注册与契约**：`verify_identity`、`query_account_info`、`query_loan_info`、`calculate_prepayment`、`check_eligibility`、`submit_rent_withdrawal`、`submit_purchase_withdrawal`、`submit_prepayment_request`。
- **错误注入机制**：支持在指定 turn 注入可恢复错误（如 `TEMPORARY_UNAVAILABLE`、`MISSING_REQUIRED_ARG`），测试 Agent 的重试与自愈能力。

### Ch3 SFT 数据合成：双 Teacher 协同与编排守卫
- **双 Teacher 机制**：Agent Teacher 扮演政务坐席，User Teacher 扮演群众；Prompt 模板版本化受控（`v1.0` / `v1.1`）。
- **`<analysis>/<action>` Envelope**：强制模型先输出显式 CoT 思维分析，再输出格式化动作块。
- **Parser 与 Current-Turn Repair**：`parse_analysis_action` 严格校验 XML 闭合与 JSON 参数；解析失败时向 Teacher 注入 `parse_feedback` 进行就地单轮修复（最多 2 次），无需丢弃整条轨迹。
- **语义守卫（Semantic Guard）**：实时拦截未核身敏感调用、重复扣款调用以及非法动作。

### Ch4 SFT 数据过滤：Verifier Funnel 与分层采样
- **L0-L5 漏斗**：L0 格式校验 $\to$ L1 沙箱状态与影子表比对 $\to$ L2 NLI 告知与 RPCR 隐私泄露校验 $\to$ L3 Tagger 特征提取 $\to$ L4 实体一致性 $\to$ L5 LLM Judge 评分。
- **L3 Tagger**：正则与轻量模型结合，打上轮数、信息释放模式、话题漂移、情绪弧线标签。
- **分层采样器**：`StratifiedSampler` 按照画像子群（Elderly/Vulnerable）、业务类型、边界难度进行严格配额采样。
- **插叙①（NLI premise-per-message）**：彻底解决超长对话 512 token 截断导致的漏判。

### Ch5 SFT 训练：LLaMA-Factory 与 SFT 饱和转折
- **训练架构**：Qwen3-8B 基座 + LoRA $r=128, \alpha=64$，4 桶数据混合。
- **插叙②（Tokendiff 修复）**：彻底排查并对齐 default_system 与 `<think>` 差异，达成 8/8 IDENTICAL。
- **插叙⑤（Loan 短板留给 GRPO）**：业务复杂度高、SFT 模仿学习遇到瓶颈，果断交由 RL 优化。
- **插叙④（Pass@k 饱和转折）**：通过组内方差数学推导，确立 pass@1=0.16 / pass@8=0.75 是 GRPO 黄金起点的科学结论，推动项目转向 Phase 6。

### Ch6 User Simulator：环境仿真与 SFT
- **Simulator 建模**：扮演真实办事群众，严格受控于 `reveal_policy`。
- **插叙③（Role Order 与 Mask History）**：Merge 连续 Agent 话术解决 ShareGPT 交替报错（挽救 53% 丢弃数据）；`mask_history: true` 消除多轮重复学习偏差。
- **评测达标**：指令遵循 98.9%、隐私防泄露 98.1%，零话题漂移与过早终止，成功冻结为仿真环境。

### Ch7 Release Gate：质量治理闭环
- **G1-G3 治理体系**：
  - G1：判定器同源性哈希锁死。
  - G2：Hybrid 判定器在测试集上各概念 P/R ≥ 90%。
  - G3：零在线调用的字节级确定性重放验证。
- **插叙⑫（Gold Relabel 与 Hybrid Review）**：逐样本归因修复 P-02/P-07/P-08，完成 13/13 概念达标闭环。

### Ch8 RL 数据与采样：Learnability Pool 与采样课程
- **Learnability Pool v1/v2**：根据冻结探针数据，将任务划分为全对饱和区、黄金学习区（$p \approx 0.5$）、全错死区。
- **插叙⑩（采样课程与 SR5 修复）**：消除 94% 组丢弃率的 frontloading bug，引入方差感知混合采样；审计并退役 247 条不可观察无效任务，建立分级课程。

### Ch9 Rollout 与 Reward：Sim Server 与 Reward v3
- **Sim Server**：本地 HTTP 独立进程，解耦 Simulator 推理与 ART 训练显存。
- **插叙⑥（Hard-Zero 策略）**：实测格式失败率仅 2.08%，确立即时终止 Hard-Zero 策略。
- **插叙⑦（Reward v3 终态门控）**：引入 `TerminalMatch` 门控，彻底解决 No-Write 任务的 Terminal Tie，解锁稀有动作学习。

### Ch10 ART GRPO 训练：框架解构与工程攻坚
- **项目侧编排**：`collect_train_groups` $\to$ `filter_zero_variance_groups` $\to$ `TrainableModel.log` $\to$ `LocalBackend.train`。
- **ART 源码黑盒解构**：
  - `gather_trajectory_groups`: 异步并发调度与组内对齐。
  - Token-Level CISPO Loss: Ratio clip $[0, 5]$，REINFORCE 式稳定更新。
  - Advantage 归一化: 组内 $(R - \bar{R}) / (\text{std} + \epsilon)$。
  - Loss Denominator Floor: $N_{norm}=2560$ 防止短序列/空序列导致的梯度尖峰。
  - 权重同步: Merged Weights 极速推送。
- **插叙⑨（KL Penalty）**：Advantage 级别自适应奖惩，`disable_adapter()` 零显存参考计算。
- **插叙⑧（LoRA-merge serving 加速 & Async RL）**：排查 6x Triton LoRA 性能悬崖，深入剖析 Intra-step Drift 与 Async 适用边界。

### Ch11 终局：RL 有效性终审 Verdict 与全盘复盘
- **插叙⑪（终审 Verdict）**：
  - 驳斥“RL 停滞”论调：证明其为 38 条不可观察任务（0/304 零墙）与 Reward v2 平局的测量假象。
  - 确认真实泛化提升：在 Range-80 真实任务上通过率提升至 61.7%（+7.8pp, p=0.023），Escalate 达 80.4%（+20.6pp），FWR 达 59.6%（+12.5pp），有效难任务迁移提升 78%。

### Ch12 面试快问快答：RL 算法高频考点 × 项目实证映射
*(本底稿 §6 汇总了全部考点与项目实证指针)*

---

## 6. 关键实验指标与数据速查表

### 6.1 阶段演进核心指标对照表

| 阶段 / 实验节点 | 评测集 / 任务面 | Strict Success (%) | Hard Violation (%) | 核心发现 / 结论 | 出处记录 |
|---|---|---|---|---|---|
| **Phase 3 SFT eval** (Qwen3-8B ckpt-720) | Stream① Eval Holdout | 62.2% (总) / loan 16.1% | 4.5% (总) / loan 22.6% | Exit Gate PASS；loan 条件分支为显著弱项，决定留给 GRPO | Note 003 |
| **Phase 4 Sim eval** (Qwen3-4B ckpt-2070) | Stream④ RPCR 压测 (580条) | 指令遵循 98.9% / 泄露率 1.9% | 0.0% (过早终止) | 5 项门槛全绿；确认不补 supplement 亦能支撑自由 Rollout | Note 006 |
| **Phase 6 Free Rollout** (Pre-GRPO) | 624 自由 Rollout 样本 | loan 33.87% / purchase 47.79% | Format Fail 2.08% | 格式失败率 <5%，定稿 Hard-Zero 策略；发现 Simulator 首轮播种泄露并修复 | Note 010 |
| **4B SFT vs 8B 对齐评测** | Eval Holdout (重测对齐) | **4B 80.1% vs 8B 77.6%** | **0.000% (双方均为0)** | 4B 达到全面 Parity，安全底线一致，正式采纳 4B 作为 RL 基座 | Note 023 |
| **LoRA Serving 吞吐突变** | GPU1 Rollout 过程 | Step 0: **1511.1 tok/s** $\to$ Step 1+: **247.2 tok/s** | — | 6x 性能断崖；定位为 Triton JIT LoRA kernel 开销，推动 Merged Serving | Note 023/025 |
| **T4-R2 梯度归一化验证** | Step 14 异常对齐轨迹 | Target Grad Norm: 18.4 $\to$ **1.59** | 0/823 Guard Skip | $N_{norm}=2560$ 成功压制梯度尖峰，同时保留 Control 任务 52-68% 信号 | Note 026 |
| **C0 $\to$ C15 正式 GRPO 训练** (Reward v3) | Range-80 任务面板 (74条成对) | **53.9% $\to$ 61.7% (+7.8pp)** | 无新增违规 | Escalate 59.8%$\to$80.4% (+20.6pp)，FWR 47.1%$\to$59.6% (+12.5pp)，$p=0.023$ | Note 031 |
| **无效任务 vs 有效难任务拆分** | C15 Promotion 面板 | **无效 38 条: 0/304 $\to$ 0/304**<br>**有效 36 条: 14/288 $\to$ 25/288 (+78%)** | — | 彻底澄清“零进展”假象，证实 GRPO 在可解任务上正向泛化迁移显著 | Note 031 |

### 6.2 面试快问快答高频映射表（考点 × 项目实证）

1. **问：GRPO 与 PPO 的本质区别？如何计算优势（Advantage）？**
   - **答**：GRPO 摒弃了独立 Critic/Value 网络，直接对同一 Prompt 采样 $K$ 条轨迹，通过组内奖励均值与方差计算相对优势：$A_i = (R_i - \bar{R}) / (\text{std} + \epsilon)$。
   - **项目实证**：`src/art/loss.py` 与 Note 007。GRPO 的梯度完全依赖组内方差；当任务 pass@1=0.95 时组内全对导致方差塌缩无梯度，而在本项目 loan 场景（pass@1=0.16, pass@8=0.75）下，75% 的组提供充沛学习信号。

2. **问：Token-Level CISPO 与标准 PPO Clip Loss 有何区别？为什么更适合 Agent？**
   - **答**：标准 PPO 对概率比值进行双向裁剪并求最小值，当偏离过大时梯度直接截断为 0；CISPO 将 Ratio 截断后仅作为权重，梯度保持 REINFORCE 形式 $\nabla_\theta \log \pi_\theta$。
   - **项目实证**：`src/art/loss.py:188-193` 与 Note 024。在多轮长序列对话中，关键决策 token 往往是低频探索点，CISPO 避免了重要修正信号被 Clip 彻底抹杀。

3. **问：KL 散度惩罚如何实现？为什么不加在 Loss 上？**
   - **答**：ART 在 Advantage 上调整相对 KL 散度：$A_i \leftarrow A_i + c_{kl}(\overline{\text{KL}} - \text{KL}_i)$，仅惩罚偏离大于均值的异常 token。参考策略通过 `model.disable_adapter()` 临时置零 LoRA 矩阵，零额外显存。
   - **项目实证**：`docs/experiment-notes/020`，监控指标 `loss/kl_policy_ref` 维持在 0.01-0.30 健康区间。

4. **问：多轮长序列 RL 中的梯度爆炸与长度偏置如何处理？**
   - **答**：ART 默认以 Assistant Token 掩码和作为分母，遇到超短序列或异常样本时容易除以极小值产生十几倍的梯度尖峰。通过引入 Policy Loss 最小分母地板（Loss Norm Floor, $N_{norm}=2560$），平滑极端梯度。
   - **项目实证**：`phase6/art/loss_norm_floor.py` 与 Note 026，将身份冒充异常任务的 Grad Norm 从 18.4 压制至 1.59，同时保留正常任务 60% 梯度。

5. **问：如何设计面向任务型 Agent 的 Reward 体系？踩过什么坑？**
   - **答**：采用多维度分解式 Reward（完成度 $R_{complete}$、合规告知 $R_{disclosure}$、效率惩罚 $P_{turns}$、严重违规 $R_{hard}=0$）。最深坑是 Reward v2 在 No-Write 任务上的“Terminal Tie”（错误 Finish 与正确拒绝同分），通过 Reward v3 终态动作匹配门控彻底解决。
   - **项目实证**：`src/agentic_gov/reward/aggregate.py`、Note 008 与 Note 031。
