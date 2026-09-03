# 任务：写白板手写 code 第二批 `code/04` ~ `code/08`（Agent 系 + 检索系 + LoRA/RLHF/ZeRO + serving 系）

你在为一场 40-60 分钟的简历项目问答面试准备"白板手写 code"材料。要求：现场能默写，代码短、直白、无依赖、每个函数可独立手写。

## 必读（按顺序）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 口径红线与 code Tier 纪律
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — **§三 白板 code 清单**，你负责：
   - `04_agent_loop_agui_hitl.py`：C11（ReAct loop）、C12（AG-UI 事件流处理：LangGraph 事件 → RUN_STARTED/TEXT_MESSAGE_*/TOOL_CALL_*/CUSTOM/RUN_FINISHED 映射 + 中间件链 + 异常补发 RUN_ERROR/RUN_FINISHED）、C13（HITL interrupt/Command(resume) 最小骨架 + request_id 校验）、C16（上下文压缩触发与安全边界截断：70% 触发、保留后 25%、不切断 tool_call 配对）
   - `05_orchestrator_subgraph.py`：C14（Orchestrator 分派工具 delegate_and_wait/delegate_in_background + 槽位准入 3 + FIFO + 软超时轮询 + teammate 线程复用）、C15（SubgraphToolMiddleware：wrap_tool_call 拦截 → 隔离执行子图 → Command(update) 白名单回写）
   - `06_retrieval_maxsim_rrf.py`：C17（MaxSim late-interaction + 两阶段检索）、C18（RRF 融合，k=60）
   - `07_lora_rlhf_zero.py`：C19（LoRA 前向与参数量估算）、C20（RLHF/PPO 流程伪码：BT loss 训练 RM + PPO 四模型循环 + GAE + KL）、C22（DeepSpeed ZeRO 分片要点 + 显存估算函数：给定参数量/卡数/stage 输出各状态显存）
   - `08_serving_paged_quant.py`：C23（PagedAttention block table + 连续批处理调度器伪码）、C24（GPTQ/AWQ 核心步骤伪码）、C26（RoPE rotate_half，可选）
3. 复用素材（先读再写）：
   - `.scratch/interview-deck/langagent-recap/recap-code/skeleton/runtime_agent_loop.py`、`context_hitl_business.py`、`workflow_agent_teams.py`、`mcp_tool_lifecycle.py`
   - `.scratch/interview-deck/langagent-recap/fact-base.md`（FACT-AGUI/FACT-ASK/FACT-LT/FACT-CMP 条目）
   - `.scratch/interview-deck/langagent-recap/detail-notes/04-summarization-middleware.md`、`06-hitl-and-ag-ui.md`、`07-agent-teams-orchestrator-tools.md`
   - `.scratch/interview-deck/detail-notes/rope-all-in-one-architecture-math-extrapolation.md`（C26）

## 硬性要求
1. 每个函数头部三行注释：`# 考察点: ...` / `# 手写量级: N 行 / M 分钟` / `# 常见追问: ...`。
2. 白板风格：短函数、直白变量名、关键行尾注公式；不 import 真实 LangGraph/torch——用最小伪类/字典模拟接口（如 event = {"type": "TEXT_MESSAGE_CONTENT", ...}），保证纯标准库可运行。
3. 每个文件带 `if __name__ == "__main__":` 断言测试（如 MaxSim 单调性、RRF 排序、LoRA 参数量公式、ZeRO 显存随卡数下降、HITL resume 匹配），写完必须实际运行 `python3 <file>` 全部通过。
4. 口径：C15 注释写明"不改子图契约、不改第三方包"；C14 注明 Agent Teams 是 design_complete 设计稿；禁词：转段、管线、训服分离、数据平面。中文注释，术语保留英文。

## 输出
`.scratch/interview-deck/resume-v3.1-qa/code/` 下 04~08 共 5 个文件。

完成后回复：文件路径 + 每个文件行数 + 每个 __main__ 运行结果（粘贴关键输出）+ 覆盖 code 编号清单。
