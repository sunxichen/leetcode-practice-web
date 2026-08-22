你要继续修订沙盒专题文档，补充用户的新 follow-up 疑问：RL rollout 过程中，Agent 输出如何被沙箱执行、异常状态码如何产生，以及为什么不依赖 ExpectedAction 顺序。

## 目标文件
/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-sandbox-architecture.md

## 代码调研范围
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/runtime/**（尤其 agent action parsing、episode runner、tool execution、terminal handling）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/sandbox/**（Sandbox.execute、Database、RuntimeFlags、error injection 如有）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_types/housing_fund/**（handlers 如何返回业务错误码）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/schemas/**（SandboxResult、SandboxError、Action/Terminal schema 如有）
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/task_factory/golden.py（只用于对比 ExpectedAction 的职责边界）
- 相关 tests

## 必须回答的用户问题
1. 目前已知 golden final state 是通过执行 ExpectedAction 得到的。但在 RL rollout + reward 计算中，沙箱是怎么根据 Agent 输出来执行的？是否调用对应 handler？完整链路是什么：Agent text/XML/JSON → parser → runtime action → sandbox.execute(tool_name,args) → ApiSpec/RuntimeFlags/handler → SandboxResult → observation。
2. 对非 Happy Path，沙盒如何“知道”该不该抛异常、抛什么异常？请明确区分：
   - 8 步管线前置错误（unknown tool / tool not allowed / missing arg / invalid format / precondition not met）
   - handler 内部业务错误（账户冻结、身份冒用、合同不存在、余额不足等）
   - 初始任务状态 db_init_state / policy_params / metadata 如何决定 handler 分支
   - 是否存在故障注入/临时异常模拟机制；如果有，在哪里配置、何时触发；如果没有，明确写没有找到。
3. Agent rollout 的工具顺序不一定按 ExpectedAction 顺序来，沙盒为什么仍能返回“想要的状态码”？请讲清：ExpectedAction 是 golden 预演脚本，不是 online rollout 的逐步裁判；online sandbox 只根据当前真实状态（db + runtime_flags + api_specs + policy_card + handler 逻辑）响应每一次调用。乱序调用会得到 PRECONDITION_NOT_MET 等状态；业务条件满足/不满足由数据库事实决定。

## 写作位置建议
在现有 §11 端到端走查之后或 §9/§10 附近新增一个小节：
“RL Rollout 中沙箱如何实时响应 Agent：异常不是脚本化播放，而是由状态机与业务 Handler 派生”。

## 写作风格
- 技术博客风格，成熟工程师向工程师解释，专业但不用黑话。
- 先结论，后链路，最后用 2 个具体例子：Happy Path submit 成功 vs 非 Happy Path submit 返回业务错误/前置错误。
- 所有函数名/字段名/错误码必须以代码为准；不确定处明确说明。

完成后回复：修改章节位置 + 新增内容摘要。