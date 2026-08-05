'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CodeSnippet } from '@/lib/interview-types';
import { resolveCodeLanguage } from '@/lib/interview-back';
import { CodeBlock } from '@/components/card/CodeBlock';
import { SPRING_CONFIG } from '@/lib/constants';
import carouselStyles from '@/components/card/SolutionCarousel.module.css';
import styles from './InterviewCodeCarousel.module.css';

interface InterviewCodeCarouselProps {
  snippets: CodeSnippet[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
}

/**
 * 面试卡的多段代码轮播：交互语义与算法题的 SolutionCarousel 一致（箭头、
 * 圆点、滑动动画，样式直接复用它的 chrome），但数据是面试卡的 CodeSnippet
 * ——不复用 Solution 类型，也没有复杂度/思路摘要那些算法题字段。
 *
 * 每段代码按自己声明的 language 高亮（schema 已保证合法，resolveCodeLanguage
 * 再兜一次未知值到 'text'，绝不静默当 Python），复制按钮在 CodeBlock 内、
 * 复制的是该段原始文本。单段代码时不渲染无意义的轮播导航。
 */
export function InterviewCodeCarousel({ snippets, activeIndex, onIndexChange }: InterviewCodeCarouselProps) {
  const [direction, setDirection] = useState(0);

  const goTo = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= snippets.length) return;
    setDirection(newIndex > activeIndex ? 1 : -1);
    onIndexChange(newIndex);
  }, [activeIndex, snippets.length, onIndexChange]);

  const goPrev = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex]);
  const goNext = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex]);

  // 下标由会话外壳按 getBackPageCount 钳制，这里再兜一次，不给 CodeBlock 喂空。
  const current = snippets[activeIndex] ?? snippets[0];
  if (!current) return null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <div className={carouselStyles.carousel}>
      {snippets.length > 1 && (
        <div className={carouselStyles.nav}>
          <button
            className={carouselStyles.arrowButton}
            onClick={goPrev}
            disabled={activeIndex === 0}
            aria-label="上一段代码"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className={carouselStyles.dots}>
            {snippets.map((snippet, i) => (
              <button
                key={i}
                className={`${carouselStyles.dot} ${i === activeIndex ? carouselStyles.dotActive : ''}`}
                onClick={() => goTo(i)}
                aria-label={`代码 ${i + 1}：${snippet.label}`}
              />
            ))}
          </div>
          <button
            className={carouselStyles.arrowButton}
            onClick={goNext}
            disabled={activeIndex === snippets.length - 1}
            aria-label="下一段代码"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}

      <div className={carouselStyles.content}>
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={activeIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SPRING_CONFIG.carousel}
            className={carouselStyles.slide}
          >
            <div className={styles.snippetHeader}>
              <h3 className={styles.snippetLabel}>{current.label}</h3>
            </div>
            <CodeBlock code={current.code} language={resolveCodeLanguage(current.language)} />
            {current.note && <p className={styles.snippetNote}>{current.note}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
