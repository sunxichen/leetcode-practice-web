# T1 Brief: 事实底稿（fact base）

## 背景

我们要为一个已完成的研究项目撰写面试复现材料。项目是 **agentic-gov**，位于 `/Users/sunxichen/Projects/agentic-gov`：一个政务（公积金）task-oriented agent 的 SFT→RL 全链路研究项目，共 6 个 phase：

1. Phase1：domain-agnostic sandbox 环境 + 任务工厂（CanonicalTask schemas、golden chain、DSL、身份证生成）
2. Phase2：SFT 数据合成（agent/user teacher 双角色、prompt 模板版本化、`<analysis>/<action>` envelope、parser、orchestrator 的 repair + semantic guard）与数据过滤（L3 tagger、NLI/RPCR verifiers、分层采样）
3. Phase3：SFT 训练（LLaMA-Factory）
4. Phase4：user simulator SFT
5. Phase5：release gate
6. Phase6：基于 OpenPipe ART 框架的 GRPO RL（ART 源码在 `/Users/sunxichen/Projects/ART`，项目使用其 LocalBackend）

最终交付物是一份中文 recap blog + 一套伪代码包，供 20-30 分钟面试自述使用。撰写工作将由多个 writer 并行完成，**你的任务是产出他们共享的事实底稿**。

## 先读

- `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/spec-recap-blog.md` — 完整规格（章节大纲、12 条决策插叙清单、代码写法约定）
- 同目录 `tickets.md` — 你的 ticket 是 T1

## 你要做什么

通读项目源码与文档，产出**一个文件**：

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/fact-base.md`

fact-base 按 blog 章节（Ch0-Ch12）组织，内容包括：

1. **12 条决策插叙的事实底稿**（编号①-⑫见 spec 的「决策插叙清单」）：每条给出出处文件路径、核心事实（发生了什么、为什么、结果如何）、可供引用的关键数字。主要来源：`docs/experiment-notes/`（31 篇）、`docs/decisions/`、`research-proposal/` 里的 ADR、`handoff/`。
2. **8 个 recap-code 文件的真实函数名清单**：`01_task_design.py` ~ `08_art_grpo.py`，每个文件列出应该用到的项目真实函数名/类名/import 路径（来自 `src/agentic_gov/`、`phase2`-`phase6/`），以及 ART 侧的真实函数名（`src/art/loss.py`、`gather.py`、`model.py`、`local/backend.py` 等）。函数名必须逐一在源码中核实存在。
3. **非 happy path 样例素材**：每个主菜章至少 1 个具体样例（身份冒充对抗任务、parse 失败修复、语义守卫拦截、被拒轨迹、format hard-zero、Escalate/FinishWithRefusal），给出出处文件和可直接引用/改写的片段。
4. **关键数字与结论**：pass@k 饱和分析结果、reward v2 天花板、LoRA merge 加速数据、RL 有效性 verdict 结论、recovery tier0/1/2 结论等，全部带出处。

## 写作风格

- 中文，技术术语保留英文原词。
- 不要黑话、不要营销腔。像一个资深算法工程师在给自己梳理项目、准备向其他工程师介绍。
- fact-base 是内部工作文档，但要求事实准确、出处可回溯——后续 writer 会引用它，但也会独立核实。

## 约束

- 只读 agentic-gov 和 ART，不修改它们的任何文件。
- 唯一写入位置是上面指定的 fact-base.md。
- 完成后回复：fact-base.md 的路径、章节覆盖情况、你认为后续 writer 最容易踩坑的 3 个点。
