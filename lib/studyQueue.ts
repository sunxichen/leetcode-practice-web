import type { Difficulty, QuestionProgress, SessionMode } from '@/lib/types';
import type { SchedulingParams } from '@/lib/schedulingParams';

/**
 * Session engine seam (会话引擎缝) — queue generation as a pure module boundary.
 *
 * Given the card set, the user's progress, the deck's scheduling params
 * (调度参数), the session mode and the current time, produce the queue order.
 * Everything is injected by the caller; this module reads no module-level
 * constants, no storage and no system clock beyond the `now` default, so the
 * same inputs always yield the same queue. The hook (hooks/useStudyQueue.ts)
 * keeps only state and side effects; all sorting and weaving lives here.
 *
 * Moved verbatim out of the hook — LeetCode 题集 queue output is bit-identical
 * to the pre-extraction implementation, including known quirks pinned by the
 * regression tests (pending learning cards are spliced into the woven segment,
 * not the final queue; the learning branch does not fall back to the legacy
 * nextReviewDate field). Brand-new cards keep question-bank array order unless
 * the deck injects a sorter via QueueOptions (面试题集按重要度，ADR-0004) —
 * Hot100 不注入，其顺序逐位不变，由回归测试钉死。
 */

/**
 * 队列引擎对卡片的最小结构化约束：一个用于索引进度与队列的 id。
 *
 * 引擎不绑定 LeetCode 题集的 Question 类型——第二个题集的卡片是
 * InterviewCard（没有 difficulty，有 category 与 priority），它原样满足本约束。
 * 按难度、按标签这类筛选模式对字段的要求属于模式自身，不属于所有卡片：
 * 见 generateQueue 的 'difficulty' / 'tag' 分支，以及题集配置里的
 * 可选会话模式清单（DeckConfig.sessionModes）——清单才是"该题集不提供
 * 某模式"的语义边界。
 */
export interface SessionCard {
  id: string;
}

/**
 * smart 队列的可选行为注入（票 10）。全部缺省时行为与注入前逐位一致，
 * 现有调用方不传本参数即零变化。
 *
 * 引擎本身不认识任何题集特定字段——排序能力由题集配置以函数注入
 * （DeckConfig.sortNewCards），引擎不在通用代码里引用 priority 等字段。
 */
export interface QueueOptions<C extends SessionCard = SessionCard> {
  /**
   * 今日已引入的新卡数：由调用方从当前题集的 dailyStats 按本地日期读取
   * （`dailyStats?.[today]?.newIntroducedCount ?? 0`）。与调度参数的
   * newCardsPerDay 共同决定 smart 队列的剩余新卡额度；未传时按 0 处理。
   * newCardsPerDay 为 null 的题集（Hot100）无上限，本值不被消费。
   */
  newCardsIntroducedToday?: number;
  /**
   * brand-new 段的引入顺序（每日新卡额度花在哪些卡上）。只作用于
   * brand-new 段——learning 逾期、review 逾期、3:1 编织与 learning 插回
   * 的既有顺序不受影响。缺省 = 保持输入题库数组顺序（Hot100 现状）。
   */
  sortNewCards?: (cards: C[]) => C[];
}

/**
 * Build a fresh study queue snapshot for SMART mode (SM-2 driven).
 *
 * Priority (woven so users see progress on new material too):
 *   1. learning / relearning cards whose dueAt is already past — at the very front
 *   2. review cards that are overdue (sorted by how overdue), woven 3:1 with new cards
 *   3. brand-new cards — order injected via options.sortNewCards (default:
 *      question-bank array order, pinned by the '30', '4', '100' regression
 *      test), then capped to today's remaining new-card allowance
 *      (params.newCardsPerDay; null = unlimited)
 *   4. learning cards whose dueAt is in the future — spliced into 2-3 at clamped
 *      positions [params.learningReinsertMin, params.learningReinsertMax] so they
 *      recur within the current ~10-min session window (Ebbinghaus loop).
 */
function generateSmartQueue<C extends SessionCard>(
  cards: C[],
  progress: Record<string, QuestionProgress>,
  params: SchedulingParams,
  now: number,
  options?: QueueOptions<C>,
): string[] {
  const learningOverdue: Array<{ id: string; dueAt: number }> = [];
  const learningPending: Array<{ id: string; dueAt: number }> = [];
  const reviewOverdue: Array<{ id: string; urgency: number }> = [];
  const brandNew: C[] = [];

  for (const card of cards) {
    const prog = progress[card.id];

    if (!prog || prog.state === 'new' || prog.proficiency === 'new') {
      brandNew.push(card);
      continue;
    }

    if (prog.state === 'learning' || prog.state === 'relearning') {
      if (prog.dueAt <= now) {
        learningOverdue.push({ id: card.id, dueAt: prog.dueAt });
      } else {
        learningPending.push({ id: card.id, dueAt: prog.dueAt });
      }
      continue;
    }

    // review state
    const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
    if (due <= now) {
      reviewOverdue.push({ id: card.id, urgency: now - due });
    }
  }

  learningOverdue.sort((a, b) => a.dueAt - b.dueAt);
  learningPending.sort((a, b) => a.dueAt - b.dueAt);
  reviewOverdue.sort((a, b) => b.urgency - a.urgency);

  // brand-new 段：先按题集注入的顺序排（缺省保持题库数组顺序），再按今日
  // 剩余额度截断——额度先花在最该引入的卡上。今日已引入数超过上限
  // （旧数据/手工编辑）按 0 剩余额度处理：不截断已存在进度，只是今天不再
  // 引入；到期的 learning/review 卡不受额度影响。
  const orderedNew = options?.sortNewCards ? options.sortNewCards(brandNew) : brandNew;
  const newCardAllowance =
    params.newCardsPerDay === null
      ? orderedNew.length
      : Math.max(0, params.newCardsPerDay - (options?.newCardsIntroducedToday ?? 0));
  const brandNewIds = orderedNew.slice(0, newCardAllowance).map(card => card.id);

  const queue: string[] = [];
  for (const item of learningOverdue) queue.push(item.id);

  const reviewNewWoven: string[] = [];
  let ri = 0, ni = 0;
  while (ri < reviewOverdue.length || ni < brandNewIds.length) {
    for (let i = 0; i < 3 && ri < reviewOverdue.length; i++) {
      reviewNewWoven.push(reviewOverdue[ri++].id);
    }
    if (ni < brandNewIds.length) {
      reviewNewWoven.push(brandNewIds[ni++]);
    }
  }

  for (let i = learningPending.length - 1; i >= 0; i--) {
    const item = learningPending[i];
    const minutesAway = Math.max(0, (item.dueAt - now) / 60000);
    const expected = Math.ceil(minutesAway * params.cardsPerMinute);
    const clamped = Math.min(params.learningReinsertMax, Math.max(params.learningReinsertMin, expected));
    const pos = Math.min(reviewNewWoven.length, clamped);
    reviewNewWoven.splice(pos, 0, item.id);
  }

  for (const id of reviewNewWoven) queue.push(id);
  return queue;
}

/** Sort filtered questions: overdue first, then most-lapsed, then by id. */
function sortFilteredQueue(
  ids: string[],
  progress: Record<string, QuestionProgress>,
  now: number = Date.now(),
): string[] {
  return [...ids].sort((a, b) => {
    const pa = progress[a];
    const pb = progress[b];
    const aDue = pa?.dueAt ?? pa?.nextReviewDate ?? 0;
    const bDue = pb?.dueAt ?? pb?.nextReviewDate ?? 0;
    const aOver = aDue > 0 && aDue <= now ? now - aDue : -1;
    const bOver = bDue > 0 && bDue <= now ? now - bDue : -1;
    if (aOver !== bOver) return bOver - aOver;
    const aLap = pa?.lapses ?? 0;
    const bLap = pb?.lapses ?? 0;
    if (aLap !== bLap) return bLap - aLap;
    return a.localeCompare(b, 'zh-Hans-CN-u-kn-true');
  });
}

/**
 * Single entry point for queue generation across all session modes.
 *
 * The queue order can be asserted without mounting the hook; the caller may
 * inject `now` to make the result deterministic. `options`（新卡额度与
 * brand-new 排序）只被 smart 模式消费——'single' 深链不是新卡引入队列，
 * 即使今日额度已用尽也照常返回请求的卡；其他非 smart 模式语义不变。
 */
export function generateQueue<C extends SessionCard = SessionCard>(
  mode: SessionMode,
  cards: C[],
  progress: Record<string, QuestionProgress>,
  params: SchedulingParams,
  now: number = Date.now(),
  options?: QueueOptions<C>,
): string[] {
  switch (mode.kind) {
    case 'smart':
      return generateSmartQueue(cards, progress, params, now, options);
    case 'difficulty': {
      // 按难度是 LeetCode 题集的模式：它要求卡片带 difficulty 字段，这个要求
      // 属于模式自身，所以收进本分支而不是抬进 SessionCard。类型上靠这里的
      // 结构化收窄编译；语义上由题集配置的可选会话模式清单保证——卡片没有
      // difficulty 的题集（面试题集）不提供这个模式。
      const ids = (cards as unknown as Array<SessionCard & { difficulty: Difficulty }>)
        .filter(card => card.difficulty === mode.value)
        .map(card => card.id);
      return sortFilteredQueue(ids, progress, now);
    }
    case 'tag': {
      // 同上：tags 字段要求属于按标签模式自身。
      const ids = (cards as unknown as Array<SessionCard & { tags: string[] }>)
        .filter(card => card.tags.includes(mode.value))
        .map(card => card.id);
      return sortFilteredQueue(ids, progress, now);
    }
    case 'weakest': {
      // Bottom 10 by easeFactor (cards user struggles with most), plus high-lapse cards.
      const seen = cards.filter(card => progress[card.id] && progress[card.id].state !== 'new');
      const ranked = seen
        .map(card => {
          const p = progress[card.id];
          return {
            id: card.id,
            score: (p.easeFactor ?? params.efDefault) - (p.lapses ?? 0) * 0.3,
          };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map(x => x.id);
      return ranked;
    }
    case 'single': {
      // Resolved against the injected card set (not the global bank) so the
      // seam stays pure and works for any 题集.
      return cards.some(card => card.id === mode.questionId) ? [mode.questionId] : [];
    }
    case 'sweep': {
      // 全量扫题：面试前集中冲刷，无视到期时间与卡生命周期状态——未到期、
      // 新卡、learning、review 全部进队列。分类过滤这个字段要求属于模式自身
      // （同 difficulty/tag 分支的收窄读取），不抬进 SessionCard。排序按题集
      // 注入的排序能力（面试题集注入 sortInterviewNewCards = 按重要度）——
      // 引擎不认识 priority，排序边界仍由题集配置保证。sweep 是固定队列模式：
      // 不参与 3:1 编织、不做新卡额度截断（cap 只存在于 smart 分支）、不做
      // learning 插回、不读 dailyStats。
      const filtered = mode.category
        ? (cards as unknown as Array<SessionCard & { category: string }>)
            .filter(card => card.category === mode.category)
        : cards;
      const ordered = options?.sortNewCards ? options.sortNewCards(filtered as C[]) : filtered;
      return ordered.map(card => card.id);
    }
    case 'sequential': {
      // 按顺序刷题：题库数组顺序就是唯一顺序——不按重要度排、不按到期筛、
      // 不做 3:1 编织、不受新卡额度约束（同 sweep 的固定队列语义）。自评
      // 照常写入调度，顺序刷完一轮即完成一次全量遍历。
      return cards.map(card => card.id);
    }
  }
}
