'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllTags } from '@/lib/questions';
import styles from './FilterPanel.module.css';

export type SemanticFilter = 'all' | 'due-today' | 'due-soon' | 'lapse-prone' | 'new';

interface FilterPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  difficulties: Set<string>;
  onToggleDifficulty: (difficulty: string) => void;
  tags: Set<string>;
  onToggleTag: (tag: string) => void;
  semantic: SemanticFilter;
  onSemanticChange: (s: SemanticFilter) => void;
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

const SEMANTIC_OPTIONS: { value: SemanticFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'due-today', label: '今日待复习' },
  { value: 'due-soon', label: '7 天内到期' },
  { value: 'lapse-prone', label: '易遗忘' },
  { value: 'new', label: '未学习' },
];

export function FilterPanel({
  searchQuery,
  onSearchChange,
  difficulties,
  onToggleDifficulty,
  tags,
  onToggleTag,
  semantic,
  onSemanticChange,
}: FilterPanelProps) {
  const allTags = useMemo(() => getAllTags(), []);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const visibleTags = tagsExpanded ? allTags : allTags.slice(0, 10);
  const hasHiddenTags = allTags.length > 10;

  return (
    <div className={styles.panel}>
      {/* Search */}
      <div className={styles.searchContainer}>
        <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="搜索题号 / 标题 / 标签..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className={styles.clearButton}
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>

      {/* Semantic filter */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>状态</span>
        <div className={styles.chips}>
          {SEMANTIC_OPTIONS.map((opt) => (
            <motion.button
              key={opt.value}
              className={`${styles.chip} ${semantic === opt.value ? styles.chipActive : ''}`}
              onClick={() => onSemanticChange(opt.value)}
              whileTap={{ scale: 0.95 }}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Difficulty (multi-select) */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>难度</span>
        <div className={styles.chips}>
          {DIFFICULTIES.map((d) => (
            <motion.button
              key={d}
              className={`${styles.chip} ${difficulties.has(d) ? styles.chipActive : ''}`}
              onClick={() => onToggleDifficulty(d)}
              whileTap={{ scale: 0.95 }}
            >
              {d}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Tags (multi-select, collapsible) */}
      <div className={styles.filterGroup}>
        <div className={styles.filterLabelRow}>
          <span className={styles.filterLabel}>标签</span>
          {tags.size > 0 && (
            <button
              className={styles.clearTagsButton}
              onClick={() => tags.forEach(t => onToggleTag(t))}
            >
              清除 ({tags.size})
            </button>
          )}
        </div>
        <div className={styles.chips}>
          <AnimatePresence initial={false}>
            {visibleTags.map((t) => (
              <motion.button
                key={t}
                className={`${styles.chip} ${tags.has(t) ? styles.chipActive : ''}`}
                onClick={() => onToggleTag(t)}
                whileTap={{ scale: 0.95 }}
                layout
              >
                {t}
              </motion.button>
            ))}
          </AnimatePresence>
          {hasHiddenTags && (
            <button
              className={styles.expandButton}
              onClick={() => setTagsExpanded(v => !v)}
            >
              {tagsExpanded ? '收起' : `+${allTags.length - 10}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
