'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { FeedbackType, StreakInfo } from '@/lib/types';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './SessionSummary.module.css';

interface SessionSummaryProps {
  /** 所属题集显示名：连续天数与每日统计是题集内概念（ADR-0002），文案须标明所属题集。 */
  deckName: string;
  feedbackBreakdown: Record<FeedbackType, number>;
  durationMs: number;
  streak: StreakInfo | undefined;
  onContinue: () => void;
}

const FEEDBACK_META: Record<FeedbackType, { label: string; color: string }> = {
  again: { label: '重来', color: 'var(--color-again)' },
  hard: { label: '困难', color: 'var(--color-hard-btn)' },
  good: { label: '良好', color: 'var(--color-good)' },
  easy: { label: '简单', color: 'var(--color-easy-btn)' },
};

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec} 秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min} 分钟` : `${min} 分 ${sec} 秒`;
}

export function SessionSummary({
  deckName,
  feedbackBreakdown,
  durationMs,
  streak,
  onContinue,
}: SessionSummaryProps) {
  const router = useRouter();
  const total = Object.values(feedbackBreakdown).reduce((a, b) => a + b, 0);
  const order: FeedbackType[] = ['easy', 'good', 'hard', 'again'];
  const positiveRate = total === 0
    ? 0
    : Math.round(((feedbackBreakdown.good + feedbackBreakdown.easy) / total) * 100);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={styles.card}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_CONFIG.enter, delay: 0.1 }}
      >
        <motion.div
          className={styles.iconWrap}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.2 }}
        >
          {total === 0 ? '👋' : positiveRate >= 70 ? '🌟' : '✨'}
        </motion.div>
        <h2 className={styles.title}>
          {total === 0 ? '本次未练题' : '本次完成！'}
        </h2>
        <p className={styles.subtitle}>
          {total === 0
            ? `${deckName} · 随时回来继续`
            : `${deckName} · 刷了 ${total} 道 · 用时 ${formatDuration(durationMs)}`}
        </p>

        {total > 0 && (
          <>
            <div className={styles.divider} />

            <div className={styles.stats}>
              {order.map(type => {
                const count = feedbackBreakdown[type];
                if (count === 0) return null;
                const pct = (count / total) * 100;
                const meta = FEEDBACK_META[type];
                return (
                  <div key={type} className={styles.statRow}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel} style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className={styles.statCount}>{count}</span>
                    </div>
                    <div className={styles.statBar}>
                      <motion.div
                        className={styles.statBarFill}
                        style={{ background: meta.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {streak && streak.currentDays > 0 && (
          <>
            <div className={styles.divider} />
            <div className={styles.streakRow}>
              <span className={styles.streakIcon}>🔥</span>
              <span className={styles.streakText}>
                连续 <strong>{streak.currentDays}</strong> 天
              </span>
              {streak.longestDays > streak.currentDays && (
                <span className={styles.streakMeta}>
                  最长 {streak.longestDays} 天
                </span>
              )}
            </div>
          </>
        )}

        <div className={styles.actions}>
          <motion.button
            className={styles.primaryButton}
            onClick={onContinue}
            whileTap={{ scale: 0.97 }}
          >
            继续学习
          </motion.button>
          <motion.button
            className={styles.secondaryButton}
            onClick={() => router.push('/browse')}
            whileTap={{ scale: 0.97 }}
          >
            浏览题库
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
