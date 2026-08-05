'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  UserProgressData,
  FeedbackType,
  QuestionProgress,
  DailyStat,
  StreakInfo,
} from '@/lib/types';
import { createStorageAdapter, reconcileProgress } from '@/lib/storage';
import { scheduleNext } from '@/lib/sm2';
import type { SchedulingParams } from '@/lib/schedulingParams';
import { DEBOUNCE_MS, LOCAL_STORAGE_KEY, UNDO_WINDOW_MS } from '@/lib/constants';

/** Snapshot stored to make the last feedback reversible. */
export interface UndoSnapshot {
  questionId: string;
  prevProgress: QuestionProgress | undefined;
  prevDailyStats: Record<string, DailyStat>;
  prevStreak: StreakInfo;
  expiresAt: number;
}

function ymd(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isPreviousDay(prev: string, today: string): boolean {
  if (!prev) return false;
  const p = new Date(prev + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diff = Math.round((t.getTime() - p.getTime()) / 86_400_000);
  return diff === 1;
}

function emptyStreak(): StreakInfo {
  return { currentDays: 0, longestDays: 0, lastActiveDay: '' };
}

function bumpDailyStats(
  stats: Record<string, DailyStat>,
  today: string,
  prevState: QuestionProgress | undefined,
  nextState: QuestionProgress,
): Record<string, DailyStat> {
  const cur: DailyStat = stats[today] ?? {
    reviewedCount: 0,
    graduatedCount: 0,
    lapseCount: 0,
  };
  const graduated =
    (!prevState || prevState.state === 'new' || prevState.state === 'learning') &&
    nextState.state === 'review';
  const lapsed = prevState?.state === 'review' && nextState.state === 'relearning';
  return {
    ...stats,
    [today]: {
      reviewedCount: cur.reviewedCount + 1,
      graduatedCount: cur.graduatedCount + (graduated ? 1 : 0),
      lapseCount: cur.lapseCount + (lapsed ? 1 : 0),
    },
  };
}

function bumpStreak(streak: StreakInfo, today: string): StreakInfo {
  const s = streak ?? emptyStreak();
  if (s.lastActiveDay === today) return s;
  const nextDays = isPreviousDay(s.lastActiveDay, today) ? s.currentDays + 1 : 1;
  return {
    currentDays: nextDays,
    longestDays: Math.max(s.longestDays, nextDays),
    lastActiveDay: today,
  };
}

export function useProgress() {
  const [progressData, setProgressData] = useState<UserProgressData>({
    lastUpdatedAt: 0,
    lastSessionCursor: null,
    progress: {},
    dailyStats: {},
    streak: emptyStreak(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(progressData);
  const adapter = useMemo(() => createStorageAdapter(), []);

  useEffect(() => {
    progressRef.current = progressData;
  }, [progressData]);

  // Initialize: dual-source reconciliation
  useEffect(() => {
    let cancelled = false;
    reconcileProgress(adapter)
      .then((data) => {
        if (cancelled) return;
        setProgressData(data);
      })
      .catch((err) => {
        console.error('[useProgress] reconcile failed', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const writeData = useCallback((next: UserProgressData) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    }
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushToRemote(), DEBOUNCE_MS);
  }, [flushToRemote]);

  // Update progress for a question — also bumps stats + streak and records an undo snapshot.
  // 调度参数由调用方从题集配置注入，本 hook 不直接引用任何题集的调度常量。
  const updateProgress = useCallback((questionId: string, feedback: FeedbackType, params: SchedulingParams) => {
    const today = ymd(Date.now());
    setProgressData((prev) => {
      const prevQ = prev.progress[questionId];
      const nextQ = scheduleNext(prevQ, feedback, params);
      // Track lapses on the question for the "易遗忘" semantic filter in browse.
      if (prevQ?.state === 'review' && nextQ.state === 'relearning') {
        nextQ.lapses = (prevQ.lapses ?? 0) + 1;
      } else {
        nextQ.lapses = prevQ?.lapses ?? 0;
      }

      const prevStats = prev.dailyStats ?? {};
      const prevStreak = prev.streak ?? emptyStreak();
      const nextStats = bumpDailyStats(prevStats, today, prevQ, nextQ);
      const nextStreak = bumpStreak(prevStreak, today);

      const updated: UserProgressData = {
        ...prev,
        lastUpdatedAt: Date.now(),
        progress: { ...prev.progress, [questionId]: nextQ },
        dailyStats: nextStats,
        streak: nextStreak,
      };
      writeData(updated);

      // Capture undo snapshot
      const snapshot: UndoSnapshot = {
        questionId,
        prevProgress: prevQ,
        prevDailyStats: prevStats,
        prevStreak,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      };
      setUndoSnapshot(snapshot);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), UNDO_WINDOW_MS);

      return updated;
    });
  }, [writeData]);

  // Undo the last feedback — restores prior progress/stats/streak. Returns whether anything was undone.
  const undoLast = useCallback((): boolean => {
    let undone = false;
    setProgressData((prev) => {
      const snap = undoSnapshot;
      if (!snap) return prev;
      undone = true;
      const newProgress = { ...prev.progress };
      if (snap.prevProgress) {
        newProgress[snap.questionId] = snap.prevProgress;
      } else {
        delete newProgress[snap.questionId];
      }
      const restored: UserProgressData = {
        ...prev,
        lastUpdatedAt: Date.now(),
        progress: newProgress,
        dailyStats: snap.prevDailyStats,
        streak: snap.prevStreak,
      };
      writeData(restored);
      return restored;
    });
    if (undone) {
      setUndoSnapshot(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    }
    return undone;
  }, [undoSnapshot, writeData]);

  // Save session cursor
  const saveSessionCursor = useCallback((cursor: UserProgressData['lastSessionCursor']) => {
    setProgressData((prev) => {
      const updated = { ...prev, lastSessionCursor: cursor, lastUpdatedAt: Date.now() };
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }
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

  return {
    progressData,
    updateProgress,
    saveSessionCursor,
    undoLast,
    undoSnapshot,
    isLoading,
  };
}
