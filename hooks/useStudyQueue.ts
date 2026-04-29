'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Question, UserProgressData, QuestionProgress } from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';


/**
 * Build a fresh study queue snapshot.
 *
 * Priority (woven so users see progress on new material too):
 *   1. learning / relearning cards whose dueAt is already past — at the very front
 *   2. review cards that are overdue (sorted by how overdue), woven 3:1 with new cards
 *   3. brand-new cards (sorted by question id, ascending)
 *   4. learning cards whose dueAt is in the future — spliced into 2-3 at clamped
 *      positions [LEARNING_REINSERT_MIN, LEARNING_REINSERT_MAX] so they recur
 *      within the current ~10-min session window (Ebbinghaus loop).
 *
 * `excludeIds` is intentionally minimal — typically not used at all because the clamp
 * already prevents the just-shown card from reappearing immediately.
 */
/** Estimated number of cards a user can blow through before a learning card becomes due.
 *  LeetCode-tuned: ~4 min per problem → 0.25 cards / minute. */
const CARDS_PER_MINUTE = 0.25;

/** Lower bound for re-showing a learning card. Prevents the immediate "I just saw this" feel.
 *  At 4 min/problem, MIN=1 ⇒ at least one other problem (~4 min) before recurrence. */
const LEARNING_REINSERT_MIN = 1;

/** Upper bound for re-showing a learning card. Prevents "I'll never see it again in this session" feel.
 *  At 4 min/problem, MAX=4 ⇒ guaranteed recurrence within ~16 min, well inside a 10–15 problem session. */
const LEARNING_REINSERT_MAX = 4;

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
  //
  // Iteration order is CRITICAL: each splice pushes previously-spliced items deeper.
  // When many cards want the same clamped position (e.g. several learning cards all
  // hit the MAX clamp of 10), the LAST iterated card ends up at the shallowest spot.
  // We therefore iterate from LATEST-due to EARLIEST-due so that the most-overdue
  // (earliest-due, longest-waited) learning card lands closest to the front. Without
  // this, the very first card a user just answered would be pushed to the back of
  // the queue and effectively never recur — which is exactly the "endless new cards"
  // bug users were experiencing.
  for (let i = learningPending.length - 1; i >= 0; i--) {
    const item = learningPending[i];
    const minutesAway = Math.max(0, (item.dueAt - now) / 60000);
    const expected = Math.ceil(minutesAway * CARDS_PER_MINUTE);
    const clamped = Math.min(LEARNING_REINSERT_MAX, Math.max(LEARNING_REINSERT_MIN, expected));
    const pos = Math.min(reviewNewWoven.length, clamped);
    reviewNewWoven.splice(pos, 0, item.id);
  }

  for (const id of reviewNewWoven) queue.push(id);

  return queue;
}

export function useStudyQueue(progressData: UserProgressData) {
  const [sessionState, setSessionState] = useState<{ queue: string[]; currentIndex: number } | null>(null);
  const questions = getAllQuestions();

  // Initialize sessionState exactly once when the user's progress data has loaded.
  //
  // Why a useEffect (not useMemo as a fallback for `queue`):
  // The previous design fell back to `initialState` whenever `sessionState` was null,
  // which meant that any change to `progressData.lastSessionCursor` (saved by
  // handleFeedback BEFORE goNext fires) would silently advance `currentIndex`
  // through the cursor — causing a double-advance and visual flicker.
  // With this useEffect, the cursor is consulted ONLY at session start.
  useEffect(() => {
    if (sessionState !== null) return;
    if (!progressData || progressData.lastUpdatedAt === 0) return;

    const cursor = progressData.lastSessionCursor;
    if (cursor && cursor.queue.length > 0 && cursor.queueIndex < cursor.queue.length) {
      setSessionState({ queue: cursor.queue, currentIndex: cursor.queueIndex });
    } else {
      setSessionState({
        queue: generateStudyQueue(questions, progressData.progress),
        currentIndex: 0,
      });
    }
  }, [sessionState, progressData, questions]);

  const queue = sessionState?.queue ?? [];
  const currentIndex = sessionState?.currentIndex ?? 0;

  const goNext = useCallback(() => {
    setSessionState(prev => {
      if (!prev) return prev;
      const nextIndex = prev.currentIndex + 1;

      // Regenerate the FUTURE part of the queue from scratch using the latest progress.
      //
      // Why regenerate fresh rather than merge/dedupe with the old tail:
      //   - The just-shown card has just transitioned (e.g. brand-new -> learning),
      //     so it now needs to be RE-INSERTED at its expected reveal position
      //     (clamped to LEARNING_REINSERT_MIN..MAX cards from now).
      //   - The previous merge-then-dedupe approach put the re-inserted card AFTER
      //     the unshown brand-new tail, then deduped it away because it already
      //     existed in the prefix. Net effect: learning cards never reappeared,
      //     and the user just saw an endless stream of new questions.
      //   - generateStudyQueue's clamp (LEARNING_REINSERT_MIN = 3) guarantees the
      //     just-shown card won't reappear immediately, so we don't need any
      //     exclusion set.
      const futureQueue = generateStudyQueue(questions, progressData.progress);

      // Keep the prefix (cards already shown in this session) so the X / Y
      // progress indicator stays meaningful. Duplicates across the prefix/future
      // boundary are intentional — the prefix is dead history, the future is live.
      const prefix = prev.queue.slice(0, nextIndex);
      return {
        queue: [...prefix, ...futureQueue],
        currentIndex: nextIndex,
      };
    });
  }, [progressData.progress, questions]);

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
