# 面试题集：设计与实施方案

本文记录面试问答题集的完整设计决策。领域词汇见 [CONTEXT.md](../CONTEXT.md)，几个不可逆决策的取舍理由见 [docs/adr/](./adr/)。

## 目标

在现有应用中增加第二个题集，用于面试问答的间隔重复训练。内容涵盖项目深挖、技术路线选择、深度学习基础，答案形态包括话术要点与代码实现（attention、loss 等）。用户是唯一作者也是唯一使用者，内容由 LLM 依据 schema 批量生成，应用只读。

## 一、内容模型

题库文件位于 `data/interview/`，按分类分文件：`project.json`、`tech-stack.json`、`dl-basics.json`。`lib/interview.ts` 合并导出，接口与 `lib/questions.ts` 对齐。

```ts
export type InterviewCategory = 'project' | 'tech-stack' | 'dl-basics';
export type Priority = 'must' | 'common' | 'bonus';   // 高频必答 / 常见 / 加分项

export interface CodeSnippet {
  label: string;        // 如 "朴素实现"、"带 mask 的版本"
  language: string;     // 默认 python，走数据而非硬编码
  code: string;
  note?: string;        // 可选说明，复杂度等
}

export interface InterviewCard {
  id: string;                    // 语义 slug，带分类前缀：dl-attention-complexity
  question: string;
  category: InterviewCategory;
  tags: string[];                // 细粒度主题：Transformer、优化器、分布式训练
  priority: Priority;
  hint?: string;                 // 一句话方向指引，不泄露内容
  answer: {
    key_points: string[];        // 3-6 条原子要点，必填
    elaboration?: string;        // 展开叙述、推导
    code?: CodeSnippet[];
    pitfalls?: string[];         // 常见坑与面试官追问点
  };
  follow_ups?: string[];         // 可能的追问
  related_ids?: string[];        // 互链，用于大题拆分后的概述卡 ↔ 深挖卡
}
```

**没有 `difficulty` 字段**，理由见 ADR-0004。

**卡片粒度硬规则**：一张卡等于一次 1-2 分钟内可口述完的回答，要点 3-6 条。超出的大题拆成"一分钟概述卡（STAR 骨架）+ 深挖卡（为什么选这个方案 / 最大的技术难点 / 效果怎么量化 / 重做会怎么改）"，用 `related_ids` 互链。

## 二、内容生产

- `data/interview/SCHEMA.md`：字段定义 + 3 个标准范例 + 一段可直接复制给 LLM 的生成 prompt。
- `scripts/validate-deck.mjs`：校验 id 唯一且符合 slug 规范、`category`/`priority` 取值合法、`key_points` 条数在 3-6 且无空串、`related_ids` 指向存在的卡、`code[].language` 在 prism 支持范围内。
- 同一脚本顺带生成 `data/deck-summary.json`（各题集的卡片 id 列表与分类/重要度分布，几 KB），供首页使用。
- 接入方式：`"build": "node scripts/validate-deck.mjs && next build"`。**不使用 `prebuild`**——pnpm 10 默认不执行 pre/post 脚本。

## 三、调度

一套算法、两套标定值（ADR-0001）。`lib/sm2.ts` 的 `scheduleNext(current, feedback)` 改为 `scheduleNext(current, feedback, params)`，`useStudyQueue` 的队列编织参数同样走 `params`。

```ts
export interface SchedulingParams {
  learningStepsMin: number[];
  relearningStepsMin: number[];
  graduatingIntervalDays: number;
  easyIntervalDays: number;
  hardIntervalFactor: number;
  easyBonusFactor: number;
  maxReviewIntervalDays: number;
  lapseRecoveryIntervalDays: number;
  efPenaltyAgain: number;
  efPenaltyHard: number;
  efBonusEasy: number;
  efMin: number;
  efDefault: number;
  cardsPerMinute: number;          // 队列插回位置估算
  learningReinsertMin: number;
  learningReinsertMax: number;
  newCardsPerDay: number | null;   // null = 无上限
}
```

| 参数 | hot100（现状，不变） | interview |
| --- | --- | --- |
| 学习步长（分钟） | `[10, 60]` | `[5, 25]` |
| 补习步长（分钟） | `[10]` | `[5]` |
| 每分钟卡片数 | `0.25` | `0.67` |
| learning 插回钳制 | `2 - 15` | `3 - 20` |
| 复习间隔上限（天） | `30` | `21` |
| 每日新卡上限 | `null` | `15` |
| 毕业间隔 / Easy 间隔 | `1` / `4` | `1` / `4` |
| EF 相关参数 | 沿用 | 沿用 |

面试卡按 1.5 分钟/张标定：5 分钟约隔 3 张卡重现（清空短期缓冲），25 分钟约隔 17 张（验证跨出工作记忆，仍落在一次 20-30 分钟会话内）。间隔上限比 LeetCode 更紧，因为答案里的数字、公式、项目指标这类细节遗忘快于算法模式。这些值改起来只是动 `DeckConfig` 常量，跑两周不合适再调。

`DailyStat` 新增 `newIntroducedCount` 字段，用于执行每日新卡上限。

## 四、进度存储

每个题集一份独立文档（ADR-0002）：

- KV / localStorage 键：`user_progress:hot100`、`user_progress:interview`
- `/api/progress` 接受 `deck` 参数并按白名单校验，`KV_KEY` 不再硬编码
- `reconcileProgress` 逻辑不变，按题集各跑一次
- `dailyStats` 与 `streak` 成为题集内概念，不存在全局连续天数；`SessionSummary` 文案标明所属题集

`ProgressProvider` 从"单份进度"改为并行加载所有题集，暴露 `useDeckProgress(deckId)`，写入只写对应那一份。首页因此能显示两个入口各自的待复习数。

## 五、会话模式

面试题集的 `SessionMode`：

```ts
| { kind: 'smart' }
| { kind: 'category'; value: InterviewCategory }
| { kind: 'priority'; value: Priority }
| { kind: 'weakest' }
| { kind: 'sweep'; category?: InterviewCategory }   // 全量扫题
| { kind: 'single'; cardId: string }
```

智能队列复用现有编织逻辑（learning 逾期最前 → 复习逾期与新卡 3:1 编织 → learning 待到期插回），两处改动由 `DeckConfig` 驱动：新卡排序改为 `priority` 优先（同级按 id），以及每日新卡引入上限。

**全量扫题**：无视到期时间，按 `priority` 遍历全部卡（可限定分类），自评照常写入调度。用于面试前集中冲刷。不做"设定面试日期倒推排期"——那要引入新的领域概念和一套一年只验证得了一两次的排期算法。

## 六、界面

### 卡片正面
问题文本、分类徽章、重要度徽章、tags、**常驻显示要点数量**（"5 个要点"，作为答案规模标尺）、`hint` 存在时显示"卡住了，给我个提示"按钮。沿用 `CardFront` 刻意隐藏调度细节的做法，不显示 `intervalDays` 等会诱导自评偏高的信息。

### 卡片背面
要点列表（主体）→ `pitfalls` → `code[]`（多段时复用 `SolutionCarousel` 的轮播交互壳，但不复用 `Solution` 类型）→ `elaboration`（可折叠）→ `follow_ups` → `related_ids` 关联卡片入口。

### 自评条
四档按钮按当前卡的要点数 `n` 动态标注命中区间：`hardMin = ceil(0.4n)`、`goodMin = ceil(0.8n)`。`n = 5` 时呈现为"重来 0-1 条 / 困难 2-3 条 / 良好 4-5 条 / 简单 全中且流畅"。零额外点击。

### 题库页 `/interview/browse`
筛选维度：搜索（问题文本 / tag）、分类多选、重要度多选、语义筛选（沿用待复习 / 即将到期 / 易遗忘 / 新卡）。`FilterPanel` 需参数化筛选维度。

列表项**可就地展开只读答案**（查阅，不写任何调度状态），另有独立的"去复习"入口跳单卡模式。查阅与复习是两种不同行为，不共用入口。

### 路由与导航
- `/interview/study`、`/interview/browse` 与现有 `/study`、`/browse` 并列，现有 URL 一律不动（ADR-0005）
- `app/page.tsx` 从 `redirect('/study')` 改为题集入口页，显示两个题集各自的待复习数与新卡数。`manifest.ts` 的 `start_url` 已是 `/`，PWA 无损
- `BottomNav` 保持"学习 / 题库"两个 tab，链接按当前题集解析；首页隐藏 `BottomNav`
- `Header` 品牌位显示当前题集名并可点击返回首页

## 七、数据加载

每个题集的完整 JSON 只被自己的路由静态 `import`（Next.js 按路由分割，两份互不拖累）。首页只读 `data/deck-summary.json`。

参考量级：`data/questions.json` 现为 288 KB / 100 题。全部静态 import 保证 PWA 离线可用；按需 fetch 会引入加载态、缓存失效、离线三个新问题，暂不采用。

## 八、实施顺序

### 阶段一：重构与抽象（不加任何新功能，hot100 行为逐位不变）
1. 引入 vitest，为 `lib/sm2.ts` 的 16 条状态迁移分支与队列生成函数写单测，**先锁定现有行为**
2. 手动导出一份 KV 进度快照留底
3. `SchedulingParams` 提取，`scheduleNext` 与队列编织改为显式接收参数，hot100 用与原常量逐位相同的默认值
4. `DeckConfig` 概念落地
5. `ProgressProvider` 改形为按题集索引，`/api/progress` 支持 `deck` 参数
6. 从 `app/study/page.tsx` 抽出 `useStudySession` + `StudySessionShell`，现有 `/study` 改为薄壳

### 阶段二：面试题集最小可用
1. `InterviewCard` 类型、`lib/interview.ts`
2. `data/interview/SCHEMA.md`（含生成 prompt）、`scripts/validate-deck.mjs`、build 脚本串联
3. **先只写 20-30 张真实卡**，实际刷两天，确认要点粒度与 1-2 分钟规则成立后再批量生成
4. `InterviewCardFront` / `InterviewCardBack` / 要点锚定的自评条
5. `/interview/study`：智能复习 + 全量扫题

### 阶段三：外围补齐
首页题集入口页、`/interview/browse`（含只读展开查阅）、`related_ids` 互链跳转、重要度徽章、按分类 / 按重要度模式、`SessionSummary` 题集文案。

## 九、已知风险

| 风险 | 应对 |
| --- | --- |
| 参数化重构时默认值未对齐原常量，导致 hot100 间隔悄悄改变且无法追溯 | 阶段一先写锁定现有行为的单测 |
| 要点粒度定得不对，几百张卡需要重做 | 阶段二先写 20-30 张验证 |
| 加题后忘记重新生成 `deck-summary.json`，首页计数偏差 | 校验脚本检查摘要是否过期，串进 build |
| 自评仍然虚高（锚文案不足以约束） | 跑两周后观察 `lapses` 分布；必要时再评估勾选式自评 |
