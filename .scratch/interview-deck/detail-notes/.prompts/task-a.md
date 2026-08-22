你要修订一份已有的面试复习笔记。读者是项目的原作者（你自己），时间跨度大、细节已遗忘。这份文档目前的问题是：只讲了沙盒引擎内部机制，没有形成「Agent 输出 → 沙盒执行 → 终态判定 → 奖励」的闭环。

## 修订对象（直接编辑这个文件，用绝对路径）
/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md

## 代码调研范围（自己动手读，不要臆造）
- 项目代码在 /Users/sunxichen/Projects/agentic-gov
- 重点：src/agentic_gov/sandbox/、src/agentic_gov/task_factory/golden.py、src/agentic_gov/runtime/（episode 循环与 terminal action 处理）、src/agentic_gov/reward/、src/agentic_gov/task_types/housing_fund/loan_repayment_query.py、src/agentic_gov/schemas/
- 可参考同目录另外三篇已完成文档（了解边界，避免重复展开）：agentic-gov-task-factory.md、agentic-gov-task-types-business-rules.md、agentic-gov-data-lifecycle-sft-rl.md

## 修订内容（5 项，保持原文档结构与风格，只做追加和局部扩写，不要重写全文）
1. 【§3.2 开头追加一段明确结论】当前系统共构建 4 个 task type、4 张 PolicyCard，一一强绑定；说明 TaskTypeRegistry 单例注册、未来扩展新领域事项的方式。
2. 【§6 确定性 ID 生成器小节扩写】补清楚业务含义：RL 中同一 task_id 会被 rollout 多次，Agent 探索过程中有大量无效/失败调用，golden_final_state 里的业务单号必须在这种前提下依然可复现、可比对——确定性 ID 是「终态比对（Outcome Verification）」能成立的前提条件。讲清「只在真实写入时消费计数器」为什么是关键设计。
3. 【§8 Golden Chain 扩写】补充：Golden Chain 由谁、在何时生成（task_factory/golden.py 在任务合成阶段）；链条如何根据 task_type + 边界属性被选择；执行中断言失败意味着什么（任务合成缺陷，而非 Agent 错误）；与 reward 模块的衔接关系。机制细节适度即可，与 task-factory 文档交叉引用而非重复。
4. 【新增小节，放 §9 之前】终态动作在 Agent 行为上的体现：Agent 侧的 Finish / Escalate / Refusal 到底以什么形式输出（工具调用还是特定消息格式，以代码为准）、沙盒/评测层如何识别 terminal action、与 Golden Chain 伪终局动作（ESCALATE / FINISH_WITH_REFUSAL）的对应关系。
5. 【新增一章，放总结之前】端到端走查：以最复杂任务 loan_repayment_query（提前还款分支）为例，逐轮展示一个 episode 中 Agent 与沙盒的完整数据交互——每一轮：Agent 输出什么（工具调用 JSON / 自然语言）、8 步管线如何处理、SandboxResult 返回什么、观察如何回填给 Agent，直到 terminal action 与奖励结算。这一章是整篇文档的「闭环演示」，要让读者看完能把前面所有机制串起来。

同时在文档开头的导读中补充一句：本文与 task-factory / task-types-business-rules / data-lifecycle 三篇专题文档构成系列，各管一面。

## 写作风格（严格遵守）
- 像写技术博客一样：一位成熟工程师向其他工程师介绍自己的系统设计，专业、坦诚、有叙事感
- 可以使用专业技术用语保持准确性，但不要用小众黑话/内部暗语；每个术语第一次出现时解释清楚
- 中文写作，代码标识符保留英文；沿用原文档的 mermaid 图、代码片段带路径标注的风格
- 所有事实性陈述必须有代码依据，禁止编造字段名、函数名、数字

完成后回复：修改了哪些章节 + 新增章节标题列表。
