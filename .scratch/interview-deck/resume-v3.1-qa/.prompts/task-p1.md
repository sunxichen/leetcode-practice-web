# 任务：写 `01-p1-agentic-rl.md`（项目一：任务型 Agent 后训练系统 面试 Q&A 笔记）

你在为一场 40-60 分钟的简历项目问答面试写备战笔记。候选人简历已定稿，笔记严格围绕简历展开。这是重头项目，占面试时间 40-45%。

## 必读（按顺序，先读再写）
1. `.scratch/interview-deck/resume-v3.1-qa/outline-v1.md` — 总计划与口径红线
2. `.scratch/interview-deck/resume-v3.1-qa/expert-outline-fable51.md` — 你的写作范围是 **§2.1 项目一全部条目 P1-01 ~ P1-40**，每条已标注层级/考察点/素材位置，逐条展开成 Q&A
3. `/Users/sunxichen/Downloads/简历3.0/孙玺晨-简历-LLM算法工程师-v3.1.pdf` — 简历原文（逐句对照表要用）
4. `/Users/sunxichen/Downloads/简历3.0/decisions.md` — 事实口径唯一依据
5. 素材（按 expert 大纲每条标注的位置精读）：
   - `.scratch/interview-deck/agentic-gov-recap/fact-base.md`、`recap-blog.md`、`recap-code/01-08`
   - `.scratch/interview-deck/detail-notes/`（任务工厂、沙箱架构、数据漏斗、RL 目标函数等专题）
   - `/Users/sunxichen/Downloads/简历3.0/research/p5-500step-verification.md`、`async-rl-investigation.md`

## 口径红线（违反即返工）
1. T5 千题 final holdout 未执行，永不说"泛化已验证"；96 题测试集不得称 held-out（是训练中参与 steering 监控的 dev 面板，与训练集 family 隔离）。
2. 训练规模数字（步数/轨迹数/GPU 数）只进文末"口头弹药数字表"，不进标题与正文叙述。
3. 禁词：转段（说"SFT 进入 RL 阶段的判据"）、管线（说"训练流程/链路"）、训服分离（说"训练与服务分离"）、数据平面、硬件线。
4. 数字口径：+30.1pp（54.3%→84.4%，SFT 基线，96 题）、FWR 8.6%→80.5%、HV 0.26%（分子分母 2/768 只口头）；+7.8pp、C0→C15、94.1% 丢弃率、14 步压测 44% stale 均只进"口头弹药表"。
5. vLLM 约 6 倍（250→1500 tok/s）必须框定为"诊断出 LoRA kernel 慢路径悬崖后改 Merged serving 恢复"，不是凭空优化。
6. 简历写 GRPO 指组内相对优势估计范式；实际 policy loss 是 ART 默认 token-level CISPO —— 被问 loss 时主动说清这层。

## 输出
文件：`.scratch/interview-deck/resume-v3.1-qa/01-p1-agentic-rl.md`

结构（严格按此模板）：
```
# 01 项目一：任务型 Agent 后训练系统 — 面试问答笔记
## A. 60 秒自述（照简历角色行展开的因果链，留 3 个钩子）
## B. 简历逐句对照表（简历原句 → 背后事实 → 可说/不可说）
## C. Q&A 清单（P1-01 ~ P1-40，按锚点 A~F 分组）
### P1-01 问题原文 ｜ L1
**30 秒版**：2-4 句口头回答要点
**深挖版**：机制细节、数字（带来源标注）、代码位置
**追问**：2-3 个最可能的追问及一句话应答
**白板**：关联 C 编号（如有）
**素材**：文件路径§章节
## D. 口头弹药数字表（只进此表：训练规模、丢弃率、早期 run、分子分母等，每条带一句使用场景）
## E. 红线与降级话术（被问没做/没测/不确定的怎么答：T5 未跑、单一 Simulator 分布等）
## F. 素材索引
```

写作要求：要点式、面试前 10 分钟可扫读；30 秒版必须口语化可直接背；深挖版数字必须能在素材中找到出处并标注来源；中文，术语保留英文。

完成后回复：输出文件路径 + 总行数 + 覆盖条目编号清单（P1-01~P1-40 逐个打勾）+ 你标注的不确定点清单。
