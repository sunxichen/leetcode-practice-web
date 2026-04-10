'use client';

import { motion } from 'framer-motion';
import type { Question } from '@/lib/types';
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
}

export function FlashCard({
  question,
  isFlipped,
  onFlip,
  activeSolutionIndex,
  onSolutionIndexChange,
}: FlashCardProps) {
  return (
    <div className={styles.perspective} onClick={() => !isFlipped && onFlip()}>
      <motion.div
        className={styles.card}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={SPRING_CONFIG.flip}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className={`${styles.face} ${styles.frontFace}`}>
          <CardFront question={question} />
          <div className={styles.flipHint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            点击翻转查看解法
          </div>
        </div>
        <div className={`${styles.face} ${styles.backFace}`}>
          <CardBack
            question={question}
            activeSolutionIndex={activeSolutionIndex}
            onSolutionIndexChange={onSolutionIndexChange}
          />
        </div>
      </motion.div>
    </div>
  );
}
