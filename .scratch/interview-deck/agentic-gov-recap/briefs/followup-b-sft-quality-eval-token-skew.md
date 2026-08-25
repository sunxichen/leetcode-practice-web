# Follow-up B — L3 Tagger、Family Split、SFT 指标与 Token Skew

## 背景

我们已完成 agentic-gov 面试 recap：

- 最终 blog：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/recap-blog.md`
- 配套代码：同目录 `recap-code/`
- 事实底稿：同目录 `fact-base.md`
- 源项目：`/Users/sunxichen/Projects/agentic-gov`

你负责基于项目代码、experiment notes、评测脚本给 recap 补足 SFT 数据质量与评估细节。**不要直接修改 recap-blog.md 或 recap-code/**，只产出可合并 patch 文档。

## 你负责回答的问题

1. Ch4.2 的 L3 Tagger 有什么用途和作用？它在 L0-L5 funnel 的哪个位置，输出什么，怎样影响下游筛选/采样/分析？不要只说“质量打标”。
2. SFT 家族级切分：`同一业务种子派生的 contrast pair 或同类任务共享底层背景事实`是什么意思？给至少两个真实、脱敏、可口述的例子：一个 contrast/adversarial derivation；一个看上去不同但共享事实、因此必须同 split 的同 family 任务。说明不切会造成哪种 leakage。
3. Ch5.2 SFT 评估指标的计算公式：补全项目真实采用/讨论的核心指标及公式（至少 pass@k、成功率/任务完成、格式/协议 hard violation、需要时 precision/recall/F1、校准/判定指标）。必须明确每个指标的样本单位、分母、何时用；不要为凑公式凭空加指标。也可以简短说明 Phase4 simulator / Phase5 gate / Phase6 中可复用的评估指标，但保持紧贴项目实际。
4. Ch5.3：token 序列渲染不一致导致 hard violation 从约 0% 到 68%+。hard violation 准确定义是什么？为什么“语义类似的 prompt”仍会带来如此大的行为差异？这是过拟合风险吗？写一个能回应面试官的严谨解释：distribution shift、chat template/control token、loss masking/assistant prefix、测试是否表明语义能力退化等。基于真实 tokendiff / experiment note 011/012 的数据，不要泛泛谈 prompt sensitivity。

## 调研要求

先自行通读并核实：

- `src/agentic_gov/l3_tagger/`、`verifier/`、`sampler/`、release tests
- split/family/stream 相关 schemas、dataset builder、Phase2/3 config 和 tests
- `phase3/eval/`、`phase4/eval/`、`phase5/`、`phase6/` 中真实 metrics / report scripts
- docs experiment notes 007, 011, 012，SFT saturation / train-infer template consistency docs
- `fact-base.md` 仅作入口；需独立核查。

## 输出（只写一个 patch 文档）

`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/review-followups/b-sft-quality-eval-token-skew.md`

结构：

1. `## 直接回答`：四个问题，每项有面试口述版和详细版。
2. `## 公式卡片`：指标公式、符号、计算粒度/分母、项目使用位置；公式用 Markdown/LaTex。
3. `## 事实与出处`：具体代码/文档路径、函数/类名、关键数值来源。
4. `## 建议插入 recap 的补丁`：按 Ch4 / Ch5 小节写可直接粘贴正文，包含两个 family split 例子。
5. `## 建议的伪代码补丁`：必要时给真实函数名的短伪代码，解释 L3 标记、family split 或 metrics 的执行逻辑。
6. `## 仍需谨慎的说法`。

## 风格

中文，平实、精确、无黑话。公式之后必须用工程语言解释。完成后回复产出路径与最关键的 3 个面试答法。