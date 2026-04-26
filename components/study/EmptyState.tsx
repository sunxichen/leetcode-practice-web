'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  onReviewWeakest: () => void;
  learningSoon?: number;
  nextLearningDueAt?: number | null;
}

function formatMinutesUntil(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return '马上';
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} 分钟后`;
  const hrs = Math.round(mins / 60);
  return `${hrs} 小时后`;
}

export function EmptyState({ onReviewWeakest, learningSoon = 0, nextLearningDueAt }: EmptyStateProps) {
  const hasLearning = learningSoon > 0 && nextLearningDueAt;
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.card}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING_CONFIG.enter}
      >
        <motion.div
          className={styles.iconWrap}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.1 }}
        >
          {hasLearning ? '⏳' : '🎉'}
        </motion.div>
        <h2 className={styles.title}>{hasLearning ? '稍等一下' : '太棒了！'}</h2>
        <p className={styles.subtitle}>
          {hasLearning
            ? `还有 ${learningSoon} 张学习中的卡片`
            : '今天的复习任务已全部完成'}
        </p>
        <p className={styles.hint}>
          {hasLearning && nextLearningDueAt
            ? `最近一张 ${formatMinutesUntil(nextLearningDueAt)}到期`
            : '明天再来继续保持吧'}
        </p>
        <div className={styles.divider} />
        <div className={styles.actions}>
          <motion.button
            className={styles.primaryButton}
            onClick={onReviewWeakest}
            whileTap={{ scale: 0.97 }}
          >
            复习最薄弱的题目
          </motion.button>
          <Link href="/browse" className={styles.secondaryButton}>
            浏览全部题目
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
