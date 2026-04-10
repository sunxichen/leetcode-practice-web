'use client';

import styles from './DifficultyBadge.module.css';

export function DifficultyBadge({ difficulty }: { difficulty: 'Easy' | 'Medium' | 'Hard' }) {
  return (
    <span className={`${styles.badge} ${styles[difficulty.toLowerCase()]}`}>
      {difficulty}
    </span>
  );
}
