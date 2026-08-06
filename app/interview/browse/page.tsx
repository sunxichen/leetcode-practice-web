'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useDeckProgress } from '@/context/ProgressContext';
import { getAllInterviewCards } from '@/lib/interview';
import { interviewStudyHref } from '@/lib/interview-back';
import { InterviewCardBack } from '@/components/interview/InterviewCardBack';
import { FilterPanel, type FilterFacet, type SemanticFilter } from '@/components/filters/FilterPanel';
import {
  filterInterviewCards,
  INTERVIEW_CATEGORY_LABEL,
  INTERVIEW_PRIORITY_LABEL,
  INTERVIEW_CATEGORY_ORDER,
  INTERVIEW_PRIORITY_ORDER,
} from '@/lib/interview-browse';
import type { InterviewCard } from '@/lib/interview-types';
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

/** 下次复习时间口径与 Hot100 题库页一致（formatNextReview 逐位相同）。 */
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

/** 面试题库页的多选筛选组（分类 + 重要度）的静态配置。中文标签在题集侧定义
 *（lib/interview-browse.ts），组件 FilterPanel 不认识这些字段。 */
const INTERVIEW_FACET_GROUPS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'category',
    label: '分类',
    options: INTERVIEW_CATEGORY_ORDER.map((c) => ({
      value: c,
      label: INTERVIEW_CATEGORY_LABEL[c],
    })),
  },
  {
    key: 'priority',
    label: '重要度',
    options: INTERVIEW_PRIORITY_ORDER.map((p) => ({
      value: p,
      label: INTERVIEW_PRIORITY_LABEL[p],
    })),
  },
];

/** 列表项：整行点击就地展开**只读**答案（查阅，不写任何调度状态），
 * 「去复习」是行内独立链接进入单卡自评。多段代码轮播的 activeIndex 用本项
 * 本地状态持有。 */
function BrowseItem({
  card,
  progress,
  index,
}: {
  card: InterviewCard;
  progress: { proficiency?: string; nextReviewDate?: number; lapses?: number } | undefined;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // 查阅是只读行为：展开/折叠、翻阅代码都只改本地 UI 状态，不调用
  // updateProgress 或任何 storage 写入。
  const [activeSolutionIndex, setActiveSolutionIndex] = useState(0);

  const proficiency = progress?.proficiency ?? 'new';
  const lapses = progress?.lapses ?? 0;

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.5) }}
    >
      <div className={styles.item}>
        <div
          className={styles.itemMain}
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
        >
          <div className={styles.itemLeft}>
            <div className={styles.itemHeader}>
              <span className={`${styles.badge} ${styles[`category_${card.category}`]}`}>
                {INTERVIEW_CATEGORY_LABEL[card.category]}
              </span>
              <span className={`${styles.badge} ${styles[`priority_${card.priority}`]}`}>
                {INTERVIEW_PRIORITY_LABEL[card.priority]}
              </span>
              {lapses > 0 && (
                <span className={styles.lapseBadge} title={`已遗忘 ${lapses} 次`}>
                  🔁 {lapses}
                </span>
              )}
            </div>
            <span className={styles.itemTitle}>{card.question}</span>
            <div className={styles.itemTags}>
              {card.tags.slice(0, 3).map((tag) => (
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
            {progress?.nextReviewDate ? (
              <span className={styles.nextReview}>
                {formatNextReview(progress.nextReviewDate)}
              </span>
            ) : null}
            {/* 去复习：行内独立链接，stopPropagation 让点击它只跳转、不触发整行展开 */}
            <Link
              href={interviewStudyHref(card.id)}
              className={styles.studyButton}
              onClick={(e) => e.stopPropagation()}
            >
              去复习
            </Link>
          </div>
        </div>

        {expanded && (
          <div className={styles.expanded}>
            <InterviewCardBack
              card={card}
              activeSolutionIndex={activeSolutionIndex}
              onSolutionIndexChange={setActiveSolutionIndex}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function InterviewBrowsePage() {
  const { progressData, isLoading } = useDeckProgress('interview');
  const cards = getAllInterviewCards();

  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Set<string>>(new Set());
  const [semantic, setSemantic] = useState<SemanticFilter>('all');

  const toggleCategory = useCallback((c: string) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }, []);

  const togglePriority = useCallback((p: string) => {
    setPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }, []);

  const facets: FilterFacet[] = INTERVIEW_FACET_GROUPS.map((g) => ({
    ...g,
    selected: g.key === 'priority' ? priorities : categories,
    onToggle: g.key === 'priority' ? togglePriority : toggleCategory,
  }));

  const filteredCards = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- snapshot now() for the filter; derived from current progress
    const now = Date.now();
    return filterInterviewCards(
      cards,
      progressData.progress,
      { searchQuery, categories, priorities, semantic },
      now,
    );
  }, [cards, progressData.progress, searchQuery, categories, priorities, semantic]);

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
        <h1 className={styles.title}>面试题库</h1>
        <span className={styles.count}>{filteredCards.length} 题</span>
      </div>

      <FilterPanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="搜索问题 / 标签..."
        semantic={semantic}
        onSemanticChange={setSemantic}
        facets={facets}
      />

      <div className={styles.list}>
        {filteredCards.map((card, i) => (
          <BrowseItem
            key={card.id}
            card={card}
            progress={progressData.progress[card.id]}
            index={i}
          />
        ))}

        {filteredCards.length === 0 && (
          <div className={styles.empty}>
            <p>没有找到匹配的题</p>
          </div>
        )}
      </div>
    </div>
  );
}
