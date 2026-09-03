# 简历 v3.1 项目问答面试备战材料：大纲与内容计划

> 定位：这是大纲，不是正文。每条 = 条目编号 + 条目名 + 一两句要点 + 依赖素材位置。
> 事实口径：严格服从 `/Users/sunxichen/Downloads/简历3.0/decisions.md` 的"指标终裁"与"v2.2/v3.1 决策"两章。本大纲在 decisions.md 未覆盖处按 recap 素材补充，标注"（口头弹药）"的内容只进口头、不进笔记标题与简历。
> 铁律速记（写正文与答题都要守）：
> 1. T5 千题 final holdout 未执行，永远不说"泛化已验证"；96 题测试集是从 300 条 dev 任务中按 12 格分层抽取、训练中用于 steering 监控的面板，与训练集 family 隔离，但不得称 held-out。
> 2. 训练规模数字（步数、轨迹数、GPU 数）只作口头弹药，不进笔记正文标题。
> 3. 禁用黑话："转段"（改说"SFT 进入 RL 阶段的判据"）、"管线"（改说"训练流程 / 链路"）、"训服分离"（改说"训练与服务分离"）、"数据平面"、"硬件线"。
> 4. 简历动词字面为真：未实施项只说"设计 / 确立 / 探索 / 评估"，Agent Teams 是 design_complete 未实施，ChatBI ReAct Loop 在参考分支，A2UI 是探索原型。
> 5. 数字必有出处：8.6%→80.5% 是 FWR（合规拒办）分项；0.26% 是 episode 级 2/768（分子分母口头）；两轮双盲审计在训练中期两次节点执行、非终点。

素材根目录（下文简写）：
- `AG/` = `.scratch/interview-deck/agentic-gov-recap/`（fact-base.md、recap-blog.md、recap-code/01–08、briefs/、review-followups/）
- `DN/` = `.scratch/interview-deck/detail-notes/`（10+ 专题 .md、rl-objectives-*.py）
- `LA/` = `.scratch/interview-deck/langagent-recap/`（fact-base.md、recap-blog.md、detail-notes/01–07、fragments/、issues/、recap-code/）
- `RS/` = `/Users/sunxichen/Downloads/简历3.0/research/`（p5-500step-verification.md、async-rl-investigation.md、expert-projects-review.md、metrics-audit.md、expert-metrics-reco.md、decisions-candidates.md）
- `DEC` = `/Users/sunxichen/Downloads/简历3.0/decisions.md`
- 早期问答稿：`.scratch/interview-deck/agentic-gov-deep-dive-answers.md`、`agentic-gov-self-intro-answers.md`、`deep-cards.json`（可复用措辞，但数字以 RS/p5 与 DEC 为准，旧稿中 C0→C15 数字已退役为口头辅助）

---

## 一、整体结构与时间分配

### 1.1 笔记文件组织（按项目分文件 + 一份总控 + 代码目录）

```
resume-v3.1-qa/
├── 00-master.md                 # 总控：自我介绍稿（90s/3min 两版）、时间分配、风险清单、覆盖度自检表、口径红线卡
├── 01-p1-agentic-rl.md          # 项目一：任务型 Agent 后训练系统（重头）
├── 02-p2-agent-platform.md      # 项目二：企业级 Agent 平台与运行时
├── 03-p3-colpali-serving.md     # 项目三：多模态文档 RAG + 私有化部署（理论与流程为主）
├── 04-p4-npc-dialogue.md        # 项目四：游戏 NPC 人格化对话（理论与流程为主）
├── 05-decision-cards.md         # 3 张关键技术决策卡 + 备选 D07 卡（Agent 变体）
├── 06-topbar-skills-patents.md  # 顶栏 4 卡、个人简介、工作经历、核心能力 6 行、专利与论文、教育
└── code/                        # 白板手写 code，按考点聚类多文件（理由见 1.3）
    ├── 01_reward_advantage_passk.py      # C01–C03、C09、C10、C25
    ├── 02_rl_losses_kl_floor.py          # C04、C05、C21、C28
    ├── 03_rl_pipeline_sync_async.py      # C06、C07、C08
    ├── 04_agent_loop_agui_hitl.py        # C11、C12、C13、C16
    ├── 05_orchestrator_subgraph.py       # C14、C15
    ├── 06_retrieval_maxsim_rrf.py        # C17、C18
    ├── 07_lora_rlhf_zero.py              # C19、C20、C22
    └── 08_serving_paged_quant.py         # C23、C24、（C26 RoPE 可选）
```

### 1.2 每份项目文件的内部结构（01–04 统一模板）

A. 60 秒自述（照简历角色行展开一句因果链，为面试官"顺着 skeleton 问"留钩子）
B. 简历逐句对照表（简历原句 → 该句背后的真实事实 → 允许说 / 不允许说）
C. 问题清单（本大纲第二部分的条目，按"简历锚点 → 追问方向"分组，每条标 L1 基础 / L2 机制 / L3 深挖）
D. 口头弹药数字表（只在此表出现、不进标题：训练规模、丢弃率、早期 run 数字、分子分母等）
E. 红线与降级话术（被问到没做 / 没测 / 团队做的部分，怎么答不失分）
F. 素材索引（指向 AG/DN/LA/RS 的章节）

`05-decision-cards.md` 每张卡结构：共性问题点题 → 本人岔路判断 → 验证收底 → 6–8 条追问 → 反共识观点的边界（什么情况下我的结论不成立）。

### 1.3 白板 code：多文件而非单文件

- 理由：候选清单 20+ 项、合计 600+ 行，单文件在面试前 30 分钟无法快速回顾；按考点聚类后每个文件 60–120 行，能独立运行一个 `if __name__ == "__main__"` 小测试，面试前可各自跑一遍确认无 bug。
- 每个函数头部三行注释：考察点 / 预期手写行数与分钟 / 最常见追问。正文见第三部分。
- 复用来源：`DN/rl-objectives-core-pseudocode.py`（GAE、group advantage、REINFORCE/PPO/GRPO/CISPO/DAPO/GSPO/DPO 已有精简版）、`DN/rl-objectives-losses.py`（带 mask 的 PyTorch 版）、`AG/recap-code/07_rl_rollout_reward.py` 与 `08_art_grpo.py`（Reward v3、组过滤、loss norm floor）、`LA/recap-code/skeleton/*.py`（ReAct loop、HITL、Orchestrator、MCP 生命周期骨架）。

### 1.4 40–60 分钟面试时间分配假设

| 时段 | 40 分钟版 | 60 分钟版 | 内容与策略 |
|---|---|---|---|
| 开场合述 | 0–3 | 0–5 | 自我介绍（时间线三段 + 两条主线 + 顶栏 4 卡各一句）；主动报"6 个系统"清单防追问；末尾一句把话头引向项目一 |
| 项目一（重头） | 3–20 | 5–28 | 按 4 个动作块顺序讲，重点停在 Reward 门控、判据、训推一致、Async RL 取舍；结果口径先说清"96 题测试集、SFT 基线对比" |
| 白板 code（第一段） | 20–27 | 28–38 | 最可能在项目一深挖后出现：Reward 门控 / GRPO advantage / pass@k / CISPO loss 四选一或二；60 分钟版可能加 RL pipeline 伪码 |
| 项目二 | 27–35 | 38–50 | 双执行路径 → AG-UI/HITL → 沙箱与产物 → ChatBI → Orchestrator-Worker；主动标注成熟度 |
| 项目三 / 四 | 35–38 | 50–55 | 通常只各挑一个点：ColPali 为何绕开 OCR / 多 NPC 为何不切 LoRA；备好 3 分钟版 |
| 白板 code（第二段，可选） | — | 55–58 | ReAct loop / MaxSim / LoRA 前向；面向 Agent 岗则 AG-UI 事件处理或 Orchestrator 分派 |
| 反问 | 38–40 | 58–60 | 2 个问题：团队 RL 基础设施现状（异步/同步、serving 形态）、Agent 平台的评测体系 |

- 重头判断：项目一占 40–45% 时间，它同时承载顶栏头牌数字与两张决策卡（D1、D2）；项目二占 25–30%，承载 D3。
- 白板 code 出现时机假设：多数面试官在项目一"你说 Reward 门控/GRPO 归一化"后立刻要求手写；少数在最后 10 分钟统一手写。两种都要能接上。
- 若面试官是 Agent 平台团队：项目二与项目一时间对调，决策卡 D2 换 D07（DEC "Agent 变体 diff 清单"）。

---

## 二、逐项目问题清单骨架

编号规则：`P1-xx` 项目一、`P2-xx` 项目二、`P3-xx` 项目三、`P4-xx` 项目四、`D1/D2/D3/D7-xx` 决策卡、`M-xx` 顶栏/简介/技能/专利/教育。每条格式：**问题** ｜ 考察点 ｜ 素材。层级标注 L1（基础，必须秒答）/ L2（机制，2–3 分钟）/ L3（深挖，需要数字与代码细节）。

### 2.1 项目一：任务型 Agent 后训练系统（agentic-gov，独立负责）

**锚点 A：角色行（Qwen3-4B、公积金业务、沙箱任务工厂 → 数据合成与验证漏斗 → SFT 与冻结模拟器 → 长程 GRPO）**

- **P1-01（L1）用一分钟讲清全链路，为什么 SFT 之后必须做 RL？** ｜ 全局叙事能力；SFT 模仿 vs RL 探索边界（贷款还款条件槽是 SFT 学不会、RL 能学的典型） ｜ `AG/recap-blog.md` Ch0 §0.2–0.3、`DN/agentic-gov-data-lifecycle-sft-rl.md` §6.1；旧稿 `agentic-gov-self-intro-answers.md`
- **P1-02（L2）为什么选 Qwen3-4B 作 Agent 基座？8B 呢？** ｜ 模型选型的工程权衡：多轮 rollout 的 decode 长尾延迟、2 卡显存、4B 与 8B 对齐评测（口头弹药：4B 80.1% vs 8B 77.6%，HV 均 0）；Simulator 也是 Qwen3-4B + LoRA r=64 ｜ `AG/fact-base.md` §2⑧、§6.1；`DN/agentic-gov-rl-training-real-process.md` §4.1
- **P1-03（L2）"任务型 Agent"与通用 Agent 的差别？为什么公积金业务适合形式化？** ｜ 有限动作空间、可程序化状态、明确政策规则、终局可判定 ｜ `DN/agentic-gov-task-types-business-rules.md` §1、§6

**锚点 B：动作行 1 环境与任务（可程序化沙箱与任务工厂、动作空间形式化：工具调用 / 用户交互 / 3 类终局动作、Golden State 比对替代主观打分）**

- **P1-04（L1）动作空间怎么形式化？三类终局动作是什么，为什么要三类？** ｜ Call_API / Ask_User / Finish / Escalate / FinishWithRefusal；Ask_User 是 Agent 的自主动作而非环境信号；`<analysis>/<action>` envelope ｜ `DN/agentic-gov-data-lifecycle-sft-rl.md` §5.2、§7；`DN/agentic-gov-sandbox-architecture.md` §9
- **P1-05（L2）Golden State 比对具体怎么做？Strict Success 定义？** ｜ 任务工厂由 Golden Chain 派生期望终态，沙箱 export_state 与之做 diff；Strict Success = R_complete=1.0；无写库任务终态为空写 → 引出 D1 ｜ `AG/recap-code/01_task_design.py`（select_golden_chain / generate_golden_final_state）、`02_sandbox.py`；`DN/agentic-gov-sandbox-architecture.md` §8、§10
- **P1-06（L2）任务工厂产什么、怎么保证任务可解且多样？** ｜ CanonicalTask 结构（Persona / HiddenTruth / DisclosureRule / AmbiguityProfile / InjectedError）、确定性 seed、合法身份证生成（GB 11643-1999 校验位）、对抗种子与对比对（Contrast Pairs）、BD-N1~N7 / BD-C1~C8 边界 ｜ `DN/agentic-gov-task-factory.md` §2–§4、§8；`AG/recap-blog.md` Ch1
- **P1-07（L2）沙箱怎么做到领域无关？错误注入干什么用？** ｜ 通用引擎 + 领域插件、8 步执行流程、内存数据库快照/回滚/变更日志、TEMPORARY_UNAVAILABLE 等可恢复错误考察重试自愈、主体感知状态账本（谁核过身） ｜ `DN/agentic-gov-sandbox-architecture.md` §2、§4–§7、§11
- **P1-08（L3）合成任务最大的坑是什么？** ｜ "物理不可解"死题（证据在工具与政策中均不可见）、幽灵对抗标签、Golden Chain 与运行时规则冲突、对比对非单变量漂移；21 项跨字段不变式 Fail-Closed 进厂门禁；（口头弹药：退役 247 条） ｜ `DN/agentic-gov-invariants-and-dead-task-diagnosis.md` §4–§6、§9
- **P1-09（L3）任务覆盖度怎么衡量？只按 4 个 task type 够吗？** ｜ 决策概念（DC）体系：31 个 DC / 8 族，按 DC 密度配额而非按 task type 计数，与 family split 物理隔离 ｜ `DN/agentic-gov-decision-concepts.md` §1.3、§3、§5、§7

**锚点 C：动作行 2 数据合成（双角色 Teacher 合成轨迹、分层验证漏斗、同步训练 Agent 策略与 RL 阶段冻结使用的 Simulator）**

- **P1-10（L2）双角色 Teacher 怎么协同？信息边界怎么隔？** ｜ Agent Teacher 只见 API spec 与对话，User Teacher 只见 persona/hidden truth；Prompt 模板版本化；当前轮修复（parse_feedback 注入、最多 2 次）；语义守卫（未核身禁敏感查询、幂等守卫） ｜ `AG/recap-blog.md` Ch3 §3.1–3.6；`AG/recap-code/03_sft_synthesis.py`
- **P1-11（L2）分层验证漏斗每层做什么？为什么叫五级却有 L0–L5？** ｜ L0 格式 → L1 沙箱终态 → L2 NLI 告知 + RPCR 泄露 → L3 行为打标 → L4 实体一致 → L5 LLM Judge；每层拦什么、成本从低到高 ｜ `DN/agentic-gov-sft-five-level-funnel.md` §1、§3、§9；`AG/recap-code/04_sft_filtering.py`
- **P1-12（L3）NLI 校验告知踩过什么坑？** ｜ mDeBERTa 512 token 硬上限、告知多在末轮被截断 → premise 改为按 assistant 单条消息取 max；同一套判定器复用到 Reward 的 R_disclosure（训练与评测判定口径统一）；（口头弹药：单样本 0.0032→0.9971，是 case 不是均分） ｜ `AG/fact-base.md` §2①；`DN/agentic-gov-sft-five-level-funnel.md` §5
- **P1-13（L2）分层采样与训练数据配比怎么定？怎么防评测泄漏？** ｜ Main / Contrast / Adversarial / Hard 四桶；按 persona 子群与边界配额；family 级切分保证同一任务家族不跨 train/dev ｜ `AG/recap-blog.md` Ch4 §4.4、Ch5 §5.1；`AG/recap-code/05_sft_training.py`（split_family）
- **P1-14（L2）为什么要自己训一个 Simulator 而不是直接用 Teacher API 当用户？** ｜ 成本与吞吐（RL 阶段每步大量并发多轮）、可冻结可复现、信息边界受控（reveal_policy）、可审计保真度 ｜ `AG/recap-blog.md` Ch6 §6.1–6.2；`AG/recap-code/06_simulator.py`
- **P1-15（L3）Simulator 训练时踩过什么坑？怎么判定它够用可以冻结？** ｜ ShareGPT 角色交替约束导致连续 assistant 轮被静默丢弃 → 角色合并（口头弹药：挽回 4028 条，7200→11030）；mask_history 消除多轮重复学习偏差；5 项硬门槛（指令遵循、泄露、人设、过早终止、跑题）；冻结后泄漏旁路监控 ｜ `AG/fact-base.md` §2③；`AG/recap-blog.md` Ch6 §6.3–6.4
- **P1-16（L3）冻结 Simulator 会不会被策略 exploit？怎么防？** ｜ R4 审计（开场系统提示词泄漏 0、RPCR 泄露差分、过早终止/跑题配对门）；Simulator 不看工具结果只看用户可见话术 ｜ `RS/p5-500step-verification.md` §5；`AG/recap-blog.md` Ch6 §6.4

**锚点 D：动作行 3 判据与训推一致（pass@k 与 Hard Violation 率作为进入 RL 阶段的判据；token-diff 校验训推逐字节一致；vLLM 提升 Rollout 吞吐约 6 倍 250→1500 tok/s）**

- **P1-17（L1）SFT 进入 RL 阶段的判据为什么不看 pass@1 看 pass@k？** ｜ GRPO 梯度来自组内方差，死区只有全对/全错；P(组内至少 1 成功)=1-(1-p)^K；低 pass@1 高 pass@k 是最佳工况（口头弹药：loan pass@1 16.1%，K=8 时约 75% 组有方差）；第二判据 Hard Violation 地板不能太高（平零抹梯度方向） ｜ `AG/fact-base.md` §2④⑤；`DN/agentic-gov-data-lifecycle-sft-rl.md` §6.2；`RS/decisions-candidates.md` D02
- **P1-18（L2）贷款还款 SFT 阶段很弱为什么不回去补数据？** ｜ 数据量不是瓶颈（口头弹药：946 条）、条件槽边界是模仿学不会的；把离散终态边界决策留给 RL 的 R_complete+R_escalate 组合信号 ｜ `AG/fact-base.md` §2⑤
- **P1-19（L2）token-diff 校验具体校什么？为什么会不一致？** ｜ 训练侧 LLaMA-Factory 模板 vs 推理侧 vLLM 读基座 jinja，两套渲染；差异 A default_system、差异 B Qwen3 末轮注入空 `<think>`；手写等效 jinja 覆盖；（口头弹药：8/8 IDENTICAL；反面教训 enable_thinking=False 反而插 `<think>` 使 HV 0→68.75%） ｜ `AG/fact-base.md` §2②；`AG/recap-blog.md` Ch5 §5.3；`AG/recap-code/05_sft_training.py`
- **P1-20（L2）vLLM 6 倍吞吐是怎么来的？是优化还是修复？** ｜ 诚实框定：Step 0 零增量 LoRA 1500 tok/s，Step 1 起非零 LoRA r=128 触发 Triton JIT LoRA kernel 慢路径跌到 250；轻量配置调优 <11% 无效；改 Merged serving（LoRA 合并进基座全量权重热推）恢复到 1500；本质是"绕开 LoRA kernel 悬崖"而非凭空 6 倍 ｜ `AG/fact-base.md` §2⑧；`RS/async-rl-investigation.md` §3.2 证据 1；`DN/agentic-gov-rl-training-real-process.md` §4.1
- **P1-21（L2）Rollout 架构长什么样？Simulator、Agent、沙箱、训练器怎么分卡？** ｜ Sim Server 独立 HTTP 进程；Agent 由 vLLM 服务；训练器与推理分卡；MultiTurnEpisodeRunner 编排一幕；权重同步方式 ｜ `AG/recap-blog.md` Ch9 §9.1、Ch10 §10.2；`AG/recap-code/07_rl_rollout_reward.py`；`DN/agentic-gov-rl-training-real-process.md` §1.2、§3.1
- **P1-22（L3）训练与评测的判定器怎么保证同源？** ｜ 冻结 NLI 阈值哈希、Hybrid 判定（NLI + LLM Adjudicator）各概念 P/R 门、字节级确定性重放；Gold relabel 处理标注自相矛盾（口头弹药：P-02/P-07/P-08 三条修法） ｜ `AG/fact-base.md` §2⑫；`AG/recap-blog.md` Ch7

**锚点 E：动作行 4 Reward 与 RL（终态比对 + 终局动作门控 Reward；Policy Loss 归一化与梯度保护；长程 GRPO；评估 Async RL(k=1) 后因机制冲突主动放弃）**

- **P1-23（L1）Reward 函数由哪几项组成？各自怎么算？** ｜ R_complete（终态 × 终局门控）、R_disclosure（NLI per-message）、效率项（轮数）、Hard Violation 直接 0；转人工加分移出总目标；权重与取值范围 ｜ `AG/recap-code/07_rl_rollout_reward.py`（compute_reward / _compute_v3_total）；`DN/agentic-gov-data-lifecycle-sft-rl.md` §5.4
- **P1-24（L2）终局动作门控为什么是乘法不是加法？** ｜ 加法=给拒办单独加分=打补丁，会被"两边都试"投机；乘法把"状态对且动作对"变成必要条件；缺失即 0；→ D1 ｜ `AG/fact-base.md` §2⑦；`05-decision-cards.md` D1
- **P1-25（L2）格式解析失败怎么处理，为什么不重采？** ｜ Hard-Zero 即时终止 vs 拒采重采；实测格式失败率约 2%（<5% 警戒线）不会塌方差；重采掩盖契约缺陷并引入采样偏差 ｜ `AG/fact-base.md` §2⑥；`AG/recap-blog.md` Ch9 §9.3
- **P1-26（L1）GRPO 与 PPO 的区别？你的 loss 到底是什么？** ｜ 无 critic、组内均值方差归一化 advantage；实际 loss 为 ART 默认 token-level CISPO（ratio detach 后做权重，梯度走 REINFORCE 路径，clip 上界宽）；简历写 GRPO 指优势估计范式、CISPO 列在技能行 ｜ `DN/rl-objectives-ppo-grpo-cispo-reinforce-dapo-gspo-dpo.md` §3.3–3.4、§6.1；`AG/fact-base.md` §6.2 Q1–Q2
- **P1-27（L2）"Policy Loss 归一化与梯度保护"具体是什么？** ｜ 分母地板 N_norm（超短/异常序列除以极小 mask 和导致梯度尖峰；口头弹药：18.4→1.59，N_norm=2560）；Grad Guard 拦截、Train Fuse 熔断、LR 调度；与 DAPO token-level 归一化、GSPO 序列级的对比 ｜ `AG/recap-code/08_art_grpo.py`（loss_norm_floor）；`DN/rl-objectives-*.md` §5 场景 3、§6.2；`AG/fact-base.md` §2⑪
- **P1-28（L2）KL 惩罚怎么加？参考模型显存怎么省？** ｜ ART 在 advantage 级做相对 KL 调节（只罚高于均值的 token）；参考 logprob 用 `disable_adapter()` 零显存；健康区间与危险信号解读 ｜ `AG/fact-base.md` §2⑨；`AG/recap-blog.md` Ch10 §10.4
- **P1-29（L3）RL 阶段任务怎么采样？零方差组怎么办？** ｜ 可学习性池（饱和区/黄金区/死区）、方差感知混合采样、零方差组过滤后再训；采样前置饱和任务的故障（口头弹药：组丢弃率 94.1%→约 13%）；分级难度课程 L1→L3 ｜ `AG/fact-base.md` §2⑩；`AG/recap-blog.md` Ch8；`AG/recap-code/08_art_grpo.py`（filter_zero_variance_groups / scenario_sampler）
- **P1-30（L2）Async RL 评估了什么、为什么放弃？** ｜ PipelineTrainer(k=1) 全套适配（配置校验、采样器接流、双卡 dedicated）+ 漂移遥测；机制冲突：Merged 单份权重 vs 多轮在途请求旧版本 adapter 404；第二论据（追问才说）：14 步压测 44% 陈旧废弃、漂移约 2 倍；→ D2 ｜ `RS/async-rl-investigation.md` 全文；`AG/fact-base.md` §2⑧；`DN/agentic-gov-rl-training-real-process.md` §4.2
- **P1-31（L3）长程训练怎么保证稳定不崩？** ｜ 分层批调度、Cosine 绝对衰减 LR、Finish anchor 防塌方、崩溃恢复与续训、期中 Look 判定（口头弹药：500 步、3.2 万 rollouts、五波次、段错误与 HANG_DUMP 处置）｜ `RS/p5-500step-verification.md` §1；`DN/agentic-gov-rl-training-real-process.md` §3
- **P1-32（L3）OpenPipe ART 是什么、你改了什么、为什么不用 verl/TRL？** ｜ ART = LoRA + Unsloth + vLLM 的轻量 agentic RL 训练器，适合小团队 2 卡；项目侧改造：Reward、采样器、分母地板、Merged 权重推送、漂移遥测；换框架的代价 ｜ `DN/agentic-gov-rl-training-real-process.md` §6；`AG/recap-blog.md` Ch10 §10.3

**锚点 F：结果行（96 题测试集；Strict Success 54.3%→84.4% +30.1 个百分点；合规拒办准确率 8.6%→80.5%；Hard Violation 率 0.26%；两轮独立双盲审计全部通过）**

- **P1-33（L1）96 题测试集是什么？怎么抽的？和训练集什么关系？** ｜ 从 300 条 dev 任务按 12 个 task_type×终局 格每格 8 题、只看任务身份随机抽取；与训练集 family 隔离；训练中用作 steering 监控面板；**不称 held-out**；双臂同窗口 fresh 各 768 幕、K=8 ｜ `RS/p5-500step-verification.md` §2；`DEC` 指标终裁
- **P1-34（L2）54.3%→84.4% 怎么拆？为什么可信？** ｜ 分项：FWR 8.6→80.5 主贡献、Finish 68.4→82.0、Escalate 85.9→90.6；基线是 SFT 同窗口 fresh 重跑非旧数；（口头弹药：SE≈4.8pp，U99 +39.2pp；分子 417/768→648/768） ｜ `RS/p5-500step-verification.md` §2.2–2.3
- **P1-35（L1）0.26% Hard Violation 是什么口径？** ｜ episode 级 2/768，两条均为格式/动作协议错误无越权沙箱操作；95% CI 上界 <1% 红线；曾发现 any-of-8 任务级与 episode 级 1% 阈值量纲错位约 8 倍并修正口径 ｜ `RS/p5-500step-verification.md` §3
- **P1-36（L2）两轮双盲审计审什么？谁审？** ｜ R3 评分反投机（Judge 判对而人工/专家判错的博弈率差分）、R4 模拟器保真（提示词泄漏、RPCR 泄露、过早终止）；在训练中期两个节点执行、均 PASS；终点未单独审、并入未执行的 T5 ｜ `RS/p5-500step-verification.md` §5
- **P1-37（L3）泛化怎么验证？有 holdout 吗？** ｜ 诚实：T5 千题 final holdout 已建好执行器与收据但未跑；300 条 dev 全量面板测到中期；不说"泛化已验证"，说"训练中监控面板显示稳定提升，最终泛化评测未执行" ｜ `RS/p5-500step-verification.md` §4、§6.2
- **P1-38（L2）早期还有一个 +7.8pp 的数字，和 +30.1 什么关系？** ｜ 两个不同 run：15 步早期原型 vs 长程 run；任务池清洗前后；面板不同（Range-80 偏 Finish vs 96 题均衡）；"假停滞"归因（无效任务零墙 + Reward v2 平局） ｜ `RS/p5-500step-verification.md` §7；`AG/fact-base.md` §2⑪
- **P1-39（L2）如果重来会改什么？最大局限？** ｜ T5 未跑、单一 Simulator 分布、只 4 类业务、reward hacking 残余（disclosure 套话）、判定器依赖 LLM Adjudicator ｜ `AG/recap-blog.md` Ch11 §11.3
- **P1-40（L1）团队多少人？哪些是你做的？Coding Agent 怎么用？** ｜ 独立负责全链路；Coding Agent 辅助研发的边界（代码生成、实验记录、ADR 起草由自己拍板） ｜ `DEC` P5；技能行"Coding Agent 辅助研发"

### 2.2 项目二：企业级 Agent 平台与运行时（langAgent，主导设计 · 团队落地）

**锚点 A：角色行 + 结果行（公司 Agent 平台算法运行时；自研可控 Agent Harness：配置驱动、子图可插拔；支撑 ChatBI、长任务、多模态问答上线；新业务以配置与插件接入）**

- **P2-01（L1）60 秒讲平台全景：什么是 Agent Harness？** ｜ 双执行路径 + 协议层 + 插件体系 + 业务 Agent 四层；"Harness"= 模型之外的运行时约束与能力装配 ｜ `LA/recap-blog.md` §0.1–0.2
- **P2-02（L1）主导设计与团队落地的边界是什么？** ｜ 设计归属（detail-notes 设计均出自本人）、哪些自己写了核心代码（运行时、协议层、ChatBI 重设计）、哪些团队实现；主动标注成熟度（develop 已合入 / 参考分支 / 原型 / design_complete） ｜ `DEC` P6；`LA/recap-blog.md` §0.2 表达策略
- **P2-03（L2）为什么选 LangGraph/deepagents 而不是自研或其他框架？** ｜ 状态图 + checkpointer + interrupt 原语成熟；deepagents 提供文件系统/子代理/摘要中间件；代价：版本锁定、需 monkey patch 中文、原生 tasks 机制不满足需求 ｜ `LA/detail-notes/01-framework-catalog`（issues/29）；`LA/fact-base.md` FACT-LT-001

**锚点 B：动作行 1 双执行路径与协议层（配置驱动的短任务动态图 / 长任务沙箱，同一套 AgentConfig；AG-UI 事件流与展示解耦；Ask User HITL 挂起恢复；探索 A2UI）**

- **P2-04（L2）为什么要两条执行路径？同一份 AgentConfig 怎么编出两种图？** ｜ 短任务：DynamicAgentFactory 按配置选节点/条件边编 CompiledStateGraph；长任务：deepagents create_deep_agent + 容器沙箱；共享工具/子图/协议层 ｜ `LA/recap-blog.md` §1.1–1.2；`LA/fact-base.md` FACT-RT-001
- **P2-05（L2）配置驱动图编译的缓存怎么做？提示词变了要重编吗？** ｜ AgentConfig MD5 → LRU 128 编译缓存；（口头弹药）PromptProxy 延迟读取 + Nacos 监听，提示词热更新不重编图 ｜ `LA/fact-base.md` FACT-RT-002、FACT-RT-011；`LA/recap-blog.md` §1.3
- **P2-06（L3）LangGraph 状态合并踩过什么坑？** ｜ messages reducer 由覆盖型 lambda 改 add_messages，修复子图回流重复消息导致 tool_calls 配对断裂 400；多 tool_call 只路由 tool_calls[0] 的已知缺陷与 Send 扇出修复方案 ｜ `LA/fact-base.md` FACT-RT-003/004；`LA/fragments/f01-reducer-problem.md`、`f03-multi-tool-concurrency.md`
- **P2-07（L1）AG-UI 是什么？为什么用它做展示解耦？** ｜ 标准事件类型（RUN/TEXT_MESSAGE/TOOL_CALL/STATE/CUSTOM）；后端只发事件、前端自由渲染；流式与 Blocking 同源聚合 ｜ `LA/recap-blog.md` §1.11；`LA/detail-notes/06-hitl-and-ag-ui.md`
- **P2-08（L2）事件流中间件怎么组织？出错怎么保证流正常收尾？** ｜ 10 级中间件（名称翻译、快照修复、活动注入、Ask User 掩码/转译、RAG 来源、工具度量）；异常补发 STEP_FINISHED/RUN_ERROR/RUN_FINISHED；（口头弹药）tool_call_id 旁路统计替代原地篡改 ｜ `LA/fact-base.md` FACT-AGUI-001/002、FACT-TOOL-006；`LA/detail-notes/01-handler-callback-middleware.md`、`03-custom-events.md`
- **P2-09（L2）Ask User 挂起恢复怎么实现？恢复时怎么防串扰？** ｜ LangGraph interrupt() 抛 GraphInterrupt 存 checkpoint → Command(resume) 恢复；stable_request_id（thread/run/tool_call 哈希）常量时间校验；答案与问题顺序精确匹配；取消语义；只绑顶层 Agent、子代理剔除 ｜ `LA/fact-base.md` FACT-ASK-001~008；`LA/detail-notes/06-hitl-and-ag-ui.md` §2
- **P2-10（L3）HITL 的产品约束怎么定的？跨实例并发怎么办？** ｜ 1–4 题 / 2–4 选项 / 禁敏感凭证的最小交互模型（调研 Codex/Claude Code）；跨实例 CAS 409 是规划未实现，当前靠 checkpointer 状态机 ｜ `LA/fact-base.md` DESIGN-ASK-001~003、DELTA-ASK-001
- **P2-11（L2）A2UI 是什么？和 AG-UI 什么关系？探索到什么程度？** ｜ 生成式界面协议（Agent 产出 UI 组件树而非文本）；AG-UI 传事件、A2UI 传界面；PoC 范围：基础组件目录分批生成、不可逆操作触发 interrupt 等 HITL 确认、交互回流两模式；口径"探索/原型" ｜ `LA/fact-base.md` DESIGN-A2UI-001/002；`LA/recap-blog.md` §5.5

**锚点 C：动作行 2 长任务与插件体系（沙箱生命周期管控；产物持久化至外部存储并可重建恢复；上下文自动压缩与分层长期记忆；Subgraph 插件与 MCP 工具体系；Agentic RAG 插件接入）**

- **P2-12（L2）长任务沙箱生命周期怎么管？** ｜ Workspace 状态机（allocating→allocated→reclaiming→reclaimed→destroying）、Run 级独占租约 + 续租、沙箱心跳防 auto_stop、各操作显式超时、类型不一致自动重建 ｜ `LA/fact-base.md` FACT-LT-002/003/004；`LA/recap-blog.md` §2.2–2.5；`LA/fragments/f06`、`f13`
- **P2-13（L2）沙箱回收后产物怎么不丢？** ｜ 第一版直连沙箱读字节 → 回收后 404；改为生成即外化到对象存储 + 冷启动回灌；Single-Flight+Coalesce 同步、SHA256 去重、中文路径中转、最终兜底同步 ｜ `LA/fact-base.md` FACT-ART-001~004、DELTA-ART-001；`LA/recap-blog.md` §3
- **P2-14（L2）上下文自动压缩怎么触发、怎么保证不丢信息？** ｜ 70% 触发 / 保留 25% / 最少 6 条；淘汰消息转存 conversation_history 文件、媒体外化；不删 State 而是动态有效投影；四段式摘要提示词；usage_updated 事件 ｜ `LA/fact-base.md` FACT-CMP-001~006；`LA/detail-notes/04-summarization-middleware.md`；`issues/30` 链式压缩示例
- **P2-15（L2）长期记忆和对话历史、checkpoint 有什么区别？为什么收敛成两层？** ｜ 五维存储（Messages / Checkpoint / Memory / Summary / 沙箱文件）；四层方案砍成 USER_GLOBAL + USER_AGENT 单表；虚拟 preferences.md、乐观锁 409 重试、401/403 抛出 vs 404/5xx 降级 ｜ `LA/fact-base.md` FACT-MEM-001~006、DELTA-MEM-001；`LA/recap-blog.md` §4.1–4.2
- **P2-16（L2）Skill 系统怎么做渐进激活？** ｜ SKILL.md frontmatter 扫描注入列表；read_file 激活拦截去重发事件；签名一致跳过下载；Zip 安全（50MB、Zip Slip、唯一 SKILL.md）；staging 替换与回滚 ｜ `LA/fact-base.md` FACT-SKL-001~008
- **P2-17（L2）Subgraph 插件怎么挂？为什么不用 deepagents 的 CompiledSubAgent？** ｜ 子图入口以 @tool schema 暴露、由路由拦截执行；长任务路径 SubAgentMiddleware 覆盖 messages 导致入口参数丢失 → 自研 SubgraphToolMiddleware 拦截 + Command(update) 双向同步；状态边界不互染 ｜ `LA/fact-base.md` FACT-TOOL-003、FACT-LT-009、DELTA-LT-002；`LA/recap-blog.md` §1.5、§2.8；→ D7
- **P2-18（L2）MCP 工具体系怎么接？有什么技术债？** ｜ JSON Schema → Pydantic 动态模型 + JSON 字符串自动反序列化；参数日志脱敏；技术债：无主动超时包装、无连接池 ｜ `LA/fact-base.md` FACT-TOOL-001/002/004；`LA/recap-code/skeleton/mcp_tool_lifecycle.py`
- **P2-19（L1）Agentic RAG 作为插件是什么形态？（轻提不深挖）** ｜ 文本 + 图片知识库并发检索、RRF 融合、图片走 VL 解析、来源经 ToolMessage.artifact 透传给中间件广播；技能行"向量+BM25 混合检索"的落点 ｜ `LA/fact-base.md` FACT-TOOL-005
- **P2-20（L3）可靠性细节：客户端断连、任务取消、沙箱命令失败怎么处理？** ｜ 独立断连轮询注入 CancelledError；延迟回滚避免 SQLite 异步死锁；ToolErrorGuard 把 Daytona 错误封装为 ToolMessage(status=error) 让模型自愈；初始化异常发 RUN_ERROR+RUN_FINISHED 并 shield 释放租约 ｜ `LA/fact-base.md` FACT-RT-007/008、FACT-LT-007/008；`LA/recap-blog.md` §7

**锚点 D：动作行 3 ChatBI 与 Agent Teams（NL2SQL 从固定 DAG 重设计为 ReAct Agent Loop；全量 M-Schema 内联消除选表级联错误；Orchestrator-Worker 协调模式；分派工具化；CompiledGraph 显式编排替代 deepagents 原生 tasks）**

- **P2-21（L1）固定 DAG 的 NL2SQL 有什么结构性问题？** ｜ 6 节点（改写→生成→自检→单次纠错）只有一次被动纠错、无法探索列值、错误级联无回路 ｜ `LA/detail-notes/05-chatbi-agent-loop.md` §1.1；`LA/fact-base.md` DESIGN-BI-001
- **P2-22（L2）ReAct Agent Loop 版怎么设计？工具有哪些？怎么退出？** ｜ 三段式循环、4 个闭包工具（probe_column_values / execute_sql / submit_final_sql / submit_clarification）、MAX_ITERATIONS=5、超限 fallback 与低置信度降级；子图不直接对用户说话，澄清结构化回主 Agent ｜ `LA/detail-notes/05-chatbi-agent-loop.md` §2–§4；`LA/fact-base.md` DESIGN-BI-003/004
- **P2-23（L2）M-Schema 是什么？为什么全量内联而否定动态选表？** ｜ 半结构化 schema 表达（表/列/类型/样例值）；单技能 3–4 张表约 2000–4000 token，内联省一轮工具调用并消除选表错误级联；边界：表多了怎么办 ｜ `LA/fact-base.md` DESIGN-BI-002/003、DELTA-BI-001
- **P2-24（L3）ChatBI 工程细节：为什么绕过 BaseTool.ainvoke？数据怎么回给主 Agent？** ｜ 绕过 runnable/callback 包装根治 AG-UI 适配器崩溃；metadata 抑制子图事件冒泡；DataEnvelope 20 行完整性分流、可视化双通道分发 ｜ `LA/detail-notes/05-chatbi-agent-loop.md` §5；`LA/fact-base.md` FACT-BI-002/004/006
- **P2-25（L2）ChatBI ReAct 版上线了吗？** ｜ 诚实口径：develop 主线为 DAG 版，ReAct 版在独立参考分支完成实现、无配套单测；简历动词"重设计" ｜ `LA/fact-base.md` DELTA-BI-002
- **P2-26（L1）Orchestrator-Worker 是什么？为什么否定自由 handoff 与黑盒调度？** ｜ 用户只对 Orchestrator；Worker 禁 Ask User；分派封装为结构化工具调用（delegate_and_wait / delegate_in_background / send_follow_up / interrupt_and_redirect / cancel / list / check）；确定性追踪与隔离；→ D3 ｜ `LA/detail-notes/07-agent-teams-orchestrator-tools.md` §1–§2
- **P2-27（L2）deepagents 原生 tasks 机制哪里不够？** ｜ 每次新线程、无会话级并发准入、暴露底层 task_id、无独立 Worker 事件流；对照设计：一成员一持久线程、3 槽位持久调度器 + FIFO、封装高层委派工具、三层流 ｜ `LA/fact-base.md` DELTA-TM-001；`LA/detail-notes/07` §5
- **P2-28（L3）Agent Teams 细节：并发、超时、断连、权限（口头弹药）** ｜ 3 槽位 + 5 条 follow-up 队列；软等待 5 分钟×3 / 硬上限 2 小时 / 删除 30 秒宽限；Outbox 幂等 + Lease/Heartbeat 对账；复用 Agent 权限模型；口径 design_complete（Master PRD + 6 项 ADR，待实施） ｜ `LA/fact-base.md` DESIGN-TM-001~011；`LA/detail-notes/07` §3
- **P2-29（L2）三种编排范式（单 Agent / Workflow / Agent Teams）怎么选？** ｜ 不是替代关系：确定性用 Workflow、开放探索用单 Agent、跨角色长任务用 Teams；Workflow 处于调研阶段（口径 proposed） ｜ `LA/recap-blog.md` §6.1–6.2、§8 Q7
- **P2-30（L2）平台上的业务 Agent 能否用项目一的方法训练？两项目怎么打通？** ｜ 跨项目：平台提供沙箱/工具/轨迹与 AG-UI 事件即天然 rollout 环境；差距在可程序化 reward 与冻结环境；现状是两条线未合并 ｜ 无一手素材，自拟

### 2.3 项目三：多模态文档 RAG 与大模型私有化部署（ColPali · vLLM/SGLang · 昇腾 910B，独立负责）

> 无一手 recap，问题以基础理论与流程为主。`RS/expert-projects-review.md` §3 提示：面试官会二选一，两侧都要能讲 10 分钟。数字口径：无真实评测数字，不编；卡种/模型名清单只口头。

**锚点 A：多模态检索（OCR 误差累积 → ColPali 页图像 late-interaction 检索绕开 OCR → 作为通用 RAG 工具接入平台）**

- **P3-01（L1）"OCR 误差累积"具体指什么？什么时候 OCR 路线仍更好？** ｜ 版面分析→OCR→切块→embedding 每步损失（表格、扫描件、图文混排）；纯文本 PDF、需精确引用字符时 OCR 仍有优势 ｜ 通用知识；`RS/expert-projects-review.md` §3
- **P3-02（L1）ColPali 架构是什么？** ｜ VLM（PaliGemma / ColQwen2 变体）把页图像切 patch，每 patch 经线性投影到低维（128）多向量；查询侧 token 级向量；无需 OCR 与版面分析 ｜ 通用知识（ColPali 论文 Faysse et al. 2024）
- **P3-03（L1）late-interaction 与 MaxSim 公式？和 bi-encoder / cross-encoder 比？** ｜ score(q,d)=Σ_i max_j q_i·d_j；bi-encoder 单向量丢细粒度、cross-encoder 不可预索引；ColBERT 血统 ｜ → C17
- **P3-04（L2）ColPali 怎么训练？用什么数据和目标？** ｜ 查询-页面对的对比学习、in-batch negatives、只训投影与 LoRA；ViDoRe 基准 ｜ 通用知识
- **P3-05（L2）索引与存储代价多大？怎么压？** ｜ 每页约 1000 个 patch × 128 维 → 单页十万级浮点数；token pooling / 二值化 / 两阶段（单向量粗召回 + MaxSim 重排）；与文本 embedding 的量级对比 ｜ 通用知识；→ C17 两阶段版
- **P3-06（L2）检索到页图像后怎么生成答案？** ｜ 生成端用 VLM 读页图（或 OCR 兜底）；多页拼接与 token 预算；引用定位 ｜ 通用知识
- **P3-07（L2）效果怎么评？在自家文档上做了什么验证？** ｜ 口径：定性（免去 OCR 预处理链路），无公开数字；能说评测方法（nDCG@k / recall@k、人工抽检）与失败案例类型 ｜ `DEC` 项目三结构（定性）
- **P3-08（L2）怎么接进平台？和项目二的文本 RAG 工具什么关系？** ｜ 作为通用 RAG 工具之一（图片知识库路径），与文本检索并发 + RRF 融合，来源元数据透传 ｜ `LA/fact-base.md` FACT-TOOL-005
- **P3-09（L3）ColPali 的局限？中文文档、长文档、表格数值问答表现？** ｜ 多语言基座依赖、数值精确匹配弱、页粒度过粗 ｜ 通用知识

**锚点 B：私有化推理（vLLM/SGLang 在英伟达与昇腾两种硬件上私有化部署并量化调优，提供标准接口）**

- **P3-10（L1）vLLM PagedAttention 原理？解决什么问题？** ｜ KV cache 按 block 分页、block table 间接寻址、消除预分配碎片、前缀共享 copy-on-write ｜ → C23；通用知识
- **P3-11（L1）连续批处理 vs 静态批处理？prefill 与 decode 怎么调度？** ｜ 迭代级调度、请求随时进出、chunked prefill 平衡 TTFT 与吞吐、prefill/decode 分离趋势 ｜ → C23
- **P3-12（L2）SGLang 与 vLLM 各自优势？为什么两个都用？** ｜ RadixAttention 前缀缓存、结构化输出与多轮共享前缀场景；vLLM 生态与硬件后端广；按业务形态选 ｜ 通用知识
- **P3-13（L1）GPTQ 与 AWQ 的差异？** ｜ GPTQ：二阶信息逐列量化误差补偿（OBQ 近似）；AWQ：激活感知保护显著通道、按 scale 搜索；均 W4A16；kernel（Marlin/ExLlama）与推理速度差异；何时选哪个 ｜ → C24；通用知识
- **P3-14（L2）量化后精度怎么回归？** ｜ perplexity + 业务集抽样 + 结构化输出成功率；校准集选择；对 Agent 工具调用格式的影响 ｜ 通用知识
- **P3-15（L2）昇腾 910B 适配做了什么？坑在哪？** ｜ CANN / torch_npu 栈、vllm-ascend 或 MindIE 后端、算子覆盖缺口、量化格式支持差异、性能对比口径（只说"平稳支撑"）；诚实边界：做的是适配与调优，不是写 kernel ｜ 通用知识；`RS/expert-projects-review.md` §3
- **P3-16（L2）显存与并发怎么估？** ｜ KV cache 每 token 大小 = 2×层数×头数×头维×dtype；最大并发推算；GQA 的影响 ｜ 通用知识
- **P3-17（L2）"标准接口"指什么？部署工程怎么做？** ｜ OpenAI 兼容接口、多模型路由、超时与限流、监控指标（TTFT / TPOT / 吞吐）；Docker / FastAPI / Redis（技能行落点） ｜ 通用知识
- **P3-18（L3）其他加速手段了解吗？** ｜ speculative decoding、prefix caching、FP8 KV cache、tensor parallel vs pipeline parallel ｜ 通用知识
- **P3-19（L1）这段和项目一的 vLLM 经验有什么联系？** ｜ 项目一 Rollout 服务的 LoRA kernel 悬崖诊断即来自这段部署经验 ｜ 跨项目自拟

### 2.4 项目四：游戏 NPC 人格化对话系统（小冰，模块负责）

> 无一手 recap。定位是"对话系统基础"，解释 SFT/RLHF 直觉从哪来；不要被带成第三条算法旗舰。规模锚点只两个：单卡十余位 NPC、迁移 14B。

**锚点 A：角色行 + 动作行 1（单卡承载十余位 NPC 且人设一致；离线剧本 post-training 注入世界观、线上角色 Prompt 区分人设，替代多 LoRA 热切换）**

- **P4-01（L1）为什么多 LoRA 热切换不可接受？** ｜ 2022–23 serving 现状：切换需重载/合并权重、不同 adapter 请求无法同 batch、显存碎片、延迟抖动；人设一致靠数据与偏好对齐而非运行时切权重 ｜ `RS/expert-projects-review.md` §4；`RS/metrics-audit.md` 第 11 条
- **P4-02（L1）单基座方案怎么做？世界观和人设怎么分工？** ｜ 剧本 post-training 注入共享世界观（离线）；角色 Prompt 承载人设差异（线上）；训练与服务分离 ｜ 简历原句；自拟
- **P4-03（L1）LoRA 原理与数学？** ｜ W'=W+BA、秩 r、α/r 缩放、A 高斯 B 零初始化、作用于注意力投影、推理可合并零开销、参数量估算 ｜ → C19
- **P4-04（L2）现在有 S-LoRA / Punica 等多适配器 serving，还会这么选吗？** ｜ 统一分页管理 adapter 权重、异构 batch 自定义 kernel；当时不可用；今天要看 NPC 数量与人设差异度决定 ｜ 通用知识
- **P4-05（L2）单基座会不会人设串扰？怎么防？** ｜ 对抗样本覆盖"诱导跳出人设"、RLHF 偏好对齐、Prompt 隔离；评估方法 ｜ 自拟
- **P4-06（L2）迁移到 14B 遇到什么？** ｜ 显存与延迟预算、并发下降、量化补偿、数据与超参迁移 ｜ 自拟

**锚点 B：动作行 2（合成含陷阱式对抗样本的 SFT 数据；RLHF 对齐人设偏好；BERT 优化主动对话 Proactive 触发时机）**

- **P4-07（L2）陷阱式对抗样本是什么？怎么合成？** ｜ 诱导跳出人设 / 询问世界观外知识 / 时代错位 / 越界请求；生成-过滤-人审；与项目一对抗种子方法论的继承关系 ｜ 自拟；类比 `DN/agentic-gov-task-factory.md` 对抗种子
- **P4-08（L1）RLHF 全流程？** ｜ SFT → 偏好数据 → RM（Bradley-Terry）→ PPO（policy / ref / RM / value 四模型）+ KL；人设偏好对怎么标 ｜ → C20
- **P4-09（L2）PPO 细节与坑？为什么不用 DPO？** ｜ clip、GAE、KL 系数、value 预热、reward hacking 表现（讨好/复读）；DPO 2023 年中才出现、离线偏好局限 ｜ → C20、C21；`DN/rl-objectives-*.md` §3.2、§3.7
- **P4-10（L2）RLHF 和你后来做的 GRPO 有什么本质区别？** ｜ 人类偏好 RM vs 可程序化 reward；critic vs 组内基线；单轮偏好 vs 多轮环境 ｜ 跨项目；`DN/rl-objectives-*.md` §1、§4
- **P4-11（L2）多模型训练显存怎么扛？DeepSpeed ZeRO 原理？** ｜ ZeRO 1/2/3 分别切优化器状态/梯度/参数；通信模式 all-gather / reduce-scatter；offload；与 FSDP 对照；14B 全参 vs LoRA 显存估算 ｜ → C22
- **P4-12（L2）BERT 优化主动对话触发时机是什么任务？为什么不用 LLM？** ｜ 二分类/多分类（该不该主动开口、什么时机）；特征（静默时长、上文情绪、剧情状态）；延迟与成本决定用小模型；样本怎么来 ｜ 自拟
- **P4-13（L2）人设一致性怎么评？** ｜ 人工盲评 + 自动一致性判别器 + 对抗样本通过率；无数字口径 ｜ 自拟
- **P4-14（L2）NPC 的多轮记忆与剧情状态怎么管？** ｜ 上下文窗口截断、摘要、结构化剧情状态注入 Prompt ｜ 自拟
- **P4-15（L1）"模块负责"负责哪块？** ｜ 诚实边界：数据与对齐 + 服务方案中的算法部分；不是整套对话平台 ｜ `DEC` 项目四结构

### 2.5 三张关键技术决策卡 + 备选卡

**D1 防 Reward Hacking：终态乘法门控，拒办不单独加分**

- **D1-01（L1）为什么无写库任务会同分博弈？** ｜ 错误办结与正确拒办终态同为空写；Reward v2 R_complete 均为 1.0；稀有动作无组内优势 ｜ `AG/fact-base.md` §2⑦
- **D1-02（L1）门控公式写出来** ｜ 完成度 = 状态分 × TerminalMatch（三值比对，缺失即 0）；→ C01
- **D1-03（L2）为什么不给拒办单独加分？** ｜ 加分项可被"两边都试"套利、需为每类动作调权、破坏"必要条件"语义 ｜ 卡片正文
- **D1-04（L2）转人工加分为什么移出训练总目标？** ｜ 防止 Escalate 成为逃避路径；转人工正确性已由门控覆盖 ｜ 卡片正文；`AG/recap-code/07`（compute_r_escalate）
- **D1-05（L2）8.6%→80.5% 是什么口径？** ｜ FWR 分项、96 题测试集 32 题×8、SFT 基线 22/256 → 206/256 ｜ `RS/p5-500step-verification.md` §2.3
- **D1-06（L3）还有哪些 reward hacking 残余？怎么监控？** ｜ disclosure 套话复读（KL 与 R3 审计）、效率项被利用、Judge 博弈率差分 ｜ `AG/fact-base.md` §2⑨；`RS/p5` §5
- **D1-07（L3）与业界（DeepSeek-R1 规则 reward、RLVR、process reward）对照** ｜ 可验证 reward 的共性与多轮终态判定的特殊性 ｜ `DN/rl-objectives-*.md` §5

**D2 Async RL 的边界：Merged 单份权重下改走串行**

- **D2-01（L1）为什么业界做 Rollout 训练异步化？前提是什么？** ｜ 多轮 agentic rollout 长尾、训练器空转；前提：服务端保留多版本权重供在途请求 ｜ 卡片正文；`RS/async-rl-investigation.md` §2.1
- **D2-02（L1）机制冲突具体怎么发生？** ｜ Merged 模式服务端只有一个模型名；权重更新后旧版本消失；在途多轮对话第 n 轮请求旧版本直接 404；"不是陈旧度问题" ｜ `RS/async-rl-investigation.md` §3.1–3.2 证据 2
- **D2-03（L2）为什么选 Merged？不是缺陷而是交换** ｜ 动态 LoRA 多版本共存但 kernel 慢 6 倍；Merged 快但单版本；在 2 卡预算下 Rollout 吞吐更值钱 ｜ `DEC` 决策卡 2 定稿；`AG/fact-base.md` §2⑧
- **D2-04（L2）什么条件下应回到异步？** ｜ 能保留多版本权重（动态 LoRA、多副本 serving、Drain Barrier、turn-level mixed policy）；大规模训练必须异步 ｜ 卡片末句；`DN/rl-objectives-*.md` §5 场景 4
- **D2-05（L2）异步的陈旧度代价你测过吗？（追问才说的第二论据）** ｜ 14 步压测：44% 陈旧样本废弃、漂移约 2 倍、训练器空转；k=1 有界陈旧 ｜ `RS/async-rl-investigation.md` §2.3、事实 2
- **D2-06（L2）CISPO 对异步陈旧度为什么更鲁棒？** ｜ ratio 作权重不截梯度、clip 上界宽；与 PPO 双侧 clip 对照 ｜ `DN/rl-objectives-*.md` §3.4、§5 场景 4
- **D2-07（L3）业界异步方案（AReaL、Kimi 等）怎么做多版本？你了解哪些？** ｜ 有界陈旧、参数服务器/多副本、importance correction；诚实说了解层面 ｜ 通用知识
- **D2-08（L3）适配代码做到什么程度？** ｜ PipelineTrainer 入口、配置校验（max_steps_off_policy≤1、KL 必开）、采样器接流、漂移遥测合入主仓、单测；口径"适配/评估/放弃" ｜ `RS/async-rl-investigation.md` §2.2

**D3 多 Agent 编排：Orchestrator-Worker 分派工具化**

- **D3-01（L1）任务分派与上下文隔离为什么是共性难题？** ｜ handoff 后责任不明、上下文互染、并发与超时无契约、追踪困难 ｜ 卡片正文；`LA/detail-notes/07` §1
- **D3-02（L1）为什么否定无中心自由 handoff 与黑盒调度？** ｜ 不可预测的交互路径、用户不知在跟谁说话、无法审计 ｜ 卡片正文
- **D3-03（L2）分派工具化是什么意思？工具列表？** ｜ 分派是 Orchestrator 的结构化 tool call（同步等待 / 后台 / 追问 / 重定向 / 取消 / 查询）；每次分派可追踪、可隔离 ｜ `LA/detail-notes/07` §2；→ C14
- **D3-04（L2）CompiledGraph 显式编排替代 deepagents tasks 具体替代了什么？** ｜ 原生 tasks 每次新线程、无准入、暴露 task_id；替代为持久 Teammate 线程 + 调度器 + 图内显式节点 ｜ `LA/fact-base.md` DELTA-TM-001
- **D3-05（L2）确定性追踪与隔离怎么体现？** ｜ 一成员一线程、Assignment 记录、三层事件流、Worker 禁 Ask User ｜ `LA/detail-notes/07` §3
- **D3-06（L2）实施到什么程度？** ｜ 口径：design_complete，Master PRD + 6 项 ADR，切片 1 资产 CRUD 需求；未上线；动词"确立/设计" ｜ `LA/fact-base.md` DESIGN-TM-011
- **D3-07（L3）与专利"动态拓扑自调节多智能体"什么关系？** ｜ 两条线各讲各的（DEC 专利-3）；专利讲拓扑自调节、平台设计讲固定 Orchestrator-Worker；不做呼应 ｜ `DEC` 专利-3
- **D3-08（L3）与业界（OpenAI Agents SDK handoff、AutoGen、Claude subagents）对照** ｜ subagent-as-tool vs subagent-as-worker 的取舍 ｜ `RS/expert-decisions-reco-v2.md` D07/D10 条目

**D7（备选，Agent 变体）子图挂载：Subgraph 即工具的中间件方案**

- **D7-01（L1）subagent 当工具还是当 worker？** ｜ 工具：同步、状态回写、可组合；worker：独立线程、异步 ｜ `RS/expert-decisions-reco-v2.md` D07
- **D7-02（L2）为什么推翻 CompiledSubAgent 路线？** ｜ SubAgentMiddleware 覆盖 messages 导致子图入口解析失败 ｜ `LA/fact-base.md` DELTA-LT-002
- **D7-03（L2）SubgraphToolMiddleware 怎么实现？** ｜ wrap_tool_call 拦截入口工具 → 隔离执行 CompiledStateGraph → Command(update) 回写 data_envelope / visualization_result / messages；不改子图契约、不改第三方包 ｜ `LA/fact-base.md` FACT-LT-009；→ C15
- **D7-04（L3）状态边界不互染怎么保证？** ｜ 子图独立 State schema、只回写白名单字段 ｜ `LA/recap-blog.md` §2.8

### 2.6 顶栏、简介、工作经历、核心能力、专利与论文、教育

- **M-01 顶栏"4年+"** ｜ 2022.07 小冰起算即 LLM 后训练；到 2026.09 为 4 年 2 个月 ｜ `DEC` 指标-2、时间线事实更正
- **M-02 顶栏"6 个 0→1 大模型系统落地"** ｜ 口头清单：①任务型 Agent 后训练系统 ②Agent 平台运行时 ③ChatBI ④多模态文档 RAG ⑤开源 LLM 私有化推理体系 ⑥NPC 对话系统；系统≠项目 ｜ `DEC` 顶栏口径；`RS/expert-metrics-reco.md` 第 2 条
- **M-03 顶栏"54.3%→84.4%"** ｜ 同 P1-33/34；label 是"长程 Agentic RL 任务成功率"，明确 54.3% 为 SFT 基线 ｜ `DEC` 指标-1
- **M-04 顶栏"2 项第一发明人授权发明专利"** ｜ CN121561033B、CN119250033B（后者独立发明人）；第三项实审中 ｜ `DEC` 专利-1/5/6、v3.1 专利号
- **M-05 个人简介两句** ｜ 北航 NLP 硕士；数字郑州 = 阿里巴巴与郑州市政府合资；两条主线各一句 ｜ 简历原句
- **M-06 工作经历与主线短语"对话系统 → Agent 平台 → Agentic RL 后训练"** ｜ 三段演进的因果：对话系统积累 SFT/RLHF 直觉 → 平台建运行时与环境 → 后训练全链路 ｜ `DEC` 工作经历标题
- **M-07 技能行 1 大模型后训练** ｜ SFT / LoRA / RLHF / GRPO / CISPO / Async RL / PyTorch / DeepSpeed / LLaMA-Factory / OpenPipe ART：每个词能说一句"在哪用的"；CISPO 是实际 loss（P1-26），DeepSpeed 落在 P4-11 ｜ `DEC` 技能区
- **M-08 技能行 2 训练系统与评测** ｜ Reward 设计（P1-23）/ Rollout 加速（P1-20）/ Simulator（P1-14）/ 轨迹合成与分层验证（P1-10/11）/ 训推一致性（P1-19） ｜ 同上
- **M-09 技能行 3 Agent 系统架构** ｜ LangGraph / deepagents / MCP / AG-UI / 沙箱生命周期 / 上下文压缩 / 多智能体编排 → P2-03/04/18/07/12/14/26 ｜ 同上
- **M-10 技能行 4 推理部署与国产化** ｜ vLLM / SGLang / GPTQ / AWQ / NVIDIA / 昇腾 910B → P3-10~15 ｜ 同上
- **M-11 技能行 5 检索与问答** ｜ Agentic RAG（P2-19）/ ColPali（P3-02）/ 向量+BM25 混合检索（RRF，C18）/ NL2SQL M-Schema（P2-23） ｜ 同上
- **M-12 技能行 6 工程与 AI 研发** ｜ Python / FastAPI / Redis / Docker / Coding Agent 辅助研发：Redis 用在哪（缓存/队列）、Docker 沙箱、Coding Agent 工作流与边界（P1-40） ｜ 自拟
- **M-13 专利 1 动态拓扑自调节对话式多智能体系统（CN121561033B）** ｜ 10 分钟答辩准备：问题、拓扑如何自调节、与 Orchestrator-Worker 的区别（D3-07）、权利要求核心 ｜ 需另备专利摘要笔记
- **M-14 专利 2 MOPAR 多智能体协同文本生成（CN119250033B，独立发明人）** ｜ 协同机制是什么、角色分工、与今天多 Agent 编排的关系 ｜ 需另备
- **M-15 专利 3 LLM 自然语言生成图表（CN118733612A，实审中）** ｜ 与 ChatBI 可视化子图（P2-24 AntV G2 Spec）的关系；法律状态"实审中" ｜ `LA/recap-blog.md` §5.4
- **M-16 论文 NLPCC 2021 一作 Syntax and Coherence** ｜ 论证质量自动评估任务、句法与连贯特征、SOTA 口径（当时该任务）；CCF-C ｜ 需另备论文摘要
- **M-17 "合作署名 5 项"** ｜ 能说出领域方向即可，不列名 ｜ `DEC` 专利-2
- **M-18 教育** ｜ 北航计算机技术硕士 NLP 方向；成都理工本科前 10% ｜ 简历原句

---

## 三、白板手写 code 清单

格式：编号 ｜ 题目 ｜ 考察点 ｜ 预期手写量级 ｜ 常见追问 ｜ 难度（★基础 ★★机制 ★★★深挖）｜ 复用素材。分 Tier A（必须盲写流畅）/ B（能写出骨架并讲清）/ C（能讲伪码即可）。

### Tier A（与简历锚点直接挂钩，最高频）

- **C01 Reward 乘法门控 `compute_reward`** ｜ 终态分 × TerminalMatch（三值比对缺失即 0）、Hard Violation 直接 0、disclosure 与效率项、转人工不进总目标 ｜ 25–35 行 / 6 min ｜ 权重怎么定、no-write 任务、拒办为何不加分、reward 范围与归一化 ｜ ★★ ｜ `AG/recap-code/07_rl_rollout_reward.py`
- **C02 GRPO group advantage** ｜ 按 group_id 求均值与 std、(R-mean)/(std+eps)、零方差组过滤 ｜ 10–15 行 / 3 min ｜ std 为 0 怎么办、要不要除 std（Dr.GRPO 争议）、K 取多少 ｜ ★ ｜ `DN/rl-objectives-core-pseudocode.py` group_relative_advantage
- **C03 pass@k 无偏估计 + 组内有方差概率** ｜ 1 - C(n-c,k)/C(n,k)（数值稳定写法）；P(非零方差)=1-(1-p)^K-p^K ｜ 10–15 行 / 3 min ｜ 为什么不用 1-(1-pass@1)^k、n 与 k 关系、判据阈值怎么定 ｜ ★★ ｜ Codex 论文公式；`AG/fact-base.md` §2④
- **C04 Token-level PPO clip / GRPO / CISPO loss（带 mask）+ 分母地板** ｜ ratio=exp(new-old)、PPO 双侧 clip 取 min、CISPO clip(ratio).detach()×A×logp、分母 max(mask_sum, N_norm) ｜ 35–45 行 / 8 min ｜ 为什么 CISPO 梯度不截断、token 级 vs 序列级归一化（DAPO/GSPO）、eps 取值 ｜ ★★★ ｜ `DN/rl-objectives-losses.py`
- **C11 ReAct loop** ｜ while 迭代：LLM 出 tool_calls → 执行 → 追加 ToolMessage → 无 tool_calls 结束；max_iterations 与 fallback；错误封装回模型 ｜ 30 行 / 6 min ｜ 并发工具调用、tool_call_id 配对、超限怎么退出、和 LangGraph 图的对应 ｜ ★★ ｜ `LA/recap-code/skeleton/runtime_agent_loop.py`；`LA/detail-notes/05` §2
- **C17 MaxSim late-interaction + 两阶段检索** ｜ einsum('qd,pd->qp').max(-1).sum()；批量文档；单向量粗召回 → MaxSim 重排 ｜ 10–20 行 / 4 min ｜ 复杂度、存储压缩（pooling/二值化）、为什么不 mean ｜ ★★ ｜ ColPali/ColBERT 公式
- **C19 LoRA 前向与数学** ｜ forward = Wx + (α/r)·B(Ax)；参数量 r(d_in+d_out)；合并 W+BA；初始化；只对 q/v ｜ 20 行 / 5 min ｜ 为什么 B 零初始化、r 与 α 怎么选、合并后能否再拆、QLoRA 差别 ｜ ★★ ｜ 通用
- **C20 RLHF/PPO 流程伪码** ｜ RM 训练（BT loss = -logσ(r_w - r_l)）；PPO 循环：采样 → RM 打分 → KL 罚 → GAE → clip 更新 value 与 policy；四模型 ｜ 40 行 / 10 min ｜ 为什么要 ref model、KL 放 reward 还是 loss、value 预热、和 GRPO 的差 ｜ ★★★ ｜ `DN/rl-objectives-*.md` §3.2

### Tier B（机制级，面向岗位方向二选一）

- **C05 KL penalty（advantage 级）+ ref logprob via disable_adapter** ｜ kl_i 逐 token、A_i += c·(mean_kl - kl_i)·mask；with model.disable_adapter(): ref_logp ｜ 15 行 / 4 min ｜ 与 loss 级 β·KL 区别、k1/k2/k3 估计器、健康区间 ｜ ★★ ｜ `AG/fact-base.md` §2⑨
- **C06 完整同步 RL 训练 pipeline** ｜ for step: 采样任务 → 并发 rollout(K) → reward → 组过滤 → advantage → train → 权重同步到推理服务 → 期中评测与门控 ｜ 50–60 行 / 10 min ｜ 每一环的失败模式、rollout 与 train 分卡、评测频率 ｜ ★★★ ｜ `AG/recap-code/08_art_grpo.py`；`DN/agentic-gov-rl-training-real-process.md` §3.1
- **C07 Async RL pipeline（有界陈旧 + 版本租约）** ｜ 生产者 rollout 队列带 policy_version；消费者训练检查 staleness≤k 丢弃；adapter 版本引用计数/租约；Drain Barrier 伪码；Merged 模式下为什么会 404 ｜ 40 行 / 8 min ｜ k 怎么选、importance correction、多版本存储代价 ｜ ★★★ ｜ `RS/async-rl-investigation.md`；`DN/rl-objectives-*.md` §5 场景 4
- **C08 token-diff 校验器** ｜ 训练侧 encode(messages) vs 推理侧 tokenizer.apply_chat_template → 首个分叉 index 与上下文 ｜ 15 行 / 3 min ｜ 差异典型来源、怎么修（覆盖 jinja） ｜ ★ ｜ `AG/recap-code/05_sft_training.py`
- **C09 沙箱执行 + Golden State diff（Strict Success）** ｜ execute(tool,args) 更新内存 DB + change_log；finalize 比对期望终态 + 期望终局动作 ｜ 25 行 / 5 min ｜ 无写库任务、错误注入、幂等 ｜ ★★ ｜ `AG/recap-code/02_sandbox.py`
- **C10 NLI per-message 取 max** ｜ score = max over assistant turns of nli(turn, hypothesis)；阈值冻结 ｜ 8 行 / 2 min ｜ 为什么不拼接、512 截断、阈值怎么标定 ｜ ★ ｜ `AG/fact-base.md` §2①
- **C12 AG-UI 事件流处理** ｜ 消费 LangGraph astream_events → 映射 RUN_STARTED / TEXT_MESSAGE_START/CONTENT/END / TOOL_CALL_START/ARGS/END / CUSTOM / RUN_FINISHED；中间件链 (event → events)；异常补发 RUN_ERROR+RUN_FINISHED ｜ 40 行 / 8 min ｜ 事件顺序约束、Blocking 聚合复用、interrupt 事件转译 ｜ ★★★ ｜ `LA/recap-blog.md` §1.11；`LA/detail-notes/03-custom-events.md`
- **C13 HITL interrupt / Command(resume) 最小骨架** ｜ 节点内 interrupt(payload) → 图挂起 → Command(resume=answer) 恢复；checkpointer 必需；request_id 校验 ｜ 25 行 / 5 min ｜ 重放语义、跨实例并发、与 aupdate_state 区别 ｜ ★★ ｜ `LA/detail-notes/06-hitl-and-ag-ui.md` §2.1
- **C14 Orchestrator 分派工具 + CompiledGraph 编排** ｜ delegate_and_wait / delegate_in_background 工具签名；槽位准入（3）与 FIFO；软超时轮询；teammate 线程复用；图节点显式连接 ｜ 40 行 / 8 min ｜ 为什么不用原生 tasks、断连恢复、Worker 为何禁 Ask User ｜ ★★★ ｜ `LA/recap-code/skeleton/workflow_agent_teams.py`；`LA/detail-notes/07` §2、§4
- **C15 SubgraphToolMiddleware** ｜ wrap_tool_call 命中子图入口 → subgraph.ainvoke(隔离 State) → Command(update={白名单字段, messages: ToolMessage}) ｜ 25 行 / 5 min ｜ 状态互染、错误传播、与 CompiledSubAgent 区别 ｜ ★★ ｜ `LA/fact-base.md` FACT-LT-009
- **C16 上下文压缩触发与截断** ｜ usage/limit ≥ 0.7 且 msgs ≥ 6 → cutoff 保留后 25% 并在安全边界（不切断 tool_call 配对）→ 摘要消息 + 转存 ｜ 20 行 / 5 min ｜ 为什么不删 State、媒体外化、摘要丢信息怎么办 ｜ ★★ ｜ `LA/detail-notes/04-summarization-middleware.md`
- **C21 DPO loss** ｜ -logσ(β[(π_w-ref_w)-(π_l-ref_l)]) ｜ 10 行 / 3 min ｜ 与 RLHF 的关系、离线偏好局限、β 含义 ｜ ★★ ｜ `DN/rl-objectives-core-pseudocode.py` dpo_loss
- **C22 DeepSpeed ZeRO 分片要点** ｜ stage1 切优化器状态、stage2 加梯度 reduce-scatter、stage3 参数 all-gather 前向/反向后释放；显存公式 16Ψ→(2+2+12/N)Ψ；offload ｜ 25 行 / 6 min ｜ 与 FSDP、通信量、ZeRO-3 与 LoRA 组合 ｜ ★★★ ｜ ZeRO 论文
- **C25 方差感知采样器 + 零方差过滤** ｜ 按任务历史 p 估计权重 ∝ p(1-p)；饱和桶权重置零；训练前过滤 std=0 组 ｜ 15 行 / 4 min ｜ 冷启动 p 怎么估、与 DAPO dynamic sampling 关系、课程 ｜ ★★ ｜ `AG/recap-code/08_art_grpo.py`

### Tier C（可能被问的通用项，讲伪码即可）

- **C18 RRF 融合** ｜ score=Σ 1/(k+rank_i)，k=60 ｜ 8 行 / 2 min ｜ 为什么用 rank 不用 score、权重 ｜ ★
- **C23 PagedAttention block table + 连续批处理调度器** ｜ 逻辑块→物理块映射、按需分配、前缀共享引用计数；调度：每迭代从 waiting 拉请求、prefill/decode 混排、抢占 ｜ 30 行 / 6 min ｜ 碎片率、copy-on-write、chunked prefill ｜ ★★★
- **C24 GPTQ / AWQ 核心步骤伪码** ｜ GPTQ：逐列量化 + Hessian 逆补偿残差；AWQ：按激活统计找显著通道、搜索 scale s 最小化输出误差 ｜ 20 行 / 5 min ｜ 校准集、group size、W4A16 kernel ｜ ★★★
- **C26 RoPE 实现（可选）** ｜ rotate_half、只旋转 Q/K、NTK/YaRN 外推 ｜ 20 行 / 5 min ｜ 为什么不旋 V、外推原理 ｜ ★★ ｜ `DN/rope-all-in-one-architecture-math-extrapolation.md` §4
- **C27 Simulator 数据转换：角色合并与 mask_history（口头 + 5 行）** ｜ 合并连续 assistant、只对最后 user 轮算 loss ｜ 10 行 / 2 min ｜ ShareGPT 交替约束 ｜ ★ ｜ `AG/recap-code/06_simulator.py`
- **C28 GAE** ｜ δ_t = r_t + γV_{t+1} - V_t；A_t = δ_t + γλA_{t+1} 反向累加 ｜ 10 行 / 3 min ｜ λ 的偏差方差权衡、LLM 中 γ=1 ｜ ★★ ｜ `DN/rl-objectives-core-pseudocode.py` gae_advantage

补充判断：Tier A 8 项是必须在 30 分钟内全部盲写一遍的；面向 RL 岗加练 C05/C06/C07/C25，面向 Agent 岗加练 C12/C13/C14/C15/C16，面向部署岗加练 C23/C24。

---

## 四、覆盖度自检表（简历每处 → 大纲条目）

| 简历区块 | 原文要点 | 大纲条目 | 白板 code |
|---|---|---|---|
| 顶栏卡 1 | 4年+ 大模型算法与 Agent 工程 | M-01、M-06 | — |
| 顶栏卡 2 | 6 个 0→1 大模型系统落地 | M-02 | — |
| 顶栏卡 3 | 54.3%→84.4% 长程 Agentic RL 任务成功率 | M-03、P1-33、P1-34、P1-37 | C02、C03 |
| 顶栏卡 4 | 2 项第一发明人授权发明专利 | M-04、M-13、M-14 | — |
| 联系行 | 现居郑州 · 意向北京/上海/杭州，可异地到岗 | 开场合述（00-master）；HR 类问题不入技术大纲 | — |
| 个人简介 | 北航 NLP 硕士；数字郑州（阿里巴巴与郑州市政府合资）高级算法工程师；两条主线 | M-05、M-18、P1-01、P2-01 | — |
| 工作经历 | 数字郑州 2023.08–至今 / 小冰 2022.07–2023.07；主线短语 | M-06、M-01 | — |
| P1 角色行 | Qwen3-4B、公积金、任务工厂→漏斗→SFT+冻结模拟器→长程 GRPO | P1-01、P1-02、P1-03 | C06 |
| P1 动作 1 环境与任务 | 可程序化沙箱与任务工厂；动作空间形式化；Golden State 比对 | P1-04~P1-09 | C09 |
| P1 动作 2 数据合成 | 双角色 Teacher；分层验证漏斗；同步训练 Agent 与冻结 Simulator | P1-10~P1-16 | C10、C27 |
| P1 动作 3 判据与训推一致 | pass@k 与 HV 率判据；token-diff 逐字节一致；vLLM 约 6 倍 250→1500 | P1-17~P1-22 | C03、C08 |
| P1 动作 4 Reward 与 RL | 终态比对 + 终局门控 Reward；Policy Loss 归一化与梯度保护；长程 GRPO；Async RL(k=1) 放弃 | P1-23~P1-32、D1、D2 | C01、C02、C04、C05、C07、C25 |
| P1 结果行 | 96 题测试集；54.3→84.4（+30.1）；合规拒办 8.6→80.5；HV 0.26%；两轮双盲审计 | P1-33~P1-39、D1-05 | — |
| P1 徽章 | 独立负责 | P1-40 | — |
| P2 角色行 | 公司 Agent 平台算法运行时；双执行路径编排、协议解耦、长任务沙箱与记忆体系 | P2-01、P2-02、P2-03 | — |
| P2 动作 1 双执行路径与协议层 | 短任务动态图/长任务沙箱同一 AgentConfig；AG-UI 事件流与展示解耦；Ask User HITL 挂起恢复；探索 A2UI | P2-04~P2-11 | C11、C12、C13 |
| P2 动作 2 长任务与插件体系 | 沙箱生命周期；产物持久化与重建恢复；上下文压缩与分层长期记忆；Subgraph 插件与 MCP；Agentic RAG 插件 | P2-12~P2-20、D7 | C15、C16、C18 |
| P2 动作 3 ChatBI 与 Agent Teams | 固定 DAG→ReAct Agent Loop；全量 M-Schema 内联；Orchestrator-Worker；分派工具化；CompiledGraph 替代 deepagents tasks | P2-21~P2-29、D3 | C11、C14 |
| P2 结果行 | 自研可控 Agent Harness；配置驱动、子图可插拔；支撑 ChatBI/长任务/多模态问答；新业务配置与插件接入 | P2-01、P2-02、P2-30 | — |
| P2 徽章 | 主导设计 · 团队落地 | P2-02 | — |
| P3 角色行 | 补齐平台能力短板：多模态文档检索工具 + 开源 LLM 私有化推理体系 | P3-01、P3-08、P3-17 | — |
| P3 动作 1 多模态检索 | OCR 误差累积；ColPali 页图像 late-interaction 绕开 OCR；通用 RAG 工具接入 | P3-01~P3-09 | C17 |
| P3 动作 2 私有化推理 | vLLM/SGLang；英伟达与昇腾两种硬件；量化调优；标准接口 | P3-10~P3-18 | C23、C24 |
| P3 结果行 | 免去 OCR 预处理链路；覆盖英伟达与国产昇腾；平稳支撑私有化落地 | P3-07、P3-15、P3-17 | — |
| P3 徽章 | 独立负责 | P3-15（边界：适配调优非写 kernel） | — |
| P4 角色行 | 单卡十余位 NPC 且人设一致；多 LoRA 热切换的显存与延迟瓶颈 | P4-01、P4-04 | C19 |
| P4 动作 1 单基座方案 | 剧本 post-training 注入世界观；角色 Prompt 区分人设；替代多 LoRA 热切换 | P4-02、P4-03、P4-05 | C19 |
| P4 动作 2 数据与对齐 | 陷阱式对抗样本 SFT 数据；RLHF 对齐人设偏好；BERT 优化 Proactive 触发时机 | P4-07~P4-13 | C20、C21、C22、C28 |
| P4 结果行 | 规避显存碎片与热切换开销；单卡十余位 NPC；平滑迁移 14B | P4-01、P4-06 | — |
| P4 徽章 | 模块负责 | P4-15 | — |
| 决策卡 1 | 防 Reward Hacking：终态乘法门控，拒办不单独加分；8.6→80.5 | D1-01~D1-07、P1-24 | C01 |
| 决策卡 2 | Async RL 的边界：Merged 单份权重下改走串行 | D2-01~D2-08、P1-20、P1-30 | C07 |
| 决策卡 3 | 多 Agent 编排：Orchestrator-Worker 分派工具化 | D3-01~D3-08、P2-26~P2-28 | C14 |
| 专利 1 | 动态拓扑自调节对话式多智能体 CN121561033B | M-13、D3-07 | — |
| 专利 2 | MOPAR 多智能体协同文本生成 CN119250033B 独立发明人 | M-14 | — |
| 专利 3 | LLM 自然语言生成图表 CN118733612A 实审中 | M-15、P2-24 | — |
| 论文 | NLPCC 2021 一作 Syntax and Coherence | M-16 | — |
| 专利副标 | 第一发明人 3 项（2 授权 1 实审）· 合作署名 5 项 | M-04、M-17 | — |
| 技能行 1 | SFT / LoRA / RLHF / GRPO / CISPO / Async RL / PyTorch / DeepSpeed / LLaMA-Factory / OpenPipe ART | M-07、P1-26、P1-30、P1-32、P4-08、P4-11 | C04、C19、C20、C22 |
| 技能行 2 | Reward 设计 / Rollout 加速 / Simulator / 轨迹合成与分层验证 / 训推一致性 | M-08 | C01、C08、C10 |
| 技能行 3 | LangGraph / deepagents / MCP / AG-UI / 沙箱生命周期 / 上下文压缩 / 多智能体编排 | M-09 | C12~C16 |
| 技能行 4 | vLLM / SGLang / GPTQ / AWQ / NVIDIA GPU / 昇腾 910B | M-10 | C23、C24 |
| 技能行 5 | Agentic RAG / ColPali / 向量+BM25 混合检索 / NL2SQL (M-Schema) | M-11 | C17、C18 |
| 技能行 6 | Python / FastAPI / Redis / Docker / Coding Agent 辅助研发 | M-12、P1-40 | — |
| 教育 | 北航硕士 NLP；成都理工本科前 10% | M-18 | — |

自检结论：简历 47 个可提问位置全部有条目映射；无映射空白。

---

## 五、风险点清单（最容易被问倒的 12 个点）

| # | 风险点 | 为什么危险 | 一句应对策略 |
|---|---|---|---|
| R1 | 54.3%→84.4% 的评测集性质 | 追问"是 held-out 吗？泛化验证了吗？"，答"是"即失信 | 主动先说：96 题是从 dev 集分层抽取、训练中用于监控的面板，与训练集 family 隔离；千题最终 holdout 已建好未执行，所以我只说"训练监控面板上的提升"。 |
| R2 | +30.1 与早期 +7.8 两个数字并存 | 旧稿/旧 recap 有 C0→C15 数字，若混说会被当作口径作假 | 主动区分：15 步早期原型 run vs 长程 run；任务池清洗前后；面板不同；只有后者上简历。 |
| R3 | HV 0.26% 的分子分母与性质 | 被问"0.26% 是几条？是越权吗？" | 2/768 episode 级，两条均为格式协议错误、无越权沙箱操作；顺带讲 any-of-8 与 episode 级量纲错位的修正。 |
| R4 | 简历写 GRPO、实际 loss 是 CISPO | 面试官细问 loss 公式时若写 PPO clip 会露怯 | 先说"GRPO 指组内相对优势的估计范式，policy loss 用 ART 默认 token-level CISPO"，再手写 C04 对照。 |
| R5 | vLLM"提升约 6 倍"的措辞 | 深挖发现是从 LoRA kernel 慢路径"恢复"而非绝对优化 | 诚实框定：定位 Triton LoRA kernel 悬崖 → Merged serving 绕开；价值在诊断与取舍，而且这个取舍直接决定了 Async RL 的边界（D2）。 |
| R6 | Async RL 卡被读成"不理解大规模 RL 为何必须异步" | 面向 Kimi/字节等自研异步基础设施团队尤其致命 | 先肯定异步是主流与前提（多版本权重），再说结论限定在 Merged 单份权重约束内；能保留多版本就应回到异步；追问再给 14 步压测的陈旧度数据。 |
| R7 | "两轮独立双盲审计" | 追问"谁审的？终点审了吗？" | R3 评分反投机 + R4 模拟器保真，训练中期两个节点执行均通过；终点未单独审、并入未执行的最终评测；"独立"指审计面板与判定链独立于训练信号。 |
| R8 | 项目二个人 vs 团队边界与成熟度 | Agent Teams 是 design_complete 未实施；ChatBI ReAct 在参考分支；A2UI 是原型；说"上线"即失真 | 每讲一块主动标成熟度（已合入 / 参考分支 / 原型 / 设计完成）；设计出自本人，落地由团队；动词用"设计/确立/重设计/探索"。 |
| R9 | ColPali 机制深挖与效果证据 | 写了 late-interaction 就会被拿论文原文问；且"免去 OCR 链路"无量化证据 | MaxSim 公式与存储代价必须盲写（C17）；效果只说定性与评测方法，不编数字；被问局限主动说数值问答与页粒度。 |
| R10 | 昇腾 910B 适配深度 | 被问 CANN 算子/kernel 级细节 | 边界诚实：做的是 vLLM/SGLang 后端适配、量化格式兼容与性能调优，不是算子开发；讲清坑（算子缺口、量化支持差异）与验证方法。 |
| R11 | 小冰 RLHF 细节（2022 年） | 被问 RM 数据量、PPO 超参、胜率数字 | 讲流程与角色（RM 偏好对怎么标、PPO 四模型、KL）、讲坑（reward hacking 表现），不给无出处数字；顺势对比后来的 GRPO（P4-10）。 |
| R12 | "6 个 0→1 系统"与"4 年+" | 追问另外两个系统是什么、4 年怎么算 | 现场报清单（M-02 六项）；4 年 = 2022.07 起算即 LLM 后训练工作。 |
| R13 | 训练规模数字被追问 | 简历刻意不写步数/轨迹数/GPU 数，追问时若含糊会显得虚 | 口头直接给：长程 run 数百步、约 3.2 万条多轮 rollout、2 卡 A6000 训练器与推理分卡；说明简历不写是因为规模不是卖点、方法才是。 |
| R14 | 专利与项目的关系 | 追问动态拓扑专利 vs Orchestrator-Worker 是否矛盾 | 两条线各讲各的：专利解决拓扑自调节问题，平台设计在企业可控性约束下选固定协调模式；不强行呼应。 |
| R15 | 冻结 Simulator 被策略 exploit | RL 老手必问"环境是学出来的，策略学会骗它怎么办" | 讲 R4 审计四项（提示词泄漏 0、RPCR 差分、过早终止、跑题）、Simulator 信息边界（不看工具结果）、以及局限（单一 Simulator 分布）。 |

---

## 附：正文撰写顺序建议

1. 先写 `00-master.md` 的口径红线卡与自我介绍稿（半天）。
2. 再写 `01-p1` 与 `05-decision-cards`（一天半，素材最厚，注意把 RS/p5 与 DEC 的口径覆盖旧 recap 数字）。
3. 再写 `code/` Tier A 8 项并全部跑通（半天）。
4. 然后 `02-p2`（一天）、`03-p3` 与 `04-p4`（各半天，理论为主）。
5. 最后 `06-topbar-skills-patents.md`，专利与论文需另找原文摘要补一份 10 分钟答辩稿。
6. 全部写完后按第四部分覆盖度表逐行打勾，再按第五部分风险清单做一次自问自答录音。
