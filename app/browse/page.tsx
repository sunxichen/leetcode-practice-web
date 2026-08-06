'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useDeckProgress } from '@/context/ProgressContext';
import { getAllQuestions } from '@/lib/questions';
import { DifficultyBadge } from '@/components/ui/DifficultyBadge';
import { FilterPanel, type SemanticFilter, type FilterFacet } from '@/components/filters/FilterPanel';
import { hot100FacetGroups } from '@/lib/browse-facets';
import { DAY_MS } from '@/lib/constants';
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
  const { progressData, isLoading } = useDeckProgress('hot100');
  const questions = getAllQuestions();

  const [searchQuery, setSearchQuery] = useState('');
  const [difficulties, setDifficulties] = useState<Set<string>>(new Set());
  const [tagsFilter, setTagsFilter] = useState<Set<string>>(new Set());
  const [semantic, setSemantic] = useState<SemanticFilter>('all');

  const toggleDifficulty = useCallback((d: string) => {
    setDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }, []);

  const toggleTag = useCallback((t: string) => {
    setTagsFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);

  // FilterPanel 参数化（票 13）：两个多选组（难度 + 标签）的静态配置来自
  // hot100FacetGroups——重构前 DIFFICULTIES 常量、getAllTags() 顺序、标签折叠
  // 阈值 10 与清除按钮逐位搬过去；这里只合并当前选中态与切换回调。
  const facets: FilterFacet[] = hot100FacetGroups().map((g) => ({
    ...g,
    selected: g.key === 'tags' ? tagsFilter : difficulties,
    onToggle: g.key === 'tags' ? toggleTag : toggleDifficulty,
  }));

  const filteredQuestions = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- snapshot now() for the filter; results are derived from current progress
    const now = Date.now();
    return questions.filter((q) => {
      // Search filter (id / title / tag)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchIdTitle =
          q.id.toLowerCase().includes(query) ||
          q.title.toLowerCase().includes(query);
        const matchTag = q.tags.some(t => t.toLowerCase().includes(query));
        if (!matchIdTitle && !matchTag) return false;
      }
      // Difficulty (multi-select; empty = all)
      if (difficulties.size > 0 && !difficulties.has(q.difficulty)) {
        return false;
      }
      // Tag filter — question must include ALL selected tags
      if (tagsFilter.size > 0) {
        for (const t of tagsFilter) {
          if (!q.tags.includes(t)) return false;
        }
      }
      // Semantic
      if (semantic !== 'all') {
        const prog = progressData.progress[q.id];
        switch (semantic) {
          case 'due-today': {
            if (!prog || prog.state === 'new') return false;
            const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
            if (due > now) return false;
            break;
          }
          case 'due-soon': {
            if (!prog || prog.state === 'new') return false;
            const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
            if (due <= now || due > now + 7 * DAY_MS) return false;
            break;
          }
          case 'lapse-prone': {
            if (!prog || (prog.lapses ?? 0) < 1) return false;
            break;
          }
          case 'new': {
            if (prog && prog.state !== 'new') return false;
            break;
          }
        }
      }
      return true;
    });
  }, [questions, searchQuery, difficulties, tagsFilter, semantic, progressData.progress]);

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
        semantic={semantic}
        onSemanticChange={setSemantic}
        facets={facets}
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
              <Link href={`/study?q=${encodeURIComponent(q.id)}`} className={styles.item}>
                <div className={styles.itemLeft}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemId}>#{q.id}</span>
                    <DifficultyBadge difficulty={q.difficulty} />
                    {(prog?.lapses ?? 0) > 0 && (
                      <span className={styles.lapseBadge} title={`已遗忘 ${prog!.lapses} 次`}>
                        🔁 {prog!.lapses}
                      </span>
                    )}
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
