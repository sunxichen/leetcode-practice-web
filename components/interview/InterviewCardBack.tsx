'use client';

import type { InterviewCard } from '@/lib/interview-types';
import type { CardState } from '@/lib/types';
import styles from './InterviewCardBack.module.css';

interface InterviewCardBackProps {
  card: InterviewCard;
  /** 背面轮播下标：面试卡本票没有轮播（多段代码是票 9），接口照 DeckCardBackProps 收下但不使用。 */
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
}

const STATE_LABEL: Record<CardState, string> = {
  new: '新卡',
  learning: '学习中',
  review: '复习',
  relearning: '补习',
};

/**
 * 面试卡背面（票 8 最小可用）：以要点列表为主体——要点是自评的锚
 * （ADR-0003），逐条编号方便用户对着数"我说中了几条"。
 *
 * elaboration / code / pitfalls / follow_ups / related_ids 一概不渲染，
 * 那是票 9（背面补全）的范围。调度状态徽章沿用 LeetCode 背面的做法：
 * 调度信息只属于背面，不出现在正面。
 */
export function InterviewCardBack({
  card,
  cardState,
  learningStep,
  intervalDays,
}: InterviewCardBackProps) {
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

      <div>
        <div className={styles.sectionLabel}>
          要点 · {card.answer.key_points.length} 条
        </div>
        <ol className={styles.keyPoints}>
          {card.answer.key_points.map((point, i) => (
            <li key={i} className={styles.keyPoint}>
              {point}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
