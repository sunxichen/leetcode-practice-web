'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useProgressContext } from '@/context/ProgressContext';
import { getAllQuestions } from '@/lib/questions';
import { DifficultyBadge } from '@/components/ui/DifficultyBadge';
import { FilterPanel } from '@/components/filters/FilterPanel';
import styles from './page.module.css';

const PROFICIENCY_LABELS: Record<string, string> = {
  new: '新题',
  again: '重来',
  hard: '困难',
  good: '良好',
  easy: '简单',
};

const PROFICIENCY_COLORS: Record<string, string> = {
  new: 'var(--color-text-tertiary)',
  again: 'var(--color-again)',
  hard: 'var(--color-hard-btn)',
  good: 'var(--color-good)',
  easy: 'var(--color-easy-btn)',
};

function formatNextReview(timestamp: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = timestamp - now;
  if (diff <= 0) return '待复习';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 1) return '明天';
  if (days <= 7) return `${days}天后`;
  return `${Math.ceil(days / 7)}周后`;
}

export default function BrowsePage() {
  const { progressData, isLoading } = useProgressContext();
  const questions = getAllQuestions();

  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('全部');
  const [proficiencyFilter, setProficiencyFilter] = useState('全部');

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!q.id.toLowerCase().includes(query) && !q.title.toLowerCase().includes(query)) {
          return false;
        }
      }
      // Difficulty filter
      if (difficultyFilter !== '全部' && q.difficulty !== difficultyFilter) {
        return false;
      }
      // Proficiency filter
      if (proficiencyFilter !== '全部') {
        const prog = progressData.progress[q.id];
        const prof = prog?.proficiency ?? 'new';
        if (prof !== proficiencyFilter) return false;
      }
      return true;
    });
  }, [questions, searchQuery, difficultyFilter, proficiencyFilter, progressData.progress]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>题库</h1>
        <span className={styles.count}>{filteredQuestions.length} 题</span>
      </div>

      <FilterPanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        difficultyFilter={difficultyFilter}
        onDifficultyChange={setDifficultyFilter}
        proficiencyFilter={proficiencyFilter}
        onProficiencyChange={setProficiencyFilter}
      />

      <div className={styles.list}>
        {filteredQuestions.map((q, i) => {
          const prog = progressData.progress[q.id];
          const proficiency = prog?.proficiency ?? 'new';

          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
            >
              <Link href={`/study?q=${q.id}`} className={styles.item}>
                <div className={styles.itemLeft}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemId}>#{q.id}</span>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </div>
                  <span className={styles.itemTitle}>{q.title}</span>
                  <div className={styles.itemTags}>
                    {q.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={styles.itemTag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.itemRight}>
                  <span
                    className={styles.proficiency}
                    style={{ color: PROFICIENCY_COLORS[proficiency] }}
                  >
                    {PROFICIENCY_LABELS[proficiency]}
                  </span>
                  {prog?.nextReviewDate && (
                    <span className={styles.nextReview}>
                      {formatNextReview(prog.nextReviewDate)}
                    </span>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}

        {filteredQuestions.length === 0 && (
          <div className={styles.empty}>
            <p>没有找到匹配的题目</p>
          </div>
        )}
      </div>
    </div>
  );
}
