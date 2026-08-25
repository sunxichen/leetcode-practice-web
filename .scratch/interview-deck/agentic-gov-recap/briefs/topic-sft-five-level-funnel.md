# 专题 brief：agentic-gov 的 SFT 五级质量漏斗（L0-L5）筛选详解与具体实现

## 背景

项目 `/Users/sunxichen/Projects/agentic-gov` 是公积金政务 agent 的数据合成、SFT、simulator、ART GRPO 研究。用户要求新增一篇可独立阅读的中文专题，讲透 **SFT 5 级漏斗筛选（L0-L5 verifier funnel）**：

输出文件：

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-sft-five-level-funnel.md`

目标不是复述 recap Ch4，而是能让面试时被问“合成轨迹怎么保证能训练？”时，从输入 trajectory 到每一级 verdict、拒绝原因、数据流、实现函数、质量/成本权衡讲完整。

## 调研要求

先通读项目源码与内部一手文档，至少：

- `src/agentic_gov/verifier/` 及其所有子模块
- `src/agentic_gov/l3_tagger/`
- `src/agentic_gov/synthesis/`（注意 online synthesis semantic guard 与 offline funnel 的边界）
- `src/agentic_gov/sampler/`、contrast/adversarial / streams 相关代码
- `phase2/verifier_config/`、`phase2/stage_d_configs/`、release tests、fixtures
- `research-proposal/phase2-verifier-pipeline.md`、NLI/RPCR specs、L2 ADR、implementation-spec 以及 docs experiment notes

核实 L0 到 L5 的真实顺序、是否每个层级所有 stream 都经过、每层的 input/output schema、fail reason、short-circuit 规则、模型/规则/LLM 使用、版本冻结、校准、采样怎样消费结果。若“5 级”在项目中有 L0-L5 共 6 个编号层或不同版本语义，必须一开始解释编号约定，不能悄悄混掉。

## 必须包含的结构

1. **先回答“为什么叫五级却有 L0-L5？”**：项目的实际编号、概念层数、预过滤/后审计边界。
2. **全链路图**：Synthesis raw trajectory → 各 gate → L3 tag/provenance → sampler/stream/release；区分 online guard 与 offline verifier funnel。
3. **逐层深讲（每层一节）**：
   - 目的：该层排掉哪类坏数据、为什么要放在这里
   - 实现：真实模块/函数/类/config，输入输出和 verdict / reason
   - 成本/吞吐：规则 vs sandbox vs NLI/RPCR vs LLM judge，如何 short-circuit
   - 正常例、失败例：使用真实但脱敏的 trace / fixture / task
   - false positive/negative 风险与缓解
4. **L3 Tagger 专章**：为什么它不是纯 gate；它生产的行为/质量标签怎样影响 stratified sampler、coverage、诊断和 release audit。
5. **L2 专章**：NLI premise-per-message、RPCR（核实完整名字/作用），阈值冻结与校准，为什么不使用 full dialogue。
6. **SFT streams 与保留决策**：不同 stream 如何根据 verdict/tag 进入或被拒；contrast / adversarial / hard task 处理差异（只写有证据的）。
7. **端到端最小伪代码**：用项目真实函数名/符号写 60-120 行 Python-style 伪代码，展示 short-circuit、reason accumulation、tagging、sampling；可不可运行均可，但注释必须解释内部逻辑。
8. **质量运营**：版本、threshold/config freeze、calibration、release gate/replay，怎样审计“该过滤器本身没把好样本删掉”。
9. **面试问答**：至少 8 个高频追问（为什么不是单一 LLM judge、NLI 截断、L3 角色、规则冲突、如何调阈值、漏斗 bias、成本、如何与 RL reward 同源）。
10. **Sources**：内部真实文件路径+符号；如使用外部资料，仅补充 NLI/RPCR 背景，不替代项目事实。

## 写作要求

中文，内容准确、平实。不要把 config 名、funnel 层或模块名编造出来；不确定时标注版本和出处。不得改动项目或 recap。完成后回复路径、L0-L5 的最终定义表、关键函数、以及你发现的命名/实现不一致。