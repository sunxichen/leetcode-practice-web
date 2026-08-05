'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useProgress, type UndoSnapshot } from '@/hooks/useProgress';
import type { UserProgressData, FeedbackType } from '@/lib/types';
import type { SchedulingParams } from '@/lib/schedulingParams';

interface ProgressContextValue {
  progressData: UserProgressData;
  /** 调度参数由调用方从题集配置注入。 */
  updateProgress: (questionId: string, feedback: FeedbackType, params: SchedulingParams) => void;
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
