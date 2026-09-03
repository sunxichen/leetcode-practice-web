# Follow-up #12: 上下文压缩提示词是否可自定义、怎么自定义（框架接口与基线落地）

---

## 1. 电梯答案

- **是否可自定义**：**完全可以自定义**。`deepagents 0.6.12` 的 `SummarizationMiddleware` 与工厂函数 `create_summarization_middleware` 均将 `summary_prompt` 作为显式入参暴露，开发者可直接传入任何包含 `{messages}` 占位符的自定义提示词字符串。
- **框架原生机制**：
  - 默认提示词定义于 `deepagents.middleware.summarization.DEEPAGENTS_DEFAULT_SUMMARY_PROMPT`，它在 LangChain 原生四段式结构（`SESSION INTENT`、`SUMMARY`、`ARTIFACTS`、`NEXT STEPS`）基础上注入了媒体引用保护说明（`<media_reference_information>`）；
  - `SummarizationMiddleware.__init__` 提供了 8 个真实可配置项（涵盖 `model`、`backend`、`trigger`、`keep`、`token_counter`、`summary_prompt`、`trim_tokens_to_summarize`、`truncate_args_settings`），支持从触发阈值、保留窗口到压缩提示词的全方位定制。
- **langAgent develop 基线现状**：**已自定义（实施了中文语义对齐与观测增强）**。
  - 项目在 `src/agent/long_task/chinese_deep_agent.py` 中定义了 `CHINESE_SUMMARY_PROMPT`，对会话意图、摘要、产物与下一步进行了严格的中文结构化对齐；
  - 在 Agent 启动时通过 `apply_chinese_patches()` 对框架进行热补丁替换，并经由 `create_observed_summarization_middleware()` 注入继承自原生中间件的 `ObservedDeepAgentsSummarizationMiddleware`，在执行中文压缩的同时通过 `adispatch_custom_event` 派发 `context.usage_updated` 可观测自定义事件（由 `context_compaction_events.build_usage_updated` 构造）。

---

## 2. 详解

### 2.1 deepagents 0.6.12 中 SummarizationMiddleware 的提示词机制与配置接口

在 `deepagents 0.6.12` 中，上下文自动压缩（Compaction / Summarization）由 `SummarizationMiddleware` 驱动。当消息历史的 Token 消耗达到设定阈值时，中间件截取较早的消息序列，调用底层 LLM 生成结构化摘要，并将完整历史转存至 Backend。

#### 1. 默认提示词定义位置与内容结构
- **定义位置**：`deepagents/middleware/summarization.py` 中的 `DEEPAGENTS_DEFAULT_SUMMARY_PROMPT`。
- **模板来源与构造**：
  ```python
  # deepagents/middleware/summarization.py (L113-L117)
  DEEPAGENTS_DEFAULT_SUMMARY_PROMPT = DEFAULT_SUMMARY_PROMPT.replace(
      "\n<messages>\n",
      f"\n{_MEDIA_REFERENCE_SUMMARY_PROMPT}\n\n<messages>\n",
      1,
  )
  ```
  它继承了 LangChain 原生的 `DEFAULT_SUMMARY_PROMPT`（位于 `langchain/agents/middleware/summarization.py` L33-L78），并在 `<messages>` 标签前插入了 DeepAgents 专属的 `<media_reference_information>` 说明，指示摘要模型保留 `<image url="/conversation_history/media/{hash}.png" />` 格式的媒体引用。
- **核心契约结构**：
  1. `<role>`: Context Extraction Assistant
  2. `<primary_objective>`: 提取最高质量/最相关的上下文信息。
  3. `<instructions>`: 规范四段式输出检查清单：
     - `## SESSION INTENT`（会话主目标与用户核心请求）
     - `## SUMMARY`（重要选择、结论、决策推理及被拒绝选项）
     - `## ARTIFACTS`（创建/修改/访问的文件或产物路径与变更概要）
     - `## NEXT STEPS`（达成目标仍需执行的具体后续任务）
  4. `<messages>`: 占位符区域，必须包含 `{messages}` 用于注入待摘要的消息文本。

#### 2. `SummarizationMiddleware.__init__` 真实入参与默认值清单

在 `deepagents/middleware/summarization.py`（L520-L532）中，`SummarizationMiddleware`（内部别名 `_DeepAgentsSummarizationMiddleware`）构造函数签名为：

```python
def __init__(
    self,
    model: str | BaseChatModel,
    *,
    backend: BACKEND_TYPES,
    trigger: ContextSize | TriggerClause | list[ContextSize | TriggerClause] | None = None,
    keep: ContextSize = ("messages", _DEFAULT_MESSAGES_TO_KEEP),  # _DEFAULT_MESSAGES_TO_KEEP = 20
    token_counter: TokenCounter = count_tokens_approximately,
    summary_prompt: str = DEEPAGENTS_DEFAULT_SUMMARY_PROMPT,
    trim_tokens_to_summarize: int | None = _DEFAULT_TRIM_TOKEN_LIMIT,  # _DEFAULT_TRIM_TOKEN_LIMIT = 4000
    truncate_args_settings: TruncateArgsSettings | None = None,
    **deprecated_kwargs: Any,
) -> None:
```

| 参数名 (Parameter) | 类型 (Type) | 默认值 (Default) | 职责说明 |
|---|---|---|---|
| `model` | `str \| BaseChatModel` | *(必须，无默认值)* | 执行摘要提取的目标语言模型实例或模型标识字符串。 |
| `backend` | `BACKEND_TYPES` | *(必须，关键字传参)* | 用于持久化转存被逐出历史消息的 Backend 实例（如 `FilesystemBackend`、`DaytonaSandbox`、`CompositeBackend`）。 |
| `trigger` | `ContextSize \| TriggerClause \| list[...] \| None` | `None` *(由 factory 自动推导)* | 触发压缩的阈值条件（支持 `("fraction", 0.85)`、`("tokens", 170000)`、`("messages", N)` 或组合字典）。 |
| `keep` | `ContextSize` | `("messages", 20)` | 压缩后保留在活跃上下文中的最近消息窗口（可指定消息数或比例）。 |
| `token_counter` | `TokenCounter` | `count_tokens_approximately` | 用于计算消息 Token 消耗的函数（默认基于字符比率快速估算）。 |
| `summary_prompt` | `str` | `DEEPAGENTS_DEFAULT_SUMMARY_PROMPT` | **用于指导模型提炼上下文的 Prompt 模板**（必须包含 `{messages}` 占位符）。 |
| `trim_tokens_to_summarize` | `int \| None` | `4000` (`_DEFAULT_TRIM_TOKEN_LIMIT`) | 喂给摘要模型生成总结时的最大输入 Token 上限截断。 |
| `truncate_args_settings` | `TruncateArgsSettings \| None` | `None` *（即禁用参数剪裁；只有经工厂函数 `create_summarization_middleware` 创建时才会注入按模型推导的默认值）* | 在触发全量压缩前，先对旧消息中过长工具参数（如 `write_file` 大内容）进行轻量剪裁的配置项。 |

#### 3. 便捷工厂函数 `create_summarization_middleware`
位于 `deepagents/middleware/summarization.py`（L1654-L1661）：
```python
def create_summarization_middleware(
    model: BaseChatModel,
    backend: BACKEND_TYPES,
    *,
    summary_prompt: str = DEEPAGENTS_DEFAULT_SUMMARY_PROMPT,
    trim_tokens_to_summarize: int | None = None,
    token_counter: TokenCounter = count_tokens_approximately,
) -> _DeepAgentsSummarizationMiddleware:
```
该函数自动通过 `compute_summarization_defaults(model)` 推导 `trigger`、`keep` 与 `truncate_args_settings`，同样直接暴露了 `summary_prompt` 供调用方覆盖。

---

### 2.2 langAgent develop 基线现状核验

#### 1. 现状判定：**已自定义（Customized via Chinese Patch & Observability Subclass）**
`langAgent develop` 基线并**没有**直接使用框架原生的英文 `DEEPAGENTS_DEFAULT_SUMMARY_PROMPT`，而是专门定制了中文提示词并集成了可观测事件。

#### 2. 自定义代码位置与内容摘要
- **提示词定义**：`src/agent/long_task/chinese_deep_agent.py`（L53-L108，常量 `CHINESE_SUMMARY_PROMPT`）。
- **内容摘要**：
  ```xml
  <role>
  上下文提取助手
  </role>
  <primary_objective>
  你的唯一目标是从以下对话历史中提取最高质量/最相关的上下文信息。
  </primary_objective>
  ...
  <instructions>
  请按以下章节结构组织摘要，每个章节作为检查清单——你必须填入相关信息，如果该章节没有内容可报告则明确写"无"：
  ## 会话意图
  ## 摘要
  ## 产物
  ## 下一步
  </instructions>
  ...
  <media_reference_information>
  对话历史中可能包含 XML 媒体引用标签，例如：
  <image url="/conversation_history/media/{hash}.png" />
  ...
  </media_reference_information>
  <messages>
  待摘要的消息：
  {messages}
  </messages>
  ```
- **挂载与注入路径**：
  1. `src/agent/long_task/factory.py` 在执行 `build_long_task_agent()` 时（L230），首行调用 `apply_chinese_patches()`；
  2. `apply_chinese_patches()`（`src/agent/long_task/chinese_deep_agent.py` L194-L245）执行全局注入：
     - 修改模块级默认常量：`_summarization.DEEPAGENTS_DEFAULT_SUMMARY_PROMPT = CHINESE_SUMMARY_PROMPT`
     - 修改构造函数默认值：`_set_kwdefault(_summarization.SummarizationMiddleware.__init__, "summary_prompt", CHINESE_SUMMARY_PROMPT)`
     - 替换中间件创建工厂：将 `_graph.create_summarization_middleware` 替换为 `_create_chinese_summarization_middleware`；
  3. 工厂函数在底层调用 `src/agent/long_task/observed_summarization_middleware.py` 中的 `create_observed_summarization_middleware()`（L284-L305），实例化 `ObservedDeepAgentsSummarizationMiddleware`（继承自 `SummarizationMiddleware`），并在调用模型前/后通过 `adispatch_custom_event` 广播 `context.usage_updated` 观测事件。

---

### 2.3 “如果要自定义”的最小示例（示例代码，非现状）

> **说明**：以下代码为演示如何在应用中自定义压缩提示词的**最小可用示例**，非本项目既有代码。

```python
"""
示例：在 DeepAgents / LangAgent 中自定义专属业务的上下文压缩提示词
"""
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain_openai import ChatOpenAI

# 1. 定义自定义压缩提示词模板（必须包含 {messages} 占位符）
CUSTOM_DEV_SUMMARY_PROMPT = """<role>
资深架构与代码审计助手
</role>

<instructions>
你正在压缩一段长程代码演进会话。请仔细阅读历史对话，重点提炼技术演进主线：

## 1. 需求与架构目标 (ARCHITECTURAL GOAL)
用户最初提出的业务诉求与系统架构变更目标。

## 2. 关键代码变更与决策 (KEY DECISIONS & DIFFS)
列出所有涉及修改的核心类、方法与配置文件路径，简述每个关键变更的动机。记录被否决的备选方案。

## 3. 当前运行状态与已知缺陷 (CURRENT STATUS & BUGS)
记录测试运行结果、当前遗留报错及尚未解决的边界缺陷。

## 4. 后续执行动作 (PENDING ACTIONS)
下一步必须紧接着执行的代码编写、编译或测试步骤。
</instructions>

<messages>
待压缩的开发会话记录：
{messages}
</messages>
"""

# 2. 构造后端与模型
backend = FilesystemBackend(root_dir="./workspace")
model = ChatOpenAI(model="gpt-4o")

# 3. 显式创建带有自定义提示词的 SummarizationMiddleware 实例
custom_summarization = SummarizationMiddleware(
    model=model,
    backend=backend,
    trigger=("tokens", 80000),      # 超过 80k tokens 触发
    keep=("messages", 10),           # 保留最近 10 条消息
    summary_prompt=CUSTOM_DEV_SUMMARY_PROMPT,  # 传入自定义提示词
    trim_tokens_to_summarize=4000,
)

# 4. 挂载到 Agent 中
# 注意：create_deep_agent 会使用传入的 custom_summarization 覆盖默认层
agent = create_deep_agent(
    model=model,
    backend=backend,
    middleware=[custom_summarization],
)
```

---

## 3. 证据清单

| 证据项 | 涉及组件 / 文件路径 | 对应行号 / 范围 | 关键事实 / 契约说明 |
|---|---|---|---|
| **EVD-F12-01** | `langchain/agents/middleware/summarization.py` | L33-L78 | LangChain 原生四段式 `DEFAULT_SUMMARY_PROMPT` 定义与契约格式。 |
| **EVD-F12-02** | `deepagents/middleware/summarization.py` | L100-L117 | `_MEDIA_REFERENCE_SUMMARY_PROMPT` 与 `DEEPAGENTS_DEFAULT_SUMMARY_PROMPT` 组合定义。 |
| **EVD-F12-03** | `deepagents/middleware/summarization.py` | L520-L631 | `SummarizationMiddleware.__init__` 声明 8 个真实可配置项（含 `summary_prompt` 默认值）。 |
| **EVD-F12-04** | `deepagents/middleware/summarization.py` | L1654-L1729 | `create_summarization_middleware` 工厂函数暴露 `summary_prompt` 并在内部推导模型 profile 默认配置。 |
| **EVD-F12-05** | `src/agent/long_task/chinese_deep_agent.py` | L53-L108 | `CHINESE_SUMMARY_PROMPT` 中文结构化压缩提示词完整实现。 |
| **EVD-F12-06** | `src/agent/long_task/chinese_deep_agent.py` | L166 起（摘要相关 patch 段 L194-L245） | `apply_chinese_patches()` 注入中文提示词并替换 `_create_chinese_summarization_middleware`。 |
| **EVD-F12-07** | `src/agent/long_task/observed_summarization_middleware.py` | L47-L100, L264-L305 | `ObservedDeepAgentsSummarizationMiddleware` 接收 `summary_prompt` 并派发 `context.usage_updated` 观测事件（L264-L265）。 |
| **EVD-F12-08** | `src/agent/long_task/factory.py` | L229-L231, L548-L558 | Long Task Agent 初始化时执行 `apply_chinese_patches()` 并由 `create_deep_agent` 装配中间件。 |
