'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Question, UserProgressData, QuestionProgress } from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';


/**
 * Build a fresh study queue snapshot.
 *
 * Priority (woven so users see progress on new material too):
 *   1. learning / relearning cards whose dueAt is "soon" (now + lookahead) — interleaved aggressively
 *   2. review cards that are overdue (sorted by how overdue)
 *   3. brand-new cards (sorted by question id, ascending)
 *
 * `excludeIds` is intentionally minimal — typically only the currently displayed card.
 */
/** Estimated number of cards a user can blow through before a learning card becomes due. */
const CARDS_PER_MINUTE = 2;

/** Lower bound for re-showing a learning card. Prevents the immediate "I just saw this" feel. */
const LEARNING_REINSERT_MIN = 3;

/** Upper bound for re-showing a learning card. Prevents "I'll never see it again in this session" feel
 *  — critical for short (10–15 min) sessions where the user otherwise blows past the dueAt by quitting. */
const LEARNING_REINSERT_MAX = 10;

function generateStudyQueue(
  questions: Question[],
  progress: Record<string, QuestionProgress>,
  excludeIds?: Set<string>,
): string[] {
  const now = Date.now();
  const learningOverdue: Array<{ id: string; dueAt: number }> = [];
  const learningPending: Array<{ id: string; dueAt: number }> = [];
  const reviewOverdue: Array<{ id: string; urgency: number }> = [];
  const brandNew: string[] = [];

  for (const q of questions) {
    if (excludeIds?.has(q.id)) continue;
    const prog = progress[q.id];

    if (!prog || prog.state === 'new' || prog.proficiency === 'new') {
      brandNew.push(q.id);
      continue;
    }

    if (prog.state === 'learning' || prog.state === 'relearning') {
      // ALWAYS include learning cards in the queue. dueAt determines priority,
      // not eligibility — otherwise a card scheduled "in 6 min" would be invisible
      // for 5 of those 6 minutes and the user just sees an endless stream of new cards.
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

  learningOverdue.sort((a, b) => a.dueAt - b.dueAt); // most overdue first
  learningPending.sort((a, b) => a.dueAt - b.dueAt); // soonest first
  reviewOverdue.sort((a, b) => b.urgency - a.urgency);

  const queue: string[] = [];

  // 1) All overdue learning cards — they're the whole point of the spaced repetition feel.
  for (const item of learningOverdue) queue.push(item.id);

  // 2) Weave review (3:1 with new), but for each pending learning card insert it
  //    at roughly the position where it will be due, based on assumed pace.
  const reviewNewWoven: string[] = [];
  let ri = 0,
    ni = 0;
  while (ri < reviewOverdue.length || ni < brandNew.length) {
    for (let i = 0; i < 3 && ri < reviewOverdue.length; i++) {
      reviewNewWoven.push(reviewOverdue[ri++].id);
    }
    if (ni < brandNew.length) {
      reviewNewWoven.push(brandNew[ni++]);
    }
  }

  // Insert each pending learning card at its expected reveal position, but clamp
  // into [LEARNING_REINSERT_MIN, LEARNING_REINSERT_MAX]. The clamp is what makes
  // short sessions feel like Ebbinghaus instead of "endless new cards":
  //   - lower bound: don't show it on the very next card (no spaced effect)
  //   - upper bound: ensure the same card recurs within a 10–15 min window even if
  //     the user is moving slower than CARDS_PER_MINUTE assumes.
  for (const item of learningPending) {
    const minutesAway = Math.max(0, (item.dueAt - now) / 60000);
    const expected = Math.ceil(minutesAway * CARDS_PER_MINUTE);
    const clamped = Math.min(LEARNING_REINSERT_MAX, Math.max(LEARNING_REINSERT_MIN, expected));
    const pos = Math.min(reviewNewWoven.length, clamped);
    reviewNewWoven.splice(pos, 0, item.id);
  }

  for (const id of reviewNewWoven) queue.push(id);

  return queue;
}

function isStillRelevant(
  prog: QuestionProgress | undefined,
  now: number,
): boolean {
  if (!prog || prog.state === 'new' || prog.proficiency === 'new') return true;
  if (prog.state === 'learning' || prog.state === 'relearning') {
    // Always relevant — a learning card stays in the queue until it graduates.
    return true;
  }
  const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
  return due <= now;
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function useStudyQueue(progressData: UserProgressData) {
  const [sessionState, setSessionState] = useState<{ queue: string[]; currentIndex: number } | null>(null);
  const questions = getAllQuestions();

  const initialState = useMemo(() => {
    if (!progressData || progressData.lastUpdatedAt === 0) {
      return { queue: [] as string[], currentIndex: 0 };
    }

    const cursor = progressData.lastSessionCursor;
    if (cursor && cursor.queue.length > 0 && cursor.queueIndex < cursor.queue.length) {
      return { queue: cursor.queue, currentIndex: cursor.queueIndex };
    }

    return {
      queue: generateStudyQueue(questions, progressData.progress),
      currentIndex: 0,
    };
  }, [progressData, questions]);

  const queue = sessionState?.queue ?? initialState.queue;
  const currentIndex = sessionState?.currentIndex ?? initialState.currentIndex;

  const goNext = useCallback(() => {
    setSessionState(prev => {
      const state = prev ?? initialState;
      const nextIndex = state.currentIndex + 1;
      const now = Date.now();

      // Keep the slice that hasn't been shown yet, and re-evaluate which ones
      // are still relevant (e.g. a learning card we already queued might have been
      // re-scheduled or graduated).
      const remainingTail = state.queue
        .slice(nextIndex)
        .filter(id => isStillRelevant(progressData.progress[id], now));

      // Refill: re-derive due / new candidates. Only exclude the card the user is
      // currently looking at (state.queue[state.currentIndex]) — NOT the entire
      // session history, so that "Again" / "Hard" cards can re-appear.
      const currentId = state.queue[state.currentIndex];
      const excludeFromRefill = new Set<string>(currentId ? [currentId] : []);
      remainingTail.forEach(id => excludeFromRefill.add(id));

      const refill = generateStudyQueue(
        questions,
        progressData.progress,
        excludeFromRefill,
      );

      const merged = dedupe([
        ...state.queue.slice(0, nextIndex),
        ...remainingTail,
        ...refill,
      ]);

      return {
        queue: merged,
        currentIndex: nextIndex,
      };
    });
  }, [initialState, progressData.progress, questions]);

  const isEmpty = queue.length === 0 || currentIndex >= queue.length;
  const currentQuestion = isEmpty ? null : getQuestionById(queue[currentIndex]) ?? null;

  // === Counters for gateway / empty-state UX ===
  const counters = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- snapshot-on-render is acceptable for due counts
    const now = Date.now();
    let dueReview = 0;
    let learningNow = 0;
    let learningSoon = 0;
    let newCount = 0;
    let nextLearningDueAt: number | null = null;

    for (const q of questions) {
      const prog = progressData.progress[q.id];
      if (!prog || prog.state === 'new' || prog.proficiency === 'new') {
        newCount++;
        continue;
      }
      if (prog.state === 'learning' || prog.state === 'relearning') {
        if (prog.dueAt <= now) {
          learningNow++;
        } else {
          learningSoon++;
        }
        if (nextLearningDueAt === null || prog.dueAt < nextLearningDueAt) {
          nextLearningDueAt = prog.dueAt;
        }
        continue;
      }
      const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
      if (due <= now) dueReview++;
    }

    return { dueReview, learningNow, learningSoon, newCount, nextLearningDueAt };
  }, [questions, progressData.progress]);

  const todayDueCount = counters.dueReview + counters.learningNow + counters.learningSoon;

  // Force review weakest
  const reviewWeakest = useCallback(() => {
    const entries = Object.entries(progressData.progress);
    entries.sort((a, b) => (a[1].easeFactor ?? 2.5) - (b[1].easeFactor ?? 2.5));
    const weakestIds = entries.slice(0, 10).map(([id]) => id);
    if (weakestIds.length > 0) {
      setSessionState({ queue: weakestIds, currentIndex: 0 });
    }
  }, [progressData.progress]);

  return {
    queue,
    currentQuestion,
    currentIndex,
    goNext,
    isEmpty,
    todayDueCount,
    counters,
    reviewWeakest,
  };
}
