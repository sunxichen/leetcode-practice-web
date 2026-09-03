# 简历 v3.1 面试备战材料 · 大纲与写作计划（定稿候选 v1）

> 基底：`expert-outline-fable51.md`（fable 5.1 咨询产出，素材引用已抽查验证全部存在）。
> 本文件 = 结构定稿 + Orchestrator 修订 + 派发计划 + 验收标准。
> 详细条目（逐项目问题清单 P1-01~P4-15、决策卡 D1/D2/D3/D7、白板 code C01~C28、覆盖度自检表 47 行、风险清单 R1~R15）原样采纳 expert 大纲第二~五部分，不在此重复。

## 1. 产出结构（定稿）

```
resume-v3.1-qa/
├── outline-v1.md                # 本文件
├── expert-outline-fable51.md    # 详细条目清单（问题/code/覆盖度/风险）
├── 00-master.md                 # 自我介绍稿（90s/3min 两版）、时间分配、口径红线卡、风险清单、覆盖度打勾表
├── 01-p1-agentic-rl.md          # 项目一：任务型 Agent 后训练（重头，占面试 40-45%）
├── 02-p2-agent-platform.md      # 项目二：企业级 Agent 平台（占 25-30%）
├── 03-p3-colpali-serving.md     # 项目三：ColPali + 私有化部署（理论流程为主）
├── 04-p4-npc-dialogue.md        # 项目四：小冰 NPC 对话（理论流程为主）
├── 05-decision-cards.md         # 决策卡 D1/D2/D3 + 备选 D7（Agent 变体）
├── 06-topbar-skills-patents.md  # 顶栏/简介/技能 6 行/专利论文/教育
└── code/                        # 白板 code，8 个文件按考点聚类，每个可独立跑通 __main__ 小测试
    ├── 01_reward_advantage_passk.py   # C01-C03、C09、C10、C25
    ├── 02_rl_losses_kl_floor.py       # C04、C05、C21、C28
    ├── 03_rl_pipeline_sync_async.py   # C06、C07、C08
    ├── 04_agent_loop_agui_hitl.py     # C11、C12、C13、C16
    ├── 05_orchestrator_subgraph.py    # C14、C15
    ├── 06_retrieval_maxsim_rrf.py     # C17、C18
    ├── 07_lora_rlhf_zero.py           # C19、C20、C22
    └── 08_serving_paged_quant.py      # C23、C24、（C26 可选）
```

项目文件统一模板（01-04）：A 60 秒自述 → B 简历逐句对照（原句→事实→可说/不可说）→ C Q&A 清单（L1 秒答/L2 机制/L3 深挖，问题→要点答案→追问→白板 code 指引）→ D 口头弹药数字表（只进此表不进标题）→ E 红线与降级话术 → F 素材索引。

## 2. Orchestrator 对 expert 大纲的修订（4 处）

- **修订 1 · 专利/论文纳入范围**：expert 将 M-13~M-16 标"需另备专利摘要笔记"。本版纳入 `06-topbar-skills-patents.md`，每项只写 10 分钟答辩骨架（问题域→我的方案→核心权利要求/贡献→与项目的关系），不写全文。素材已就位：`.scratch/interview-deck/patent/` 下三项专利全文 PDF。
- **修订 2 · 时间分配加岗位变体**：expert 的 40/60 分钟表以"项目一重头"为默认。本版补两个变体：Agent 平台岗（P2 与 P1 时间对调，决策卡 D2 换 D07）；部署/检索岗（P3 升为第二重头，白板优先 C17/C23/C24）。写进 `00-master.md`。
- **修订 3 · 白板 code 分 Tier 纪律**：Tier A 8 项（C01/C02/C03/C04/C11/C17/C19/C20）必须 30 分钟内全部盲写一遍且跑通；Tier B 9 项按岗位方向选练；Tier C 6 项会讲伪码即可。code 文件验收标准：无 import 依赖、单个函数可独立手写、`__main__` 断言通过。
- **修订 4 · P3/P4"自拟"条目的事实纪律**：expert 在 P3/P4 标了若干"自拟"条目（无一手素材）。写正文时这些条目只允许讲业界通用机制与方法论（LoRA 数学、S-LoRA、RLHF 流程、ColPali 架构），凡涉及"我在项目里做了什么、效果如何"一律按简历字面（定性、无数字），不得编造实验细节与数字。

## 3. 口径红线（写作与验收共用，源自 decisions.md）

1. T5 千题 final holdout 未执行，永不说"泛化已验证"；96 题测试集不得称 held-out（是训练中参与 steering 监控的 dev 面板，与训练集 family 隔离）。
2. 训练规模数字（步数/轨迹数/GPU 数）只进"口头弹药数字表"，不进标题与正文叙述。
3. 禁词：转段、管线、训服分离、数据平面、硬件线（按 decisions.md 黑话禁令，用直白中文替代）。
4. 动词字面为真：Agent Teams=design_complete 未实施、ChatBI ReAct 在参考分支、A2UI 是探索原型；只说"设计/确立/重设计/探索"。
5. 数字口径：+30.1pp（54.3%→84.4%，SFT 基线，96 题）、FWR 8.6%→80.5%、HV 0.26%（2/768 口头）；+7.8pp、C0→C15、94.1% 丢弃率、14 步压测 44% stale 均为口头弹药。
6. vLLM 6 倍必须框定为"诊断 LoRA kernel 悬崖后绕开恢复"，不是凭空优化。

## 4. 派发计划（herdr + agy CLI + gemini-3.8-flash-high）

每批任务 prompt 必带：①口径红线全文 ②对应项目模板 ③expert 大纲条目编号范围 ④素材路径 ⑤输出文件路径与格式样例。

| 批次 | 任务 | 产出 | 依赖素材 | 并行实例 |
|---|---|---|---|---|
| B1 | 项目一 Q&A 正文 | `01-p1-agentic-rl.md` | AG/ + DN/ + RS/p5、async-rl | agy ×1 |
| B1 | 决策卡 4 张正文 | `05-decision-cards.md` | RS/ + LA/detail-notes/07 | agy ×1 |
| B2 | 项目二 Q&A 正文 | `02-p2-agent-platform.md` | LA/ 全部 | agy ×1 |
| B2 | 白板 code Tier A + RL 系 | `code/01,02,03` | DN/rl-objectives-*.py、AG/recap-code/07,08 | agy ×1 |
| B3 | 项目三理论 + 项目四理论 | `03-p3`、`04-p4` | 通用理论（允许 web research）+ 简历字面 | agy ×2 |
| B4 | 白板 code Agent 系 + 通用系 | `code/04,05,06,07,08` | LA/recap-code/skeleton/ | agy ×1 |
| B4 | 顶栏/技能/专利/教育 | `06-topbar-skills-patents.md` | DEC + 专利素材（待定） | agy ×1 |
| B5 | 总控（最后写，依赖全部产出） | `00-master.md` | 以上全部 + 覆盖度表逐行打勾 | 我自己写 |

## 5. 验收标准（每批回收后我执行）

1. 禁词 grep 零命中；口头弹药数字不出现在标题（grep 步数/轨迹数/94.1/44%/7.8 等）。
2. 抽 5 个 Q&A 对照素材原文核事实。
3. code 文件逐个 `python3 code/xx.py` 跑通。
4. 覆盖度表（expert 大纲第四部分 47 行）逐行打勾。
5. 全部完成后按风险清单 R1~R15 做一轮自问自答演练。

## 6. 用户拍板记录（2026-09-03）

- [x] 大纲整体与 4 处修订确认，按本文件开工。
- [x] 专利素材：`.scratch/interview-deck/patent/` 下三项专利全文 PDF（动态拓扑 CN121561033B、MOPAR CN119250033B、NL2Chart CN118733612A）。
- [x] 并行度：每批最多 3-4 个 agy 实例。B1+B2 合并为第一批 4 实例（p1 / cards / p2 / code-A），B3+B4 为第二批，B5 收尾。
