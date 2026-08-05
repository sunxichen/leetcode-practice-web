'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  UserProgressData,
  FeedbackType,
  QuestionProgress,
  DailyStat,
  StreakInfo,
} from '@/lib/types';
import { createStorageAdapter, reconcileProgress, progressKeyFor } from '@/lib/storage';
import { bumpDailyStats, ymd } from '@/lib/dailyStats';
import { scheduleNext } from '@/lib/sm2';
import type { SchedulingParams } from '@/lib/schedulingParams';
import { DEBOUNCE_MS, UNDO_WINDOW_MS } from '@/lib/constants';
import { DECK_IDS, getDeckConfig, type DeckId } from '@/lib/decks';

/**
 * Snapshot stored to make the last feedback reversible.
 * 撤销是题集内操作：快照记录它属于哪个题集，恢复时只动那一份文档。
 */
export interface UndoSnapshot {
  deckId: DeckId;
  questionId: string;
  prevProgress: QuestionProgress | undefined;
  prevDailyStats: Record<string, DailyStat>;
  prevStreak: StreakInfo;
  expiresAt: number;
}

/** 单个题集的进度取用接口——与票 5 之前 useProgressContext 的形状一致。 */
export interface DeckProgressValue {
  progressData: UserProgressData;
  /** 调度参数由调用方从题集配置注入。 */
  updateProgress: (questionId: string, feedback: FeedbackType, params: SchedulingParams) => void;
  saveSessionCursor: (cursor: UserProgressData['lastSessionCursor']) => void;
  undoLast: () => boolean;
  undoSnapshot: UndoSnapshot | null;
  isLoading: boolean;
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

function emptyProgress(): UserProgressData {
  return {
    lastUpdatedAt: 0,
    lastSessionCursor: null,
    progress: {},
    dailyStats: {},
    streak: emptyStreak(),
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

/** 每个题集一份的可变运行时：脏标记与防抖定时器（ref 持有，回调内可变）。 */
interface DeckRuntime {
  dirty: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * 全部题集的进度：并行加载、按题集取用（ADR-0002，每个题集一份独立文档）。
 * 每日统计与连续天数是题集内概念——它们随各题集的文档各自存取，不存在
 * 全局连续天数。写入路径（自评 / 撤销 / 会话游标）只写对应题集那一份。
 */
export function useProgress() {
  const [dataByDeck, setDataByDeck] = useState<Record<DeckId, UserProgressData>>(
    () => Object.fromEntries(DECK_IDS.map((id) => [id, emptyProgress()])) as Record<DeckId, UserProgressData>,
  );
  const [loadingByDeck, setLoadingByDeck] = useState<Record<DeckId, boolean>>(
    () => Object.fromEntries(DECK_IDS.map((id) => [id, true])) as Record<DeckId, boolean>,
  );
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 每个题集各一份存储适配器（创建后不可变）与可变运行时（脏标记/定时器，
  // 走 ref——与重构前 dirtyRef/timerRef 同一模式）。
  const adapters = useMemo(
    () =>
      Object.fromEntries(DECK_IDS.map((id) => [id, createStorageAdapter(id)])) as Record<
        DeckId,
        ReturnType<typeof createStorageAdapter>
      >,
    [],
  );
  const runtimesRef = useRef<Record<DeckId, DeckRuntime>>(
    Object.fromEntries(DECK_IDS.map((id) => [id, { dirty: false, flushTimer: null }])) as Record<
      DeckId,
      DeckRuntime
    >,
  );

  const dataRef = useRef(dataByDeck);
  useEffect(() => {
    dataRef.current = dataByDeck;
  }, [dataByDeck]);

  // Initialize: dual-source reconciliation, all decks in parallel.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DECK_IDS.map((id) =>
        reconcileProgress(id, adapters[id], getDeckConfig(id).schedulingParams)
          .then((data) => ({ id, data }))
          .catch((err) => {
            console.error(`[useProgress] reconcile failed for deck ${id}`, err);
            return { id, data: null };
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      setDataByDeck((prev) => {
        const next = { ...prev };
        for (const { id, data } of results) {
          if (data) next[id] = data;
        }
        return next;
      });
      setLoadingByDeck((prev) => {
        const next = { ...prev };
        for (const { id } of results) next[id] = false;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [adapters]);

  // Remote flush (per deck)
  const flushDeck = useCallback(
    async (deckId: DeckId) => {
      const rt = runtimesRef.current[deckId];
      if (!rt.dirty) return;
      rt.dirty = false;
      try {
        await adapters[deckId].set(dataRef.current[deckId]);
      } catch {
        rt.dirty = true;
      }
    },
    [adapters],
  );

  const flushAll = useCallback(async () => {
    await Promise.all(DECK_IDS.map((id) => flushDeck(id)));
  }, [flushDeck]);

  const writeData = useCallback(
    (deckId: DeckId, next: UserProgressData) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(progressKeyFor(deckId), JSON.stringify(next));
      }
      const rt = runtimesRef.current[deckId];
      rt.dirty = true;
      if (rt.flushTimer) clearTimeout(rt.flushTimer);
      rt.flushTimer = setTimeout(() => flushDeck(deckId), DEBOUNCE_MS);
    },
    [flushDeck],
  );

  // Update progress for a question — also bumps stats + streak and records an undo snapshot.
  // 调度参数由调用方从题集配置注入，本 hook 不直接引用任何题集的调度常量。
  const updateProgress = useCallback(
    (deckId: DeckId, questionId: string, feedback: FeedbackType, params: SchedulingParams) => {
      const today = ymd(Date.now());
      setDataByDeck((prevAll) => {
        const prev = prevAll[deckId];
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
        writeData(deckId, updated);

        // Capture undo snapshot
        const snapshot: UndoSnapshot = {
          deckId,
          questionId,
          prevProgress: prevQ,
          prevDailyStats: prevStats,
          prevStreak,
          expiresAt: Date.now() + UNDO_WINDOW_MS,
        };
        setUndoSnapshot(snapshot);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), UNDO_WINDOW_MS);

        return { ...prevAll, [deckId]: updated };
      });
    },
    [writeData],
  );

  // Undo the last feedback — restores prior progress/stats/streak in that deck only.
  // Returns whether anything was undone.
  const undoLast = useCallback(
    (deckId: DeckId): boolean => {
      let undone = false;
      setDataByDeck((prevAll) => {
        const snap = undoSnapshot;
        if (!snap || snap.deckId !== deckId) return prevAll;
        undone = true;
        const prev = prevAll[deckId];
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
        writeData(deckId, restored);
        return { ...prevAll, [deckId]: restored };
      });
      if (undone) {
        setUndoSnapshot(null);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      }
      return undone;
    },
    [undoSnapshot, writeData],
  );

  // Save session cursor
  const saveSessionCursor = useCallback(
    (deckId: DeckId, cursor: UserProgressData['lastSessionCursor']) => {
      setDataByDeck((prevAll) => {
        const prev = prevAll[deckId];
        const updated = { ...prev, lastSessionCursor: cursor, lastUpdatedAt: Date.now() };
        if (typeof window !== 'undefined') {
          localStorage.setItem(progressKeyFor(deckId), JSON.stringify(updated));
        }
        return { ...prevAll, [deckId]: updated };
      });
      runtimesRef.current[deckId].dirty = true;
    },
    [],
  );

  // Visibility change: flush on background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushAll();
    };
  }, [flushAll]);

  // Online event: force sync on network recovery
  useEffect(() => {
    const handleOnline = () => {
      for (const id of DECK_IDS) runtimesRef.current[id].dirty = true;
      flushAll();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushAll]);

  const byDeck = useMemo(() => {
    const out = {} as Record<DeckId, DeckProgressValue>;
    for (const id of DECK_IDS) {
      out[id] = {
        progressData: dataByDeck[id],
        isLoading: loadingByDeck[id],
        undoSnapshot: undoSnapshot && undoSnapshot.deckId === id ? undoSnapshot : null,
        updateProgress: (questionId, feedback, params) => updateProgress(id, questionId, feedback, params),
        saveSessionCursor: (cursor) => saveSessionCursor(id, cursor),
        undoLast: () => undoLast(id),
      };
    }
    return out;
  }, [dataByDeck, loadingByDeck, undoSnapshot, updateProgress, saveSessionCursor, undoLast]);

  return { byDeck };
}
