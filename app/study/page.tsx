'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProgressContext } from '@/context/ProgressContext';
import { useStudyQueue } from '@/hooks/useStudyQueue';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useHaptics } from '@/hooks/useHaptics';
import { FlashCard } from '@/components/card/FlashCard';
import { FeedbackBar } from '@/components/feedback/FeedbackBar';
import { EmptyState } from '@/components/study/EmptyState';
import { SPRING_CONFIG, EXIT_ANIMATIONS, ENTER_ANIMATION } from '@/lib/constants';
import type { FeedbackType } from '@/lib/types';
import styles from './page.module.css';

function StudyGateway({ onStart, dueCount }: { onStart: () => void; dueCount: number }) {
  return (
    <motion.div
      className={styles.gateway}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={styles.gatewayCard}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_CONFIG.enter, delay: 0.1 }}
      >
        <motion.div
          className={styles.gatewayIconWrap}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.2 }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </motion.div>
        <motion.h1
          className={styles.gatewayTitle}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.25 }}
        >
          准备好了吗？
        </motion.h1>
        <motion.p
          className={styles.gatewaySubtitle}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.3 }}
        >
          {dueCount > 0 ? (
            <>今日有 <span className={styles.dueHighlight}>{dueCount}</span> 道题等你复习</>
          ) : '开始探索题库吧'}
        </motion.p>
        <motion.div
          className={styles.gatewayDivider}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        />
        <motion.button
          className={styles.startButton}
          onClick={onStart}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.4 }}
        >
          开始学习
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

export default function StudyPage() {
  const [started, setStarted] = useState(false);
  const { progressData, updateProgress, saveSessionCursor, isLoading } = useProgressContext();
  const { queue, currentQuestion, currentIndex, goNext, isEmpty, todayDueCount, reviewWeakest } = useStudyQueue(progressData);
  const { trigger: triggerHaptic } = useHaptics();

  // Card UI transient state
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeSolutionIndex, setActiveSolutionIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<FeedbackType | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const isAnimatingRef = useRef(false);

  const handleFlip = useCallback(() => {
    if (isFlipped || !currentQuestion) return;
    setIsFlipped(true);
    triggerHaptic(10);
  }, [isFlipped, currentQuestion, triggerHaptic]);

  const handleFeedback = useCallback((feedback: FeedbackType) => {
    if (!currentQuestion || isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    triggerHaptic(feedback === 'again' ? [10, 50, 10] : 10);

    updateProgress(currentQuestion.id, feedback);
    setExitDirection(feedback);

    // Save session cursor
    saveSessionCursor({
      mode: 'ebbinghaus',
      currentQuestionId: currentQuestion.id,
      queue,
      queueIndex: currentIndex + 1,
      timestamp: Date.now(),
    });

    // Wait for exit animation then advance
    setTimeout(() => {
      goNext();
      setIsFlipped(false);
      setActiveSolutionIndex(0);
      setExitDirection(null);
      setCardKey(prev => prev + 1);
      isAnimatingRef.current = false;
    }, 400);
  }, [currentQuestion, triggerHaptic, updateProgress, goNext, saveSessionCursor, queue, currentIndex]);

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

  if (!started) {
    return <StudyGateway onStart={() => setStarted(true)} dueCount={todayDueCount} />;
  }

  if (isEmpty) {
    return (
      <div className={styles.container}>
        <EmptyState onReviewWeakest={reviewWeakest} />
      </div>
    );
  }

  if (!currentQuestion) return null;

  const exitAnim = exitDirection ? EXIT_ANIMATIONS[exitDirection] : undefined;

  return (
    <div className={styles.container}>
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
              question={currentQuestion}
              isFlipped={isFlipped}
              onFlip={handleFlip}
              activeSolutionIndex={activeSolutionIndex}
              onSolutionIndexChange={setActiveSolutionIndex}
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
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress indicator */}
      <div className={styles.progress}>
        <span className={styles.progressText}>
          {currentIndex + 1} / {queue.length}
        </span>
      </div>
    </div>
  );
}
