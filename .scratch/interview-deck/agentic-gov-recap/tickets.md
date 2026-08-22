# Tickets: agentic-gov 面试复现材料（recap blog + recap code）

产出两份同等地位、相互独立的面试复现交付物：单文件长文 blog（`recap-blog.md`）+ 伪代码包（`recap-code/`，8 个文件）。源 spec：`.scratch/interview-deck/spec-recap-blog.md`。

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

**多智能体执行约定（用户明确要求）**：正文撰写将采用多智能体形式，每个 worker 有独立上下文。T1 的 fact-base 只作为 worker 的**参考起点，不是唯一事实来源**——每个 worker 必须自己自由调研、通读项目相关代码与文档（research-proposal/、docs/decisions/、docs/experiment-notes/、handoff/、src/agentic_gov/、phase2-phase6/、~/Projects/ART），独立核实函数名与决策细节后再写。

## T1 事实底稿（fact base）

**What to build:** 通读项目源码、research-proposal/、docs/decisions/（ADR）、docs/experiment-notes/（31 篇）、handoff/、~/Projects/ART 源码，产出 `.scratch/interview-deck/fact-base.md`：按 blog 章节组织的真实函数名清单、12 条决策插叙的出处与要点、非 happy path 样例素材、关键数字/结论。供各 worker 参考（非唯一来源）。

**Blocked by:** None — can start immediately

- [x] 覆盖全部 12 条决策插叙（①-⑫），每条有出处文件与核心事实
- [x] 覆盖 8 个 recap-code 文件各自的真实函数名/import 路径清单（项目侧 + ART 侧）
- [x] 非 happy path 素材：每主菜章至少 1 个具体样例（对抗任务、parse 修复、语义守卫、被拒轨迹、hard-zero、Escalate/Refusal）
- [x] 关键数字/结论（pass@k 结果、reward 天花板、吞吐/加速数据、RL 有效性 verdict 结论）有出处

## T2 Blog Ch0-2 + 01_task_design.py + 02_sandbox.py

**What to build:** blog 总览章（项目定位、全链路 ASCII 数据流图、自述路线）、任务设计章（CanonicalTask schemas、公积金 4 任务类型、golden chain、DSL、ID 卡生成、对抗种子+contrast pairs，含身份冒充非 happy path 样例）、沙箱环境章；对应两个代码文件。

**Blocked by:** T1 事实底稿（fact base）

- [x] Ch0 含全链路 ASCII 数据流图，可徒手白板复现
- [x] Ch1 含非 happy path 小节（身份冒充对抗任务样例）
- [x] 01/02 代码文件：真实函数名、语法合法、中文注释解释内部逻辑
- [x] 写作前独立通读项目相关源码核实细节，不只依赖 fact-base

## T3 Blog Ch3-4 + 03_sft_synthesis.py + 04_sft_filtering.py

**What to build:** SFT 数据合成章（agent/user teacher 双角色、prompt 模板版本化 v1.0/v1.1、`<analysis>/<action>` envelope、parser、orchestrator 的 current-turn repair + semantic guard，含 parse 修复与语义守卫拦截样例）、SFT 数据过滤章（L3 tagger、NLI/RPCR verifiers、分层采样，插叙① NLI premise-per-message）；对应两个代码文件。

**Blocked by:** T1 事实底稿（fact base）

- [x] Ch3 含 2 处非 happy path 小节（parse 失败修复、语义守卫拦截，各附具体样例片段）
- [x] Ch4 含插叙①（L2 NLI premise-per-message 的动机与影响）
- [x] 03/04 代码文件：真实函数名、语法合法、中文注释解释内部逻辑
- [x] 写作前独立通读项目相关源码核实细节，不只依赖 fact-base

## T4 Blog Ch5-7 + 05_sft_training.py + 06_simulator.py

**What to build:** SFT 训练章（LLaMA-Factory 薄集成、数据配比；插叙② tokendiff 模板一致性、⑤ loan 短板留给 GRPO、④ pass@k 饱和转 GRPO 作章末转折）、User Simulator 章（插叙③ role order/mask history 修复 + 评测结论）、Release Gate 节（插叙⑫ gold relabel/hybrid review）；对应两个代码文件。

**Blocked by:** T1 事实底稿（fact base）

- [x] 插叙②③④⑤⑫ 全部落位，④作为 Ch5 章末的 SFT→RL 转折
- [x] 05/06 代码文件：真实函数名、语法合法、中文注释解释内部逻辑（SFT 训练侧代码薄、决策为主）
- [x] 写作前独立通读项目相关源码核实细节，不只依赖 fact-base

## T5 Blog Ch8-9 + 07_rl_rollout_reward.py

**What to build:** RL 数据与采样章（learnability pool、frontloading、variance-aware mixture sampler；插叙⑩ SR5 数据血缘/课程修复）、Rollout 与 Reward 章（sim server、vLLM serving、adjudicator、reward v2→v3；插叙⑥ format hard-zero、⑦ reward v2 天花板；非 happy path：hard-zero 轨迹、Escalate/FinishWithRefusal 轨迹样例）；对应代码文件。

**Blocked by:** T1 事实底稿（fact base）

- [x] 插叙⑥⑦⑩ 全部落位
- [x] Ch9 含非 happy path 小节（hard-zero / Escalate / FinishWithRefusal 轨迹样例）
- [x] 07 代码文件：真实函数名、语法合法、中文注释解释内部逻辑
- [x] 写作前独立通读项目相关源码核实细节，不只依赖 fact-base

## T6 Blog Ch10 + 08_art_grpo.py

**What to build:** ART GRPO 训练章：项目侧 train_grpo 编排（rollout→打分→gather→log→train 循环）+ ART 黑盒拆解（`gather_trajectory_groups` 分组/等待语义、`TrainableModel.log`、`_train_step` 内 GRPO loss：importance ratio/clip/优势归一化/KL、loss 归一化与长度偏置及项目 loss_norm_floor 实证、vLLM 权重同步 + LoRA serving 机制）；插叙⑨ KL penalty、⑧ LoRA-merge serving 加速发现 + async RL（CISPO vs GRPO、async drift、merged serving）；mermaid 组件交互图；对应代码文件。

**Blocked by:** T1 事实底稿（fact base）

- [x] 插叙⑧⑨ 全部落位，async RL 按业界重要方向讲透（结合项目实证，不科普）
- [x] 08 代码文件分两层：项目编排 + ART 内部机制伪代码（loss.py/gather.py/model.py 真实函数名）
- [x] mermaid 组件交互图可渲染
- [x] 写作前独立通读项目相关源码与 ~/Projects/ART 源码核实细节，不只依赖 fact-base

## T7 Blog Ch11-12 + 全文终检

**What to build:** 终局章（RL 有效性 verdict、recovery tier0/1/2、全盘复盘；插叙⑪）、面试快问快答附录（RL 算法高频考点 × 项目实证映射，只写项目真实踩过的点）；然后全文终检：章节连贯性、术语一致、插叙编号与 spec 大纲一致、伪代码函数名抽样 grep 核对、ASCII/mermaid 图渲染验证、通读模拟 20-30 min 自述计时。

**Blocked by:** T2, T3, T4, T5, T6

- [x] Ch11 含插叙⑪，自述有明确最终落点
- [x] Ch12 快问快答每条映射到项目实证，无通用科普
- [x] 伪代码函数名抽样与项目源码 grep 核对通过
- [x] 12 条插叙全部落位且编号与 spec 一致
- [x] 全文通读连贯，自述量适配 20-30 min
