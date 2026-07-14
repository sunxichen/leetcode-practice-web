'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  Question,
  UserProgressData,
  QuestionProgress,
  SessionMode,
} from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';


/**
 * Build a fresh study queue snapshot for SMART mode (SM-2 driven).
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
 *  At 4 min/problem, MIN=2 ⇒ at least two other problems (~8 min) before recurrence,
 *  slightly under the 10-min step-0 interval. */
const LEARNING_REINSERT_MIN = 2;

/** Upper bound for re-showing a learning card. Prevents "I'll never see it again in this session" feel.
 *  At 4 min/problem, MAX=15 ⇒ guaranteed recurrence within ~60 min, matching the
 *  60-min step-1 interval. If the session is shorter, the card simply appears next session. */
const LEARNING_REINSERT_MAX = 15;

function generateSmartQueue(
  questions: Question[],
  progress: Record<string, QuestionProgress>,
): string[] {
  const now = Date.now();
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
    const expected = Math.ceil(minutesAway * CARDS_PER_MINUTE);
    const clamped = Math.min(LEARNING_REINSERT_MAX, Math.max(LEARNING_REINSERT_MIN, expected));
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
): string[] {
  const now = Date.now();
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

function generateQueue(
  mode: SessionMode,
  questions: Question[],
  progress: Record<string, QuestionProgress>,
): string[] {
  switch (mode.kind) {
    case 'smart':
      return generateSmartQueue(questions, progress);
    case 'difficulty': {
      const ids = questions.filter(q => q.difficulty === mode.value).map(q => q.id);
      return sortFilteredQueue(ids, progress);
    }
    case 'tag': {
      const ids = questions.filter(q => q.tags.includes(mode.value)).map(q => q.id);
      return sortFilteredQueue(ids, progress);
    }
    case 'weakest': {
      // Bottom 10 by easeFactor (cards user struggles with most), plus high-lapse cards.
      const seen = questions.filter(q => progress[q.id] && progress[q.id].state !== 'new');
      const ranked = seen
        .map(q => {
          const p = progress[q.id];
          return {
            id: q.id,
            score: (p.easeFactor ?? 2.5) - (p.lapses ?? 0) * 0.3,
          };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map(x => x.id);
      return ranked;
    }
    case 'single': {
      return getQuestionById(mode.questionId) ? [mode.questionId] : [];
    }
  }
}

export function useStudyQueue(progressData: UserProgressData, mode: SessionMode) {
  const [sessionState, setSessionState] = useState<{ queue: string[]; currentIndex: number } | null>(null);
  const questions = getAllQuestions();
  const modeKey = JSON.stringify(mode);

  // Ref mirror of progress so goNext (called from setTimeout in handleFeedback)
  // always sees the latest data, avoiding a stale-closure bug where the just-
  // applied feedback is invisible to queue regeneration.
  const progressRef = useRef(progressData.progress);
  useEffect(() => {
    progressRef.current = progressData.progress;
  }, [progressData.progress]);

  // (Re)initialize sessionState when progress is loaded OR mode changes.
  //
  // Always regenerate a fresh queue from current progress — the persisted
  // session cursor is NOT used to restore a stale queue because due/learning
  // state may have shifted since the cursor was saved (e.g. resuming the next
  // day). A dynamic smart queue must reflect the actual SM-2 schedule.
  useEffect(() => {
    if (!progressData || progressData.lastUpdatedAt === 0) return;

    setSessionState({
      queue: generateQueue(mode, questions, progressData.progress),
      currentIndex: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey, progressData.lastUpdatedAt === 0]);

  const queue = sessionState?.queue ?? [];
  const currentIndex = sessionState?.currentIndex ?? 0;

  const goNext = useCallback(() => {
    setSessionState(prev => {
      if (!prev) return prev;
      const nextIndex = prev.currentIndex + 1;

      // For non-smart modes, the queue is fixed — just advance the cursor.
      if (mode.kind !== 'smart') {
        return { queue: prev.queue, currentIndex: nextIndex };
      }

      // Smart mode: regenerate future tail from latest progress (via ref so
      // we always see the post-feedback state), preserve prefix so the X / Y
      // indicator stays meaningful.
      const futureQueue = generateSmartQueue(questions, progressRef.current);
      const prefix = prev.queue.slice(0, nextIndex);
      return {
        queue: [...prefix, ...futureQueue],
        currentIndex: nextIndex,
      };
    });
  }, [mode.kind, questions]);

  /** Roll back the cursor by one (used by undo). Returns true if anything was rolled back. */
  const goBack = useCallback((): boolean => {
    let rolled = false;
    setSessionState(prev => {
      if (!prev || prev.currentIndex === 0) return prev;
      rolled = true;
      return { queue: prev.queue, currentIndex: prev.currentIndex - 1 };
    });
    return rolled;
  }, []);

  const isEmpty = queue.length === 0 || currentIndex >= queue.length;
  const currentQuestion = isEmpty ? null : getQuestionById(queue[currentIndex]) ?? null;

  // === Counters for gateway / empty-state UX ===
  const counters = useMemo(() => {
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
        if (prog.dueAt <= now) learningNow++;
        else learningSoon++;
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

  return {
    queue,
    currentQuestion,
    currentIndex,
    goNext,
    goBack,
    isEmpty,
    todayDueCount,
    counters,
  };
}
