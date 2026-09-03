# Ticket 31: follow-up #21 — 专题六增补"使用向 HITL 指南"（怎么用+实例）

Status: done

## 目标
用户反馈专题六太偏底层实现，真正需要的是"怎么用 LangGraph/deepagents 实现 HITL"。在 `detail-notes/06-hitl-and-ag-ui.md` **前部（§1 之后）插入一章"使用向指南"**（不删改已有底层章节，仅在新章末尾加一句"底层原理见后文章节"指引）：

## 要求
- 事实源：`.scratch/langagent-framework-sources`（langgraph 1.2.8、langchain 1.4.8、deepagents 0.6.12、ag_ui_langgraph 0.0.42）+ `.scratch/langagent-develop-reference`。
- 面向"我要给自己的 agent 加 HITL"的开发者，按场景组织：
  1. **最简用法**：LangGraph `interrupt()` 在节点内挂起 + `Command(resume=...)` 恢复的最小可运行骨架（真实 API 签名、checkpointer 是硬依赖）。
  2. **工具审批**：deepagents `HumanInTheLoopMiddleware` + `interrupt_on` 配置实例（approve/edit/reject/respond 四种决策各是什么意思、如何配置 allowed_decisions/description/when 谓词）。
  3. **结构化提问**：langAgent Ask User 模式作为"生产级 interrupt 用法"参考（稳定 ID、校验、前端契约）——简化为"他们怎么用 interrupt 实现结构化表单"的用法视角，不展开底层。
  4. **前端对接**：AG-UI 侧 interrupt 如何透出（on_interrupt CustomEvent）、前端提交 resume 的调用形态。
- 每个场景配完整代码实例（真实 API，import 路径正确，可对照源码核实）。
- 常见坑清单（无 checkpointer 报错、恢复时点重放语义、多 interrupt 顺序）。
- 纪律：API 签名逐一核实；不写 commit hash。

## 验收标准
1. 所有代码实例的 API 与锁定版本一致。
2. 新章节插入后全文结构连贯，底层章节保留。
