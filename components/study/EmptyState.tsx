'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  onReviewWeakest: () => void;
}

export function EmptyState({ onReviewWeakest }: EmptyStateProps) {
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
          🎉
        </motion.div>
        <h2 className={styles.title}>太棒了！</h2>
        <p className={styles.subtitle}>今天的复习任务已全部完成</p>
        <p className={styles.hint}>明天再来继续保持吧</p>
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
