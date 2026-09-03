# 任务：写 `02-p2-agent-platform.md`（项目二：企业级 Agent 平台与运行时 面试 Q&A 笔记）

你在为一场 40-60 分钟的简历项目问答面试写备战笔记。项目二占面试时间 25-30%，投 Agent 平台岗时升为重头。

## 必读（按顺序，先读再写）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 总计划与口径红线
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — 你的写作范围是 **§2.2 项目二全部条目 P2-01 ~ P2-30**
3. `/Users/sunxichen/Downloads/简历3.0/孙玺晨-简历-LLM算法工程师-v3.1.pdf` — 简历原文
4. `/Users/sunxichen/Downloads/简历3.0/decisions.md` — 事实口径（重点读"项目二结构"、P6 角色定位）
5. 素材（按 expert 大纲每条标注的位置精读）：
   - `.scratch/interview-deck/langagent-recap/fact-base.md`、`recap-blog.md`、`detail-notes/01-07`、`fragments/`、`issues/`、`recap-code/skeleton/`

## 口径红线（违反即返工）
1. 角色口径：本人主导设计 + 团队共同落地；detail-notes 中的设计均出自本人。每讲一块主动标成熟度：已合入主干 / 参考分支（ChatBI ReAct）/ 探索原型（A2UI）/ design_complete 未实施（Agent Teams）。
2. 动词字面为真：未实施项只说"设计/确立/重设计/探索"，不说"已上线/已实现/带来提升"。
3. 项目二结果行零量化数字，不编。
4. 用户砍掉的细节（PromptProxy 热更新、tool_call_id 旁路度量、Internal API 边界）不进正文，放"口头弹药表"。
5. 禁词：转段、管线、训服分离、数据平面。中文，术语保留英文。

## 输出
文件：`.scratch/interview-deck/resume-v3.1-qa/02-p2-agent-platform.md`

结构（与项目一模板一致）：
```
# 02 项目二：企业级 Agent 平台与运行时 — 面试问答笔记
## A. 60 秒自述
## B. 简历逐句对照表（原句 → 背后事实 → 可说/不可说，成熟度标注在此表完成）
## C. Q&A 清单（P2-01 ~ P2-30，按锚点 A~D 分组）
### P2-xx 问题 ｜ 层级
**30 秒版** / **深挖版**（带来源标注）/ **追问** / **白板**（C11~C16 等）/ **素材**
## D. 口头弹药数字表
## E. 红线与降级话术（成熟度被追问、个人 vs 团队边界被追问的应对）
## F. 素材索引
```

完成后回复：输出文件路径 + 总行数 + 覆盖条目编号清单（P2-01~P2-30 逐个打勾）+ 不确定点。
