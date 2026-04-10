'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [queue, setQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const questions = getAllQuestions();
  const isRefillingRef = useRef(false);
  const initializedRef = useRef(false);

  // Initialize queue (only once when progress is loaded)
  useEffect(() => {
    if (initializedRef.current) return;
    if (!progressData || progressData.lastUpdatedAt === 0) return;

    // Try to restore session cursor
    const cursor = progressData.lastSessionCursor;
    if (cursor && cursor.queue.length > 0 && cursor.queueIndex < cursor.queue.length) {
      setQueue(cursor.queue);
      setCurrentIndex(cursor.queueIndex);
    } else {
      const initialQueue = generateStudyQueue(questions, progressData.progress);
      setQueue(initialQueue);
      setCurrentIndex(0);
    }
    initializedRef.current = true;
  }, [progressData, questions]);

  // Low water mark refill
  useEffect(() => {
    if (!initializedRef.current) return;
    const remaining = queue.length - currentIndex;
    if (remaining <= LOW_WATER_MARK && remaining > 0 && !isRefillingRef.current) {
      isRefillingRef.current = true;

      const existingIds = new Set(queue);
      const refillBatch = generateStudyQueue(
        questions,
        progressData.progress,
        existingIds,
      );

      if (refillBatch.length > 0) {
        setQueue(prev => {
          isRefillingRef.current = false;
          return [...prev, ...refillBatch];
        });
      } else {
        isRefillingRef.current = false;
      }
    }
  }, [currentIndex, queue.length, questions, progressData.progress, queue]);

  const goNext = useCallback(() => {
    setCurrentIndex(prev => prev + 1);
  }, []);

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
      setQueue(weakestIds);
      setCurrentIndex(0);
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
