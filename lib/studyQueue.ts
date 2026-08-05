import type { Question, QuestionProgress, SessionMode } from '@/lib/types';
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
 * regression tests (new cards are NOT re-sorted; pending learning cards are
 * spliced into the woven segment, not the final queue; the learning branch
 * does not fall back to the legacy nextReviewDate field).
 */

/**
 * Build a fresh study queue snapshot for SMART mode (SM-2 driven).
 *
 * Priority (woven so users see progress on new material too):
 *   1. learning / relearning cards whose dueAt is already past — at the very front
 *   2. review cards that are overdue (sorted by how overdue), woven 3:1 with new cards
 *   3. brand-new cards, in question-bank array order (deliberately NOT re-sorted;
 *      pinned by the '30', '4', '100' regression test)
 *   4. learning cards whose dueAt is in the future — spliced into 2-3 at clamped
 *      positions [params.learningReinsertMin, params.learningReinsertMax] so they
 *      recur within the current ~10-min session window (Ebbinghaus loop).
 */
function generateSmartQueue(
  questions: Question[],
  progress: Record<string, QuestionProgress>,
  params: SchedulingParams,
  now: number = Date.now(),
): string[] {
  const learningOverdue: Array<{ id: string; dueAt: number }> = [];
  const learningPending: Array<{ id: string; dueAt: number }> = [];
  const reviewOverdue: Array<{ id: string; urgency: number }> = [];
  const brandNew: string[] = [];

  for (const q of questions) {
    const prog = progress[q.id];

    if (!prog || prog.state === 'new' || prog.proficiency === 'new') {
      brandNew.push(q.id);
      continue;
    }

    if (prog.state === 'learning' || prog.state === 'relearning') {
      if (prog.dueAt <= now) {
        learningOverdue.push({ id: q.id, dueAt: prog.dueAt });
      } else {
        learningPending.push({ id: q.id, dueAt: prog.dueAt });
      }
      continue;
    }

    // review state
    const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
    if (due <= now) {
      reviewOverdue.push({ id: q.id, urgency: now - due });
    }
  }

  learningOverdue.sort((a, b) => a.dueAt - b.dueAt);
  learningPending.sort((a, b) => a.dueAt - b.dueAt);
  reviewOverdue.sort((a, b) => b.urgency - a.urgency);

  const queue: string[] = [];
  for (const item of learningOverdue) queue.push(item.id);

  const reviewNewWoven: string[] = [];
  let ri = 0, ni = 0;
  while (ri < reviewOverdue.length || ni < brandNew.length) {
    for (let i = 0; i < 3 && ri < reviewOverdue.length; i++) {
      reviewNewWoven.push(reviewOverdue[ri++].id);
    }
    if (ni < brandNew.length) {
      reviewNewWoven.push(brandNew[ni++]);
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
 * inject `now` to make the result deterministic.
 */
export function generateQueue(
  mode: SessionMode,
  questions: Question[],
  progress: Record<string, QuestionProgress>,
  params: SchedulingParams,
  now: number = Date.now(),
): string[] {
  switch (mode.kind) {
    case 'smart':
      return generateSmartQueue(questions, progress, params, now);
    case 'difficulty': {
      const ids = questions.filter(q => q.difficulty === mode.value).map(q => q.id);
      return sortFilteredQueue(ids, progress, now);
    }
    case 'tag': {
      const ids = questions.filter(q => q.tags.includes(mode.value)).map(q => q.id);
      return sortFilteredQueue(ids, progress, now);
    }
    case 'weakest': {
      // Bottom 10 by easeFactor (cards user struggles with most), plus high-lapse cards.
      const seen = questions.filter(q => progress[q.id] && progress[q.id].state !== 'new');
      const ranked = seen
        .map(q => {
          const p = progress[q.id];
          return {
            id: q.id,
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
      return questions.some(q => q.id === mode.questionId) ? [mode.questionId] : [];
    }
  }
}
