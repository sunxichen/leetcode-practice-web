'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import type { InterviewCard } from '@/lib/interview-types';
import type { CardState } from '@/lib/types';
import { getInterviewBackSections } from '@/lib/interview-back';
import { InterviewCodeCarousel } from './InterviewCodeCarousel';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './InterviewCardBack.module.css';

interface InterviewCardBackProps {
  card: InterviewCard;
  /** 背面轮播下标：多段代码的当前页，由会话外壳持有并按 getBackPageCount 钳制。 */
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
  /** 互链入口的去向：按当前题集的学习路由构建，由会话外壳/题库页传入 */
  studyHref: (cardId: string) => string;
  /** 互链解析：当前题集的卡片读取接口——组件不直接引用任何题集的数据模块 */
  getCardById: (id: string) => InterviewCard | undefined;
}

const STATE_LABEL: Record<CardState, string> = {
  new: '新卡',
  learning: '学习中',
  review: '复习',
  relearning: '补习',
};

/**
 * 面试卡背面（票 9 补全）：按设计文档的顺序渲染——要点列表（主体）→ 常见坑
 * → 代码（多段时轮播）→ 展开叙述（默认折叠）→ 可能的追问 → 互链卡片入口。
 *
 * 可选区块该不该存在由 getInterviewBackSections 归一化决定：缺省或空数组
 * 一律为 null，这里只按 null 判断渲染，空数组不会变成空标题/空盒子。
 * 调度状态徽章沿用 LeetCode 背面的做法：调度信息只属于背面，不出现在正面。
 */
export function InterviewCardBack({
  card,
  activeSolutionIndex,
  onSolutionIndexChange,
  cardState,
  learningStep,
  intervalDays,
  studyHref,
  getCardById,
}: InterviewCardBackProps) {
  const [elaborationOpen, setElaborationOpen] = useState(false);
  const sections = getInterviewBackSections(card, getCardById);

  let stateDetail = '';
  if (cardState === 'learning' || cardState === 'relearning') {
    stateDetail = ` ${(learningStep ?? 0) + 1}`;
  } else if (cardState === 'review' && intervalDays && intervalDays > 0) {
    stateDetail = ` · ${intervalDays}d`;
  }

  return (
    <div className={styles.back}>
      <div className={styles.header}>
        <span className={styles.label}>答案</span>
        {cardState && (
          <span className={styles.stateInfo}>
            {STATE_LABEL[cardState]}{stateDetail}
          </span>
        )}
      </div>

      {/* 1. 要点列表：自评的锚（ADR-0003），主体，永远渲染 */}
      <div>
        <div className={styles.sectionLabel}>
          要点 · {sections.keyPoints.length} 条
        </div>
        <ol className={styles.keyPoints}>
          {sections.keyPoints.map((point, i) => (
            <li key={i} className={styles.keyPoint}>
              {point}
            </li>
          ))}
        </ol>
      </div>

      {/* 2. 常见坑 */}
      {sections.pitfalls && (
        <div>
          <div className={styles.sectionLabel}>常见坑</div>
          <ul className={styles.textList}>
            {sections.pitfalls.map((pitfall, i) => (
              <li key={i} className={styles.textItem}>
                {pitfall}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. 代码：多段时轮播切换；语言走各段自己的 language 字段 */}
      {sections.code && (
        <div>
          <div className={styles.sectionLabel}>
            代码{sections.code.length > 1 ? ` · ${activeSolutionIndex + 1}/${sections.code.length}` : ''}
          </div>
          <InterviewCodeCarousel
            snippets={sections.code}
            activeIndex={activeSolutionIndex}
            onIndexChange={onSolutionIndexChange}
          />
        </div>
      )}

      {/* 4. 展开叙述：默认折叠，点击后才挂载内容，初始渲染不泄露全文 */}
      {sections.elaboration && (
        <div>
          <button
            type="button"
            className={styles.elaborationToggle}
            onClick={() => setElaborationOpen(prev => !prev)}
            aria-expanded={elaborationOpen}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`${styles.elaborationChevron} ${elaborationOpen ? styles.elaborationChevronOpen : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            展开叙述
          </button>
          <AnimatePresence initial={false}>
            {elaborationOpen && (
              <motion.div
                key="elaboration"
                className={styles.elaborationBox}
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={SPRING_CONFIG.enter}
              >
                <p className={styles.elaborationText}>{sections.elaboration}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 5. 可能的追问 */}
      {sections.followUps && (
        <div>
          <div className={styles.sectionLabel}>可能的追问</div>
          <ul className={styles.textList}>
            {sections.followUps.map((followUp, i) => (
              <li key={i} className={styles.textItem}>
                {followUp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. 互链卡片入口：跳现有单卡深链，查阅不改动当前卡进度 */}
      {sections.related && (
        <div>
          <div className={styles.sectionLabel}>相关卡片</div>
          <div className={styles.relatedList}>
            {sections.related.map((entry) => (
              <Link
                key={entry.id}
                href={studyHref(entry.id)}
                className={styles.relatedLink}
              >
                <span className={styles.relatedQuestion}>{entry.question}</span>
                <span className={styles.relatedId}>{entry.id}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
