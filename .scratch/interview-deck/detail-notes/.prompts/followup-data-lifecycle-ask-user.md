你要继续修订数据生命周期专题文档，补充用户的新 follow-up 疑问：Agent 如何决定 Ask_User，sandbox 是否给 Ask_User 信号，以及 Ask_User 在 SFT/RL 数据形态中的流转。

## 目标文件
/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-data-lifecycle-sft-rl.md

## 代码调研范围
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/runtime/**（action parser、episode runner、simulator/user interaction、terminal/action types）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/synthesis/**（teacher trajectories 中 Ask_User 如何生成/验证）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/verifier/**（format parser、funnel、RPCR/reveal policy 对 Ask_User 的约束）
- /Users/sunxichen/Projects/agentic-gov/phase2/**、phase3/**（ShareGPT 转换里 Ask_User 如何保留为 assistant 内容）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_factory/reveal.py 和 opening/reveal policy 相关逻辑
- 相关 tests

## 必须回答的用户问题
1. Agent 是如何决定 Ask_User 的？请明确：它不是 sandbox 主动发出的 imperative signal，而是模型 policy 根据 system prompt、PolicyCard.required_slots、当前对话历史、工具 observation、缺失槽位、错误反馈等自己生成 `Ask_User` 动作（以代码实际 action 协议为准）。
2. Ask_User 在 runtime 中如何处理？parser 如何识别？episode runner 如何把 assistant 的问题发给 user simulator/真实用户？user simulator 又如何根据 reveal_policy 决定透露哪些 slot？
3. Ask_User 与工具调用的区别：Ask_User 不进入 sandbox.execute，不调用 handler，不修改 db/runtime_flags；它改变的是对话状态和可观测信息。请用代码事实确认。
4. 在 SFT ShareGPT 样本里，Ask_User 是 assistant 消息内容的一部分；在 RL rollout 中，它是模型输出的 action 类型之一。loss/reward 如何间接约束它？比如问对必要 slot、少问废话、避免用户不该提前透露。

## 写作位置建议
在 Data Lifecycle 文档的 RL rollout 章节中新增或扩写小节：
“Ask_User 不是沙盒信号，而是 Agent 的信息获取动作”。
同时在 ShareGPT 示例附近注明 Ask_User 如何体现在 assistant content 中。

## 写作风格
- 技术博客风格，成熟工程师向工程师解释，专业但不用黑话。
- 先给结论，再给 SFT/RL 两条链路中的数据形态，最后给一个 mini episode 例子。
- 所有字段名、action type、函数名必须以代码为准；不确定处明确说明。

完成后回复：修改章节位置 + 新增内容摘要。