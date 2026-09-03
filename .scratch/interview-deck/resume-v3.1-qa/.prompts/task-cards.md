# 任务：写 `05-decision-cards.md`（3 张关键技术决策卡 + 备选 D7 卡 面试 Q&A 笔记）

你在为一场 40-60 分钟的简历项目问答面试写备战笔记。简历上有 3 张"关键技术决策"卡（防 Reward Hacking 终态乘法门控 / Async RL 的边界 Merged 单份权重下改走串行 / 多 Agent 编排 Orchestrator-Worker 分派工具化），另有 1 张备选卡 D7（Subgraph 即工具中间件，投 Agent 岗时替换卡 2）。决策卡是面试官最可能逐字追问的区域。

## 必读（按顺序，先读再写）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 总计划与口径红线
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — 你的写作范围是 **§2.5 决策卡 D1-01~D1-07、D2-01~D2-08、D3-01~D3-08、D7-01~D7-04**
3. `/Users/sunxichen/Downloads/简历3.0/孙玺晨-简历-LLM算法工程师-v3.1.pdf` — 卡片原文（必须与简历逐字一致地引用）
4. `/Users/sunxichen/Downloads/简历3.0/decisions.md` — 卡的定稿过程与措辞理由（"调研与终裁""决策卡 2 重框/定稿"章节必读）
5. 素材：
   - D1/D2：`.scratch/interview-deck/agentic-gov-recap/fact-base.md`、`/Users/sunxichen/Downloads/简历3.0/research/async-rl-investigation.md`、`p5-500step-verification.md`、`.scratch/interview-deck/detail-notes/rl-objectives-*.md`
   - D3/D7：`.scratch/interview-deck/langagent-recap/fact-base.md`、`detail-notes/07-agent-teams-orchestrator-tools.md`、`/Users/sunxichen/Downloads/简历3.0/research/expert-decisions-reco-v2.md`

## 口径红线（违反即返工）
1. 卡 2 的论点限定在"Merged 单份权重约束下的机制冲突"，不能被读成"不理解大规模 RL 为何必须异步"；Merged 是主动交换（让出动态 LoRA 多版本换 Rollout 吞吐），不是缺陷。
2. "14 步压测 44% 陈旧废弃率与漂移翻倍"已从卡面删除 —— 只作为追问时的第二论据，正文里标注"（追问再说）"。
3. FWR 8.6%→80.5% 是卡 1 的收底数字；训练规模数字不进正文。
4. Agent Teams 口径 = design_complete 未实施（Master PRD + 6 项 ADR），动词限"设计/确立"；D7 是机制级表述无数字。
5. 禁词：转段、管线、训服分离、数据平面。中文，术语保留英文。

## 输出
文件：`.scratch/interview-deck/resume-v3.1-qa/05-decision-cards.md`

每张卡结构：
```
## D1 防 Reward Hacking：终态乘法门控，拒办不单独加分
> 简历原文（逐字引用）
### 讲卡三板斧（共性问题点题 → 本人岔路与反共识判断 → 验证收底，各 2-3 句口语稿）
### 追问清单（D1-01 ~ D1-07，每条：问题 → 30 秒版 → 深挖版（带来源）→ 白板 code 指引）
### 边界（什么情况下我的结论不成立 / 业界对照）
```
D7 卡注明"备选：投 Agent 平台团队时替换 D2"。

完成后回复：输出文件路径 + 总行数 + 覆盖条目编号清单 + 不确定点。
