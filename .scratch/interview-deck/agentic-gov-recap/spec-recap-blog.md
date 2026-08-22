# Spec: agentic-gov 面试复现材料（recap blog + recap code）

来源：2026 年面试准备会话，经 grilling 逐问确认。tracker：本地 markdown（`.scratch/interview-deck/`）。

## Problem Statement

用户要用 agentic-gov 项目（政务公积金 task-oriented agent 的 SFT→RL 全链路研究）面试。项目跨度大（6 个 phase），很多内容已经遗忘。已有的 detail-notes 专题文档比较离散、没有整体联动，无法支撑"口述完整项目全貌"的 20-30 分钟面试自述。需要一份 minimal 但信息完整的复现材料：看完能建立项目全貌/蓝图，能完整口述，且覆盖实验过程中影响方向的关键决策与发现——不只是 happy path。

## Solution

产出两份同等地位、相互独立的交付物：

1. **recap blog**（单文件长文，`recap-blog.md`）：All-in-x / Hands-on-x 风格的中文长文，以"逻辑流水线为主线 + 关键决策插叙"组织，逐章复现完整研究链路（task 设计 → sandbox 环境 → SFT 数据合成 → SFT 数据过滤 → SFT 训练 → user simulator → release gate → RL 数据采样 → rollout/reward → ART GRPO 训练 → 有效性终局）。配 ASCII / mermaid 图。
2. **recap code**（多文件包，`recap-code/`）：与 blog 章节一一对应的 8 个 `.py` 文件，语法合法但不可运行的伪代码；函数名使用项目与 ART 中的真实函数名；中文注释充分解释每个函数的内部执行逻辑（不是只写输入输出）。

两份交付物完全独立，不引用、不依赖已有的 detail-notes。

## User Stories

1. 作为面试者，我想在自述开头用一张全链路数据流图讲清项目蓝图，以便面试官 30 秒内建立整体认知。
2. 作为面试者，我想按流水线章节逐段复述项目，以便 20-30 分钟内完整覆盖全貌且重点突出。
3. 作为面试者，我想每个核心章节都有"关键决策/发现"插叙（为什么这么做、踩过什么坑、如何改变方向），以便展示研究判断力而不是流水账。
4. 作为面试者，我想每章都有非 happy path 的具体样例（对抗任务、parse 失败修复、语义守卫拦截、被拒轨迹、hard-zero rollout、Escalate/Refusal），以便回答"异常情况怎么处理"。
5. 作为面试者，我想有一份与项目真实代码强对应的伪代码骨架，以便白板时能默写模块结构与关键函数。
6. 作为面试者，我想伪代码注释解释函数内部执行逻辑，以便被追问实现细节时能照着讲。
7. 作为面试 RL 算法岗的候选人，我想 blog 里包含项目真实踩过的 RL 算法点（GRPO loss、importance ratio、优势归一化、KL、CISPO vs GRPO、loss 归一化/长度偏置、credit assignment），以便应对算法深挖。
8. 作为面试 RL 算法岗的候选人，我想文末有"快问快答"附录（高频问题 → 标准答案 → 项目实证指针），以便考前快速扫题。
9. 作为面试者，我想知道 ART 框架黑盒内部（gather/log/train/loss、vLLM 权重同步、LoRA serving）的机制，以便讲清"训练 pipeline 是我自己掌控的，不是调包"。
10. 作为面试者，我想讲清 SFT 冷启动饱和（pass@k 分析）后转向 GRPO 的决策链，以便说明研究方向转折的依据。
11. 作为面试者，我想讲清工程发现（训练-推理模板 tokendiff 不一致、LoRA merge 后 serving 加速、async rollout drift），以便展示工程深度。
12. 作为面试者，我想讲清 RL 有效性的最终 verdict 与 recovery 分层结论，以便自述有明确的最终落点。
13. 作为读者，我想 blog 与 recap code 各自独立完整，以便单独读任何一份都不缺上下文。
14. 作为复习者，我想材料按核心度分级详略（task 设计/数据/RL 是主菜），以便把时间花在面试权重最高的部分。

## Implementation Decisions

### 交付物与位置

- Blog：`.scratch/interview-deck/recap-blog.md`，单文件长文（预计 1.5-2.5 万字），内部按 Ch0-Ch12 章节组织，正文可配代码块辅助理解。
- 代码：`.scratch/interview-deck/recap-code/`，8 个文件：`01_task_design.py`、`02_sandbox.py`、`03_sft_synthesis.py`、`04_sft_filtering.py`、`05_sft_training.py`、`06_simulator.py`、`07_rl_rollout_reward.py`、`08_art_grpo.py`。每个文件顶部 docstring 说明该阶段在全局中的位置。
- 两份交付物与 `detail-notes/` 完全独立，不交叉引用；detail-notes 原样保留不动。

### 叙事结构

- 主线：逻辑流水线（任务设计→环境→数据合成→数据过滤→SFT→simulator→release gate→RL），非时间线。
- 每章内嵌 1-2 处"关键决策/发现"插叙；每个主菜章嵌 1-2 处非 happy path 小节，贴具体迷你样例（对抗任务 JSON 片段、被拦截对话片段、被拒轨迹片段）。
- 全 6 个 phase 都覆盖，按核心度分级详略：task 设计 / SFT 数据合成+过滤 / RL 为主菜（代码+详解）；SFT 训练与 simulator 中等篇幅（决策为主、代码薄）；release gate 压缩为一节；纯工程运维（监控、吞吐调优）不进正文，只在相关插叙中被提及。

### Blog 章节大纲（含插叙与非 happy path 放置）

- Ch0 总览：项目定位、全链路 ASCII 数据流图、自述路线。
- Ch1 任务设计：CanonicalTask schemas、公积金 4 任务类型、golden chain、DSL、ID 卡生成（GB 11643-1999）、对抗种子 + contrast pairs。〔非 happy path：身份冒充对抗样例〕
- Ch2 沙箱环境：domain-agnostic sandbox engine、状态机、API 模拟、错误注入。
- Ch3 SFT 数据合成：agent/user teacher 双角色、prompt 模板版本化（v1.0/v1.1）、`<analysis>/<action>` envelope、parser、orchestrator（current-turn repair + semantic guard）。〔非 happy path：parse 失败修复、语义守卫拦截样例〕
- Ch4 SFT 数据过滤：L3 tagger、NLI/RPCR verifiers、分层采样。〔插叙① NLI premise-per-message〕
- Ch5 SFT 训练：LLaMA-Factory 薄集成、数据配比。〔插叙② 训练-推理模板 tokendiff 不一致修复；⑤ loan-repayment 短板刻意留给 GRPO；④ pass@k 饱和 → 转向 GRPO（章末转折）〕
- Ch6 User Simulator：simulator SFT。〔插叙③ role order/mask history 修复 + phase4 评测结论〕
- Ch7 Release Gate：质量治理闭环（一节篇幅）。〔插叙⑫ gold relabel / hybrid review〕
- Ch8 RL 数据与采样：learnability pool、frontloading、variance-aware mixture sampler。〔插叙⑩ SR5 数据血缘/课程问题与修复〕
- Ch9 Rollout 与 Reward：sim server、vLLM serving、adjudicator、reward v2 → v3（terminal-gated outcome）。〔插叙⑥ format failure hard-zero vs resample；⑦ reward v2 质量天花板〕〔非 happy path：hard-zero 轨迹、Escalate/FinishWithRefusal 轨迹〕
- Ch10 ART GRPO 训练：项目侧 train_grpo 编排 + ART 黑盒拆解（`gather_trajectory_groups` 分组/等待语义、`TrainableModel.log`、`_train_step` 内 GRPO loss：importance ratio/clip/优势归一化/KL）、loss 归一化与长度偏置（项目 `loss_norm_floor` 实证）、vLLM 权重同步 + LoRA serving 机制。mermaid 组件交互图。〔插叙⑨ KL penalty 设计与解读；⑧ LoRA-merge serving 加速发现 + async RL（CISPO vs GRPO、async drift、merged serving）〕
- Ch11 终局：RL 有效性 verdict、effectiveness recovery tier0/1/2、全盘复盘。〔插叙⑪〕
- Ch12 面试快问快答：RL 算法高频考点 × 项目实证映射。只写项目真实实现/踩过的点，不做通用知识科普。

### 决策插叙清单（12 条，已确认全收）

① L2 NLI premise-per-message；② 训练-推理模板 tokendiff/jinja 修复；③ simulator role order/mask history 修复 + 评测结论；④ SFT 冷启动饱和 pass@k 分析 → 转 GRPO；⑤ loan-repayment 短板留给 GRPO；⑥ format failure hard-zero vs resample；⑦ reward v2 质量天花板 → v3；⑧ LoRA-merge serving 加速发现 + async RL（CISPO vs GRPO、async drift、merged serving，业界方向需讲透）；⑨ KL penalty 设计与解读；⑩ 采样课程（frontloading / variance-aware mixture / SR5 数据血缘修复）；⑪ RL 有效性终审 verdict + recovery tier0/1/2；⑫ phase5 gold relabel / hybrid review。

### 代码写法约定

- 语法合法的 Python，可读但不可运行；保留真实 import 路径、函数签名、类型标注、控制流骨架；省略处用 `...` 或一行注释带过。
- 函数名必须使用项目（`src/agentic_gov/`、`phase6/`）与 ART（`~/Projects/ART`，OpenPipe/ART 官方 ~0.5.17，LocalBackend）中的真实函数名。
- 中文注释，解释函数内部执行逻辑与为什么，不只写输入输出。
- ART 复现深度两层：项目侧编排（rollout→打分→gather→log→train 循环）+ ART 内部机制拆解（loss、权重同步、LoRA serving）。不下钻到 unsloth/vLLM 集成实现细节。

### 事实来源

项目内 `research-proposal/`、`docs/decisions/`（ADR）、`docs/experiment-notes/`（31 篇）、`handoff/`、`src/agentic_gov/`、`phase2-phase6`；ART 源码 `~/Projects/ART/src/art/`（loss.py、gather.py、model.py、local/backend.py）。写作前需通读对应部分提炼事实底稿，确保函数名与决策细节真实准确。

## Testing Decisions

本交付物是文档/伪代码，无自动化测试。验收方式：

- 每个 ticket 完成后由用户通读对应章节/代码文件做 review，反馈后修订。
- 终检（最后一个 ticket）：全文连贯性自查——章节间术语一致、插叙编号与大纲一致、伪代码函数名与项目源码逐一核对（抽样 grep 验证）、ASCII/mermaid 图可渲染、全文通读一遍模拟 20-30 min 自述计时。
- 好 review 的标准：只核对"外部行为"——读者能否建立蓝图、能否复述、决策链是否完整；不纠结措辞风格细节。

## Out of Scope

- 通用 RL 算法知识科普（属于独立专题，不进本交付物）。
- 可运行的 demo；伪代码不追求可执行。
- detail-notes 的重写/对齐。
- 监控、吞吐调优等纯工程运维内容的系统展开。
- 英文版本。

## Further Notes

- ART 版本以本地 `~/Projects/ART`（跟踪 OpenPipe/ART main，项目用 LocalBackend，约 0.5.17 语义）为准。
- 写作语言：中文（技术术语保留英文原词）。
