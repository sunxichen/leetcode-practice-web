'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Solution } from '@/lib/types';
import { CodeBlock } from './CodeBlock';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './SolutionCarousel.module.css';

interface SolutionCarouselProps {
  solutions: Solution[];
  activeSolutionIndex: number;
  onIndexChange: (index: number) => void;
}

export function SolutionCarousel({ solutions, activeSolutionIndex, onIndexChange }: SolutionCarouselProps) {
  const [direction, setDirection] = useState(0);

  const goTo = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= solutions.length) return;
    setDirection(newIndex > activeSolutionIndex ? 1 : -1);
    onIndexChange(newIndex);
  }, [activeSolutionIndex, solutions.length, onIndexChange]);

  const goPrev = useCallback(() => goTo(activeSolutionIndex - 1), [goTo, activeSolutionIndex]);
  const goNext = useCallback(() => goTo(activeSolutionIndex + 1), [goTo, activeSolutionIndex]);

  const current = solutions[activeSolutionIndex];
  if (!current) return null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <div className={styles.carousel}>
      {/* Navigation header */}
      {solutions.length > 1 && (
        <div className={styles.nav}>
          <button
            className={styles.arrowButton}
            onClick={goPrev}
            disabled={activeSolutionIndex === 0}
            aria-label="Previous solution"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className={styles.dots}>
            {solutions.map((_, i) => (
              <button
                key={i}
                className={`${styles.dot} ${i === activeSolutionIndex ? styles.dotActive : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Solution ${i + 1}`}
              />
            ))}
          </div>
          <button
            className={styles.arrowButton}
            onClick={goNext}
            disabled={activeSolutionIndex === solutions.length - 1}
            aria-label="Next solution"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}

      {/* Solution content */}
      <div className={styles.content}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeSolutionIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SPRING_CONFIG.carousel}
            className={styles.slide}
          >
            <div className={styles.methodHeader}>
              <h3 className={styles.methodName}>{current.method_name}</h3>
              <div className={styles.complexityBadges}>
                <span className={styles.complexityBadge}>
                  ⏱ {current.time_complexity}
                </span>
                <span className={styles.complexityBadge}>
                  💾 {current.space_complexity}
                </span>
              </div>
            </div>
            <p className={styles.ideaSummary}>{current.idea_summary}</p>
            <CodeBlock code={current.code} language="python" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
