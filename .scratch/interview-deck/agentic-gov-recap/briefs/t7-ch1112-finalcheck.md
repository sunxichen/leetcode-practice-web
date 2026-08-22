# T7 Brief: Blog Ch11-12 + 全文终检

## 背景

我们在为已完成的研究项目 **agentic-gov**（位于 `/Users/sunxichen/Projects/agentic-gov`）撰写面试复现材料。项目是政务（公积金）task-oriented agent 的 SFT→RL 全链路研究，共 6 个 phase。RL 基于 OpenPipe ART 框架（源码 `/Users/sunxichen/Projects/ART`）。

最终交付物（位于 `/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/`）：

1. **recap blog**：多个 writer 已分章写完 Ch0-Ch10，分片在 `recap-blog.d/`（ch00-02.md、ch03-04.md、ch05-07.md、ch08-09.md、ch10.md），orchestrator 会合并成单文件 `recap-blog.md`
2. **recap code**：`recap-code/` 下 8 个伪代码文件已就位

你负责**收官**：写最后两章 + 全文终检。

## 先读

- 同目录 `spec-recap-blog.md`、`tickets.md`（你的 ticket 是 T7，验收标准以它为准）
- 同目录 `fact-base.md` — 事实底稿（参考起点，不是唯一来源；关键事实自己核实）
- **通读 `recap-blog.d/` 全部 5 个分片**——你的两章要和前文风格、术语、详略程度无缝衔接

## 你负责的部分

### 1. 写 Ch11、Ch12（写到 `recap-blog.d/ch11-12.md`）

- **Ch11 终局**：RL 有效性终审 verdict（出处 `docs/decisions/adr-phase6-rl-effectiveness-verdict.md`）、effectiveness recovery tier0/1/2 结论（出处 `handoff/handoff-phase6-rl-effectiveness-recovery-tier0-tier1-tier2-20260707.md`）、全盘复盘（整条链路做对了什么、如果重来会改什么）。含决策插叙⑪。这是自述的最终落点，要有"收官感"
- **Ch12 面试快问快答**：RL 算法高频考点 × 项目实证映射。**只写项目真实踩过/实现过的点**，每条格式：问题 → 3-5 句标准答案 → 「项目实证」指针（指向项目里的具体机制/文件/决策）。候选点（从全文已覆盖的内容里提炼，不要引入前文没有的科普）：GRPO vs PPO 与组相对优势、importance ratio 与 CISPO token 级裁剪、优势归一化与零方差组过滤、KL penalty 设计与解读、loss 归一化分母与长度偏置（loss_norm_floor）、async RL 的 off-policy drift、多轮 agentic 的 credit assignment（trajectory 级 reward 广播到 token）、reward hacking 与 format hard-zero、pass@k 可学习性诊断、LoRA merge serving 加速

### 2. 全文终检（对 `recap-blog.d/` 全部分片 + `recap-code/` 全部 8 个文件）

- 12 条决策插叙全部落位，编号与 spec 一致（①②在 Ch4/Ch5，③在 Ch6，④⑤在 Ch5，⑥⑦在 Ch9，⑧⑨在 Ch10，⑩在 Ch8，⑪在 Ch11，⑫在 Ch7）
- 术语一致性抽查：同一概念全文的叫法（如 CanonicalTask、envelope、adjudicator、learnability pool）
- 伪代码函数名抽样核对：从 8 个 `.py` 里随机抽 20 个函数名/类名，grep 项目源码与 ART 源码验证存在
- ASCII / mermaid 图语法检查（mermaid 代码块用 ` ```mermaid ` 标注且语法合法）
- 章节间衔接：相邻分片的接缝处是否有重复或断裂，如有，直接修分片文件
- 发现的问题能自己修的直接修（限 `.scratch/interview-deck/agentic-gov-recap/` 内），不能修的列在回复里

## 写作风格（重要）

- 中文，技术术语保留英文原词
- **不要黑话、不要营销腔**。资深算法工程师梳理自己项目、向其他工程师介绍的风格
- 先通读前文分片，保持语气、格式（决策插叙的 ASCII 框、标题层级）一致

## 约束

- 只读 agentic-gov 和 ART，不修改它们的任何文件
- 写入位置仅限 `.scratch/interview-deck/agentic-gov-recap/` 下：`recap-blog.d/ch11-12.md`（新建），以及终检时对现有分片和代码文件的修正
- **不要合并生成 recap-blog.md**——合并由 orchestrator 做
- 完成后回复：产出/修改的文件清单、终检各项结果（插叙落位表、函数名抽查 20 条的通过率、衔接问题及处理）、遗留问题
