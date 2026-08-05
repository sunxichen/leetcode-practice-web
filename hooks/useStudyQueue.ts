'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  UserProgressData,
  SessionMode,
} from '@/lib/types';
import type { DeckConfig } from '@/lib/decks/types';
import { generateQueue, type QueueOptions, type SessionCard } from '@/lib/studyQueue';
import { ymd } from '@/lib/dailyStats';

/**
 * Session state and side effects only. All queue sorting / weaving logic lives
 * in the pure session-engine seam (lib/studyQueue.ts); this hook just feeds it
 * the current card set, progress, 调度参数 and mode, and holds the resulting
 * queue cursor.
 *
 * 卡片集与调度参数全部来自题集配置（deck），hook 不直接引用任何题集的
 * 数据源或调度常量。
 */
export function useStudyQueue<C extends SessionCard>(
  progressData: UserProgressData,
  mode: SessionMode,
  deck: DeckConfig<C>,
) {
  const [sessionState, setSessionState] = useState<{ queue: string[]; currentIndex: number } | null>(null);
  const cards = deck.dataSource.getAllCards();
  const modeKey = JSON.stringify(mode);

  // Ref mirror of progress so goNext (called from setTimeout in handleFeedback)
  // always sees the latest data, avoiding a stale-closure bug where the just-
  // applied feedback is invisible to queue regeneration.
  const progressRef = useRef(progressData.progress);
  useEffect(() => {
    progressRef.current = progressData.progress;
  }, [progressData.progress]);

  // 同一原因镜像 dailyStats：刚才那次自评若是一张新卡的首次引入，额度消费
  // 必须立刻对 goNext 的队尾重算可见，否则本次会话会多放行一张新卡。
  const dailyStatsRef = useRef(progressData.dailyStats);
  useEffect(() => {
    dailyStatsRef.current = progressData.dailyStats;
  }, [progressData.dailyStats]);

  /**
   * smart 队列的新卡额度与 brand-new 排序（票 10）：
   * - 额度统计从当前题集的 dailyStats 按当前本地日期读取（题集内概念，
   *   ADR-0002）——绝不读另一个题集或全局键；
   * - 排序能力由题集配置注入（Hot100 不提供 = 保持题库数组顺序）；
   * - 只被 smart 模式消费；single 深链与其他模式的语义不变。
   */
  const queueOptions = useCallback((): QueueOptions<C> => {
    return {
      newCardsIntroducedToday:
        dailyStatsRef.current?.[ymd(Date.now())]?.newIntroducedCount ?? 0,
      sortNewCards: deck.sortNewCards,
    };
  }, [deck.sortNewCards]);

  // (Re)initialize sessionState when progress is loaded OR mode changes.
  //
  // Always regenerate a fresh queue from current progress — the persisted
  // session cursor is NOT used to restore a stale queue because due/learning
  // state may have shifted since the cursor was saved (e.g. resuming the next
  // day). A dynamic smart queue must reflect the actual SM-2 schedule.
  useEffect(() => {
    if (!progressData || progressData.lastUpdatedAt === 0) return;

    setSessionState({
      queue: generateQueue(mode, cards, progressData.progress, deck.schedulingParams, undefined, queueOptions()),
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
      const futureQueue = generateQueue(
        { kind: 'smart' },
        cards,
        progressRef.current,
        deck.schedulingParams,
        undefined,
        queueOptions(),
      );
      const prefix = prev.queue.slice(0, nextIndex);
      return {
        queue: [...prefix, ...futureQueue],
        currentIndex: nextIndex,
      };
    });
  }, [mode.kind, cards, deck.schedulingParams, queueOptions]);

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
  const currentCard = isEmpty ? null : deck.dataSource.getCardById(queue[currentIndex]) ?? null;

  // === Counters for gateway / empty-state UX ===
  const counters = useMemo(() => {
    const now = Date.now();
    let dueReview = 0;
    let learningNow = 0;
    let learningSoon = 0;
    let newCount = 0;
    let nextLearningDueAt: number | null = null;

    for (const card of cards) {
      const prog = progressData.progress[card.id];
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
  }, [cards, progressData.progress]);

  const todayDueCount = counters.dueReview + counters.learningNow + counters.learningSoon;

  return {
    queue,
    currentCard,
    currentIndex,
    goNext,
    goBack,
    isEmpty,
    todayDueCount,
    counters,
  };
}
