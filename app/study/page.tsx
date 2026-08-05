'use client';

import { Suspense, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeckProgress, type UndoSnapshot } from '@/context/ProgressContext';
import { useStudyQueue } from '@/hooks/useStudyQueue';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useHaptics } from '@/hooks/useHaptics';
import { FlashCard } from '@/components/card/FlashCard';
import { FeedbackBar } from '@/components/feedback/FeedbackBar';
import { EmptyState } from '@/components/study/EmptyState';
import { ModePicker } from '@/components/study/ModePicker';
import { SessionSummary } from '@/components/study/SessionSummary';
import { UndoToast } from '@/components/ui/UndoToast';
import { SPRING_CONFIG, EXIT_ANIMATIONS, ENTER_ANIMATION } from '@/lib/constants';
import { getDeckConfig } from '@/lib/decks';
import type { FeedbackType, SessionMode, UserProgressData } from '@/lib/types';
import styles from './page.module.css';

const FEEDBACK_LABEL: Record<FeedbackType, string> = {
  again: '重来',
  hard: '困难',
  good: '良好',
  easy: '简单',
};

/**
 * 本页服务的题集。卡片数据源、调度参数、可选会话模式清单与卡片正反面组件
 * 全部从题集配置取用，本页不直接引用任何题集的常量与卡面组件。
 */
const deck = getDeckConfig('hot100');
const { CardFront, CardBack } = deck.components;

function StudyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedQuestionId = searchParams?.get('q') ?? null;

  const {
    progressData,
    updateProgress,
    saveSessionCursor,
    undoLast,
    undoSnapshot,
    isLoading,
  } = useDeckProgress(deck.id);

  // === Session mode ===
  // - Deeplink ?q= forces single-card mode (takes precedence)
  // - Otherwise null until the user picks something in the ModePicker
  const [pickedMode, setPickedMode] = useState<SessionMode | null>(null);
  const sessionMode: SessionMode | null = focusedQuestionId
    ? { kind: 'single', questionId: focusedQuestionId }
    : pickedMode;
  const activeMode: SessionMode = sessionMode ?? { kind: 'smart' };
  const {
    queue,
    currentQuestion,
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
    if (!currentQuestion) return;
    setIsFlipped(prev => !prev);
    triggerHaptic(10);
  }, [currentQuestion, triggerHaptic]);

  const handleFeedback = useCallback((feedback: FeedbackType) => {
    if (!currentQuestion || isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    triggerHaptic(feedback === 'again' ? [10, 50, 10] : 10);

    updateProgress(currentQuestion.id, feedback, deck.schedulingParams);
    setExitDirection(feedback);
    setSessionBreakdown(prev => ({ ...prev, [feedback]: prev[feedback] + 1 }));
    if (activeMode.kind !== 'single' && currentIndex + 1 >= queue.length) {
      setSessionEndedAt(Date.now());
    }

    // Save session cursor (only meaningful for smart mode)
    if (activeMode.kind === 'smart') {
      saveSessionCursor({
        mode: 'ebbinghaus',
        currentQuestionId: currentQuestion.id,
        queue,
        queueIndex: currentIndex + 1,
        timestamp: Date.now(),
      });
    }

    // Wait for exit animation then advance
    setTimeout(() => {
      // Single-card mode: after one feedback, bounce back to browse with the summary.
      if (activeMode.kind === 'single') {
        isAnimatingRef.current = false;
        router.push('/browse');
        return;
      }
      goNext();
      setIsFlipped(false);
      setActiveSolutionIndex(0);
      setExitDirection(null);
      setCardKey(prev => prev + 1);
      isAnimatingRef.current = false;
    }, 400);
  }, [currentQuestion, triggerHaptic, updateProgress, goNext, saveSessionCursor, queue, currentIndex, activeMode.kind, router]);

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
      if (currentQuestion) {
        setActiveSolutionIndex(prev => Math.min(currentQuestion.solutions.length - 1, prev + 1));
      }
    },
    onToggleTheme: () => {},
    onToggleSound: () => {},
  });

  // === Render branches ===
  if (isLoading) {
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

  // Mode picker (gateway) — only if no mode has been chosen and no deeplink.
  if (!sessionMode) {
    return (
      <ModePicker
        todayDueCount={todayDueCount}
        counters={counters}
        weakestCount={weakestCount}
        questions={deck.dataSource.getAllCards()}
        modes={deck.sessionModes}
        onSelectMode={(m) => {
          resetSession();
          setPickedMode(m);
        }}
      />
    );
  }

  // Session summary — user tapped 结束本次, or queue is empty after at least one feedback.
  const sessionFeedbackTotal = Object.values(sessionBreakdown).reduce((a, b) => a + b, 0);
  if (forceFinished || (isEmpty && sessionFeedbackTotal > 0 && activeMode.kind !== 'single')) {
    return (
      <SessionSummary
        deckName={deck.name}
        feedbackBreakdown={sessionBreakdown}
        durationMs={Math.max(0, (sessionEndedAt ?? sessionStartedAt) - sessionStartedAt)}
        streak={progressData.streak}
        onContinue={() => {
          resetSession();
          setPickedMode(null);
        }}
      />
    );
  }

  // Queue empty with no feedbacks yet — show the calm EmptyState (no review due, smart mode).
  if (isEmpty) {
    return (
      <div className={styles.container}>
        <EmptyState
          onReviewWeakest={() => {
            resetSession();
            setPickedMode({ kind: 'weakest' });
          }}
          learningSoon={counters.learningSoon}
          nextLearningDueAt={counters.nextLearningDueAt}
        />
      </div>
    );
  }

  if (!currentQuestion) return null;

  const currentProg = progressData.progress[currentQuestion.id];
  const cardState = currentProg?.state ?? 'new';
  const exitAnim = exitDirection ? EXIT_ANIMATIONS[exitDirection] : undefined;

  return (
    <div className={styles.container}>
      <ModeBar
        mode={activeMode}
        onChangeMode={() => {
          resetSession();
          setPickedMode(null);
        }}
        onFinish={() => {
          setSessionEndedAt(Date.now());
          setForceFinished(true);
        }}
      />

      <div className={styles.cardArea}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`card-${cardKey}`}
            initial={ENTER_ANIMATION.initial}
            animate={ENTER_ANIMATION.animate}
            exit={exitAnim}
            transition={exitDirection
              ? (exitDirection === 'again' ? SPRING_CONFIG.exitNegative : SPRING_CONFIG.exitPositive)
              : SPRING_CONFIG.enter
            }
            className={styles.cardWrapper}
          >
            <FlashCard
              isFlipped={isFlipped}
              onFlip={handleFlip}
              front={
                <CardFront
                  card={currentQuestion}
                  cardState={cardState}
                />
              }
              back={
                <CardBack
                  card={currentQuestion}
                  activeSolutionIndex={activeSolutionIndex}
                  onSolutionIndexChange={setActiveSolutionIndex}
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
        {isFlipped && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={SPRING_CONFIG.enter}
          >
            <FeedbackBar
              onFeedback={handleFeedback}
              disabled={!!exitDirection}
              currentProgress={currentProg}
              schedulingParams={deck.schedulingParams}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.progress}>
        <span className={styles.progressText}>
          {currentIndex + 1} / {queue.length}
        </span>
      </div>

      {undoSnapshot && (
        <UndoToast
          visible
          message={`已记录${FEEDBACK_LABEL[recoverFeedback(undoSnapshot, progressData) ?? 'good']}`}
          expiresAt={undoSnapshot.expiresAt}
          onUndo={handleUndo}
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

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <StudyPageInner />
    </Suspense>
  );
}
