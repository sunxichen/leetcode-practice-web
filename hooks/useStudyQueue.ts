'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Question, UserProgressData, QuestionProgress } from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';
import { LOW_WATER_MARK } from '@/lib/constants';

function generateStudyQueue(
  questions: Question[],
  progress: Record<string, QuestionProgress>,
  excludeIds?: Set<string>,
): string[] {
  const now = Date.now();
  const overdue: Array<{ id: string; urgency: number }> = [];
  const newQuestions: string[] = [];

  for (const q of questions) {
    if (excludeIds?.has(q.id)) continue;

    const prog = progress[q.id];
    if (!prog || prog.proficiency === 'new') {
      newQuestions.push(q.id);
    } else if (prog.nextReviewDate <= now) {
      overdue.push({ id: q.id, urgency: now - prog.nextReviewDate });
    }
  }

  overdue.sort((a, b) => b.urgency - a.urgency);

  const queue: string[] = [];
  let overdueIdx = 0, newIdx = 0;
  while (overdueIdx < overdue.length || newIdx < newQuestions.length) {
    for (let i = 0; i < 3 && overdueIdx < overdue.length; i++) {
      queue.push(overdue[overdueIdx++].id);
    }
    if (newIdx < newQuestions.length) {
      queue.push(newQuestions[newIdx++]);
    }
  }

  return queue;
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
      const remaining = state.queue.length - nextIndex;

      if (remaining > 0 && remaining <= LOW_WATER_MARK) {
        const refillBatch = generateStudyQueue(
          questions,
          progressData.progress,
          new Set(state.queue),
        );

        return {
          queue: refillBatch.length > 0 ? [...state.queue, ...refillBatch] : state.queue,
          currentIndex: nextIndex,
        };
      }

      return {
        queue: state.queue,
        currentIndex: nextIndex,
      };
    });
  }, [initialState, progressData.progress, questions]);

  const isEmpty = queue.length === 0 || currentIndex >= queue.length;
  const currentQuestion = isEmpty ? null : getQuestionById(queue[currentIndex]) ?? null;

  // Count for gateway display
  const todayDueCount = generateStudyQueue(questions, progressData.progress).length;

  // Force review weakest
  const reviewWeakest = useCallback(() => {
    const entries = Object.entries(progressData.progress);
    entries.sort((a, b) => a[1].easeFactor - b[1].easeFactor);
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
    reviewWeakest,
  };
}
