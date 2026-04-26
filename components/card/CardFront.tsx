'use client';

import { useState, useCallback } from 'react';
import type { Question, CardState } from '@/lib/types';
import { DifficultyBadge } from '@/components/ui/DifficultyBadge';
import { TagChip } from '@/components/ui/TagChip';
import styles from './CardFront.module.css';

interface CardFrontProps {
  question: Question;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
}

const STATE_LABEL: Record<CardState, string> = {
  new: '新题',
  learning: '学习中',
  review: '复习',
  relearning: '补习',
};

function StateBadge({
  state,
  learningStep,
  intervalDays,
}: {
  state: CardState;
  learningStep?: number;
  intervalDays?: number;
}) {
  let detail = '';
  if (state === 'learning' || state === 'relearning') {
    detail = ` ${(learningStep ?? 0) + 1}`;
  } else if (state === 'review' && intervalDays && intervalDays > 0) {
    detail = ` · ${intervalDays}d`;
  }
  return (
    <span className={`${styles.stateBadge} ${styles[`stateBadge_${state}`]}`}>
      {STATE_LABEL[state]}{detail}
    </span>
  );
}

export function CardFront({ question, cardState, learningStep, intervalDays }: CardFrontProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = `${question.id}. ${question.title}\n\n${question.description}\n\n核心模式: ${question.core_pattern}\n\n边界用例:\n${question.corner_cases.map(c => `- ${c}`).join('\n')}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [question]);

  return (
    <div className={styles.front}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.questionId}>#{question.id}</span>
          <DifficultyBadge difficulty={question.difficulty} />
          {cardState && (
            <StateBadge
              state={cardState}
              learningStep={learningStep}
              intervalDays={intervalDays}
            />
          )}
        </div>
        <h2 className={styles.title}>{question.title}</h2>
        <div className={styles.tags}>
          {question.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.section}>
          <p className={styles.description}>{question.description}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>核心模式</div>
          <p className={styles.pattern}>{question.core_pattern}</p>
        </div>

        {question.corner_cases.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>边界用例</div>
            <ul className={styles.cornerCases}>
              {question.corner_cases.map((c, i) => (
                <li key={i} className={styles.cornerCase}>
                  <span className={styles.bullet}>•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              已复制到剪贴板
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制题目
            </>
          )}
        </button>
      </div>
    </div>
  );
}
