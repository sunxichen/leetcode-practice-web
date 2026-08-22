你要为面试复习写一份新的专题笔记。主题是：项目中期 RL 长期无进展时，团队一度误判为“4B 模型容量不足或 GRPO 在复杂多轮 Agent 上失效”，后来通过失败轨迹回放发现根因是 Task Factory 生成了大量逻辑矛盾/物理不可解的“死题”，于是沉淀出跨字段不变式（Invariants）校验体系，清洗历史任务并防止复发。

## 产出
写入新文件：/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-invariants-and-dead-task-diagnosis.md

## 代码/文档调研范围（必须自己查证，不要臆造）
项目代码在 /Users/sunxichen/Projects/agentic-gov
重点调研：
- src/agentic_gov/task_factory/invariants/**
- src/agentic_gov/task_factory/**，尤其 entrypoints/core/golden/reveal 相关逻辑
- src/agentic_gov/verifier/funnel.py
- src/agentic_gov/reward/**
- src/agentic_gov/runtime/**
- src/agentic_gov/task_types/**
- tests/** 中 invariants、golden、task_factory、verifier、reward 相关测试
- docs/**、handoff/**、phase*/** 中与 RL 无进展、GRPO、dead task、invariant、clean、retire、247、DC-31、belief grounding、release gate 相关记录

全仓搜索建议：
`invariant`, `dead task`, `dead_task`, `retire`, `247`, `GRPO`, `4B`, `capacity`, `no progress`, `stalled`, `DC-31`, `belief_grounding`, `unobservable`, `frozen`, `identity`, `mismatch`, `mock`, `No-Write`, `golden`, `reachability`, `filter`, `resample`, `drop`, `repair`, `promote`。

## 重要事实约束
用户口述中包含几个数字/判断：
- “连续近两个月几乎毫无长进”
- “退役了 247 条矛盾任务”
- “21 项跨字段不变式”
这些内容必须查证来源。若代码/文档无法找到明确来源，请在文档中写清楚：哪些是代码确认事实，哪些是项目复盘口述记忆，哪些当前仓库无法确认。不要把未查证记忆写成确定事实。

## 文档目标
这不是普通 API 说明，而是一篇技术事故复盘 + 工程机制沉淀专题。读完后要能完整回答面试题：
“项目里最严重的一次误判是什么？后来怎么证明原结论不成立？”

核心闭环：
RL 曲线长期无进展 → 初始误判模型/GRPO 失效 → 失败轨迹代码级回放 → 发现死题/伪可解任务 → 抽象成跨字段不变式 → 批量清洗与门禁 → 新数据集训练恢复 → 证明原结论不成立。

## 建议章节结构（可根据代码事实微调）
1. 导读：这次事故为什么值得单独成文。
2. 背景：为什么一开始看起来像“模型容量不足 / GRPO 失效”。说明曲线现象、合理怀疑、误判风险。
3. 证伪方法：为什么没有直接换大模型/改算法，而是做失败轨迹回放；回放时看哪些证据（Agent 可观测信息、SandboxResult、db_init_state、golden_final_state、reward breakdown）。
4. 死题类型详解：
   - 不可观测任务：golden 期待的决策条件没有出现在 Agent 可观测轨迹中（例如账户冻结/状态字段问题，以代码事实为准）。
   - 文本/metadata 与底层 mock/DB 不一致：任务描述说一套，handler 查到另一套（例如身份冒用/实名核验相关，必须查代码确认）。
   - Golden Chain 与 runtime state machine 不一致：expected action 可达性、precondition/postcondition 主体绑定错误、No-Write 违背。
   - 对比对污染：A/B pair 除目标边界外还改了其它变量，导致因果解释失效。
5. 21 项不变式体系如何分层。不要只罗列；按工程目的分类：观测可达性、数据库一致性、工具链可达性、业务终局一致性、No-Write 守恒、对比对隔离、DC-31/truth grounding 等。每类给 1 个具体 bad task → 后果 → invariant 如何发现 → 正确任务应满足什么。
6. 清洗/修复/退役机制：filter 失败后是 drop、repair、promote、resample 还是 retire？历史任务如何批量回扫？如果 247 无法确认，要明确说明。
7. 训练恢复与结论证伪：在同一模型/同一 GRPO 主流程下，主要变量变成“数据自洽性门禁”，曲线恢复才证明原先“模型/算法失效”结论不成立。若仓库有 handoff/实验日志，请引用；若没有，区分代码证据与口述复盘。
8. 工程 takeaways：
   - 合成数据的最大风险不是“脏文本”，而是“物理不可解”。
   - RL reward 再精细，也无法从死题里学习。
   - Invariant 是把一次人工排查固化成系统防线。
   - 评测闭环依赖任务自洽性：db_init_state、observable evidence、Golden Chain、Sandbox、Reward 必须一致。
9. 面试回答模板：最后给一版 2 分钟口述版，帮助用户直接回答 D3。

## 写作风格
- 像成熟工程师写技术博客/事故复盘：专业、清晰、有叙事，不使用黑话。
- 中文写作，代码标识符保留英文。
- 每个术语首次出现要解释。
- 可以用 mermaid 图、表格、代码片段；代码片段须标注文件路径。
- 不要和现有 Task Factory 文档重复过多；它讲机制全景，本篇讲事故诊断与 invariant 为什么诞生。
- 与现有文档做交叉引用：task-factory、sandbox、data-lifecycle。

完成后回复：文件路径 + 章节大纲 + 哪些关键数字已确认/未确认。