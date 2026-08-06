import type { QuestionProgress } from '@/lib/types';

/**
 * 首页题集入口卡的计数 — 纯函数（Node 可测）。
 *
 * 输入是题集的轻量摘要 id 列表 + 该题集的进度文档，输出待复习数与新卡数，
 * 因此首页不必静态引入完整题库 — 只读 data/deck-summary.json（几 KB）与
 * 进度求交集即可。
 */

export interface DeckCounts {
  /** 待复习卡数：对齐 useStudyQueue.todayDueCount 的口径。 */
  dueCount: number;
  /** 新卡数：对齐 useStudyQueue.counters.newCount 的口径。 */
  newCount: number;
}

/**
 * 与 useStudyQueue.counters 逐条对齐的计数口径（不要自创）：
 *
 * 新卡 (= newCount)：
 *   无进度条目、或 state === 'new'、或 proficiency === 'new'。
 *
 * 待复习 (= dueCount = dueReview + learningNow + learningSoon)：
 *   - learning / relearning：无论是否到期都计入（到期算 learningNow、
 *     未到期算 learningSoon，两者都进 todayDueCount）；
 *   - review：`dueAt ?? nextReviewDate ?? 0 <= now` 才计入（已复习未到期的
 *     不计入）。
 */
export function summarizeDeckCounts(
  cardIds: string[],
  progress: Record<string, QuestionProgress>,
  now: number,
): DeckCounts {
  let dueCount = 0;
  let newCount = 0;
  for (const id of cardIds) {
    const prog = progress[id];
    if (!prog || prog.state === 'new' || prog.proficiency === 'new') {
      newCount++;
      continue;
    }
    if (prog.state === 'learning' || prog.state === 'relearning') {
      dueCount++;
      continue;
    }
    const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
    if (due <= now) dueCount++;
  }
  return { dueCount, newCount };
}
