'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudySession, type StudySessionOptions } from '@/hooks/useStudySession';
import { FlashCard } from '@/components/card/FlashCard';
import { FeedbackBar } from '@/components/feedback/FeedbackBar';
import { EmptyState } from '@/components/study/EmptyState';
import { ModePicker } from '@/components/study/ModePicker';
import { SessionSummary } from '@/components/study/SessionSummary';
import { resolveSessionView } from '@/components/study/sessionView';
import { UndoToast } from '@/components/ui/UndoToast';
import { SPRING_CONFIG, EXIT_ANIMATIONS, ENTER_ANIMATION } from '@/lib/constants';
import { sequentialStartIndex, type SessionCard } from '@/lib/studyQueue';
import type { UndoSnapshot } from '@/context/ProgressContext';
import type { FeedbackType, SessionMode, UserProgressData } from '@/lib/types';
import styles from './StudySessionShell.module.css';

const FEEDBACK_LABEL: Record<FeedbackType, string> = {
  again: '重来',
  hard: '困难',
  good: '良好',
  easy: '简单',
};

/**
 * 学习会话外壳 — 与题集无关（票 6，ADR-0005）。
 *
 * 渲染会话的各个状态（loading / 模式选择 / 会话总结 / 空状态 / 刷卡），
 * 状态机本体在 useStudySession 里。题集差异全部由 DeckConfig 注入：卡面
 * 组件、调度参数、模式清单、ModePicker 统计与背面分页数；路由差异（单卡
 * 自评后的去向）由 onSingleComplete 回调注入。本组件不引用任何具体题集，
 * 也不感知 URL 与路由器。
 */
export function StudySessionShell<C extends SessionCard>(props: StudySessionOptions<C>) {
  const { deck } = props;
  const { CardFront, CardBack } = deck.components;
  const session = useStudySession(props);

  // ModePicker 的标签云/难度分布统计是题集特定逻辑，由题集配置从卡片集派生。
  const pickerData = useMemo(
    () => deck.getModePickerData(deck.dataSource.getAllCards()),
    [deck],
  );

  // === Render branches ===
  if (session.isLoading) {
    return (
      <div className={styles.loading}>
        <motion.div
          className={styles.loadingDot}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    );
  }

  const sessionFeedbackTotal = Object.values(session.sessionBreakdown).reduce((a, b) => a + b, 0);
  const view = resolveSessionView({
    hasMode: session.sessionMode !== null,
    forceFinished: session.forceFinished,
    isEmpty: session.isEmpty,
    feedbackTotal: sessionFeedbackTotal,
    isSingle: session.activeMode.kind === 'single',
  });

  // Mode picker (gateway) — only if no mode has been chosen and no deeplink.
  if (view === 'picker') {
    // 按顺序刷题的续刷提示：断点下一位的 1-based 位置；从头开始则不显示。
    const allCardIds = deck.dataSource.getAllCards().map(card => card.id);
    const sequentialStart = sequentialStartIndex(allCardIds, session.progressData.sequentialCursor);
    return (
      <ModePicker
        todayDueCount={session.todayDueCount}
        counters={session.counters}
        weakestCount={session.weakestCount}
        topTags={pickerData.topTags}
        difficultyCounts={pickerData.difficultyCounts}
        categories={pickerData.categories}
        sequentialTotal={allCardIds.length}
        sequentialResumeAt={sequentialStart > 0 ? sequentialStart + 1 : null}
        modes={deck.sessionModes}
        onSelectMode={session.selectMode}
      />
    );
  }

  // Session summary — user tapped 结束本次, or queue is empty after at least one feedback.
  if (view === 'summary') {
    return (
      <SessionSummary
        deckName={deck.name}
        feedbackBreakdown={session.sessionBreakdown}
        durationMs={Math.max(0, (session.sessionEndedAt ?? session.sessionStartedAt) - session.sessionStartedAt)}
        streak={session.progressData.streak}
        onContinue={session.backToModePicker}
        browsePath={deck.browsePath}
      />
    );
  }

  // Queue empty with no feedbacks yet — show the calm EmptyState (no review due, smart mode).
  if (view === 'empty') {
    return (
      <div className={styles.container}>
        <EmptyState
          onReviewWeakest={() => session.selectMode({ kind: 'weakest' })}
          learningSoon={session.counters.learningSoon}
          nextLearningDueAt={session.counters.nextLearningDueAt}
          browsePath={deck.browsePath}
        />
      </div>
    );
  }

  if (!session.currentCard) return null;

  const currentCard = session.currentCard;
  const currentProg = session.progressData.progress[currentCard.id];
  const cardState = currentProg?.state ?? 'new';
  const exitAnim = session.exitDirection ? EXIT_ANIMATIONS[session.exitDirection] : undefined;

  return (
    <div className={styles.container}>
      <ModeBar
        mode={session.activeMode}
        onChangeMode={session.backToModePicker}
        onFinish={session.finishSession}
      />

      <div className={styles.cardArea}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`card-${session.cardKey}`}
            initial={ENTER_ANIMATION.initial}
            animate={ENTER_ANIMATION.animate}
            exit={exitAnim}
            transition={session.exitDirection
              ? (session.exitDirection === 'again' ? SPRING_CONFIG.exitNegative : SPRING_CONFIG.exitPositive)
              : SPRING_CONFIG.enter
            }
            className={styles.cardWrapper}
          >
            <FlashCard
              isFlipped={session.isFlipped}
              onFlip={session.handleFlip}
              front={
                <CardFront
                  card={currentCard}
                  cardState={cardState}
                />
              }
              back={
                <CardBack
                  card={currentCard}
                  activeSolutionIndex={session.activeSolutionIndex}
                  onSolutionIndexChange={session.setActiveSolutionIndex}
                  cardState={cardState}
                  learningStep={currentProg?.learningStep}
                  intervalDays={currentProg?.intervalDays}
                />
              }
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {session.isFlipped && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={SPRING_CONFIG.enter}
          >
            <FeedbackBar
              onFeedback={session.handleFeedback}
              disabled={!!session.exitDirection}
              currentProgress={currentProg}
              schedulingParams={deck.schedulingParams}
              sublabels={deck.getFeedbackAnchors?.(currentCard)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.progress}>
        <span className={styles.progressText}>
          {session.currentIndex + 1} / {session.queue.length}
        </span>
      </div>

      {session.undoSnapshot && (
        <UndoToast
          visible
          message={`已记录${FEEDBACK_LABEL[recoverFeedback(session.undoSnapshot, session.progressData) ?? 'good']}`}
          expiresAt={session.undoSnapshot.expiresAt}
          onUndo={session.handleUndo}
          onDismiss={() => { /* hook will clear via timer */ }}
        />
      )}
    </div>
  );
}

/** Derive the feedback that was applied from the snapshot + current progress. */
function recoverFeedback(
  snap: UndoSnapshot,
  progressData: UserProgressData,
): FeedbackType | null {
  const current = progressData.progress[snap.questionId];
  return (current?.proficiency as FeedbackType) ?? null;
}

function ModeLabel(mode: SessionMode): string {
  switch (mode.kind) {
    case 'smart': return '智能复习';
    case 'difficulty': return `难度 · ${mode.value}`;
    case 'tag': return `标签 · ${mode.value}`;
    case 'weakest': return '攻克最弱';
    case 'single': return `单题 · #${mode.questionId}`;
    case 'sweep': return '全量扫题';
    case 'sequential': return '按顺序刷题';
  }
}

function ModeBar({
  mode,
  onChangeMode,
  onFinish,
}: {
  mode: SessionMode;
  onChangeMode: () => void;
  onFinish: () => void;
}) {
  return (
    <div className={styles.modeBar}>
      <button className={styles.modeBarChip} onClick={onChangeMode}>
        <span className={styles.modeBarLabel}>{ModeLabel(mode)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {mode.kind !== 'single' && (
        <button className={styles.finishButton} onClick={onFinish}>
          结束本次
        </button>
      )}
    </div>
  );
}
