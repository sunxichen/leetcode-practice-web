'use client';

import type { Question } from '@/lib/types';
import { SolutionCarousel } from './SolutionCarousel';
import styles from './CardBack.module.css';

interface CardBackProps {
  question: Question;
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
}

export function CardBack({ question, activeSolutionIndex, onSolutionIndexChange }: CardBackProps) {
  return (
    <div className={styles.back}>
      <div className={styles.header}>
        <span className={styles.label}>解法</span>
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
