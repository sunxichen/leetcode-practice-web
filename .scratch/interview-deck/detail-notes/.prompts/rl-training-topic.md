你要新写一篇面试复习专题文档：Agentic-Gov 的 RL Training 真实训练过程与实验复盘。用户特别强调：仓库里有详细 handoff、ADR、experiment-notes；除了 agentic-gov 本身，还要包含 ART 相关内容（/Users/sunxichen/Projects/ART）。

## 产出
写入新文件：/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-rl-training-real-process.md

## 调研范围
主项目：/Users/sunxichen/Projects/agentic-gov
重点：
- docs/experiment-notes/**（尤其 023-031，以及与 P5、Phase 5/6、GRPO、4B、Reward v3、data lineage、curriculum 有关的记录）
- handoff/**（phase6-grpo、free-rollout、reward、sampler、throughput、agent-stage 等）
- docs/decisions/** 或 ADR/decision 文档
- phase5/**、phase6/**、phase3/llamafactory/**、phase3/scripts/**、src/agentic_gov/runtime/**、reward/**、sampler/**、release/**
- pyproject/Makefile/scripts 中训练入口、评估入口、launch 脚本

ART 项目：/Users/sunxichen/Projects/ART
重点查：README、docs、examples、源码中与 GRPO / ART Trainer / rollout / reward / server / LoRA / vLLM / multi-agent 训练相关内容。不要只泛泛介绍 ART，要讲清 agentic-gov 是如何借用或适配 ART 思想/组件的；若没有直接代码依赖，要明确说明是概念/流程借鉴还是外部训练框架。

## 用户必须得到回答的问题
1. P5 的 RL 取得了一些成效，但 P5 这批 RL 数据分布如何？请查明 P5/Phase5/Phase6 中相关 RL 训练数据分布：task type、terminal action、hard family、difficulty、curriculum、K/group size、数据来源等。与前期规划的 RL 应用数据分布之间有什么差异？为什么当时使用了这样的分布？
2. RL 真实训练过程：从 SFT checkpoint → rollout generation → sandbox/reward → GRPO update → checkpoint eval/release gate 的真实链路。请尽量用实验记录还原，而不是写教科书 GRPO。
3. 实验记录复盘：
   - 初期 free rollout / readiness / throughput / drop rate 问题
   - 4B 模型、LoRA/vLLM serving、CUDA 双卡等工程问题
   - reward v2/v3、terminal-gated outcome、hard zero、效率惩罚等演进
   - sampler/curriculum/data distribution 的调整
   - P5 结果为什么“有成效但有限”，后续为何出现数据自洽性/invariant 复盘
4. ART 相关内容：ART 是什么、核心训练抽象是什么、和 agentic-gov RL training 的对应关系是什么；项目是否直接使用 ART 包/源码/思想；如有具体文件/脚本/配置，请引用。
5. 最后给一张时间线表：Phase / 日期 / 主要目标 / 数据分布 / 训练设置 / 发现的问题 / 结论。

## 建议章节结构
1. 导读：这篇文档解决什么问题——不是讲 GRPO 原理，而是还原 agentic-gov 真实 RL 训练史。
2. RL Training 总览架构：SFT base、rollout runner、sandbox、reward、sampler、GRPO trainer、eval/release gate、ART 角色。
3. P5 数据分布与前期规划的偏差：实际用了什么、原计划是什么、为什么偏差合理/不合理、对结果解释造成什么影响。
4. 真实训练链路：一次 GRPO step/round 中数据怎么走。
5. 实验时间线与关键转折：按 experiment-notes/handoff 还原。
6. Reward 与 sampler 演进：为什么 reward v3 terminal-gated outcome、为什么要 variance-aware/curriculum/frontloading。
7. 工程系统问题：throughput、drop rate、vLLM/LoRA serving、2GPU、async pipeline、monitoring。
8. ART 专章：ART 的核心概念与本项目适配/借鉴。
9. P5 成效与局限：为什么说有效、为什么不够、哪些结论后来被修正。
10. 面试回答模板：2 分钟讲 RL Training 的版本。

## 写作风格
- 像成熟工程师写技术博客/实验复盘：专业、清晰、有叙事，不使用黑话。
- 中文写作，代码标识符保留英文。
- 每个术语首次出现要解释。
- 所有数字、日期、分布、结论必须来自代码/文档；不确定就写“当前仓库无法确认”。
- 不要泛泛写 RL 原理，要围绕 agentic-gov 的真实工程过程。

完成后回复：文件路径 + 章节大纲 + 已确认的 P5 数据分布要点 + ART 关系结论。