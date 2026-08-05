'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  UserProgressData,
  SessionMode,
} from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';
import { HOT100_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { generateQueue } from '@/lib/studyQueue';

/**
 * Session state and side effects only. All queue sorting / weaving logic lives
 * in the pure session-engine seam (lib/studyQueue.ts); this hook just feeds it
 * the current card set, progress, 调度参数 and mode, and holds the resulting
 * queue cursor.
 */
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
      queue: generateQueue(mode, questions, progressData.progress, HOT100_SCHEDULING_PARAMS),
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
      const futureQueue = generateQueue({ kind: 'smart' }, questions, progressRef.current, HOT100_SCHEDULING_PARAMS);
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
