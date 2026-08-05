'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { InterviewCard, InterviewCategory, Priority } from '@/lib/interview-types';
import type { CardState } from '@/lib/types';
import { TagChip } from '@/components/ui/TagChip';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './InterviewCardFront.module.css';

interface InterviewCardFrontProps {
  card: InterviewCard;
  cardState?: CardState;
}

const CATEGORY_LABEL: Record<InterviewCategory, string> = {
  'project': '项目',
  'tech-stack': '技术路线',
  'dl-basics': '深度学习基础',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  must: '高频必答',
  common: '常见',
  bonus: '加分项',
};

/**
 * 与 LeetCode 正面同一原则：只显示内容状态（新卡/学过），不显示任何调度
 * 信息（intervalDays、learningStep）——那些数字会泄露"你应该多有信心"
 * 从而污染自评（见 components/card/CardFront.tsx 顶部注释）。
 */
function StateBadge({ state }: { state: CardState }) {
  const label = state === 'new' ? '新卡' : '学过';
  return <span className={`${styles.stateBadge} ${styles[`stateBadge_${state === 'new' ? 'new' : 'seen'}`]}`}>{label}</span>;
}

/**
 * 面试卡正面：问题、分类徽章、重要度徽章、标签，以及常驻显示的要点数量
 * ——它是自评的锚（ADR-0003），用户翻卡前就要知道"这题该说几点"，因此常驻
 * 渲染，不折叠、不靠 hover 出现。
 *
 * 提示按钮（票 9）：只在 card.hint 写了内容时出现，点击后才显示；hint 是
 * 一句话方向指引，不是答案，这里只渲染 hint 本身，不碰任何答案字段。
 * 视觉与交互沿用 LeetCode 正面的提示（虚线按钮 + 展开动画），但文案不叫
 * "思路提示"——那是算法题 core_pattern 的语义。
 */
export function InterviewCardFront({ card, cardState }: InterviewCardFrontProps) {
  const [hintShown, setHintShown] = useState(false);
  // schema 已保证 hint 写了就非空，这里再兜一次空白串，没有就不留按钮占位。
  const hint = card.hint && card.hint.trim().length > 0 ? card.hint : null;

  return (
    <div className={styles.front}>
      <div className={styles.header}>
        <div className={styles.badgeRow}>
          <span className={`${styles.badge} ${styles.categoryBadge}`}>
            {CATEGORY_LABEL[card.category]}
          </span>
          <span className={`${styles.badge} ${styles[`priority_${card.priority}`]}`}>
            {PRIORITY_LABEL[card.priority]}
          </span>
          {cardState && <StateBadge state={cardState} />}
        </div>
        <h2 className={styles.title}>{card.question}</h2>
        <div className={styles.tags}>
          {card.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <AnimatePresence initial={false}>
          {hint && hintShown && (
            <motion.div
              key="hint"
              className={styles.hintBox}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={SPRING_CONFIG.enter}
            >
              <div className={styles.hintLabel}>💡 提示</div>
              <p className={styles.hintText}>{hint}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.footer}>
        <span className={styles.keyPointCount}>
          {card.answer.key_points.length} 个要点
        </span>
        {hint && !hintShown && (
          <button
            type="button"
            className={styles.hintButton}
            onClick={() => setHintShown(true)}
          >
            <span className={styles.hintIcon}>💡</span>
            卡住了，给我个提示
          </button>
        )}
      </div>
    </div>
  );
}
