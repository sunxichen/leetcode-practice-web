你要为面试复习写一份专题笔记。读者是项目的原作者（你自己），时间跨度大、细节已遗忘，目标是通过这份文档重新建立对「Task Factory（任务工厂）」的完整 Big Picture，逻辑闭环、可直接用于面试复盘。

## 产出
写入新文件：.scratch/interview-deck/detail-notes/agentic-gov-task-factory.md（当前工作目录下）

## 代码调研范围（自己动手读，不要臆造）
- 项目代码在 /Users/sunxichen/Projects/agentic-gov
- 重点：src/agentic_gov/task_factory/ 全部模块（core.py、entrypoints.py、expression.py、id_card.py、opening_batch.py、reveal.py、invariants/、golden.py）
- 关联：src/agentic_gov/schemas/（CanonicalTask 等契约）、src/agentic_gov/task_loader.py、tests/ 中 task_factory 相关测试
- golden.py 中与任务生成联动的部分只需理解职责边界（Golden Chain 机制细节由另一篇文档负责，本文只需讲清衔接点）

## 必须涵盖的内容要点
1. Task Factory 的定位：输入是什么（种子、政策参数空间、用户画像等），输出是什么（CanonicalTask 的完整字段逐个解释）
2. 模块全景图：core / entrypoints / expression / id_card / opening_batch / reveal / invariants 各自的职责与协作顺序（建议 mermaid 图）
3. 一条任务从 seed 到可加载的完整合成流程，分阶段讲清每个阶段在解决什么问题
4. 不变式校验（invariants）：校验了哪些性质、为什么这能保证「任务可解且标答正确」
5. 与 Golden Chain / golden_final_state 的联动：任务生成时如何同步产出标答
6. 与 task_loader / build_sandbox 的 policy 版本硬校验如何衔接
7. 结尾：设计取舍总结（为什么这么设计，解决了什么工程问题）

## 写作风格（严格遵守）
- 像写技术博客一样：一位成熟工程师向其他工程师介绍自己的系统设计，专业、坦诚、有叙事感
- 可以使用专业技术用语保持准确性，但不要用小众黑话/内部暗语；每个术语第一次出现时解释清楚
- 中文写作，代码标识符保留英文
- 结构对齐同目录已有文档 .scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md 的风格：导读开头、编号章节、mermaid 图辅助、关键代码片段引用并标注文件路径
- 所有事实性陈述必须有代码依据，禁止编造字段名、函数名、数字

完成后回复：文件路径 + 章节大纲列表。
