'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Question, CardState } from '@/lib/types';
import { DifficultyBadge } from '@/components/ui/DifficultyBadge';
import { TagChip } from '@/components/ui/TagChip';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './CardFront.module.css';

interface CardFrontProps {
  question: Question;
  cardState?: CardState;
}

/**
 * Simplified state badge — intentionally drops the learningStep / intervalDays
 * detail that was previously shown on the FRONT. Those numbers leak how
 * confident the user "should" feel and bias self-rating; the back of the
 * card is the correct place for the full scheduling context.
 */
function StateBadge({ state }: { state: CardState }) {
  const label = state === 'new' ? '新题' : '学过';
  return <span className={`${styles.stateBadge} ${styles[`stateBadge_${state === 'new' ? 'new' : 'seen'}`]}`}>{label}</span>;
}

export function CardFront({ question, cardState }: CardFrontProps) {
  const [copied, setCopied] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = `${question.id}. ${question.title}\n\n${question.description}`;
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
          {cardState && <StateBadge state={cardState} />}
        </div>
        <h2 className={styles.title}>{question.title}</h2>
        <div className={styles.tags}>
          {question.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.description}>{question.description}</p>

        <AnimatePresence initial={false}>
          {hintShown && (
            <motion.div
              key="hint"
              className={styles.hintBox}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={SPRING_CONFIG.enter}
            >
              <div className={styles.hintLabel}>💡 思路提示</div>
              <p className={styles.hintText}>{question.core_pattern}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.footer}>
        {!hintShown && (
          <button
            type="button"
            className={styles.hintButton}
            onClick={() => setHintShown(true)}
          >
            <span className={styles.hintIcon}>💡</span>
            卡住了，给我个提示
          </button>
        )}
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              已复制
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
