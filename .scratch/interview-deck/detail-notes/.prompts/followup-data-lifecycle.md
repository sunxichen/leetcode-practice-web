你要继续修订面试复习笔记。用户看完 Data Lifecycle 文档后仍有疑问，请你基于代码调研补充，不要臆造。

## 目标文件
/Users/sunxichen/Projects/leetcode-practice-app/leetcode-practice-web/.scratch/interview-deck/detail-notes/agentic-gov-data-lifecycle-sft-rl.md

## 代码/文档调研范围
- /Users/sunxichen/Projects/agentic-gov/src/agentic_gov/** 与数据生成、验证、采样、reward、runtime 相关模块
- /Users/sunxichen/Projects/agentic-gov/phase2/**、phase3/**、phase4/**、phase5/**、phase6/** 中与 SFT 数据、ShareGPT、漏斗检验、release gate、eval gate 相关文件
- /Users/sunxichen/Projects/agentic-gov/docs/**、handoff/** 中与 funnel/check/gate/ShareGPT/chat template 相关说明
- 全仓搜索：`ShareGPT`、`sharegpt`、`funnel`、`gate`、`validation`、`validate`、`schema`、`messages`、`role`、`from`、`system`、`human`、`gpt`、`tool`

## 用户 follow-up 疑问（必须直接回答）
1. “多层漏斗检验机制”详述：请把从 task 生成、SFT 样本构造、chat template/tokenization、训练前验收、RL rollout/reward、release/eval gate 的多层检查串起来。每一层说明：输入是什么、检查什么、失败后如何处理、它防的是什么污染/错误。
2. ShareGPT 标准格式的角色定义有哪些？请以项目真实采用的格式为准，明确字段名（如 `conversations` / `from` / `value` 或 `messages` / `role` / `content` 等）、允许角色（如 system/human/gpt/tool 等，以代码为准）、每类角色语义、assistant tool call / tool observation 如何表达、与 chat template 的映射关系。

## 额外要求
- 补充你认为和这两个问题强相关、但原文遗漏的点，例如：loss mask 与角色定义的关系、ShareGPT 到 LlamaFactory/Qwen chat template 的边界、为什么需要多层校验而不是只在最后 eval。
- 写成技术博客风格，专业但不使用黑话；术语首次出现解释清楚。
- 禁止编造。找不到依据时明确写“从当前代码看，无法确认 X”。

完成后回复：修改文件 + 新增/改写章节列表。