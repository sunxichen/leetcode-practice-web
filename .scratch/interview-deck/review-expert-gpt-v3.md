# agentic-gov 自述阶段问题题集第三轮确认（GPT v3）

> 审阅日期：2026-08-11  
> 被审文件：`agentic-gov-self-intro-questions.md` v3  
> 审阅范围：仅核验 v2 的 M1–M6、统计账目、核心/延伸分层，以及修订是否引入新事实错误。

---

# 结论：APPROVE WITH NITS

v2 的六项阻塞问题均已在 v3 中**实质解决**，未发现新引入的科学事实错误。核心层/延伸层的拆分清楚、可执行，已经可以进入制卡阶段。

仅剩两个不影响内容正确性的 metadata 小修：

1. 自查清单仍写“`must 14`”，应改为“`must 15`”。
2. priority 列中的 `must（RL 岗）`、`common（RL 岗 must）` 不符合文件声明的 `must/common/bonus` 三值枚举；若制卡工具按精确字符串解析会漏计。建议 C6/C7 写回 `must`、E4 写回 `common`，岗位弹性继续保留在文件头或锚点中。

这两项可在制卡前顺手修正，不需要再做一轮专家审阅。

---

# 1. M1–M6 核验

## M1：统计与 priority

**结果：实质 PASS，残留两个 nits。**

按题目逐行清点并按作者定义归一化：

- 核心层：25 题
  - must 15：含 C6/C7 的 RL 岗弹性 must
  - common 9：含 E4 的基础 priority common
  - bonus 1
- 延伸层：9 题
  - common 2
  - bonus 7
- 全文件：34 题
  - must 15
  - common 11
  - bonus 8

因此正文统计段的 **25 + 9 = 34、15/11/8** 是正确的。

残留问题：

- 自查清单第 1 项写成“34 = 25 + 9；must 14”，与统计段冲突，应改成 `must 15`。
- 表格 priority 单元格使用了带注释的非枚举值。人工阅读没有歧义，但机械解析只能数到 31 题（会漏掉 C6、C7、E4）。制卡前应把列值标准化，岗位弹性放到其他字段。

## M2：C3 FWR 口径

**结果：PASS。**

v3 已准确区分：

- 基础 main/adversarial 池：FWR 30 条，全部 identity-impersonation，两个字面模板；
- 完整 post-rescan Stream①：FWR 54/3996，约 1.3%。

该表述与 Note 030/031 的不同统计口径一致，不再把 30 条误称为“全库总量”。

## M3：原 C9、现 F2 的错误分类

**结果：PASS。**

F2 已正确写明：

- subject-scoped precondition 在写入前拦截，不落库；
- `PRECONDITION_NOT_MET` 计入 `P_failed_calls`，episode 继续；
- Agent 后续恢复并正确完成时，`R_complete` 仍可为 1；
- `UNKNOWN_TOOL` / `TOOL_NOT_ALLOWED` 属 hard violation；
- 模型输出 envelope、parse、action-contract failure（含 action 缺失）进入 hard-zero；
- sandbox 参数层 `INVALID_FORMAT` 属可恢复 efficiency error。

该口径与 `episode_runner.py`、`reward/hard_violation.py` 和两份 ADR 一致。题目也已下沉到延伸层，层级合理。

## M4：D4 Wave1 根因与修复数字

**结果：PASS。**

v3 不再把缺口断言成“已证明不是模型能力”，而是表述为：

- 现有证据支持 trigger 配额/分布假设；
- 修复假设仍待 80-episode 重测确认。

修复台账也已准确改为：

- 70 行替换/重生成；
- 48 个保留 task id 的内容变更；
- 22 个新 task id；
- 新 pur×Esc L1 为 45 条 frozen。

这与 P5 board 记录 19–21 和 W12 repin 报告一致。

## M5：E4 对照臂与因果识别

**结果：PASS。**

v3 已正确区分：

- arm A = pre-RL SFT ckpt720；
- arm B = 按预注册 checkpoint 选择规则得到的 RL checkpoint；
- 两臂 policy 不同，冻结的是 holdout、judge/JRA、simulator、采样与 look 计划；
- A/B 回答的是“训练后 policy 是否优于起点”；
- A/B 不能单独识别“GRPO 相对 filtered-SFT 的算法特异性贡献”；
- optional arm C 才提供该补充对照，且 descriptive only；未执行时必须承认归因未完整识别。

这是足够严谨且适合面试口述的因果边界。

## M6：C6 算法口径

**结果：PASS。**

v3 已写成：

> GRPO-style 组内相对优势 + ART token-level CISPO loss，非 vanilla GRPO。

同时明确 strict/async 的 2× wall-time 和 44% rollout drop 是工程对照，不是 GRPO/PPO/DPO 的算法选型证据。该表述与 Phase 6 throughput ADR D6 一致。

---

# 2. 是否改出新的事实错误

**未发现新的阻塞性事实错误。**

抽查结果：

- A2 已将“到账时间”改为“处理时效与结果/下一步”，符合 rent policy card 与 submitted/approved 终态。
- C4 Reward v3 公式、`R_complete = R_state × R_terminal`、`R_escalate` 仅作 telemetry 均正确。
- C7 已区分 JRA 已执行与 R3 仅预注册，未再混写已执行/计划。
- D3 已提醒跨池 invalid 数字不能简单加总。
- D4 的 P5 acceptance 摘要虽是口述压缩版，但方向正确：aggregate superiority、terminal/rare-action NI 与 breadth、collapse veto、HV≤1%、judge audit clean。
- E1 已把卡位拓扑改为 packet-dependent，不再把历史 trainer/inference 分卡形态说成永久系统结构。
- F3 已降 bonus，并明确 related-work note 是制卡前置，不会将仓库二手总结直接包装成已完成的文献结论。

---

# 3. 核心层 / 延伸层分层评价

**可接受，且比 v2 明显更适合制卡。**

## 核心层

25 题仍略高于我最初建议的 18–22 题，但目前具备三个合理化条件：

1. 其中 C6/C7/E4 有明确岗位弹性，不要求纯应用岗同权重学习；
2. 核心层已不再包含错误码分类、related work、ART serving、同源细节等深挖项；
3. 题目覆盖完整的真实面试叙事：项目/本人 → 场景与替代方案 → 闭环 → 结果/失败/现状 → 边界与上线。

因此，25 题作为 Opening Core 的**候选池**可以接受。学习系统应继续利用 must/common/bonus 和岗位标签控制抽取权重，不应要求一次面试逐题覆盖。

## 延伸层

9 题下沉合理：

- F1/F2 是 reward/sandbox 第一层追问；
- F3 是 related work；
- F4/F5 是数据与 simulator 泛化风险；
- F6 是方向修正故事；
- F7/F9 是 RL 工程；
- F8 是输出协议。

“照常制卡、低权重学习、面试官主动深挖时启用”的定位清楚。

---

# 4. 制卡前小修清单

仅需两项：

1. 将自查清单中的 `must 14` 改为 `must 15`。
2. 将 priority 列恢复为严格枚举：
   - C6：`must`
   - C7：`must`
   - E4：`common`
   - 岗位弹性继续写在文件头/锚点，或新增独立 `role_override` metadata；不要污染 priority 字段。

完成后即可直接进入制卡，无需第四轮审阅。

---

# 最终判定

> **APPROVE WITH NITS — 内容与事实已达到制卡标准；修正一处 must 数字笔误和三处 priority 枚举格式即可。**
