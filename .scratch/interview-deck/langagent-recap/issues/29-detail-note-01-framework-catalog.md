# Ticket 29: follow-up #19 — 专题一增补框架学习向"内置 Callback/Middleware 全景"

Status: done

## 目标
用户读专题一的目的偏"学习 langgraph/deepagents 框架本身"，希望了解框架内置的、有重要价值的 callback、middleware 等扩展点。在 `detail-notes/01-handler-callback-middleware.md` **末尾增补一章**（不删改已有章节）：

## 要求
- 事实源：`.scratch/langagent-framework-sources` 锁定版本（langchain_core 1.4.8 / langgraph 1.2.8 / deepagents 0.6.12）。
- Callback 侧内置清单：逐个列出框架自带的 CallbackHandler 实现（如 LangChainTracer、StdOutCallbackHandler、FileCallbackHandler、ConsoleCallbackHandler、UsageMetadataCallbackHandler 等——以源码实际存在为准），每个一句话用途 + 真实路径行号 + 适用场景。
- Middleware 侧内置清单：langchain 1.x `langchain/agents/middleware/` 与 deepagents `deepagents/middleware/` 下全部内置中间件（Summarization、HumanInTheLoop、ToolCallLimit、ModelCallLimit、ToolRetry、ModelRetry、ToolSelection/LLMToolSelector、PII/Guardrails、ContextEditing、TodoList、Filesystem、SubAgent、AsyncSubAgent、PatchToolCalls 等——以源码实际为准），每个：解决什么问题、关键配置项、真实路径行号。
- 每个条目给"什么时候你会需要它"的学习向一句话。
- 明确标注哪些是 langAgent 项目已用/未用（与 develop 基线对照）。
- 纪律：类名逐一到源码核实；不确定的标"未核实"；不写 commit hash。

## 验收标准
1. 清单与锁定版本源码一致，无虚构类。
2. 新增章节与已有章节体例一致。
