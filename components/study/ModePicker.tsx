'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Question, SessionMode } from '@/lib/types';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './ModePicker.module.css';

interface Counters {
  dueReview: number;
  learningNow: number;
  learningSoon: number;
  newCount: number;
  nextLearningDueAt: number | null;
}

interface ModePickerProps {
  todayDueCount: number;
  counters: Counters;
  onSelectMode: (mode: SessionMode) => void;
  weakestCount: number;
  /** 卡片数据源：由题集配置注入，标签云与难度分布都从这里统计。 */
  questions: Question[];
  /** 可选会话模式清单：由题集配置注入，决定提供哪些模式入口。 */
  modes: readonly SessionMode['kind'][];
}

const MAX_TAG_CHIPS = 8;

function formatMinutesUntil(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return '马上';
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} 分钟后`;
  const hrs = Math.round(mins / 60);
  return `${hrs} 小时后`;
}

export function ModePicker({ todayDueCount, counters, onSelectMode, weakestCount, questions, modes }: ModePickerProps) {
  // Top tags by question count
  const topTags = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const q of questions) {
      for (const t of q.tags) tally[t] = (tally[t] ?? 0) + 1;
    }
    return Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TAG_CHIPS)
      .map(([t]) => t);
  }, [questions]);

  // Per-difficulty totals
  const diffCounts = useMemo(() => {
    const acc = { Easy: 0, Medium: 0, Hard: 0 };
    for (const q of questions) acc[q.difficulty]++;
    return acc;
  }, [questions]);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_CONFIG.enter, delay: 0.1 }}
        className={styles.header}
      >
        <div className={styles.iconWrap}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <h1 className={styles.title}>准备好了吗？</h1>
        <p className={styles.subtitle}>
          {todayDueCount > 0 ? (
            <>
              今日有 <span className={styles.highlight}>{todayDueCount}</span> 道题等你复习
              {counters.learningSoon > 0 && counters.nextLearningDueAt && (
                <>
                  {' · '}
                  <span className={styles.highlight}>{counters.learningSoon}</span> 张学习中（最近 {formatMinutesUntil(counters.nextLearningDueAt)}）
                </>
              )}
            </>
          ) : counters.newCount > 0 ? (
            <>题库还有 <span className={styles.highlight}>{counters.newCount}</span> 道新题</>
          ) : (
            '挑一种模式开始'
          )}
        </p>
      </motion.div>

      {modes.includes('smart') && (
        <motion.button
          className={styles.primaryCard}
          onClick={() => onSelectMode({ kind: 'smart' })}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.15 }}
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.01 }}
        >
          <div className={styles.primaryIcon}>💫</div>
          <div className={styles.primaryText}>
            <span className={styles.primaryTitle}>智能复习</span>
            <span className={styles.primarySubtitle}>
              自动安排今天该刷的题 · 推荐
            </span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </motion.button>
      )}

      {modes.includes('difficulty') && (
        <motion.section
          className={styles.section}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.2 }}
        >
          <div className={styles.sectionLabel}>按难度</div>
          <div className={styles.chipRow}>
            {(['Easy', 'Medium', 'Hard'] as const).map(d => (
              <motion.button
                key={d}
                className={`${styles.chip} ${styles[`chip_${d.toLowerCase()}`]}`}
                onClick={() => onSelectMode({ kind: 'difficulty', value: d })}
                whileTap={{ scale: 0.96 }}
              >
                <span className={styles.chipLabel}>{d}</span>
                <span className={styles.chipMeta}>{diffCounts[d]} 题</span>
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      {modes.includes('tag') && (
        <motion.section
          className={styles.section}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.25 }}
        >
          <div className={styles.sectionLabel}>按标签</div>
          <div className={styles.chipRowScroll}>
            {topTags.map(t => (
              <motion.button
                key={t}
                className={styles.tagChip}
                onClick={() => onSelectMode({ kind: 'tag', value: t })}
                whileTap={{ scale: 0.96 }}
              >
                {t}
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      {weakestCount > 0 && modes.includes('weakest') && (
        <motion.section
          className={styles.section}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...SPRING_CONFIG.enter, delay: 0.3 }}
        >
          <motion.button
            className={styles.weakestButton}
            onClick={() => onSelectMode({ kind: 'weakest' })}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.weakestIcon}>🔥</span>
            <span className={styles.weakestText}>攻克最弱</span>
            <span className={styles.weakestMeta}>挑出 {Math.min(10, weakestCount)} 道你最常忘的</span>
          </motion.button>
        </motion.section>
      )}
    </motion.div>
  );
}
