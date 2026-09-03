# Spec: langAgent 工程复现材料（recap blog + recap code）

来源：围绕 `langAgent` 面试复现材料进行的第一轮 grilling。本文是后续事实审计、第二轮 grilling、长文写作与白板代码整理的唯一规格基线。

## Problem Statement

用户需要系统复习并复现 `langAgent` 项目。项目已经从配置驱动的单 Agent 动态图扩展到 Long Task Agent、Daytona Sandbox、Workspace 与 Artifact、Memory、上下文自动压缩、Skill、Ask User、A2UI 等机制，并继续演进到 Workflow/Chatflow 和 Agent Teams。当前知识分散在最新 `develop` 源码、本地功能分支、测试、PRD、SPEC、ADR、原型、研究报告和 Git 历史中，且本地工作分支落后或领先于部分线上状态，无法依靠单一 checkout 建立准确全貌。

用户需要的不是源码目录说明，也不是只覆盖 happy path 的 demo，而是一套 minimal 但机制完整的工程复现材料。材料应当帮助读者理解系统蓝图、关键控制流、状态与协议边界、失败恢复和设计演进，并能支撑高级 Agent 应用/平台工程师岗位的 20 至 30 分钟项目陈述。与此同时，正文仍应是一篇有独立技术深度的专业工程 blog，而不是面试题速记。

recap code 的目标不是端到端运行，而是帮助用户在白板场景中还原真实系统的关键实现。关键类名和函数名必须来自项目源码、框架源码或已经确认的设计契约；注释既要解释函数在全链路中的作用，也要在必要处说明函数内部的执行逻辑。代码必须保持 minimal，不应机械展开每一个叶子函数。

由于代码、PRD 和 commit 不能独立证明真实线上事故、方案比较和实际效果，正式写作前必须先建立证据化 fact base，再进行第二轮 evidence-gap grilling。未经用户确认的历史不得被写成事实，设计态能力不得被描述为已上线能力。

## Solution

产出一套以 `langAgent` 为中心的工程复现资料，包含：

1. 一篇单文件中文长文，以一次 Long Task 请求的端到端生命周期为主线，穿插影响架构走向的工程决策、失败模式和升级过程。
2. 一组语法合法但无需运行的 Python 伪代码，按核心能力与平台演进分组，用于记忆关键控制流和白板手写。
3. 一份可追溯 fact base，记录每条重要 claim 的证据、成熟度、置信度和是否需要用户确认。
4. 一组专题 briefs，汇总每个机制的源码、测试、文档与框架事实，供写作阶段使用。
5. 一份 evidence gaps 清单，仅保留源码和文档无法回答的设计历史、线上现象、方案取舍与效果问题。
6. 两轮分离的 grilling：第一轮确认范围与写作规则；第二轮在事实审计后核验 evidence gaps，并冻结可写事实。
7. 一份面向使用的 20 至 30 分钟自述路线，以及正文末尾的高频追问和白板代码索引。它们是辅助入口，不主导正文结构。

正文以 `langAgent` 的运行时职责为边界。Dify、LangFlowMVP、aibot-service、管理端和用户端仅在解释集成契约、运行语义或跨服务一致性时出现，不扩展为其他仓库的完整复现。

## User Stories

1. 作为项目核心设计与实现参与者，我想用第一人称讲清项目为何这样设计，以便展示真实的架构 ownership。
2. 作为复习者，我想先看到一张完整系统蓝图，以便快速建立单 Agent、Long Task、Workflow 和 Agent Teams 的关系。
3. 作为读者，我想沿一次 Long Task 请求走完整条执行链，以便理解组件如何在真实运行中协作。
4. 作为读者，我想理解通用 Dynamic Agent 与 Long Task Agent 的职责边界，以免把两套运行时混为一谈。
5. 作为读者，我想理解 ReAct loop 的决策、工具调用、观察、回边和终止，以便口述 Agent 最核心的执行模型。
6. 作为读者，我想理解 LangGraph state、reducer、checkpoint 和 interrupt 语义，以便解释状态如何跨节点和跨请求持续。
7. 作为读者，我想理解配置如何驱动动态图编译与缓存，以便解释平台如何承载不同业务 Agent。
8. 作为读者，我想区分普通工具、图节点、子图入口和 subgraph-as-tool，以便说明不同扩展机制的适用场景。
9. 作为读者，我想理解动态 MCP 工具的 schema、认证、执行、超时和结果回传，以便讲清免注册工具接入。
10. 作为读者，我想理解 RAG、文件上下文和多模态上下文如何进入模型，以便说明知识接入不是简单拼 prompt。
11. 作为读者，我想理解 Long Task Agent 的初始化、middleware 组装、事件流和收尾，以便掌握长任务编排主干。
12. 作为读者，我想理解 Workspace 与 Daytona Sandbox 生命周期，以便解释隔离执行和资源复用。
13. 作为读者，我想理解密文环境变量如何被安全地注入沙箱，以便说明凭证边界和日志脱敏。
14. 作为读者，我想理解上传文件如何进入沙箱，以便说明对象存储、文件解析和执行环境的连接。
15. 作为读者，我想理解 Artifact 的发现、导出、hash 去重、外部化和恢复，以便说明临时沙箱中的产物如何持久交付。
16. 作为读者，我想理解沙箱重建后的 Artifact 回灌和防重复 externalize，以便掌握非 happy path 下的数据一致性。
17. 作为读者，我想区分对话历史、checkpoint 和长期记忆，以便避免把所有上下文机制都称为 memory。
18. 作为读者，我想理解 User Global 与 User-Agent memory 的 namespace 和隔离，以便解释跨会话记忆如何避免串扰。
19. 作为读者，我想理解自动上下文压缩的触发、摘要、消息替换和失败降级，以便说明长会话如何持续运行。
20. 作为读者，我想理解压缩事件如何被观测，以便解释 token 使用和上下文变化如何对前端及运维可见。
21. 作为读者，我想理解 Skill 导入、校验、signature、缓存、选择和渐进加载，以便说明过程性知识如何按需进入 Agent。
22. 作为读者，我想理解 Skill 激活去重与安全事件，以便说明可观测性不应改变工具执行结果。
23. 作为读者，我想理解 Ask User 的 typed contract、稳定 request ID、interrupt 和 resume，以便解释 Human-in-the-loop 的确定性恢复。
24. 作为读者，我想看到 Ask User 的重复提交、快照缺失、取消和恢复失败路径，以便理解它不是只有 pending 卡片的 happy path。
25. 作为读者，我想理解 AG-UI 的 run、message、tool、activity、custom 和 artifact 事件，以便掌握 Agent 与前端之间的协议层。
26. 作为读者，我想理解 deepagents/LangGraph 事件如何被 Event Bridge 和 middleware 转换，以便说明领域执行与展示协议如何解耦。
27. 作为读者，我想理解流式接口与 blocking 接口如何共享事件语义，以便解释多种调用方式的一致性。
28. 作为读者，我想理解客户端断连、取消传播、后台收尾和流关闭，以便回答生产长连接中的可靠性问题。
29. 作为读者，我想沿 ChatBI、DataEnvelope、Visualization/A2UI 到 AG-UI Activity 的代表链路理解业务子图。
30. 作为读者，我想理解 ChatBI 从固定节点流水线升级到 agent loop 的结构变化、收益和代价，以便看到真实架构演进。
31. 作为读者，我想理解 SQL 生成、自检、纠错和退出条件，但不需要逐个背诵所有 prompt 和业务 CRUD。
32. 作为读者，我想理解 Visualization 的 spec 生成、校验、重试与 ToolMessage 回传，以便掌握白盒子图的价值。
33. 作为读者，我想理解 Report 与 A2UI 的入口、状态、输出和交互回流，以便获得业务能力全貌。
34. 作为读者，我想理解初始化失败、模型超时、工具异常、沙箱异常和事件异常的分层处理，以便说明错误为何不能统一吞掉。
35. 作为读者，我想理解 correlation、幂等、去重、参数遮蔽和事件配对，以便掌握协议一致性和安全边界。
36. 作为读者，我想理解 Opik、工具统计和结构化日志如何关联 run 与 workspace，以便说明系统如何观测。
37. 作为读者，我想适度下钻 LangGraph、deepagents、AG-UI 和 Daytona 的关键内部语义，以便证明项目不是简单调包。
38. 作为读者，我想理解开放式 Agent loop 与确定性 Workflow/Chatflow 的边界，以便说明平台为什么需要第二种编排范式。
39. 作为读者，我想理解 Workflow asset、runtime contract、事件适配、human-input bridge、checkpoint 和版本语义，以便掌握集成蓝图。
40. 作为读者，我想理解 Dify 与 LangFlowMVP 路线比较和 fallback gate，以便复述技术选型依据而不是只报框架名称。
41. 作为读者，我想理解 Agent Teams 的 Orchestrator、持久 Teammate、assignment、并发和双层超时，以便掌握多 Agent 调度模型。
42. 作为读者，我想理解 Team Event、read model、断连执行、权限和审计，以便说明多 Agent 系统的生产化边界。
43. 作为复习者，我想让 recap code 使用真实函数名与关键控制流，以便在白板上还原项目而不背一套虚构 API。
44. 作为复习者，我想让关键函数的内部机制得到代码或文字解释，以便在追问时能继续下钻。
45. 作为复习者，我想让标准算法和第三方样板保持简写，以便 recap code 仍然 minimal。
46. 作为复习者，我想区分必须能默写、需要能解释和追问时展开的代码，以便合理分配准备时间。
47. 作为事实核验者，我想让每个重要 claim 都有证据类型和成熟度，以便避免把 PRD 意图写成实现结果。
48. 作为事实核验者，我想把真实线上事故与一般失败模式分开，以便不根据 commit message 虚构影响。
49. 作为项目参与者，我想在第二轮 grilling 中只回答源码无法回答的问题，以便把时间用于补充真实设计历史。
50. 作为项目参与者，我想在正式写作前确认并冻结 fact base，以便所有后续章节使用同一套事实。
51. 作为读者，我想获得一篇连贯的单文件长文，以便不在多个专题之间来回跳转。
52. 作为读者，我想看到设计决策以触发场景、问题、候选方案、选择、代价和结果组织，以便理解架构为何演进。
53. 作为读者，我想看到具体非 happy path 和恢复流程，以便材料不成为只展示成功演示的宣传稿。
54. 作为面试准备者，我想获得一条 20 至 30 分钟自述路线，以便从深度正文中提炼陈述主干。
55. 作为面试准备者，我想获得高频追问和白板代码索引，以便快速定位需要复习的实现。
56. 作为后续研究者，我想保留 fact base、briefs 和专题入口，以便继续扩写更深的专题 blog。
57. 作为写作 worker，我想亲自核对负责主题的源码、测试和设计材料，以便 fact base 作为共享约束而不是未经验证的二手结论。

## Implementation Decisions

### 叙事身份与边界

- 采用“核心设计与实现参与者”的第一人称叙事。
- 目标岗位定位为高级 Agent 应用/平台工程师，兼顾架构 ownership。
- 以 `langAgent` 的运行时、编排、状态、协议、可靠性与平台演进为中心。
- 外部后端和前端只讲与 `langAgent` 直接相关的资产、权限、API、事件和一致性契约。
- Dify、LangFlowMVP 和第三方框架只下钻到集成所依赖的一层运行语义，不写通用源码教程。

### 事实基线与成熟度

- 最新远端 `develop` 的 detached reference worktree 是当前已合入能力的主要源码基线。
- 本地 A2UI 分支及其测试用于核验已经实现但未出现在最新 `develop` 工作树中的基础能力。
- Workflow/Chatflow 与 Agent Teams 使用 PRD、SPEC、ADR、研究报告、原型和相关框架源码建立设计事实。
- 每条重要 claim 标记为已实现、原型验证、设计完成、提议、已废弃或待确认。
- PRD/SPEC 可以证明目标、约束和设计契约，不能单独证明已实现、已上线或产生了实际效果。
- 证据按问题分工：PRD/SPEC/tickets/ADR 是设计意图基线，`develop` 源码与测试是当前实现基线，二者不存在跨问题通用的单一优先级。
- 每个核心机制都要建立“设计意图—当前实现—偏差/演进”对照；偏差原因若仓库无法证明，进入第二轮 grilling，不由 worker 猜测。
- 第一人称 ownership 必须区分“我参与或主导的设计”和“团队最终落地的实现”，不得暗示作者亲自编写所有实现细节。
- commit 和回归测试可以证明结构变化或失败模式，不能单独证明事故影响范围。
- 未经用户确认的线上历史只能进入 evidence gaps，不得进入正式叙事。
- fact base 是共享证据索引和事实约束，不替代写作 worker 对原始材料的阅读。
- 每个写作 worker 必须重新研究负责主题的源码、测试、文档和必要的框架实现，并与 fact base 交叉验证。
- 写作 research 发现冲突、遗漏或过期结论时，必须回写 fact base 或重新打开 evidence gap，不能在章节中静默修正。

### 两轮 Grilling 与事实冻结门

- 第一轮 grilling 只确认产物范围、叙事规则、代码形式、证据纪律和机制清单，现已完成。
- 源码审计阶段先生成 fact base、专题 briefs 和 evidence gaps，不开始写正式 blog。
- 第二轮 grilling 是独立的 Human-in-the-loop blocking gate，只处理 evidence gaps 中无法从仓库回答的问题。
- 第二轮问题逐个提出，每个问题附已有证据、未知点和推荐表述。
- 用户回答被整理为可发布事实、需脱敏事实、仅供理解但不发布的信息或仍然未知的信息。
- 第二轮结束后由用户明确确认事实底稿；未经确认，任何正文或 recap code 写作 ticket 不得开始。
- 后续发现事实冲突时重新打开对应 evidence gap，而不是由写作阶段自行选择版本。

### 主文结构

- 最终交付是一篇单文件中文长文，不设严格字数上限。
- 主线是一条完整 Long Task 生命周期：请求与配置、构建 Agent、agent loop、工具和子图、workspace 与 sandbox、memory/context/skill、Ask User、事件和 artifact、错误恢复与收尾。
- 通用 Dynamic Agent 是底座，Long Task 是主要讲解骨架。
- A2UI 是已实现的基础交互能力，放在结构化输出和 Human-in-the-loop 相关章节。
- Workflow/Chatflow 和 Agent Teams 进入正文，作为平台编排与协作维度的演进，并明确成熟度。
- 每个核心章节穿插一至两个工程决策或失败模式，采用触发场景、问题、候选方案、最终选择、代价、结果和回归验证的结构。
- ChatBI 架构升级作为业务子图章节的重点决策插叙，使用升级前后架构对照。
- 全部业务子图进入能力全貌，但只深拆 ChatBI、DataEnvelope、Visualization/A2UI 代表链路。
- Report、RAG 和其他辅助能力讲清入口、状态、关键节点、异常和输出契约，不逐节点展开所有 prompt 与 CRUD。
- 正文只在必要处保留真实函数名和最多文件路径，不展示 commit hash 或密集源码脚注。
- 20 至 30 分钟自述路线置于开头独立小节；高频追问与白板索引置于文末附录，不干扰正文。
- 值得继续深挖但会打断主线的内容标成专题入口，为后续专题 blog 保留扩写空间。

### 机制覆盖

- 核心运行时覆盖 ReAct、state/reducer、动态图编译、图缓存、plugin/subgraph、工具分类、模型路由、reasoning 与 checkpoint。
- 工具与知识覆盖动态 MCP、RAG、BAML、文件/多模态上下文、多工具调用和 subgraph-as-tool。
- Long Task 覆盖 service 编排、deepagents agent 构建、middleware 顺序、Workspace、Daytona、环境变量、文件导入和资源收尾。
- Artifact 覆盖 export、bundle、目录同步、hash 去重、externalize、跨沙箱 restore 与部分失败。
- Memory/Context/Skill 覆盖短期历史、长期 memory namespace、backend、上下文压缩、压缩观测、Skill 导入、选择、渐进读取和激活去重。
- Human-in-the-loop 与协议覆盖 Ask User contract、interrupt/resume、参数遮蔽、AG-UI、Event Bridge、SSE、blocking aggregation、断连和 cancellation。
- 业务能力覆盖 ChatBI 升级、SQL 生成和纠错、DataEnvelope、Visualization、Report、RAG 与 A2UI。
- 生产化覆盖错误分层、幂等关联、安全遮蔽、Opik、工具统计、Nacos、测试和恢复。
- Workflow/Chatflow 覆盖编排边界、引擎选型、资产版本、runtime contract、AG-UI adapter、human-input bridge、checkpoint、并发、取消、重试、安全和可观测性。
- Agent Teams 覆盖 Team asset、Orchestrator、持久 Teammate、assignment admission、同步/后台执行、follow-up/redirect、双层超时、Team Event、read model、断连恢复、权限和审计。

### Recap Code

- recap code 是语法合法但无需运行的 Python 伪代码，不提供可运行 demo、fake adapter、安装步骤或启动脚本。
- 已实现能力与设计演进能力分组存放，设计态文件在顶部标记具体成熟度。
- 类名和函数名优先来自真实项目源码；框架内部机制使用对应框架的真实名字；设计态能力使用已确认的契约名。
- 不为填满骨架而发明看似真实的 API。
- 关键函数同时解释其全链路作用和必要的内部步骤。
- 涉及关键状态变化、路由、重试、恢复和一致性的函数使用伪代码展开。
- 标准算法、第三方样板和非关键叶子逻辑可用函数内文字解释，不要求全部展开。
- 与面试无关的 HTTP、CRUD、日志和配置拼装使用省略号或简短注释压缩。
- 每个文件标记必须能默写、需要能解释和追问时展开的内容。
- 代码包含 happy path、至少一个关键异常分支，以及少量跨文件 execution trace。
- ChatBI recap code 以升级后的 agent loop 为主，旧版固定图只保留最小对照。

### Deliverables

- `spec-recap-blog.md`：本规格。
- `fact-base.md`：事实、证据、成熟度、置信度和可发布状态。
- `evidence-gaps.md`：第二轮 grilling 的唯一问题来源和状态记录。
- `briefs/`：按机制组织的核验材料。
- `recap-blog.md`：最终单文件长文。
- `recap-code/core/`：已实现能力的白板型伪代码。
- `recap-code/evolution/`：Workflow/Chatflow 与 Agent Teams 等设计演进代码。
- 允许写作阶段使用分章草稿，但最终读者入口仍为单文件 blog。

## Testing Decisions

### 验收原则

- 验收材料对读者呈现的外部行为、机制完整性和事实准确性，不测试文档生成过程本身。
- 不以篇幅、章节数量或代码行数作为质量指标。
- 每项检查都应能指出具体遗漏、矛盾或无法复述的机制。

### Fact Base 验收

- 已确认机制清单中的每个机制都映射到至少一条 fact 或被明确标记为待研究。
- 关键 claim 至少有一种证据；涉及实现与设计一致性的 claim 使用两种证据交叉验证。
- 证据明确区分源码、测试、文档、Git 演进、框架源码和用户口述。
- 每个核心机制均分别记录设计 claim、实现 claim 和 delta；不得用代码替代设计 claim，也不得用 PRD 替代实现 claim。
- 设计态、实现态、上线态和废弃态不得混写。
- 同一主题存在文档与代码冲突时，记录冲突并进入 evidence gaps，不静默选边。
- 脱敏要求记录在 claim 级别，避免写作阶段泄露内部地址、凭证、客户或业务敏感数据。

### 第二轮 Grilling 验收

- 只有仓库无法回答且会影响叙事准确度的问题才能进入第二轮。
- 问题逐个提出，不把多个独立决策打包询问。
- 每个高影响 evidence gap 最终处于已回答、明确不公开、允许保留未知或移出范围之一。
- 用户显式确认冻结后的 fact base，写作 tickets 才能解除阻塞。

### Blog 验收

- 开篇蓝图能在短时间内说明平台定位、核心执行面和能力演进。
- Long Task 主线从请求进入走到事件关闭、资源收尾和产物交付，不出现链路断点。
- 每个核心机制包含为什么存在、如何工作、边界在哪里和失败时怎样处理。
- 决策插叙由证据支持，不制造 A/B 实验、收益数字或线上事故。
- ChatBI 升级、Ask User、context compaction、memory、skill、sandbox、artifact、Workflow 和 Agent Teams 均达到规格要求的深度。
- 正文对当前实现、原型验证和设计演进使用一致且醒目的措辞。
- 自述路线可在 20 至 30 分钟内覆盖项目主干，但正文不被该时长压缩为提纲。
- 全文术语、状态名、事件名和组件职责一致。

### Recap Code 验收

- 所有 Python 文件通过语法编译检查，不要求依赖可导入或代码可运行。
- 关键类名和函数名抽样与真实源码、框架源码或设计契约核对。
- 每个核心文件说明其在全局链路中的位置。
- 关键函数的注释解释内部执行顺序、状态变化、失败策略和下游消费方式。
- minimal 代码不把关键机制藏在一个无说明的函数调用后，也不机械复制项目实现。
- 代码与 blog 对同一机制使用一致的名字、状态和执行顺序。
- execution trace 能跨越入口、Agent、工具/子图、事件和收尾，帮助读者重建完整链路。
- 每个章节和代码 ticket 都记录其独立核对过的原始材料；不得只引用 topic brief 或复制 fact base 表述。

### 最终一致性检查

- 使用机制覆盖矩阵核对 spec、fact base、blog 和 recap code。
- 抽样检查正文 claim 是否能回溯到 fact base。
- 检查 Mermaid/ASCII 图、状态机和事件序列与文字描述一致。
- 模拟一次 20 至 30 分钟自述，记录无法顺畅连接的章节并修订。
- 对高频追问进行反向检查：答案能否从正文或 recap code 中直接找到依据。

## Out of Scope

- 构建可运行的端到端 demo。
- 复现真实 Daytona、MCP、LLM、对象存储、Dify 或跨服务部署环境。
- 完整介绍 aibot-service、管理端、用户端及其 CRUD 或页面实现。
- 把 Dify、LangFlowMVP、LangGraph、deepagents、AG-UI 或 Daytona 写成通用源码教程。
- 逐个解释 ChatBI、Report 等业务模块的全部 prompt、schema 和数据访问代码。
- 根据 commit message、测试名或 PRD 推断未经确认的线上影响和业务收益。
- 在事实冻结前开始正式 blog 或 recap code 写作。
- 编写英文版本。
- 在本轮交付中直接扩写所有专题 blog。

## Further Notes

- 写作语言为中文，保留必要的英文技术术语和真实 API 名称。
- 使用 ASCII 或 Mermaid 表达全链路、状态机、事件序列和架构升级，图只在能显著降低理解成本时出现。
- `minimal` 指保留决定系统行为的骨架、关键设计和异常路径，不等同于浅层摘要。
- source audit 可以读取最新 `develop` worktree、本地功能分支、相关框架仓库和设计材料，但不修改 `langAgent` 工作目录。
- 第二轮 grilling 是正式写作的硬门禁，也是用户口述事实进入材料的唯一受控入口。
- 后续专题 blog 应复用 fact base 和 briefs，不重新根据源码猜测项目历史。
