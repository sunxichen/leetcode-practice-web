# 任务：写 `04-p4-npc-dialogue.md`（项目四：游戏 NPC 人格化对话系统 面试 Q&A 笔记）

你在为一场 40-60 分钟的简历项目问答面试写备战笔记。项目四（小冰，2022-2023）在简历上只有骨架描述、无一手 recap 素材，所以本笔记**以业界通用基础理论与流程为主**，凡"我在项目里做了什么/效果如何"必须严格限定在简历字面，不得编造数字。项目定位是"对话系统基础"——解释候选人 SFT/RLHF 直觉的来源，不要写成第三条算法旗舰。规模锚点只有两个：单卡十余位 NPC、平滑迁移 14B。

## 必读（按顺序）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 口径红线与修订 4
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — 你的写作范围是 **§2.4 项目四全部条目 P4-01 ~ P4-15**
3. `/Users/sunxichen/Downloads/简历3.0/孙玺晨-简历-LLM算法工程师-v3.1.pdf` — 简历原文（项目四区块逐句对照）
4. `/Users/sunxichen/Downloads/简历3.0/decisions.md` — "项目四结构"决策
5. 可参考的相邻素材（方法论继承关系）：`.scratch/interview-deck/detail-notes/rl-objectives-ppo-grpo-cispo-reinforce-dapo-gspo-dpo.md`（PPO/RLHF/DPO 对比）、`.scratch/interview-deck/detail-notes/agentic-gov-task-factory.md`（对抗种子方法论，供"陷阱式对抗样本"类比）

## 内容要求
- 理论深挖方向（每条给足机制级细节）：
  - LoRA 数学：W'=W+BA、秩 r、α/r 缩放、A 高斯/B 零初始化、参数量估算、推理合并零开销、QLoRA 差异
  - 多适配器 serving：2022-23 为什么多 LoRA 热切换不可行（重载/合批/显存碎片/延迟抖动）；今天的 S-LoRA/Punica 统一分页管理与异构 batch 原理；如果今天重做怎么选
  - RLHF 全流程：SFT → 偏好对标注 → RM（Bradley-Terry loss）→ PPO 四模型（policy/ref/RM/value）+ KL；reward hacking 表现；DPO 对比（2023 年中才出现）
  - DeepSpeed ZeRO：stage 1/2/3 分别切什么、通信模式（all-gather/reduce-scatter）、offload、与 FSDP 对照、14B 全参 vs LoRA 显存估算示例
  - BERT 主动对话触发：任务形式化（分类）、特征（静默时长/上文情绪/剧情状态）、为什么用小模型
- 项目侧口径：单基座方案 = 离线剧本 post-training 注入世界观 + 线上角色 Prompt 区分人设；数据与对齐 = 陷阱式对抗样本 SFT + RLHF 人设偏好 + BERT 触发；结果 = 规避显存碎片与热切换开销、单卡十余位 NPC、迁移 14B。"模块负责"边界：数据与对齐 + 服务方案中的算法部分，不是整套对话平台。
- 跨项目连接：P4-10（RLHF 与后来 GRPO 的本质区别：人类偏好 RM vs 可程序化 reward、critic vs 组内基线、单轮 vs 多轮环境）。

## 输出
文件：`.scratch/interview-deck/resume-v3.1-qa/04-p4-npc-dialogue.md`

结构（统一模板）：A 60 秒自述 / B 简历逐句对照表 / C Q&A 清单（P4-01~P4-15，30 秒版 + 深挖版 + 追问 + 白板 C19~C22/C28 + 素材）/ D 口头弹药数字表（注明无数字纪律）/ E 红线与降级话术（被问 2022 年 RM 数据量、PPO 超参、胜率数字时：讲流程与角色不给无出处数字）/ F 素材索引。

中文，术语保留英文，禁词：转段、管线、训服分离、数据平面。

完成后回复：输出文件路径 + 总行数 + 覆盖条目编号清单 + 不确定点。
