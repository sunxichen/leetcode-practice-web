你要为面试复习写一份专题笔记。读者是项目的原作者（你自己），时间跨度大、细节已遗忘，目标是通过这份文档重新建立对「四大 Task Type 业务规则设计」的完整 Big Picture，逻辑闭环、可直接用于面试复盘。

## 产出
写入新文件：.scratch/interview-deck/detail-notes/agentic-gov-task-types-business-rules.md（当前工作目录下）

## 代码调研范围（自己动手读，不要臆造）
- 项目代码在 /Users/sunxichen/Projects/agentic-gov
- 重点：src/agentic_gov/task_types/housing_fund/ 下四个事项文件（account_balance_query.py、withdrawal_for_rent.py、withdrawal_for_purchase.py、loan_repayment_query.py），以及 registry.py、runtime_bundle.py
- 关联：src/agentic_gov/schemas/（PolicyCard、ApiSpec、ExpectedAction 等）、src/agentic_gov/sandbox/（handler 如何被引擎调用）、src/agentic_gov/task_factory/golden.py 中各事项的 Golden Chain 定义

## 必须涵盖的内容要点
开篇先给全局对照表（4 个 task_type / policy_id / 难度 / 核心规则一句话），然后每个 task type 一节，统一结构：
1. 业务背景与真实政务场景映射（这个事项在现实中是什么）
2. required_slots 与追问策略（必须向群众收集什么）
3. 工具清单与调用时序约束（precondition 链：哪个工具解锁哪个工具）
4. 政策规则：限额区间、硬性规则、转人工条件（escalation_conditions）、必告知项（mandatory_disclosures）
5. 错误分支全表：该事项可能触发的每种业务错误码、触发条件、Agent 期望的应对行为
6. 流程变体（如 loan_repayment_query 的纯查询 vs 提前还款分支，runtime_bundle 如何裁剪）
7. 该事项在训练中考察 Agent 的什么能力

结尾独立一章：难度递进设计意图——为什么这四个事项构成 ⭐→⭐⭐⭐⭐ 的训练难度阶梯，各自引入了哪一类新挑战（只读/单写入/多要素复合主体/分支变体）。

## 写作风格（严格遵守）
- 像写技术博客一样：一位成熟工程师向其他工程师介绍自己的系统设计，专业、坦诚、有叙事感
- 可以使用专业技术用语保持准确性，但不要用小众黑话/内部暗语；每个术语第一次出现时解释清楚
- 中文写作，代码标识符保留英文
- 结构对齐同目录已有文档 .scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md 的风格：导读开头、编号章节、mermaid 图辅助、关键代码片段引用并标注文件路径
- 所有事实性陈述（限额数字、错误码、字段名）必须有代码依据，禁止编造

完成后回复：文件路径 + 章节大纲列表。
