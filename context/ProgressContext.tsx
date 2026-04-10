'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useProgress } from '@/hooks/useProgress';
import type { UserProgressData, FeedbackType } from '@/lib/types';

interface ProgressContextValue {
  progressData: UserProgressData;
  updateProgress: (questionId: string, feedback: FeedbackType) => void;
  saveSessionCursor: (cursor: UserProgressData['lastSessionCursor']) => void;
  isLoading: boolean;
}

const ProgressContext = createContext<ProgressContextValue>({
  progressData: { lastUpdatedAt: 0, lastSessionCursor: null, progress: {} },
  updateProgress: () => {},
  saveSessionCursor: () => {},
  isLoading: true,
});

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { progressData, updateProgress, saveSessionCursor, isLoading } = useProgress();

  return (
    <ProgressContext.Provider value={{ progressData, updateProgress, saveSessionCursor, isLoading }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgressContext() {
  return useContext(ProgressContext);
}
