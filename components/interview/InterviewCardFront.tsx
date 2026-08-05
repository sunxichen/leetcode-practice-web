'use client';

import type { InterviewCard, InterviewCategory, Priority } from '@/lib/interview-types';
import type { CardState } from '@/lib/types';
import { TagChip } from '@/components/ui/TagChip';
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
 * 面试卡正面（票 8 最小可用）：问题、分类徽章、重要度徽章、标签，以及常驻
 * 显示的要点数量——它是自评的锚（ADR-0003），用户翻卡前就要知道"这题该
 * 说几点"，因此常驻渲染，不折叠、不靠 hover 出现。
 *
 * 提示按钮（hint）属于票 9，本票不渲染。
 */
export function InterviewCardFront({ card, cardState }: InterviewCardFrontProps) {
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

      <div className={styles.body} />

      <div className={styles.footer}>
        <span className={styles.keyPointCount}>
          {card.answer.key_points.length} 个要点
        </span>
      </div>
    </div>
  );
}
