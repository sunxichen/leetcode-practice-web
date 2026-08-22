你要为面试复习写一份专题笔记。读者是项目的原作者（你自己），时间跨度大、细节已遗忘，目标是通过这份文档重新建立对「一条数据从合成到喂进模型训练的完整旅程（SFT 与 RL 两条支路）」的完整 Big Picture，逻辑闭环、可直接用于面试复盘。

## 产出
写入新文件：.scratch/interview-deck/detail-notes/agentic-gov-data-lifecycle-sft-rl.md（当前工作目录下）

## 代码调研范围（自己动手读，不要臆造）
- 项目代码在 /Users/sunxichen/Projects/agentic-gov
- SFT 支路：phase3/（datasets、scripts、llamafactory 配置）、src/agentic_gov/synthesis/、phase2/prompt_templates、phase3 相关 handoff（handoff/handoff-phase2-to-phase3-20260601.md）
- RL 支路：src/agentic_gov/runtime/、src/agentic_gov/reward/、src/agentic_gov/sampler/、src/agentic_gov/task_loader.py、phase6 相关 handoff（尤其 handoff-phase6-grpo-*）
- 契约基础：src/agentic_gov/schemas/、src/agentic_gov/sandbox/

## 必须涵盖的内容要点
1. 总览：一张图讲清 CanonicalTask → SFT 样本 / RL rollout 两条支路的分叉与汇合
2. SFT 支路：
   - SFT 对话样本如何构造（轨迹来源、正样本如何生成、是否含错误恢复示范）
   - **重点**：一条样本经过 chat template 模板化之后的完整样貌——system prompt 里 PolicyCard 如何渲染、工具定义如何注入、多轮 user/assistant/tool 消息各自长什么样、loss mask 打在哪些 token 上。请给出基于真实代码/模板还原的完整示例
3. RL 支路：
   - rollout episode 循环：reset → policy 生成 → sandbox execute → 观察回填 → … → terminal action → reward 结算，逐步讲清每一步的数据形态
   - GRPO 分组采样方式与奖励构成（R_complete、效率惩罚、hard violation 归零门、terminal action 门控）
4. SFT 与 RL 的关系：为什么 SFT 之后还要 RL（稀有动作梯度、探索与自愈纠错能力），两者数据分布差异
5. Agent 的终态动作（Finish / Escalate / Refusal）在输出上如何表达、评测层如何识别
6. 结尾：整条链路的设计哲学总结

注意：沙盒引擎内部机制（8 步管线、RuntimeFlags 等）由另一篇文档负责，本文只在 episode 交互处做简要回扣并注明交叉引用，不要展开重写。

## 写作风格（严格遵守）
- 像写技术博客一样：一位成熟工程师向其他工程师介绍自己的系统设计，专业、坦诚、有叙事感
- 可以使用专业技术用语保持准确性，但不要用小众黑话/内部暗语；每个术语第一次出现时解释清楚
- 中文写作，代码标识符保留英文
- 结构对齐同目录已有文档 .scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md 的风格：导读开头、编号章节、mermaid 图辅助、关键代码片段引用并标注文件路径
- 所有事实性陈述必须有代码/配置/handoff 文档依据，禁止编造；chat template 示例必须基于真实模板还原

完成后回复：文件路径 + 章节大纲列表。
