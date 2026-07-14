'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Question, CardState } from '@/lib/types';
import { CardFront } from './CardFront';
import { CardBack } from './CardBack';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './FlashCard.module.css';

interface FlashCardProps {
  question: Question;
  isFlipped: boolean;
  onFlip: () => void;
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
}

export function FlashCard({
  question,
  isFlipped,
  onFlip,
  activeSolutionIndex,
  onSolutionIndexChange,
  cardState,
  learningStep,
  intervalDays,
}: FlashCardProps) {
  return (
    <div className={styles.perspective}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isFlipped ? 'back' : 'front'}
          className={styles.card}
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.985 }}
          transition={SPRING_CONFIG.flip}
        >
          {isFlipped ? (
            <div className={styles.face}>
              <CardBack
                question={question}
                activeSolutionIndex={activeSolutionIndex}
                onSolutionIndexChange={onSolutionIndexChange}
                cardState={cardState}
                learningStep={learningStep}
                intervalDays={intervalDays}
              />
              <button type="button" className={styles.flipButton} onClick={onFlip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                </svg>
                返回题目
              </button>
            </div>
          ) : (
            <div className={styles.face}>
              <CardFront question={question} cardState={cardState} />
              <button type="button" className={styles.flipButton} onClick={onFlip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                点击查看解法
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
