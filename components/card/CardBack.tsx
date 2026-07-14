'use client';

import type { Question, CardState } from '@/lib/types';
import { SolutionCarousel } from './SolutionCarousel';
import styles from './CardBack.module.css';

interface CardBackProps {
  question: Question;
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
}

const STATE_LABEL: Record<CardState, string> = {
  new: '新题',
  learning: '学习中',
  review: '复习',
  relearning: '补习',
};

export function CardBack({
  question,
  activeSolutionIndex,
  onSolutionIndexChange,
  cardState,
  learningStep,
  intervalDays,
}: CardBackProps) {
  // Detail string for the moved-here scheduling badge.
  let stateDetail = '';
  if (cardState === 'learning' || cardState === 'relearning') {
    stateDetail = ` ${(learningStep ?? 0) + 1}`;
  } else if (cardState === 'review' && intervalDays && intervalDays > 0) {
    stateDetail = ` · ${intervalDays}d`;
  }

  return (
    <div className={styles.back}>
      <div className={styles.header}>
        <span className={styles.label}>解析</span>
        {cardState && (
          <span className={styles.stateInfo}>
            {STATE_LABEL[cardState]}{stateDetail}
          </span>
        )}
      </div>

      <div className={styles.recallSection}>
        <div className={styles.sectionLabel}>核心模式</div>
        <p className={styles.pattern}>{question.core_pattern}</p>
      </div>

      {question.corner_cases.length > 0 && (
        <div className={styles.recallSection}>
          <div className={styles.sectionLabel}>边界用例</div>
          <ul className={styles.cornerCases}>
            {question.corner_cases.map((c, i) => (
              <li key={i} className={styles.cornerCase}>
                <span className={styles.bullet}>•</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.solutionsHeader}>
        <span className={styles.solutionsLabel}>代码解法</span>
        <span className={styles.count}>
          {question.solutions.length} 种解法
        </span>
      </div>

      <SolutionCarousel
        solutions={question.solutions}
        activeSolutionIndex={activeSolutionIndex}
        onIndexChange={onSolutionIndexChange}
      />
    </div>
  );
}
