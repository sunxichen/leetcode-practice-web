'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BrowseFacetStatic } from '@/lib/browse-facets';
import styles from './FilterPanel.module.css';

export type SemanticFilter = 'all' | 'due-today' | 'due-soon' | 'lapse-prone' | 'new';

/** FilterPanel 注入的一个多选筛选组：静态描述 + 当前选中态 + 切换回调。
 * 组件只负责按 label 渲染组、按 options 铺 chip，选中态与切换逻辑由调用方
 * 持有（受控组件不作内部状态）——因此组件不引用任何题集的数据源
 *（getAllTags 等），分类/重要度的中文标签也由调用方注入（题集侧定义）。 */
export interface FilterFacet extends BrowseFacetStatic {
  /** 当前选中的值集合（空 = 全部）。 */
  selected: Set<string>;
  /** 切换一个选项。 */
  onToggle: (value: string) => void;
}

interface FilterPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** 搜索框占位文案，由调用方（题集侧）决定。默认沿用 LeetCode 现状文案。 */
  searchPlaceholder?: string;
  semantic: SemanticFilter;
  onSemanticChange: (s: SemanticFilter) => void;
  /** 注入的多选筛选组（难度/标签/分类/重要度……），顺序即渲染顺序。 */
  facets: FilterFacet[];
}

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
  searchPlaceholder = '搜索题号 / 标题 / 标签...',
  semantic,
  onSemanticChange,
  facets,
}: FilterPanelProps) {
  // 多选组的折叠态（「+N 展开/收起」）按组记录，目前只有 LeetCode 标签组用得到。
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

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
          placeholder={searchPlaceholder}
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

      {/* 注入的多选筛选组 */}
      {facets.map((facet) => {
        const isExpanded = expandedKeys[facet.key];
        const threshold = facet.collapsibleThreshold;
        const collapsible =
          typeof threshold === 'number' && facet.options.length > threshold;
        const visible = !collapsible || isExpanded
          ? facet.options
          : facet.options.slice(0, threshold);

        return (
          <div key={facet.key} className={styles.filterGroup}>
            <div className={styles.filterLabelRow}>
              <span className={styles.filterLabel}>{facet.label}</span>
              {facet.showClear && facet.selected.size > 0 && (
                <button
                  className={styles.clearTagsButton}
                  onClick={() => facet.selected.forEach((v) => facet.onToggle(v))}
                >
                  清除 ({facet.selected.size})
                </button>
              )}
            </div>
            <div className={styles.chips}>
              <AnimatePresence initial={false}>
                {visible.map((opt) => (
                  <motion.button
                    key={opt.value}
                    className={`${styles.chip} ${facet.selected.has(opt.value) ? styles.chipActive : ''}`}
                    onClick={() => facet.onToggle(opt.value)}
                    whileTap={{ scale: 0.95 }}
                    layout
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </AnimatePresence>
              {collapsible && (
                <button
                  className={styles.expandButton}
                  onClick={() => setExpandedKeys((prev) => ({ ...prev, [facet.key]: !isExpanded }))}
                >
                  {isExpanded ? '收起' : `+${facet.options.length - threshold}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
