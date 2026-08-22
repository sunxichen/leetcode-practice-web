'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useDeckProgress } from '@/context/ProgressContext';
import { useStudyQueue } from '@/hooks/useStudyQueue';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useHaptics } from '@/hooks/useHaptics';
import type { DeckConfig } from '@/lib/decks/types';
import type { SessionCard } from '@/lib/studyQueue';
import type { FeedbackType, SessionMode } from '@/lib/types';

/**
 * 学习会话 hook — 与题集无关的会话状态机（票 6，ADR-0005）。
 *
 * 持有模式选择、队列推进、翻卡、自评、退出动画、会话统计与撤销的全部状态
 * 与副作用；所有题集差异由 DeckConfig 注入（卡片数据源、调度参数、模式
 * 清单、背面分页数），路由差异（单卡自评后的去向）由 onSingleComplete
 * 回调注入。本 hook 不引用任何具体题集，也不感知 URL 与路由器。
 *
 * 状态机的每一个分支都是从原 app/study/page.tsx 逐位搬来的，用户可见行为
 * 零变化（含已知怪癖：撤销不回滚 session breakdown，见 handleUndo 注释）。
 */
export interface StudySessionOptions<C extends SessionCard> {
  /** 题集配置：卡片数据源、调度参数、模式清单、卡面组件与各项能力全部由此注入。 */
  deck: DeckConfig<C>;
  /** 深链单卡 id（路由层的 ?q=）：存在时强制 single 模式，优先于 ModePicker 的选择。 */
  focusedCardId: string | null;
  /** 单卡模式自评完成后的动作（如返回题库页）——路由策略由路由层注入。 */
  onSingleComplete: () => void;
}

export function useStudySession<C extends SessionCard>({
  deck,
  focusedCardId,
  onSingleComplete,
}: StudySessionOptions<C>) {
  const {
    progressData,
    updateProgress,
    saveSessionCursor,
    saveSequentialCursor,
    undoLast,
    undoSnapshot,
    isLoading,
  } = useDeckProgress(deck.id);

  // === Session mode ===
  // - Deeplink (?q=, injected as focusedCardId) forces single-card mode (takes precedence)
  // - Otherwise null until the user picks something in the ModePicker
  const [pickedMode, setPickedMode] = useState<SessionMode | null>(null);
  const sessionMode: SessionMode | null = focusedCardId
    ? { kind: 'single', questionId: focusedCardId }
    : pickedMode;
  const activeMode: SessionMode = sessionMode ?? { kind: 'smart' };
  const {
    queue,
    currentCard,
    currentIndex,
    goNext,
    goBack,
    isEmpty,
    todayDueCount,
    counters,
  } = useStudyQueue(progressData, activeMode, deck);

  const weakestCount = useMemo(() => {
    return Object.values(progressData.progress).filter(p => p.state !== 'new').length;
  }, [progressData.progress]);

  const { trigger: triggerHaptic } = useHaptics();

  // === Card UI transient state ===
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeSolutionIndex, setActiveSolutionIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<FeedbackType | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const isAnimatingRef = useRef(false);
  const [forceFinished, setForceFinished] = useState(false);

  // === Session telemetry (for SessionSummary) ===
  // Use state (not a ref) so we can read it safely during render to compute duration.
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(() => Date.now());
  const [sessionEndedAt, setSessionEndedAt] = useState<number | null>(null);
  const [sessionBreakdown, setSessionBreakdown] = useState<Record<FeedbackType, number>>({
    again: 0, hard: 0, good: 0, easy: 0,
  });
  const resetSession = useCallback(() => {
    setSessionStartedAt(Date.now());
    setSessionEndedAt(null);
    setSessionBreakdown({ again: 0, hard: 0, good: 0, easy: 0 });
    setForceFinished(false);
    setIsFlipped(false);
    setActiveSolutionIndex(0);
    setExitDirection(null);
    setCardKey(k => k + 1);
  }, []);

  const handleFlip = useCallback(() => {
    if (!currentCard) return;
    setIsFlipped(prev => !prev);
    triggerHaptic(10);
  }, [currentCard, triggerHaptic]);

  const handleFeedback = useCallback((feedback: FeedbackType) => {
    if (!currentCard || isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    triggerHaptic(feedback === 'again' ? [10, 50, 10] : 10);

    updateProgress(currentCard.id, feedback, deck.schedulingParams);
    setExitDirection(feedback);
    setSessionBreakdown(prev => ({ ...prev, [feedback]: prev[feedback] + 1 }));
    if (activeMode.kind !== 'single' && currentIndex + 1 >= queue.length) {
      setSessionEndedAt(Date.now());
    }

    // Save session cursor (only meaningful for smart mode)
    if (activeMode.kind === 'smart') {
      saveSessionCursor({
        mode: 'ebbinghaus',
        currentQuestionId: currentCard.id,
        queue,
        queueIndex: currentIndex + 1,
        timestamp: Date.now(),
      });
    }

    // 按顺序刷题的断点：每次自评后记录当前卡，刷完一整轮（这是最后一张）
    // 自动清空，下次从头开始。中途退出/关页也不丢——断点已随进度文档落盘。
    if (activeMode.kind === 'sequential') {
      saveSequentialCursor(
        currentIndex + 1 >= queue.length
          ? null
          : { cardId: currentCard.id, timestamp: Date.now() },
      );
    }

    // Wait for exit animation then advance
    setTimeout(() => {
      // Single-card mode: after one feedback, hand over to the route-layer
      // action (e.g. back to the browse page) instead of a local summary.
      if (activeMode.kind === 'single') {
        isAnimatingRef.current = false;
        onSingleComplete();
        return;
      }
      goNext();
      setIsFlipped(false);
      setActiveSolutionIndex(0);
      setExitDirection(null);
      setCardKey(prev => prev + 1);
      isAnimatingRef.current = false;
    }, 400);
  }, [currentCard, triggerHaptic, updateProgress, goNext, saveSessionCursor, saveSequentialCursor, queue, currentIndex, activeMode.kind, onSingleComplete, deck.schedulingParams]);

  const handleUndo = useCallback(() => {
    if (isAnimatingRef.current) return;
    const ok = undoLast();
    if (!ok) return;
    // Roll back UI state to the previous card.
    goBack();
    // Decrement breakdown for last feedback we recorded
    setSessionBreakdown(prev => {
      if (!undoSnapshot) return prev;
      // We don't know which feedback was last without re-deriving; the snapshot
      // doesn't store it. Read from the *replaced* progress entry (which was
      // overwritten by scheduleNext). Easiest: just decrement total by 1 across
      // the first non-zero of [easy, good, hard, again] — but to be accurate,
      // record the feedback in the snapshot. For simplicity here we accept the
      // breakdown drift on undo; the user re-rates the card on next pass.
      return prev;
    });
    setIsFlipped(true); // user was just looking at the answer
    setActiveSolutionIndex(0);
    setExitDirection(null);
    setCardKey(k => k + 1);
    triggerHaptic(10);
  }, [undoLast, undoSnapshot, goBack, triggerHaptic]);

  // Keyboard shortcuts
  useKeyboard({
    isFlipped,
    onFlip: handleFlip,
    onFeedback: handleFeedback,
    onPrevSolution: () => setActiveSolutionIndex(prev => Math.max(0, prev - 1)),
    onNextSolution: () => {
      if (currentCard) {
        // 背面分页数由题集配置注入（LeetCode 是解法数），这里不读卡片字段。
        setActiveSolutionIndex(prev => Math.min(deck.getBackPageCount(currentCard) - 1, prev + 1));
      }
    },
    onToggleTheme: () => {},
    onToggleSound: () => {},
  });

  // === Mode transitions (the shell's render branches wire these to UI) ===
  const selectMode = useCallback((mode: SessionMode) => {
    resetSession();
    setPickedMode(mode);
  }, [resetSession]);

  const backToModePicker = useCallback(() => {
    resetSession();
    setPickedMode(null);
  }, [resetSession]);

  const finishSession = useCallback(() => {
    setSessionEndedAt(Date.now());
    setForceFinished(true);
  }, []);

  return {
    // progress (per-deck document, via the deck's id)
    progressData,
    isLoading,
    undoSnapshot,
    // mode
    sessionMode,
    activeMode,
    forceFinished,
    selectMode,
    backToModePicker,
    finishSession,
    // queue
    queue,
    currentCard,
    currentIndex,
    isEmpty,
    todayDueCount,
    counters,
    weakestCount,
    // card UI
    isFlipped,
    activeSolutionIndex,
    setActiveSolutionIndex,
    exitDirection,
    cardKey,
    handleFlip,
    handleFeedback,
    handleUndo,
    // session telemetry
    sessionStartedAt,
    sessionEndedAt,
    sessionBreakdown,
  };
}
