'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './FlashCard.module.css';

interface FlashCardProps {
  /** 卡片正面，由题集配置的 CardFront 渲染 */
  front: ReactNode;
  /** 卡片背面，由题集配置的 CardBack 渲染 */
  back: ReactNode;
  isFlipped: boolean;
  onFlip: () => void;
}

/**
 * 翻卡容器：只负责正反面切换动画与翻卡按钮，不关心卡片内容形态。
 * 正反面渲染组件来自题集配置（见 lib/decks/），由学习页渲染后传入。
 */
export function FlashCard({ front, back, isFlipped, onFlip }: FlashCardProps) {
  return (
    <div className={styles.perspective}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isFlipped ? 'back' : 'front'}
          className={styles.card}
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.985 }}
          transition={SPRING_CONFIG.flip}
        >
          {isFlipped ? (
            <div className={styles.face}>
              {back}
              <button type="button" className={styles.flipButton} onClick={onFlip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                </svg>
                返回题目
              </button>
            </div>
          ) : (
            <div className={styles.face}>
              {front}
              <button type="button" className={styles.flipButton} onClick={onFlip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                点击查看解法
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
