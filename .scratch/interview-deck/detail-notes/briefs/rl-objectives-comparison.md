# Worker brief：专题《PPO、GRPO、CISPO、REINFORCE、DAPO、GSPO、DPO 的关系、差异与 Loss 实现》

## 背景与目标

读者刚完成 agentic-gov 项目的 recap blog，其中 Ch10 使用了 OpenPipe ART 的 token-level CISPO/GRPO 训练语境。现在需要补一篇**独立的中文专题**，帮助一名算法工程师从同一套目标函数视角理解以下方法：

- REINFORCE
- PPO
- GRPO
- CISPO
- DAPO
- GSPO
- DPO

目标不是做名词百科或只列差异，而是回答：它们各自从哪个共同目标出发，在哪一个环节改了什么，为什么这个差异会改变训练信号、方差、bias、长度偏置、on/off-policy 性或工程行为。读者应能从 Python loss 代码中直观看到相似性和不同点。

## 必须先做联网调研

**先联网搜索与阅读，再开始写作。**优先顺序：

1. 原始论文 / arXiv 页面或 PDF（REINFORCE、PPO、GRPO、DPO、DAPO、GSPO、CISPO）
2. 作者/机构的官方技术报告、官方 GitHub 实现或文档
3. 仅在一手来源缺失时才用高可信二手资料，并明确标注

不要引用营销文章、未署名博客或搜索摘要作为关键数学结论的依据。对每个变体，核实其**正式名称、原论文、objective/loss 公式、是否需要 reference policy、是否 on-policy、ratio 是 token-level 还是 sequence-level、group baseline/advantage 的具体定义**。特别注意：

- DAPO/GSPO 不只是一个 loss；把 loss 内改动与训练/采样系统策略（如 dynamic sampling）分开。
- DPO 不是 on-policy policy gradient；不能为了表格整齐硬塞进 PPO/GRPO 谱系。
- CISPO 的论文/正式定义可能与本地 ART 的具体 `loss_fn` 配置不同；必须区分“原始方法”与“agentic-gov/ART 使用的实现语义”。
- 公式如有不同论文版本/实现变体，明确说明你采用哪一个版本，不能假装全行业只有一个标准公式。

可以阅读项目源代码作为**项目落地上下文**：

- recap：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/agentic-gov-recap/recap-blog.md`（重点 Ch10）
- 项目侧：`/Users/sunxichen/Projects/agentic-gov/phase6/art/train_grpo.py`、`loss_norm_floor.py`
- ART：`/Users/sunxichen/Projects/ART/src/art/loss.py`

但数学/算法事实仍以联网找到的原始论文与官方材料为主。

## 输出文件（只写这两个文件）

目录：`/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/`

1. `rl-objectives-ppo-grpo-cispo-reinforce-dapo-gspo-dpo.md`
2. `rl-objectives-losses.py`

不得修改 agentic-gov、ART 或 recap blog 的任何文件。

## Markdown 必须包含的结构

1. **先给结论/导航图**：用一张关系图或族谱说明：REINFORCE 是 policy-gradient 基础；PPO/CISPO/GRPO/DAPO/GSPO 分别如何从其构成部件衍生；DPO 处在 preference-learning 旁支。不要把谱系表述成严格历史因果，若只是数学关系请注明。
2. **统一记号与共同骨架**：trajectory、token、old policy、reference policy、reward、advantage、importance ratio、mask、group。先写共同的 `-A * log π` 骨架，之后用“改哪个部件”的方式解释。
3. **逐个方法**：REINFORCE、PPO、GRPO、CISPO、DAPO、GSPO、DPO。每个都给：训练数据来源、核心 objective/loss、相较共同骨架改了什么、解决的具体问题、代价/失败模式、是否与其他变体混用/包含。
4. **逐维对照表**：至少包含 on-policy/离线、reward/reward model/preference、critic/reference policy、advantage/baseline、ratio 粒度、clip/KL、loss 归一化粒度、对长度偏置的影响、group 的作用。
5. **为什么这些差异 matters**：不是口号，要用 4-6 个具体场景说明：高方差、ratio 过大、零方差 group、长回答、reward hacking、async rollout/off-policy drift、preference 数据缺少在线 reward。
6. **结合 agentic-gov/ART 的落地阅读**：简短、准确地说明此项目具体采用什么（比如 ART `loss_fn` 的 CISPO 语义、GRPO group advantage、`loss_norm_floor`、async drift 的关注点）；明确“项目实现”不等同于每个算法的唯一官方定义。
7. **代码阅读指南**：讲 companion Python 文件怎样用同一个 synthetic batch 演示每种 loss 的差异；解释哪些训练系统行为不可能只靠一个 loss function 表达。
8. **Sources**：按算法列出原始论文/官方实现的 URL，并标明读者应该看哪一节/公式。保证链接真实、可访问、与正文论断对应。

## Companion Python 代码要求

- 使用 PyTorch，语法合法、可运行（假定 `torch` 已安装），单文件可直接 `python rl-objectives-losses.py` 做 smoke run。
- **每一种方法都要有一个明确的 loss/objective 函数实现**：REINFORCE、PPO、GRPO、CISPO、DAPO、GSPO、DPO。
- 用共享的 toy tensor batch、相同 helper 函数与并排示例，显式展示：
  - token-level vs sequence-level importance ratio
  - vanilla policy gradient vs PPO clip vs CISPO detached clipped weight
  - GRPO group-relative advantage
  - DAPO token-level normalization / asymmetric clipping / dynamic sampling 不属于 loss 的边界
  - GSPO sequence-level geometric-mean ratio 或论文实际定义
  - DPO chosen/rejected 相对 reference 的 logistic objective
- 中文 docstring + 行内注释必须解释内部计算逻辑和与相邻变体的区别，不能只是注释输入输出。
- 明确写出：代码为**教学用最小实现**，省略了分布式训练、tokenization、padding、optimizer、reward 模型、full trajectory rollout 等；不要把教学实现冒充官方训练代码。
- 如果不同论文/实现有分歧，函数名或注释要带版本/假设说明。
- 末尾包含 assert 或打印，验证 loss 为有限值、演示关键的数值关系；不要仅定义函数不运行。

## 写作风格

- 中文，保留必要英文术语/公式。
- 不要黑话、不要营销腔、不要“革命性/颠覆性”措辞。
- 像资深算法工程师给其他工程师讲清一组容易混淆的目标函数；先讲共同结构，再讲差异。
- 数学要精确，但每个公式后都用朴素语言说明“这项梯度实际上在推什么”。
- 主文长度不限，但宁可完整清楚，也不要用一张空洞大表代替解释。

## 完成后回复

回复两个输出文件路径；列出你联网查到并实际使用的第一手来源；说明最需要读者注意的 3 个“不要混淆”的结论；以及任何你发现的术语/论文版本不确定性。
