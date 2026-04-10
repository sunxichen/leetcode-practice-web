'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UserProgressData, FeedbackType, QuestionProgress } from '@/lib/types';
import { createStorageAdapter, reconcileProgress } from '@/lib/storage';
import { calculateSM2, getFeedbackQuality } from '@/lib/sm2';
import { DEBOUNCE_MS, LOCAL_STORAGE_KEY } from '@/lib/constants';

export function useProgress() {
  const [progressData, setProgressData] = useState<UserProgressData>({
    lastUpdatedAt: 0,
    lastSessionCursor: null,
    progress: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(progressData);
  const adapter = useMemo(() => createStorageAdapter(), []);

  // Keep ref in sync
  useEffect(() => {
    progressRef.current = progressData;
  }, [progressData]);

  // Initialize: dual-source reconciliation
  useEffect(() => {
    reconcileProgress(adapter).then((data) => {
      setProgressData(data);
      setIsLoading(false);
    });
  }, [adapter]);

  // Remote flush
  const flushToRemote = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      await adapter.set(progressRef.current);
    } catch {
      dirtyRef.current = true;
    }
  }, [adapter]);

  // Update progress for a question
  const updateProgress = useCallback((questionId: string, feedback: FeedbackType) => {
    setProgressData(prev => {
      const currentProgress = prev.progress[questionId];
      const quality = getFeedbackQuality(feedback);

      const sm2Result = calculateSM2({
        quality,
        repetition: currentProgress?.level ?? 0,
        easeFactor: currentProgress?.easeFactor ?? 2.5,
        interval: currentProgress?.interval ?? 0,
      });

      const newQuestionProgress: QuestionProgress = {
        level: sm2Result.repetition,
        nextReviewDate: sm2Result.nextReviewDate,
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        proficiency: feedback,
        lastReviewDate: Date.now(),
      };

      const updated: UserProgressData = {
        ...prev,
        lastUpdatedAt: Date.now(),
        progress: {
          ...prev.progress,
          [questionId]: newQuestionProgress,
        },
      };

      // Immediate localStorage dual-write
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

      return updated;
    });

    dirtyRef.current = true;

    // Debounce remote sync
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushToRemote(), DEBOUNCE_MS);
  }, [flushToRemote]);

  // Save session cursor
  const saveSessionCursor = useCallback((cursor: UserProgressData['lastSessionCursor']) => {
    setProgressData(prev => {
      const updated = { ...prev, lastSessionCursor: cursor, lastUpdatedAt: Date.now() };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    dirtyRef.current = true;
  }, []);

  // Visibility change: flush on background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushToRemote();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushToRemote();
    };
  }, [flushToRemote]);

  // Online event: force sync on network recovery
  useEffect(() => {
    const handleOnline = () => {
      dirtyRef.current = true;
      flushToRemote();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushToRemote]);

  return { progressData, updateProgress, saveSessionCursor, isLoading };
}
