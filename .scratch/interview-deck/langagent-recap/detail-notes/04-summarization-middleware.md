# 专题四：deepagents SummarizationMiddleware 机制详解

> **文档定位**：本文档针对 `deepagents 0.6.12` 中的核心上下文压缩组件 `SummarizationMiddleware` 进行源码级深度剖析，并系统解构 `langAgent` 在长程多轮 Agent 场景下的继承观测方案（`ObservedDeepAgentsSummarizationMiddleware`）与中文热补丁优化。全面解构从 Token 估算、触发与保留策略、AI/Tool 消息对保护、多媒体消息外化转存、非侵入式 `Command` 状态投影，到 LangGraph Checkpoint 持久化和端到端执行 Trace 的完整技术实现。

---

## 1. 核心架构全景与三层状态设计

在长生命周期、复杂工具调用的 Agent 执行过程中，上下文窗口膨胀（Context Bloat）是导致模型推理失败、延迟激增与成本失控的核心诱因。`deepagents 0.6.12` 的 `SummarizationMiddleware` 彻底革新了传统 LangChain 原生的破坏性清空策略，构建了**内存窗口投影、图状态检查点、外部后端归档**三层解耦的状态模型。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      SummarizationMiddleware 三层状态与交互全景图                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [1. 上下文投影层 (Context Window / Effective Messages)]                                │
│    • 由 _get_effective_messages 动态拼装: [summary_message, *messages[cutoff_index:]]   │
│    • 仅作为当前轮次 LLM 推理的输入载荷，不破坏底层原始消息记录                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [2. 图状态检查点层 (Graph State & Checkpointer)]                                       │
│    • state["messages"]: 完整的、只追加的原始对话历史 (Append-Only Message History)       │
│    • state["_summarization_event"]: 记录最近一次压缩事件 (cutoff_index, summary_message)  │
│    • 通过 ExtendedModelResponse.command = Command(update={...}) 持久化到 Checkpointer  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [3. 外部后端归档层 (Backend Offload Storage)]                                          │
│    • 淘汰消息转存至 Markdown: /conversation_history/{thread_id}.md                      │
│    • 内联 Base64/Data 多媒体提取至: /conversation_history/media/{sha256[:16]}.{ext}    │
│    • 允许 Agent 后续按需调用 read_file 调阅历史全量细节                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 核心组件与职责划分

| 组件 / 类名 | 源码定位 | 核心职责 |
|---|---|---|
| `SummarizationMiddleware` (`_DeepAgentsSummarizationMiddleware`) | [`deepagents/middleware/summarization.py#L500-L1647`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L500-L1647) | 框架原生核心中间件。实现 `wrap_model_call` / `awrap_model_call`，拦截模型请求、裁剪工具参数、转存历史至后端、调用摘要模型并返回携带 `_summarization_event` 的 `Command`。 |
| `SummarizationToolMiddleware` | [`deepagents/middleware/summarization.py#L1822-L2191`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1822-L2191) | 框架原生主动压缩工具层。暴露 `compact_conversation` 结构化工具，配合约 50% 预算的资格门禁（Eligibility Gate），供模型或人工审批在合适阶段主动触发压缩。 |
| `ObservedDeepAgentsSummarizationMiddleware` | [`src/agent/long_task/observed_summarization_middleware.py#L47-L281`](file:///.scratch/langagent-develop-reference/src/agent/long_task/observed_summarization_middleware.py#L47-L281) | `langAgent` 自建继承扩展。在同层拦截真实 `Command` 状态更新，增加 6 条消息防抖门禁，基于 `ContextVar` 隔离并发观测，向前端发射 `context.usage_updated` 自定义事件。 |
| `ConversationHistoryBackend` | [`src/agent/long_task/conversation_history_backend.py#L67-L360`](file:///.scratch/langagent-develop-reference/src/agent/long_task/conversation_history_backend.py#L67-L360) | `langAgent` 自建后端协议实现。将 `/conversation_history/` 路径路由到底层 OSS 与后端 Context File API，承接转存的 Markdown 与媒体文件。 |

---

## 2. 触发与 Token 估算机制深度剖析

### 2.1 Token 计数体系：`count_tokens_approximately`

在实际工程中，在每次模型调用前通过网络调用分词器 API（如 OpenAI `tiktoken` 或 Anthropic Tokenizer）存在极高的延迟开销。`deepagents` 默认采用 `langchain_core.messages.utils.count_tokens_approximately` 算法进行毫秒级本地估算。

- **源码定义**：[`langchain_core/messages/utils.py#L2239-L2355`](file:///.scratch/langagent-framework-sources/langchain_core/messages/utils.py#L2239-L2355)
- **函数签名**：
  ```python
  def count_tokens_approximately(
      messages: Iterable[MessageLikeRepresentation],
      *,
      chars_per_token: float = 4.0,
      extra_tokens_per_message: float = 3.0,
      count_name: bool = True,
      tokens_per_image: int = 85,
      use_usage_metadata_scaling: bool = False,
      tools: list[BaseTool | dict[str, Any]] | None = None,
  ) -> int
  ```

#### 核心估算原理与关键参数

1. **字符/Token 比率 (`chars_per_token`)**：
   - 默认比率为 `4.0`（常见英文文本约 4 个字符对应 1 个 Token）。
   - **模型专属调优**：在 [`langchain/agents/middleware/summarization.py#L208-L216`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L208-L216) 的 `_get_approximate_token_counter` 中，若模型类型以 `anthropic-chat` 开头，会自动调优为 `chars_per_token=3.3`（基于 Claude 官方 Token 计数 API 的离线拟合结果）。
2. **消息边界开销 (`extra_tokens_per_message=3.0`)**：
   - 对应每个 Chat 消息头尾的特殊控制字符（如 `<|im_start|>role\n` 与 `<|im_end|>`）。
3. **多模态视觉惩罚 (`tokens_per_image=85`)**：
   - 当消息中包含图像 Block（`type in {"image", "image_url"}`）时，**绝不直接计算 Base64 字符串的字符数**（否则数万字符会导致估算暴增），而是按固定 85 Tokens 的低分辨率图像惩罚计入（[`utils.py#L2326-L2327`](file:///.scratch/langagent-framework-sources/langchain_core/messages/utils.py#L2326-L2327)）。
4. **工具 Schema 序列化开销 (`tools`)**：
   - 若传入 `tools` 列表，会将工具定义转换为 OpenAI Function/Tool JSON 格式，计算 `json.dumps(tool_dict)` 字符数并折算为 Token 计入总量（[`utils.py#L2304-L2309`](file:///.scratch/langagent-framework-sources/langchain_core/messages/utils.py#L2304-L2309)）。
   - `SummarizationMiddleware.__init__` 在初始化时通过 `_token_counter_accepts_tools`（[`summarization.py#L226-L258`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L226-L258)）利用 `inspect.signature` 预先探测计数器是否支持 `tools` 参数，避免运行时反复反射的性能损耗。
5. **动态校准机制 (`use_usage_metadata_scaling`)**：
   - 当开启且消息历史中存在携带 `AIMessage.usage_metadata["total_tokens"]` 的前序输出时，计算最新 AI 消息的实际 Token 与前序估算 Token 的比率作为缩放因子（Scaling Factor），校准后续消息的估算值。
6. **近似误差特征**：
   - 该计数器为字符比率近似（无官方误差区间数据，量级仅供直觉参考）；在中文及代码混合场景下，由于汉字在多数分词器中占用 1~2 Tokens（即 1~2 字符/Token），默认 4.0 的比率会**显著低估（Underestimate）**实际 Token 消耗。因此，必须依赖安全边际（Safety Margin）和模型真实返回的 Usage 双重保障。

---

### 2.2 阈值推导与配置类型体系

#### 1. `compute_summarization_defaults` 默认值推导规则

框架通过 `compute_summarization_defaults(model)` 函数基于模型 Profile 自动推导最佳默认参数：

- **源码定位**：[`deepagents/middleware/summarization.py#L261-L298`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L261-L298)
- **推导逻辑**：
  ```python
  def compute_summarization_defaults(model: BaseChatModel) -> SummarizationDefaults:
      has_profile = (
          model.profile is not None
          and isinstance(model.profile, dict)
          and "max_input_tokens" in model.profile
          and isinstance(model.profile["max_input_tokens"], int)
      )
      if has_profile:
          return {
              "trigger": ("fraction", 0.85),
              "keep": ("fraction", 0.10),
              "truncate_args_settings": {
                  "trigger": ("fraction", 0.85),
                  "keep": ("fraction", 0.10),
              },
          }
      return {
          "trigger": ("tokens", 170000),
          "keep": ("messages", 6),
          "truncate_args_settings": {
              "trigger": ("messages", 20),
              "keep": ("messages", 20),
          },
      }
  ```

#### 2. 类型定义与组合语义 (`ContextSize` vs `TriggerClause`)

在 [`langchain/agents/middleware/summarization.py#L112-L206`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L112-L206) 中定义了严格的类型体系：

- **元组单值形式 (`ContextSize`)**：
  - `("fraction", float)`：占模型 `max_input_tokens` 的比例（如 `("fraction", 0.85)`）。
  - `("tokens", int)`：绝对 Token 数量（如 `("tokens", 170000)`）。
  - `("messages", int)`：绝对消息条数（如 `("messages", 20)`）。
- **字典 AND 组合形式 (`TriggerClause`)**：
  - `{"tokens": 4000, "messages": 10}`：表示当前会话**必须同时满足** Token 数 $\ge 4000$ **且** 消息数 $\ge 10$ 时才触发。
- **列表 OR 组合形式 (`list[ContextSize | TriggerClause]`)**：
  - `[{"tokens": 5000, "messages": 3}, ("fraction", 0.85)]`：列表中任意一项条件满足即可触发压缩。

---

### 2.3 真实判定流程：`_should_summarize` 的双通道校验

在 [`langchain/agents/middleware/summarization.py#L583-L623`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L583-L623) 中，`_should_summarize` 实现了估算值与服务端真实 Usage 的**双通道触发（Dual-Channel Trigger）**：

```python
def _should_summarize(self, messages: list[AnyMessage], total_tokens: int) -> bool:
    if not self._trigger_clauses:
        return False

    for clause in self._trigger_clauses:
        clause_met = True
        for kind, value in clause.items():
            if kind == "messages" and len(messages) < cast("int", value):
                clause_met = False
                break
            if kind == "tokens":
                threshold_tokens = cast("int", value)
                # 双通道: 本地估算 total_tokens 达标 OR 上一次模型响应中携带的 reported_tokens 达标
                if (
                    total_tokens < threshold_tokens
                    and not self._should_summarize_based_on_reported_tokens(
                        messages, float(threshold_tokens)
                    )
                ):
                    clause_met = False
                    break
            if kind == "fraction":
                max_input_tokens = self._get_profile_limits()
                if max_input_tokens is None:
                    clause_met = False
                    break
                threshold = int(max_input_tokens * cast("float", value))
                if threshold <= 0:
                    threshold = 1
                if (
                    total_tokens < threshold
                    and not self._should_summarize_based_on_reported_tokens(
                        messages, float(threshold)
                    )
                ):
                    clause_met = False
                    break
        if clause_met:
            return True
    return False
```

- **服务端上报校验 (`_should_summarize_based_on_reported_tokens`, L561-L581)**：
  从后向前检索最新一条 `AIMessage`，提取其 `usage_metadata.get("total_tokens")`，并通过 `_provider_matches` 校验 `response_metadata["model_provider"]` 与当前模型提供商一致性。若厂商实际计费 Token 已超过阈值，即使本地近似估算因中文偏差尚未达到，也会精准触发压缩。

---

## 3. 执行机制与核心调用链

### 3.1 核心调用链路全景

在异步执行环境中，`SummarizationMiddleware.awrap_model_call` 构成了 Agent 与底层模型调用之间的主要屏障：

```
[ 模型调用发起: awrap_model_call(request, handler) ]
  │
  ├─► 1. 投影历史: _get_effective_messages(request)
  │      └─► _apply_event_to_messages: [summary_message, *messages[cutoff_index:]]
  │
  ├─► 2. 首轮 Token 估算: _count_tokens(effective_messages, system_message, tools)
  │
  ├─► 3. 预压缩参数剪裁: _truncate_args(effective_messages, total_tokens)
  │      └─► 若触发，重写较早 AIMessage.tool_calls 中的超长参数 (如 write_file 字符串)
  │
  ├─► 4. 判定是否压缩: _should_summarize(truncated_messages, total_tokens)
  │      ├─► [无需压缩] ──► 尝试执行 handler(request.override(messages=truncated_messages))
  │      │                   └─► 若抛出 ContextOverflowError ──► 捕获并进入压缩降级分支
  │      └─► [需要压缩] ──► 继续向下执行压缩流程
  │
  ├─► 5. 计算截断点: cutoff_index = _determine_cutoff_index(truncated_messages)
  │      ├─► 二分查找目标 Token 边界 (_find_token_based_cutoff)
  │      └─► 消息安全回退调整 (_find_safe_cutoff_point, 保护 AI/Tool 消息对)
  │
  ├─► 6. 消息物理切分: _partition_messages(truncated_messages, cutoff_index)
  │      ├─► messages_to_summarize = messages[:cutoff_index]
  │      └─► preserved_messages    = messages[cutoff_index:]
  │
  ├─► 7. 多媒体外化: await _aoffload_inline_media(backend, messages_to_summarize)
  │      └─► Base64 图片上传至 /conversation_history/media/{hash}.{ext}，替换为 XML 标签
  │
  ├─► 8. 并发转存与摘要生成: await asyncio.gather(
  │          _aoffload_to_backend(backend, offloaded_media_messages),
  │          _acreate_summary(offloaded_media_messages)
  │      )
  │      ├─► 追加写入 Markdown: /conversation_history/{thread_id}.md
  │      └─► 截断并在独立 LLM 生成四段式摘要: self.model.ainvoke(summary_prompt)
  │
  ├─► 9. 构造摘要消息: _build_new_messages_with_path(summary, file_path)
  │      └─► HumanMessage(content=..., additional_kwargs={"lc_source": "summarization"})
  │
  ├─► 10. 计算绝对状态偏移: state_cutoff_index = _compute_state_cutoff(previous_event, cutoff_index)
  │
  ├─► 11. 执行内层模型调用: await handler(request.override(messages=[*new_messages, *preserved_messages]))
  │
  └─► 12. 封装返回: ExtendedModelResponse(
              model_response=response,
              command=Command(update={"_summarization_event": new_event})
          )
```

---

### 3.2 预压缩轻量优化：`_truncate_args`

为了避免频繁调用昂贵且耗时的摘要模型，`deepagents` 引入了前置的工具参数剪裁机制：

- **源码定位**：[`deepagents/middleware/summarization.py#L965-L991, L1033-L1088`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L965-L991)
- **核心逻辑**：
  在触发全量摘要前，检查是否满足 `_truncate_args_trigger`。若满足，计算出保活窗口 `_determine_truncate_cutoff_index`。对保活窗口**之前**的历史 `AIMessage`，遍历其 `tool_calls`（主要是 `write_file`、`edit_file` 等可能包含几万行代码的参数）。若参数值字符串长度大于 `max_length`（默认 2000 字符），则将其截断为：
  ```python
  truncated_args[key] = value[:20] + "...(argument truncated)"
  ```
  这一轻量操作往往能瞬间回收数万 Tokens，使得 `_should_summarize` 重新变为 `False`，从而完全免去全量摘要调用。

---

### 3.3 截断点选择与 AI/Tool 消息对保护

在多轮工具调用型 Agent 中，若粗暴地按固定条数截断，极易将 `AIMessage(tool_calls=[...])` 与紧随其后的 `ToolMessage(tool_call_id=...)` 强行拆散在截断点两侧。这会导致发送给模型的消息列表中出现**孤立的 ToolMessage**（缺少上文 ToolCall）或**未响应的 ToolCall**，直接引发 OpenAI / Anthropic API 的 `400 Bad Request` 报错。

#### 保护算法：`_find_safe_cutoff_point`
- **源码定位**：[`langchain/agents/middleware/summarization.py#L763-L797`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L763-L797)
- **执行规则**：
  1. 检查 `messages[cutoff_index]` 是否为 `ToolMessage`。
  2. 若是，向后扫描连续的 `ToolMessage` 集合，收集所有待匹配的 `tool_call_ids`。
  3. 从 `cutoff_index - 1` **向前逆向回溯查找**，定位发出这些 `tool_calls` 的源头 `AIMessage`。
  4. 将截断点 `cutoff_index` **向前移动至该 `AIMessage` 所在位置**，确保整组“AI 发起调用 + 所有 Tool 响应消息”被完整归入同一侧（统一保留在上下文，或统一划入待摘要分区）。
  5. 若极端情况下未找到匹配的 `AIMessage`，则作为降级策略向后推进跳过这些 `ToolMessage`。

```
[ 消息序列示例与截断点调整 ]
Index:   0       1                2            3            4            5
Msg:   User ──► AI(call_id=A) ──► Tool(id=A) ──► User ──► AI(call_id=B) ──► Tool(id=B)
                        ▲               ▲
                        │               └─ 初始计算 cutoff_index = 2 (命中 ToolMessage)
                        └─ 回溯修正 cutoff_index = 1 (将 AI 与 Tool 整体保留或划出)
```

---

### 3.4 摘要消息生成流水线与 Token 截断

当确定切分出 `messages_to_summarize` 后，中间件通过 `_acreate_summary`（[`deepagents/middleware/summarization.py#L667-L670`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L667-L670) 委托至 [`langchain/agents/middleware/summarization.py#L824-L849`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L824-L849)）执行生成：

1. **输入消息安全截断 (`_trim_messages_for_summary`, L850-L869)**：
   为防止待摘要的消息本身过长直接撑爆摘要模型的上下文，调用 `langchain_core.messages.utils.trim_messages`：
   ```python
   trim_messages(
       messages,
       max_tokens=self.trim_tokens_to_summarize,  # 默认 4000 tokens
       token_counter=self.token_counter,
       start_on="human",
       strategy="last",
       allow_partial=True,
       include_system=True,
   )
   ```
   若裁剪逻辑出现未知异常，自动降级为保留末尾 15 条消息（`_DEFAULT_FALLBACK_MESSAGE_COUNT = 15`）。
2. **XML 格式化 (`get_buffer_string(format="xml")`)**：
   待摘要消息被序列化为结构化 XML 字符串，既保留了角色标签与多媒体 URL 引用，又剥离了冗余的对象元数据。
3. **独立模型调用 (`self.model.ainvoke`)**：
   将格式化后的消息填入 `summary_prompt.format(messages=formatted_messages)`，调用模型生成纯文本摘要。该请求注入了 `config={"metadata": {"lc_source": "summarization"}}`，便于链路追踪与计费隔离。

---

## 4. 状态与恢复：Command 更新与 Checkpoint 持久化

### 4.1 核心范式演进：非侵入式 Command 机制

理解 `deepagents 0.6.12` 与传统框架的区别，核心在于理解**消息状态的持久化契约**：

```
[ 传统 LangChain LCSummarizationMiddleware.before_model ]
  • 返回: {"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES), summary_msg, *preserved_msgs]}
  • 结果: 永久擦除 Checkpoint 中的历史消息列表！无法回溯、无法重放、无法审计。

[ deepagents SummarizationMiddleware.wrap_model_call ]
  • 消息列表: state["messages"] 保持 Append-Only 原封不动。
  • 返回: ExtendedModelResponse(command=Command(update={"_summarization_event": new_event}))
  • 结果: Checkpointer 完整保存全量历史，通过 _summarization_event 实现只读投影。
```

`SummarizationState` 在 [`deepagents/middleware/summarization.py#L203-L211`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L203-L211) 中声明：
```python
class SummarizationState(AgentState):
    _summarization_event: Annotated[NotRequired[SummarizationEvent | None], PrivateStateAttr]
```
`PrivateStateAttr` 注解指示 LangGraph 将该字段作为私有状态管理，伴随每次图节点执行自动提交并落盘到 Checkpointer。

---

### 4.2 连续链式压缩 (Chained Summarization) 与绝对偏移量换算

在极长会话中，Agent 可能会经历第 2 次、第 3 次乃至数十次连续压缩。系统必须解决两个关键问题：
1. **防止摘要嵌套转存**：前一次压缩生成的 `HumanMessage(additional_kwargs={"lc_source": "summarization"})` 不应被重复追加到后端归档文件中。
   - 框架通过 `_filter_summary_messages`（[`summarization.py#L755-L768`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L755-L768)）过滤掉带有 `lc_source="summarization"` 的消息。
2. **有效索引与状态绝对索引换算 (`_compute_state_cutoff`)**：
   - 源码定位：[`deepagents/middleware/summarization.py#L859-L885`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L859-L885)
   - **换算公式**：
     在第 $N$ 次压缩时，模型看到的 `effective_messages` 包含 1 条前序摘要消息和从 `prior_cutoff` 开始的真实消息。此时计算出的 `effective_cutoff` 包含了开头的摘要消息。因此，映射回 `state["messages"]` 的真实全局绝对截断点公式为：
     $$\text{state\_cutoff\_index} = \text{prior\_cutoff} + \text{effective\_cutoff} - 1$$
     减 1 精确消除了虚拟摘要消息占用的 1 个偏移量，确保下一次 `_apply_event_to_messages` 截取的切片 `messages[state_cutoff_index:]` 绝对准确。

---

## 5. 失败处理、边界保护与多模态外化

### 5.1 失败容错与降级矩阵

| 故障场景 | 发生位置 | 中间件捕获与降级行为 | 对 Agent 主流程的影响 |
|---|---|---|---|
| **后端历史转存失败** (OSS/磁盘不可写) | `_aoffload_to_backend` ([L1355-L1373](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1355-L1373)) | 函数内记录 `logger.warning` 并返回 `file_path = None`；调用方 `awrap_model_call`（L1605-L1608）再记 `logger.error` 并 `warnings.warn`。`_build_new_messages_with_path` 自动切换为不带文件引用的通用文本模板（`Here is a summary...`）。 | **无阻塞**。压缩与模型调用正常继续，仅历史无法被外部查阅。 |
| **摘要模型调用失败** (LLM API 抛错) | `_acreate_summary` ([L847-L849](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L847-L849)) | 捕获 `Exception` 并返回字符串 `"Error generating summary: {e}"`。 | **无崩溃**。构造包含错误信息的摘要消息注入上下文，Agent 继续尝试执行。 |
| **上下文溢出兜底** (`ContextOverflowError`) | `awrap_model_call` ([L1568-L1572](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1568-L1572)) | 当预检未触发但底层模型因极端偏差抛出溢出错误时，立即进入 `overflow_triggered` 分支，执行即时压缩并调用 `_aclip_overflow_tail` 裁剪过长 ToolMessage，重试模型调用。 | **自动恢复**。将致命的上下文超限转化为自愈压缩重试。 |
| **参数剪裁禁用** (`truncate_args_settings=None`) | `__init__` ([L621-L625](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L621-L625)) | `self._truncate_args_trigger` 被置为 `None`，`_should_truncate_args` 直接返回 `False`，完全跳过参数剪裁阶段。 | **符合预期**。完全禁用轻量剪裁，直接进入常规摘要流程。 |

---

### 5.2 多媒体消息外化与 XML 引用保护

在长程 Agent 任务中，对话常包含截图、图表或 Base64 多媒体。若将庞大的 Base64 编码直接塞入摘要提示词或转存 Markdown，会导致 Token 爆炸与文件臃肿。

1. **识别与提取 (`_extract_data_url` & `_decode_data_url`)**：
   - 源码定位：[`deepagents/middleware/summarization.py#L321-L402`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L321-L402)
   - 识别标准 Content Block 中的 `base64`、顶层 `data:` URL 以及 OpenAI 风格 `image_url`。
   - 解析 MIME 类型并计算唯一内容哈希：`key = hashlib.sha256(raw).hexdigest()[:16]`。
2. **独立上传与去重 (`_aoffload_inline_media`)**：
   - 源码定位：[`deepagents/middleware/summarization.py#L1173-L1224`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1173-L1224)
   - 相同哈希的媒体仅上传一次至 `{artifacts_root}/conversation_history/media/{key}.{ext}`。
3. **标签重写与占位符保护 (`_rewrite_data_url_blocks`)**：
   - 上传成功的媒体被重写为 `<image url="/conversation_history/media/{key}.png" />`。
   - 若解码或上传失败，重写为 `<image error="failed_to_offload" />` 占位符（L301），绝不静默丢失。
4. **提示词契约保障 (`_MEDIA_REFERENCE_SUMMARY_PROMPT`)**：
   - 源码定位：[`deepagents/middleware/summarization.py#L100-L117`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L100-L117)
   - 在提示词中显式声明：
     ```xml
     <media_reference_information>
     Conversation history may include XML media reference tags, for example:
     <image url="/conversation_history/media/{hash}.png" />
     These tags mean the original message included media that was preserved at the referenced backend path.
     ...
     When the media could be important for future context, preserve the media reference in your summary.
     The model consuming the summary can call `read_file` on the referenced path if it needs to inspect the media.
     </media_reference_information>
     ```
     确保摘要生成模型理解该标签代表持久化媒体，并在生成的四段式摘要中保留该 XML 路径引用。

---

## 6. langAgent 扩展与工程落地

在 `langAgent` 项目中，针对长任务场景对原生中间件进行了严格的观测扩展与中文语义对齐：

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│              langAgent 继承观测架构: ObservedDeepAgentsSummarizationMiddleware         │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   class ObservedDeepAgentsSummarizationMiddleware(SummarizationMiddleware):           │
│       │                                                                               │
│       ├─► 1. 首轮防抖拦截: _should_summarize                                           │
│       │      └─► len(messages) < settings.context_compaction_min_messages (6条) ──► 拒绝  │
│       │                                                                               │
│       ├─► 2. 并发隔离观测: _CallObservation (基于 contextvars.ContextVar)              │
│       │      └─► 记录 thread_id, run_id, context_tokens_before, planned_compaction    │
│       │                                                                               │
│       ├─► 3. 执行原生流程: response = await super().awrap_model_call(request, handler) │
│       │      └─► 拦截真实返回的 ExtendedModelResponse.command.update["_summarization_event"] │
│       │                                                                               │
│       ├─► 4. 重算真实水位: _count_tokens(final_effective_messages + new_messages)     │
│       │                                                                               │
│       └─► 5. 发射 AG-UI 事件: await adispatch_custom_event(                           │
│                  "context.usage_updated",                                             │
│                  build_usage_updated(..., approximate=True, mode="auto")              │
│              )  ──► 异常严格 catch，绝不影响模型推理主流程                              │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 继承设计考量：为什么必须 Subclass 而非 Extra Middleware？

正如 [`src/agent/long_task/observed_summarization_middleware.py#L1-L6`](file:///.scratch/langagent-develop-reference/src/agent/long_task/observed_summarization_middleware.py#L1-L6) 中的架构注释所明确指出：
> *“观测必须与 deepagents 的 SummarizationMiddleware 处在同一层：原生 middleware 会在内层模型调用返回后才创建 `_summarization_event`。因此这里通过继承原生实现，而不是作为 `extra_middleware` 追加到调用链末端。”*

若作为独立中间件挂载，在外层无法获知内层是否真正发生了截断与摘要生成，也无法提取到 `Command` 中的 `_summarization_event` 结构。

---

### 6.2 关键机制与参数配置核查

根据 `fact-base.md`（`FACT-CMP-*` 系列）与源码核验：

#### 1. 首轮防抖门禁 (`FACT-CMP-002`)
- **源码定位**：[`src/agent/long_task/observed_summarization_middleware.py#L68-L78`](file:///.scratch/langagent-develop-reference/src/agent/long_task/observed_summarization_middleware.py#L68-L78)
- **实现逻辑**：
  ```python
  def _should_summarize(self, messages: list[BaseMessage], total_tokens: int) -> bool:
      from src.server.config.config import settings
      min_messages = settings.context_compaction_min_messages  # 默认 6
      if len(messages) < min_messages:
          return False
      return super()._should_summarize(messages, total_tokens)
  ```
  防止在首轮对话输入极大 Prompt（如注入了大量系统规范）时误触发压缩，破坏初始任务上下文。

#### 2. 中文热补丁矩阵 (`chinese_deep_agent.py` L166-L319, `FACT-CMP-001`, `FACT-CMP-004`)
在 Agent 启动初始化时，通过 `apply_chinese_patches()` 对框架进行集中运行时补丁注入：
- **触发比例调整**：将原生 85% 默认阈值下调至 **70%**（`context_compaction_trigger_fraction = 0.7`，[`config.py#L126`](file:///.scratch/langagent-develop-reference/src/server/config/config.py#L126)）。
- **保留窗口调整**：将截断计算覆盖为保留后 **25%**（`context_compaction_keep_fraction = 0.25`，[`config.py#L128`](file:///.scratch/langagent-develop-reference/src/server/config/config.py#L128)）的消息数安全截断：
  ```python
  def _message_count_cutoff(self, messages):
      if not messages:
          return 0
      keep_count = max(1, int(len(messages) * _compaction_settings.context_compaction_keep_fraction))
      return self._lc_helper._find_safe_cutoff(messages, keep_count)
  ```
- **中文结构化提示词 (`CHINESE_SUMMARY_PROMPT`)**：
  替换英文模板，严格规范中文四段式检查清单输出：
  1. `## 会话意图` (SESSION INTENT)
  2. `## 摘要` (SUMMARY)
  3. `## 产物` (ARTIFACTS)
  4. `## 下一步` (NEXT STEPS)

#### 3. 单一自定义事件发射 (`FACT-CMP-006`, `DELTA-CMP-001`)
- **源码定位**：[`src/agent/long_task/context_compaction_events.py#L15-L59`](file:///.scratch/langagent-develop-reference/src/agent/long_task/context_compaction_events.py#L15-L59)
- **实现细节**：
  在模型调用完成后，中间件计算最新的上下文 Token 占用，派发单一 `context.usage_updated` AG-UI CUSTOM 事件：
  ```python
  {
      "thread_id": "thread-1001",
      "run_id": "run-2002",
      "context_tokens": 128400,
      "max_input_tokens": 200000,
      "context_ratio": 64,          # 整数百分比
      "approximate": True,          # 标识为本地近似估算值
      "mode": "auto",
      "compacted": True             # 本轮次是否实际执行了压缩
  }
  ```
  *(注：根据 `DELTA-CMP-001`，PRD 规划的 `compaction_started` / `compaction_finished` / `compaction_failed` 在当前 develop 代码中仅作为内部日志输出，带外 SSE 事件收敛为单一 `context.usage_updated`)*。

---

## 7. 端到端完整执行时序 Trace

以下展示一次典型的长任务会话在第 7 轮交互中触发上下文压缩的完整端到端时序序列：

```
User / Client         ObservedMiddleware           LLM / OSS Backend              LangGraph Checkpoint
     │                        │                            │                               │
 1.  │── Invoke Run ─────────►│                            │                               │
     │                        │ 2. _count_tokens: 145k     │                               │
     │                        │    (72.5% > 70% 阈值)      │                               │
     │                        │ 3. 检查 min_messages(7>=6) │                               │
     │                        │ 4. 计算 cutoff: 保留后25%  │                               │
     │                        │ 5. 安全回溯 AI/Tool 边界   │                               │
     │                        │                            │                               │
     │                        │ 6. 提取 Base64 媒体        │                               │
     │                        │─── PUT media/{hash}.png ──►│                               │
     │                        │                            │                               │
     │                        │ 7. 并发执行:               │                               │
     │                        │─── PUT history.md ────────►│                               │
     │                        │─── ainvoke(中文摘要Prompt)─►│                               │
     │                        │◄── 返回四段式结构化摘要 ───│                               │
     │                        │                            │                               │
     │                        │ 8. 构造 HumanMessage(摘要) │                               │
     │                        │ 9. 组装 [摘要, *保留消息]  │                               │
     │                        │                            │                               │
     │                        │ 10. 真正业务模型推理 ─────►│                               │
     │                        │◄─── 返回 AIMessage(业务) ──│                               │
     │                        │                            │                               │
     │                        │ 11. 重算水位 (35k / 17.5%) │                               │
     │                        │─── adispatch_custom_event ─┼──────────────────────────────►│
     │                        │    ("context.usage_updated"│                               │
     │                        │     compacted=True)        │                               │
     │                        │                            │                               │
     │                        │ 12. 返回 ExtendedModelResponse                             │
     │                        │     (Command(update={"_summarization_event": ...}))        │
     │                        │───────────────────────────────────────────────────────────►│
     │                        │                            │                   13. 写入 Checkpoint
 14. │◄── SSE 流式输出 ───────│                            │                       (全量原始历史 +
     │   (包含 usage_updated) │                            │                        最新摘要事件)
```

### 详尽阶段分解说明

1. **Step 1-3（输入与阈值预检）**：用户发送请求，`ObservedDeepAgentsSummarizationMiddleware.awrap_model_call` 介入。调用 `_count_tokens` 得到当前有效上下文为 145,000 Tokens，达到模型 200,000 上限的 72.5%（超过 70% 触发线），且消息条数（7 条）满足 $\ge 6$ 的防抖限制。
2. **Step 4-5（截断点确定与安全保护）**：计算保留后 25% 的消息。`_find_safe_cutoff_point` 检测到切分点若落在 `ToolMessage` 上，则向前回溯将其发起方 `AIMessage` 一同划入保活区，防止孤立响应。
3. **Step 6（多模态外化）**：扫描待淘汰历史，将内联 Base64 截图提取并上传至 `/conversation_history/media/{hash}.png`，在消息体中替换为 `<image url="..." />` 标签。
4. **Step 7（并发归档与摘要）**：`asyncio.gather` 同时发起两路 I/O：将淘汰消息追加写入 `/conversation_history/{thread_id}.md`，并调用模型结合 `CHINESE_SUMMARY_PROMPT` 生成包含会话意图、摘要、产物、下一步的中文总结。
5. **Step 8-10（有效请求重构与内层调用）**：生成携带 `additional_kwargs={"lc_source": "summarization"}` 的 `HumanMessage`，与保活区消息拼装为 `modified_messages`，转交内层 Handler 完成本次用户指令的业务模型推理。
6. **Step 11（观测事件广播）**：模型返回后，中间件重新估算上下文水位（骤降至 35,000 Tokens，17.5%），通过 `adispatch_custom_event` 广播 `context.usage_updated` 事件，前端实时刷新上下文进度条。
7. **Step 12-13（状态提交与落盘）**：中间件返回封装了 `Command(update={"_summarization_event": new_event})` 的 `ExtendedModelResponse`。LangGraph 图运行时捕获该 Command 并将新的摘要事件与业务消息原子写入持久化 Checkpointer，完成全生命周期闭环。

---

## 8. 源码核验与证据清单

| 证据编号 | 源码模块 / 文件路径 | 对应行号范围 | 关键事实与设计契约 |
|---|---|---|---|
| **EVD-CMP-01** | `deepagents/middleware/summarization.py` | [`L520-L631`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L520-L631) | `SummarizationMiddleware.__init__` 声明 8 个配置参数（含 `backend`, `trigger`, `keep`, `truncate_args_settings`）。 |
| **EVD-CMP-02** | `deepagents/middleware/summarization.py` | [`L261-L298`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L261-L298) | `compute_summarization_defaults` 基于模型 profile 推导 85% / 10% 默认阈值。 |
| **EVD-CMP-03** | `deepagents/middleware/summarization.py` | [`L1090-L1224`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1090-L1224) | `_offload_inline_media` / `_aoffload_inline_media` 提取 Base64 媒体至 `/conversation_history/media/` 并生成哈希去重路径。 |
| **EVD-CMP-04** | `deepagents/middleware/summarization.py` | [`L1225-L1376`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1225-L1376) | `_offload_to_backend` / `_aoffload_to_backend` 追加写入 Markdown 历史，失败返回 `None` 且不阻塞摘要。 |
| **EVD-CMP-05** | `deepagents/middleware/summarization.py` | [`L1511-L1645`](file:///.scratch/langagent-framework-sources/deepagents/middleware/summarization.py#L1511-L1645) | `awrap_model_call` 完整异步执行流，生成 `Command(update={"_summarization_event": ...})`。 |
| **EVD-CMP-06** | `langchain/agents/middleware/summarization.py` | [`L583-L623`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L583-L623) | `_should_summarize` 判定双通道（本地估算 vs 服务端 `usage_metadata` 上报）。 |
| **EVD-CMP-07** | `langchain/agents/middleware/summarization.py` | [`L763-L797`](file:///.scratch/langagent-framework-sources/langchain/agents/middleware/summarization.py#L763-L797) | `_find_safe_cutoff_point` 逆向回溯匹配 `AIMessage.tool_calls`，保护 AI/Tool 对完整性。 |
| **EVD-CMP-08** | `langchain_core/messages/utils.py` | [`L2239-L2355`](file:///.scratch/langagent-framework-sources/langchain_core/messages/utils.py#L2239-L2355) | `count_tokens_approximately` 算法实现，包含 `tokens_per_image=85` 视觉折算与 `tools` schema 统计。 |
| **EVD-CMP-09** | `src/agent/long_task/observed_summarization_middleware.py` | [`L47-L281`](file:///.scratch/langagent-develop-reference/src/agent/long_task/observed_summarization_middleware.py#L47-L281) | `ObservedDeepAgentsSummarizationMiddleware` 继承原生类，实现 6 条消息防抖与 `context.usage_updated` 事件发射。 |
| **EVD-CMP-10** | `src/agent/long_task/chinese_deep_agent.py` | [`L166-L319`](file:///.scratch/langagent-develop-reference/src/agent/long_task/chinese_deep_agent.py#L166-L319) | `apply_chinese_patches()`（起于 L166）注入 70% 触发、25% 消息数保留比例与 `CHINESE_SUMMARY_PROMPT`（压缩相关补丁集中在 L290-L319）。 |
| **EVD-CMP-11** | `src/server/config/config.py` | [`L124-L133`](file:///.scratch/langagent-develop-reference/src/server/config/config.py#L124-L133) | 压缩相关配置项：`context_compaction_trigger_fraction=0.7`, `keep_fraction=0.25`, `min_messages=6`。 |
| **EVD-CMP-12** | `src/agent/long_task/conversation_history_backend.py` | [`L67-L146`](file:///.scratch/langagent-develop-reference/src/agent/long_task/conversation_history_backend.py#L67-L146) | `ConversationHistoryBackend` 将 `/conversation_history/` 路径映射至后端 OSS 与 context file 接口。 |

---

## 9. 连续链式压缩 (Chained Compaction) 深度走查实例

在真实的复杂多轮长程 Agent 任务中，会话生命周期往往经历多次上下文超限与多次相继压缩（Chained Compaction）。许多工程师对“摘要之后再摘要”时指针如何推进、旧摘要如何处理、Checkpoint 如何保持完整性存在困惑。

本节基于 `deepagents 0.6.12` 与 `langAgent` 的真实运行机制，构造一个完整的两代连续压缩（$S_1 \to S_2$）实战演练，通过代入具体数字逐行拆解指针推进公式、视图投影与防抖机制。

### 9.1 演练环境与运行配置

假定 Agent 运行在以下基准配置下（与 `langAgent` 生产环境及中文补丁完全一致）：
- **模型上下文上限 (`max_input_tokens`)**：`200,000` Tokens (200k)
- **触发压缩门限 (`context_compaction_trigger_fraction`)**：`0.70`（即 $\ge 140{,}000$ Tokens 且满足条数门禁时触发）
- **上下文保留比例 (`context_compaction_keep_fraction`)**：`0.25`（保留末尾约 25% 的有效消息）
- **最小消息防抖门禁 (`context_compaction_min_messages`)**：`6` 条（有效消息数 $< 6$ 时严禁触发）

---

### 9.2 阶段一：初始累积至第 1 次压缩 (Round 1 ~ Round 5)

#### 1. 触发前状态 (Round 5)
在多轮数据分析任务中，Agent 经历了多轮 SQL 查询与数据加载。在 Round 5 模型调用前：
- **Checkpoint 中的原始消息**：`state["messages"]` 共 8 条消息 $[M_0, M_1, M_2, M_3, M_4, M_5, M_6, M_7]$：
  - $M_0$ (`HumanMessage`)：初始业务需求（"分析 Q3 销售异动并输出归因报告"）
  - $M_1$ (`AIMessage`)：调用工具 `query_sales_data`
  - $M_2$ (`ToolMessage`)：返回基础销售表（大载荷）
  - $M_3$ (`AIMessage`)：调用工具 `aggregate_metrics`
  - $M_4$ (`ToolMessage`)：返回聚合指标（大载荷）
  - $M_5$ (`AIMessage`)：阶段性中间总结
  - $M_6$ (`HumanMessage`)：用户跟进指令（"请结合用户留存明细做下钻"）
  - $M_7$ (`AIMessage`)：调用工具 `fetch_cohort_matrix`
- **历史压缩事件**：`state.get("_summarization_event") = None`（首次运行）。
- **有效投影获取 (`_get_effective_messages`)**：
  因 `event is None`，`effective_messages = list(messages) = [M_0, M_1, M_2, M_3, M_4, M_5, M_6, M_7]`（长度为 8）。
- **Token 估算与判定 (`_count_tokens` & `_should_summarize`)**：
  - 估算 Token 数：`total_tokens = 148,000`（占 200k 的 74.0%，超过 70% 阈值 140,000）。
  - 防抖检查：`len(effective_messages) = 8 >= 6`（通过门禁）。
  - 判定结果：`should_summarize = True`，触发**第 1 次压缩**。

#### 2. 第 1 次切分与截断点计算 (`_determine_cutoff_index`)
- 保留条数计算：`keep_count = max(1, int(8 * 0.25)) = 2`。
- 目标截断点：`target_cutoff = 8 - 2 = 6`。
- 安全边界检查 (`_find_safe_cutoff_point`)：
  - 检查 `effective_messages[6]` 即 $M_6$（`HumanMessage`）。由于 $M_6$ 不是 `ToolMessage`，不会拆散任何 AI/Tool 对，安全截断点确认：`cutoff_index = 6`。
- 消息物理切分 (`_partition_messages`)：
  - 待摘要消息：`messages_to_summarize = effective_messages[:6] = [M_0, M_1, M_2, M_3, M_4, M_5]`（6 条）。
  - 保留消息：`preserved_messages = effective_messages[6:] = [M_6, M_7]`（2 条）。

#### 3. 归档、摘要生成与状态换算 (`_compute_state_cutoff`)
1. **历史外化归档 (`_aoffload_to_backend`)**：
   将 $[M_0, \dots, M_5]$ 序列化并追加写入 `/conversation_history/thread-001.md`。
2. **第一代摘要生成 (`_acreate_summary`)**：
   调用摘要模型结合 `CHINESE_SUMMARY_PROMPT`，将 $[M_0, \dots, M_5]$ 提炼为第一代中文四段式摘要 $S_1$。
   构造摘要消息：`new_messages = [HumanMessage(content="...S1...", additional_kwargs={"lc_source": "summarization"})]`。
3. **绝对截断点计算 (`_compute_state_cutoff`)**：
   由于 `previous_event is None`：
   $$\text{state\_cutoff\_index} = 6$$
4. **内层推理与事件落盘**：
   - 拼装内层模型输入：`modified_messages = [S_1, M_6, M_7]`（有效长度 3，其中 $M_7$ 为携带 `fetch_cohort_matrix` 工具调用的 `AIMessage`）。
   - 工具执行节点响应 $M_7$ 的调用，产出 $M_8$（`ToolMessage`：留存矩阵大载荷）；模型基于新投影继续后续推理。
   - 中间件返回 `ExtendedModelResponse(command=Command(update={"_summarization_event": new_event}))`，其中：
     ```python
     new_event = {
         "cutoff_index": 6,
         "summary_message": S_1,  # HumanMessage with lc_source="summarization"
         "file_path": "/conversation_history/thread-001.md"
     }
     ```
5. **落盘后的 Checkpoint 状态**：
   - `state["messages"]` = $[M_0, M_1, M_2, M_3, M_4, M_5, M_6, M_7, M_8]$（**全量 9 条消息原样保留在 Checkpointer 中，绝不执行物理删除！**）。
   - `state["_summarization_event"]` 记录 `cutoff_index = 6` 与 $S_1$。
   - 上下文水位骤降至 $32{,}000$ Tokens（16.0%），发射 `context.usage_updated(compacted=True)`。

---

### 9.3 阶段二：增量推进与防抖机制生效 (Round 6 ~ Round 7)

#### 1. Round 6：刚压缩后的有效投影与防抖保护
在第 6 轮，用户提出新的对比要求，追加 $M_9$（`HumanMessage`），`state["messages"]` 达到 10 条 ($M_0 \sim M_9$)。
- **动态投影重构 (`_get_effective_messages`)**：
  根据 `_summarization_event`（`cutoff_index = 6`, `summary_message = S_1`）：
  $$\text{effective\_messages} = [S_1] + \text{messages}[6:] = [S_1, M_6, M_7, M_8, M_9] \quad (\text{长度为 } 5)$$
- **Token 估算与防抖门禁生效**：
  - 估算 Token 数约为 $38{,}000$ Tokens（19.0%）。
  - `_should_summarize` 检查有效消息长度：`len(effective_messages) = 5 < 6`。
  - **核心防抖语义**：此时有效消息数不足 6 条，直接被 `context_compaction_min_messages = 6` 门禁拦截。**这彻底防止了刚完成压缩后因单条长响应瞬间导致系统陷入“压缩 $\to$ 消息极短 $\to$ 再压缩”的死循环自激震荡（Thrashing）**。
- 模型正常调用，生成分析响应 $M_{10}$。

#### 2. Round 7：业务继续自然推进
- 会话继续推进，经历 Round 7 的用户交互与工具分析，生成 $M_{11}, M_{12}$。
- Checkpoint 累积至 13 条原始消息 ($M_0 \sim M_{12}$)。
- 有效投影：`[S_1, M_6, M_7, M_8, M_9, M_{10}, M_{11}, M_{12}]`（长度 8 条）。
- 上下文 Token 水位爬升至 $95{,}000$ Tokens（47.5% < 70%），未触发压缩，本轮消息编号推进至 $M_{12}$ 结束。

---

### 9.4 阶段三：再次突破水位至第 2 次链式压缩 (Round 8)

#### 1. 触发前状态 (Round 8)
在 Round 8 中，Agent 执行了多维交叉回归分析，产生了庞大的数据载荷。
- **Checkpoint 中的原始消息**：`state["messages"]` 共 17 条消息 $[M_0, M_1, \dots, M_{16}]$：
  - $M_0 \sim M_5$：第 1 阶段已归档历史
  - $M_6 \sim M_7$：第 1 阶段保留上下文
  - $M_8 \sim M_{12}$：第 2 阶段常规交互与中间结果
  - $M_{13}$ (`HumanMessage`)："请执行多维交叉回归分析"
  - $M_{14}$ (`AIMessage`)：调用工具 `run_multivariate_regression`
  - $M_{15}$ (`ToolMessage`)：回归分析明细矩阵（超大载荷 55k Tokens）
  - $M_{16}$ (`AIMessage`)：调用图表渲染工具
- **当前有效投影 (`_get_effective_messages`)**：
  基于上一轮事件（`prior_cutoff = 6`，摘要 $S_1$）：
  $$\text{effective\_messages} = [S_1] + \text{messages}[6:] = [S_1, M_6, M_7, M_8, M_9, M_{10}, M_{11}, M_{12}, M_{13}, M_{14}, M_{15}, M_{16}]$$
  投影列表长度为 **12 条**（1 条前序摘要 + 11 条增量消息）。
- **Token 估算与触发判定**：
  - `total_tokens = 146,000`（占 200k 的 73.0% > 70% 门限）。
  - `len(effective_messages) = 12 >= 6`（通过防抖门禁）。
  - 判定结果：`should_summarize = True`，触发**第 2 次链式压缩**。

#### 2. 第 2 次截断点计算 (`_determine_cutoff_index`)
- 保留条数计算：`keep_count = max(1, int(12 * 0.25)) = 3`。
- 目标截断点：`target_cutoff = 12 - 3 = 9`。
- 安全边界校验 (`_find_safe_cutoff_point`)：
  - 观察 `effective_messages` 在下标 9 处的分界：
    - 下标 0..8：$[S_1, M_6, M_7, M_8, M_9, M_{10}, M_{11}, M_{12}, M_{13}]$（9 条）。
    - 下标 9..11：$[M_{14}, M_{15}, M_{16}]$（3 条）。
  - `effective_messages[9]` 是 `AIMessage` $M_{14}$，其发起的工具调用与 $M_{15}$（`ToolMessage`）均完整保留在保活区（$[M_{14}, M_{15}, M_{16}]$），未拆散 AI/Tool 消息对。
  - 确认有效截断点：`effective_cutoff = 9`。
- 消息物理切分：
  - `messages_to_summarize = effective_messages[:9] = [S_1, M_6, M_7, M_8, M_9, M_{10}, M_{11}, M_{12}, M_{13}]`
  - `preserved_messages = effective_messages[9:] = [M_{14}, M_{15}, M_{16}]`

#### 3. 链式压缩的两路核心差异机制

在链式压缩中，中间件对 `messages_to_summarize` 的两路消费存在本质差异：

```
                    ┌───────────────────────────────────────────────────────────────────┐
                    │ messages_to_summarize: [S1, M6, M7, M8, M9, M10, M11, M12, M13]   │
                    └─────────────────────────────────┬─────────────────────────────────┘
                                                      │
                 ┌────────────────────────────────────┴────────────────────────────────────┐
                 ▼                                                                         ▼
   [ 路径 A: 历史外化归档 (I/O) ]                                            [ 路径 B: 摘要生成 (LLM) ]
   _filter_summary_messages 介入                                            保留全部输入 (包含旧摘要 S1)
   过滤掉 lc_source="summarization" 的 S1                                    作为 Baseline Context 注入 Prompt
                 │                                                                         │
                 ▼                                                                         ▼
   仅将 [M6, M7, M8, M9, M10, M11, M12, M13] 增量追加写入                     LLM 将 "旧摘要 S1" 与 "增量过程 M6~M13"
   /conversation_history/thread-001.md                                      融合提炼为第二代摘要 S2 ("摘要的摘要")
   (绝不重复写入旧摘要，保持 Markdown 归档纯净)                               (信息递进浓缩，保留全局上下文意图)
```

1. **存储归档过滤 (`_filter_summary_messages`)**：
   - 源码检查：`msg.additional_kwargs.get("lc_source") == "summarization"`。
   - 旧摘要 $S_1$ 命中过滤条件，**被完全剥离**。
   - 实际追加写入 Markdown 的只有增量消息 $[M_6, M_7, M_8, M_9, M_{10}, M_{11}, M_{12}, M_{13}]$。
   - 归档文件最终顺序为 $M_0 \sim M_5$（第 1 次归档）+ $M_6 \sim M_{13}$（第 2 次归档），无任何嵌套冗余。
2. **摘要生成（“摘要的摘要” / Summary of Summaries）**：
   - $S_1$ **不会在此处被过滤**，它与增量消息 $[M_6 \dots M_{13}]$ 一并序列化为 XML 格式送入摘要模型。
   - 摘要模型在提示词引导下，将第一阶段的背景意图（来自 $S_1$）与第二阶段的增量分析（来自 $M_6 \sim M_{13}$）融合重组，生成第二代结构化中文摘要 $S_2$。
   - 构造新摘要消息：`new_messages = [HumanMessage(content="...S2...", additional_kwargs={"lc_source": "summarization"})]`。

#### 4. 绝对截断点换算公式逐行演算 (`_compute_state_cutoff`)

这是连续链式压缩最关键的数学对齐环节：

- **换算公式**：
  $$\text{state\_cutoff\_index} = \text{prior\_cutoff} + \text{effective\_cutoff} - 1$$
- **具体数字代入**：
  - `prior_cutoff`（第 1 次压缩记录在 Checkpoint 的截断点）= $6$
  - `effective_cutoff`（本次在有效投影中计算出的截断下标）= $9$
  - 计算过程：
    $$\text{state\_cutoff\_index} = 6 + 9 - 1 = 14$$

```
【为什么必须 "- 1"？数学原理深度解构】

在 effective_messages 中：
  下标 0:  S1   (虚拟摘要消息，由中间件在内存中临时拼装，在 state["messages"] 中并不存在！)
  下标 1:  M6   (对应 state["messages"][6])
  下标 2:  M7   (对应 state["messages"][7])
  ...
  下标 k:  M(6+k-1)
  ...
  下标 8:  M13  (对应 state["messages"][13])
  下标 9:  M14  (对应 state["messages"][14] —— 本次保活区的第 1 条消息！)

effective_cutoff = 9 表示在 effective_messages 中切掉前 9 项（即 1 条虚拟摘要 S1 + 8 条真实消息 M6~M13）。
因此，真实底层消息总共需要推进淘汰的条数为 9 - 1 = 8 条。
全局绝对下标前进至：prior_cutoff + (effective_cutoff - 1) = 6 + 8 = 14。
```

- **验证一致性**：
  若在底层原始消息列表上按切片截取 `state["messages"][14:]`，得到的正是 $[M_{14}, M_{15}, M_{16}]$，与保活列表 `preserved_messages` **完全一致、严丝合缝**！

#### 5. 状态落盘与下一轮无缝衔接
- 中间件提交新事件 `new_event = {"cutoff_index": 14, "summary_message": S_2, "file_path": "/conversation_history/thread-001.md"}`。
- 模型完成本轮业务推理，输出 $M_{17}$。
- **Checkpoint 持久化状态**：
  - `state["messages"]` = $[M_0, M_1, \dots, M_{17}]$（共 18 条完整历史消息全量保留）。
  - `state["_summarization_event"]` 更新为 `cutoff_index = 14` 与 $S_2$。
- **Round 9 投影无缝接入**：
  当 Round 9 用户输入 $M_{18}$ 时，`_get_effective_messages` 计算：
  $$\text{effective\_messages} = [S_2] + \text{messages}[14:] = [S_2, M_{14}, M_{15}, M_{16}, M_{17}, M_{18}] \quad (\text{长度为 } 6)$$
  模型在包含宏观全局背景（$S_2$）与微观最新上下文（$M_{14} \sim M_{18}$）的高效载荷下继续推理。

---

### 9.5 全周期状态演进对照表

下表完整展示了该会话从第 1 轮启动到经历两次链式压缩的全生命周期状态演化，清晰对比 **Checkpoint 全量单调追加** 与 **LLM 投影动态伸缩** 的区别：

| 轮次 (Round) | 交互动作与状态变更 | Checkpoint 原始消息数 (`state["messages"]`) | 活跃 cutoff 指针 | 有效投影长度 (`_get_effective_messages`) | 摘要代数 | 估算 Token 水位 | 压缩事件与说明 |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| **R1 ~ R4** | 初始规划、Schema 读取、初步查询 | $1 \to 6$ 条 ($M_0 \sim M_5$) | `None` | $1 \to 6$ 条 ($M_0 \sim M_5$) | 无摘要 | $15\text{k} \to 115\text{k}$ | 正常交互，未达 70% 阈值 |
| **R5 (前)** | 用户跟进，准备执行大表联查 | 8 条 ($M_0 \sim M_7$) | `None` | 8 条 ($M_0 \sim M_7$) | 无摘要 | $148\text{k}$ (74.0%) | 满足 $\ge 140\text{k}$ 且 $\ge 6$ 条，**触发第 1 次压缩** |
| **R5 (后)** | 生成 $S_1$，截断 $M_0 \sim M_5$，生成 $M_8$ | **9 条** ($M_0 \sim M_8$) | **`6`** | **3 条** ($[S_1, M_6, M_7]$) | **$S_1$ (第 1 代)** | **$32\text{k}$ (16.0%)** | 写入 Checkpoint，发射 `usage_updated` |
| **R6** | 用户追加分析需求 $M_9$，输出 $M_{10}$ | 11 条 ($M_0 \sim M_{10}$) | `6` | 5 条 ($[S_1, M_6 \dots M_9]$) | $S_1$ (第 1 代) | $38\text{k}$ (19.0%) | **6 条防抖拦截**（有效数 5 < 6），安全保护 |
| **R7** | 增量分析，生成 $M_{11}, M_{12}$ | 13 条 ($M_0 \sim M_{12}$) | `6` | 8 条 ($[S_1, M_6 \dots M_{12}]$) | $S_1$ (第 1 代) | $95\text{k}$ (47.5%) | 水位自然上升，未达 70% 阈值 |
| **R8 (前)** | 回归计算完成，准备渲染图表 | 17 条 ($M_0 \sim M_{16}$) | `6` | 12 条 ($[S_1, M_6 \dots M_{16}]$) | $S_1$ (第 1 代) | $146\text{k}$ (73.0%) | 满足 $\ge 140\text{k}$ 且 $\ge 6$ 条，**触发第 2 次链式压缩** |
| **R8 (后)** | $S_1$ 与 $M_6 \sim M_{13}$ 融合为 $S_2$，输出 $M_{17}$ | **18 条** ($M_0 \sim M_{17}$) | **`14`** ($6+9-1$) | **4 条** ($[S_2, M_{14} \dots M_{16}]$) | **$S_2$ (第 2 代)** | **$34\text{k}$ (17.0%)** | 过滤 $S_1$ 归档增量，写入 Checkpoint |
| **R9** | 用户输入 $M_{18}$，在 $S_2$ 基础上继续推理 | 19 条 ($M_0 \sim M_{18}$) | `14` | 6 条 ($[S_2, M_{14} \dots M_{18}]$) | $S_2$ (第 2 代) | $42\text{k}$ (21.0%) | 无缝接入第 2 代上下文视窗 |

---

### 9.6 Token 水位线锯齿波形 (Sawtooth Pattern) 与防抖防护边界

#### 1. 动态锯齿波形 (Sawtooth Waveform)
在长程 Agent 运行期间，上下文窗口 Token 消耗呈现出典型的**周期性锯齿起落（Sawtooth Cycle）**特征：

```
Context Token 水位 (%)
100% ┼───────────────────────────────────────────────────────────── (物理硬上限 200k)
     │
 70% ┼───────▲ (R5: 74%) ──────────────────▲ (R8: 73%) ──────────── (触发门限 140k / 70%)
     │      /│                            /│
 50% ┼     / │                           / │
     │    /  │                          /  │
 25% ┼   /   │                         /   │
     │  /    ▼ (R5后: 16%)            /    ▼ (R8后: 17%)
  0% ┼─┴─────────────────────────────┴──────────────────────────── 交互轮次 (Rounds)
       [  第 1 周期: R1 ~ R5  ]        [  第 2 周期: R6 ~ R8  ]
```

每次压缩均将上下文从危急的 70%+ 水位迅速释放至 15%~20% 的健康区间，既保证了推理成本可控，又杜绝了上下文溢出风险。

#### 2. 6 条防抖门禁 (`context_compaction_min_messages = 6`) 的双向防护

防抖门禁在整个生命周期中承担着两项不可替代的稳定性职责：

```
                    ┌─────────────────────────────────────────────────────────┐
                    │  防抖门禁: len(effective_messages) >= min_messages (6条) │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
   [ 防线 1: 冷启动防线 (Cold-Start Gate) ]                     [ 防线 2: 自激振荡防线 (Anti-Thrashing Gate) ]
   • 场景: 首轮输入包含超长 System Prompt 或 50k 大文档          • 场景: 刚完成压缩后 (有效消息数 3~5 条)
   • 现象: Token 虽瞬间超过 70%，但消息数仅 1~2 条                • 现象: 单个 Tool 返回稍大导致 Token 估算偏高
   • 保护: 拒绝压缩，防止首轮关键需求被过早抹平成摘要             • 保护: 强制拒绝连续二次压缩，打破死循环自激
```

---

### 9.7 工程师复述口诀与核心心智模型

若要向团队同事或面试官清晰复述 `deepagents` 连续链式压缩的精髓，可提炼为**三句核心心智模型**：

1. **存储只追加，视图动态切**：
   Checkpoint 中的 `state["messages"]` 永远是完整、Append-Only 的真实历史；送入 LLM 的仅仅是 `[summary, *messages[cutoff:]]` 内存视图，状态安全不丢失。
2. **归档滤旧摘，生成融前文**：
   写磁盘归档时通过 `_filter_summary_messages` 剔除带有 `lc_source="summarization"` 的旧摘要，杜绝重复落盘；调用 LLM 生成新摘要时传入 `[旧摘要 + 增量消息]`，实现“摘要的摘要”层级演进。
3. **指针加增量，减一消虚位**：
   全局截断点推进公式严格遵守 $\text{state\_cutoff} = \text{prior\_cutoff} + \text{effective\_cutoff} - 1$；减 1 精准消除内存中首项虚拟摘要的下标占位，实现多代压缩下绝对数组索引的零误差对齐。

