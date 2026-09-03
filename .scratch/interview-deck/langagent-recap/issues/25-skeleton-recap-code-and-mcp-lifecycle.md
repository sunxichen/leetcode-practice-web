# 编写 skeleton 级极简白板代码与 MCP 工具全链路

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #4 #17

## What to build

新建 recap-code/skeleton/（现有 core/ 与 evolution/ 保持只读不动）：

- 一套真正 skeleton 级的极简白板代码：每个主题只保留可默写的骨架（真实类名/函数名 + 核心控制流 + 一行注释级机制说明），砍掉次要分支，目标是 15 分钟内能默写主干。
- mcp_tool_lifecycle.py：MCP 工具从被接收到注册为工具、到执行、到结果回传参与 agent loop 的全链路（follow-up #4）。

## Acceptance criteria

- [ ] 类名/函数名与 develop 基线或框架真实一致，设计态标成熟度。
- [ ] 全部通过 AST 编译；无 Fake/Mock；无 __pycache__。
- [ ] 每个文件标注"必须能默写 / 需要能解释 / 追问时展开"。
- [ ] skeleton 与 core/evolution 的关系在每个文件头部注释说明（skeleton 是记忆骨架，core 是完整机制参照）。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
