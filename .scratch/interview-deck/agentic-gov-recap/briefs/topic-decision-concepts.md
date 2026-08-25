# 专题 brief：agentic-gov 的 Decision Concept（DC）详解

## 背景

项目 `/Users/sunxichen/Projects/agentic-gov` 是公积金政务 Agent 的 task factory → SFT → simulator → ART GRPO 项目。用户要求在下列 detail-notes 目录新增一篇独立专题，讲清项目中的 **Decision Concept（DC）**：

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-decision-concepts.md`

这不是泛泛讨论“decision making”，而是项目内实际存在的 DC taxonomy。初步定位：`src/agentic_gov/constants.py` 有 31 个 concept、density/quota；task metadata 有 `concept_primary` 与 `decision_concept_ids`；task factory、hard train、release preflight、evaluation 都使用它。

## 目标

让读者能回答：

- DC 是什么，为什么 task type 不够、还要用 DC 作为训练/评测/采样的原子覆盖单位？
- `concept_primary` 与 `decision_concept_ids` 的区别，为什么一个任务可以同时考多个 concept？
- 31 个 DC 各自训练 Agent 的什么决策能力？分别被哪些 task/variant 触发？
- density/quota、family split、hard train、curriculum、release preflight、hard validation 如何围绕 DC 工作？
- DC 如何避免把数据集“业务名字多、实际决策逻辑重复”误当成覆盖广？
- 面试时如何结合一两个 DC 举例口述“从业务场景 → decision boundary → task construction → reward/eval”闭环？

## 调研要求

先通读项目源码与内部一手文档：

- `src/agentic_gov/constants.py`：DC ids、density、mapping、断言
- `src/agentic_gov/schemas/` 中 task metadata 定义
- `src/agentic_gov/task_factory/core.py`、`entrypoints.py`、`invariants/`
- `src/agentic_gov/hard_train_v2.py`、`release/preflight.py`、相关 sampler/release modules
- phase2/phase6 的 task pool、hard validation、curriculum / plan 文档
- 相关 tests、fixtures、research-proposal、docs/decisions、experiment notes

不要只根据 constants 表猜语义：每个 DC 的解释至少要交叉验证其对应 task factory / variant / test / prompt 使用处。

可使用 web 做非常有限的背景研究（例如 coverage taxonomy / curriculum 的术语），但关键事实以项目源码为准。

## 必须包含的结构

1. **一句话定义 + 全景图**：DC 在数据/训练链路中处于哪里。
2. **数据模型与不变量**：`concept_primary`、`decision_concept_ids`、task_type、family/seed 的关系；重要断言。
3. **31 个 DC 的可读 taxonomy**：不要机械堆 31 条。先按“决策能力”分组（核实实际 grouping 后再写），每个 DC 给：ID、名称/语义、决策边界、典型任务或变体、常见错误策略、如何评估。表格可分组。
4. **从一个 DC 走完整闭环**：至少两个真实例子。要分别覆盖一个正常合规决策和一个 adversarial/exception/边界决策。展示 task factory 如何标记、怎样成为训练样本、如何在 sampler/preflight/eval 中检查。
5. **覆盖与采样**：density/quota 4800 等数值的含义、为何不是平均 task type 计数；release preflight / deficits 的具体工作。
6. **与 family split、contrast/adversarial variants、hard train、L1-L3（若确有）课程的关系**。
7. **面试口述版**：2 分钟与 5 分钟两版；附常见追问（DC 与 label 有何区别、一个任务为何多个 DC、concept drift 怎么治理）。
8. **Sources**：内部文件路径、关键符号；如果用了 web，也列 URL。

## 风格

中文，清楚且不营销。像资深算法工程师介绍自己做的数据建模，而不是写项目宣传稿。不要编造不存在的 DC 名称/语义；不确定性要显示注明。可给短伪代码，但不是必需。不得修改源项目或 recap blog。

完成后回复输出路径、31 DC 的分组结构、最重要的 3 个建模洞见，以及你发现的任何概念版本冲突。