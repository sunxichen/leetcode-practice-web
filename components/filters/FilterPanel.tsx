'use client';

import { motion } from 'framer-motion';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  difficultyFilter: string;
  onDifficultyChange: (difficulty: string) => void;
  proficiencyFilter: string;
  onProficiencyChange: (proficiency: string) => void;
}

const DIFFICULTIES = ['全部', 'Easy', 'Medium', 'Hard'];
const PROFICIENCIES = [
  { value: '全部', label: '全部' },
  { value: 'new', label: '新题' },
  { value: 'again', label: '重来' },
  { value: 'hard', label: '困难' },
  { value: 'good', label: '良好' },
  { value: 'easy', label: '简单' },
];

export function FilterPanel({
  searchQuery,
  onSearchChange,
  difficultyFilter,
  onDifficultyChange,
  proficiencyFilter,
  onProficiencyChange,
}: FilterPanelProps) {
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
          placeholder="搜索题号或标题..."
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

      {/* Difficulty filter */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>难度</span>
        <div className={styles.chips}>
          {DIFFICULTIES.map((d) => (
            <motion.button
              key={d}
              className={`${styles.chip} ${difficultyFilter === d ? styles.chipActive : ''}`}
              onClick={() => onDifficultyChange(d)}
              whileTap={{ scale: 0.95 }}
            >
              {d === '全部' ? '全部' : d}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Proficiency filter */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>熟练度</span>
        <div className={styles.chips}>
          {PROFICIENCIES.map((p) => (
            <motion.button
              key={p.value}
              className={`${styles.chip} ${proficiencyFilter === p.value ? styles.chipActive : ''}`}
              onClick={() => onProficiencyChange(p.value)}
              whileTap={{ scale: 0.95 }}
            >
              {p.label}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
