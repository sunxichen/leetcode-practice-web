'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useProgress, type UndoSnapshot } from '@/hooks/useProgress';
import type { UserProgressData, FeedbackType } from '@/lib/types';

interface ProgressContextValue {
  progressData: UserProgressData;
  updateProgress: (questionId: string, feedback: FeedbackType) => void;
  saveSessionCursor: (cursor: UserProgressData['lastSessionCursor']) => void;
  undoLast: () => boolean;
  undoSnapshot: UndoSnapshot | null;
  isLoading: boolean;
}

const ProgressContext = createContext<ProgressContextValue>({
  progressData: { lastUpdatedAt: 0, lastSessionCursor: null, progress: {} },
  updateProgress: () => {},
  saveSessionCursor: () => {},
  undoLast: () => false,
  undoSnapshot: null,
  isLoading: true,
});

export function ProgressProvider({ children }: { children: ReactNode }) {
  const value = useProgress();
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgressContext() {
  return useContext(ProgressContext);
}
