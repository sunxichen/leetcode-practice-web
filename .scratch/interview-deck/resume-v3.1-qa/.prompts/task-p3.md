# 任务：写 `03-p3-colpali-serving.md`（项目三：多模态文档 RAG 与大模型私有化部署 面试 Q&A 笔记）

你在为一场 40-60 分钟的简历项目问答面试写备战笔记。项目三在简历上只有定性描述、无一手 recap 素材，所以本笔记**以业界通用基础理论与流程为主**（允许联网查证论文与官方文档细节），凡是"我在项目里做了什么/效果如何"的回答必须严格限定在简历字面（定性、无数字），不得编造实验细节与数字。

## 必读（按顺序）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 口径红线与修订 4（P3/P4 自拟条目的事实纪律）
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — 你的写作范围是 **§2.3 项目三全部条目 P3-01 ~ P3-19**
3. `/Users/sunxichen/Downloads/简历3.0/孙玺晨-简历-LLM算法工程师-v3.1.pdf` — 简历原文（项目三区块逐句对照）
4. `/Users/sunxichen/Downloads/简历3.0/decisions.md` — "项目三结构"决策

## 内容要求
- 理论深挖方向（每条给足机制级细节，这是面试官能无限追问的地方）：
  - ColPali：VLM 页图像 patch 多向量、late-interaction 与 MaxSim 公式及复杂度、与 bi-encoder/cross-encoder 对比、训练方式（对比学习、in-batch negatives、ViDoRe）、索引存储代价与压缩（token pooling/二值化/两阶段检索）、局限（中文、数值问答、页粒度）
  - vLLM/SGLang：PagedAttention block table 原理、连续批处理与 chunked prefill、RadixAttention、两者选型
  - 量化：GPTQ（二阶误差补偿）vs AWQ（激活感知显著通道保护）机制差异、W4A16、kernel（Marlin/ExLlama）、量化后精度回归方法
  - 昇腾 910B：CANN/torch_npu 栈、vllm-ascend/MindIE、算子覆盖与量化格式差异；口径边界——做的是适配与调优，不是写 kernel
  - 显存估算：KV cache 每 token 大小公式、GQA 影响、最大并发推算（必须能给出一个具体模型的估算示例，如 7B/32 层/GQA）
- 项目侧口径（凡涉及"我做了什么"）：严格按简历字面——引入 ColPali 绕开 OCR、作为通用 RAG 工具接入平台；vLLM/SGLang 双硬件私有化部署并量化调优、提供标准接口；结果定性（免去 OCR 预处理链路、覆盖英伟达与昇腾、平稳支撑）。无真实评测数字，不编。
- 与项目一/二的连接：P3-08（接入平台 RAG 工具，参考 `.scratch/interview-deck/langagent-recap/fact-base.md` 的 FACT-TOOL-005）、P3-19（vLLM 部署经验与项目一 Rollout LoRA kernel 诊断的关系）。

## 输出
文件：`.scratch/interview-deck/resume-v3.1-qa/03-p3-colpali-serving.md`

结构（统一模板）：
```
# 03 项目三：多模态文档 RAG 与大模型私有化部署 — 面试问答笔记
## A. 60 秒自述
## B. 简历逐句对照表（原句 → 背后事实 → 可说/不可说）
## C. Q&A 清单（P3-01 ~ P3-19，按锚点 A/B 分组）
### P3-xx 问题 ｜ 层级
**30 秒版** / **深挖版**（理论条目给机制与公式，标注"通用知识"；项目条目标注"简历口径"）/ **追问** / **白板**（C17/C23/C24）/ **素材**
## D. 口头弹药数字表（本项目几乎为空，注明"无真实数字，被追问给方法不给数"）
## E. 红线与降级话术（被问效果数字、昇腾 kernel 级细节、ColPali 在自家文档上的具体指标时怎么答）
## F. 素材索引（含论文/官方文档链接）
```

中文，术语保留英文，禁词：转段、管线、训服分离、数据平面、硬件线（说"在英伟达与昇腾两种硬件上"）。

完成后回复：输出文件路径 + 总行数 + 覆盖条目编号清单 + 不确定点。
