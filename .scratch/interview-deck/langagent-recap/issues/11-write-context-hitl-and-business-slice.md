# 编写 Memory、Compaction、Skill、HITL 与业务链路章节及代码

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

交付长期任务的上下文治理、过程性知识、Human-in-the-loop，以及 ChatBI、DataEnvelope、Visualization/A2UI 代表业务链路章节草稿和对应 recap code。

## Acceptance criteria

- [x] Worker 独立重读相关源码、测试、PRD/SPEC、A2UI 分支和必要框架实现，不直接复述 fact base。
- [x] 章节明确区分作者参与/主导的设计与团队最终落地的实现，并在关键处呈现设计意图、当前行为和已确认的偏差/演进。
- [x] 清楚区分 conversation history、checkpoint、长期 memory、workspace 文件和 compaction summary。
- [x] Skill 与 Ask User 覆盖导入/激活、interrupt/resume、事件、去重和失败路径。
- [x] ChatBI 使用升级前后架构对照，区分可证实结构变化与经用户确认的设计动机。
- [x] 代表链路完整连接 ChatBI、DataEnvelope、Visualization/A2UI 和 AG-UI Activity；其他业务能力保持全貌级覆盖。
- [x] recap code 对关键机制达到白板可还原深度，并在发现事实冲突时重新打开 evidence gap。

## Blocked by

- [08 - 执行第二轮 Evidence-Gap Grilling 并冻结事实](08-run-evidence-gap-grilling-and-freeze-facts.md)

## Comments

### 最终定点修订完成项 (包含第 5 轮 3 项精准对齐)
1. **ObservedDeepAgentsSummarizationMiddleware 签名与配置获取**：
   - 彻底删除局部重写的接收 Dict 的 `_get_effective_messages`，直接复用父类 `self._get_effective_messages(request)`，保证与 `super().awrap_model_call` 动态调用的签名完全兼容。
   - `thread_id`/`run_id` 严格按源码真实实现从 `langgraph.config.get_config()` 的 `configurable` 读取（捕获 `RuntimeError` 时安全降级为空字符串）。
2. **JavaMemoryBackend 构造签名与客户端调用**：
   - 构造方法严格对齐源码签名：`__init__(self, *, user_id: str, scope_type: str, app_id: int, source_thread_id: Optional[str] = None, source_run_id: Optional[str] = None)`。
   - 移除必填注入参数，改为导入并调用模块级 `from src.server.clients import backend_api_client`。
   - `_aupdate_file` 同步将 `source_thread_id` 与 `source_run_id` 注入 `MemoryFileUpdateRequest`。
3. **SkillActivationMiddleware 真实事件链路与格式对齐**：
   - 引入 `from src.agent.long_task.event_bridge import LongTaskEventBridge` 与 `from src.agent.core.event_utils import dispatch_agui_custom_event`。
   - 通过 `_resolve_package(request)` 和 `_is_successful_tool_message(result)` 精确判断有效激活。
   - 采用标准规范生成 `activity_value = LongTaskEventBridge.skill_activation_activity_value(...)` 并调用 `dispatch_agui_custom_event("copilotkit_emit_activity", activity_value, config=request.runtime.config)`，异常严格隔离在 `try...except` 中。

### 交付物产出
1. 正文章节：`.scratch/interview-deck/langagent-recap/recap-blog/t11-context-hitl-business.md`
2. 白板代码：`.scratch/interview-deck/langagent-recap/recap-code/core/context_hitl_business.py` (764 行)

### 静态验证结果
- AST 语法静态解析与编译：`python3 -c "import ast; ast.parse(open('.../context_hitl_business.py').read()); compile(...)"` 成功通过。
- 零残留扫描：全量 ripgrep 检查确认无任何 `*Flow`、`*Core`、`whiteboard_`、Fake、Mock、dummy、placeholder、秒级、1～2秒、commit hash 或 `StateGraph(dict)`。
- 缓存检查：确认无任何 `__pycache__` 临时目录残留。
