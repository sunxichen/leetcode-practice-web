'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { FeedbackType } from '@/lib/types';
import { ParticleEffect } from '@/components/ui/ParticleEffect';
import { SPRING_CONFIG } from '@/lib/constants';
import styles from './FeedbackBar.module.css';

interface FeedbackBarProps {
  onFeedback: (type: FeedbackType) => void;
  disabled?: boolean;
}

const FEEDBACK_OPTIONS: { type: FeedbackType; label: string; sublabel: string; className: string }[] = [
  { type: 'again', label: '重来', sublabel: '<10分钟', className: 'again' },
  { type: 'hard', label: '困难', sublabel: '1天', className: 'hard' },
  { type: 'good', label: '良好', sublabel: '3天', className: 'good' },
  { type: 'easy', label: '简单', sublabel: '7天', className: 'easy' },
];

export function FeedbackBar({ onFeedback, disabled }: FeedbackBarProps) {
  const [particles, setParticles] = useState<{ x: number; y: number; active: boolean }>({
    x: 0, y: 0, active: false,
  });
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleFeedback = useCallback((type: FeedbackType, index: number) => {
    if (disabled) return;

    if (type === 'easy') {
      const btn = buttonRefs.current[index];
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setParticles({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          active: true,
        });
      }
    }

    onFeedback(type);
  }, [onFeedback, disabled]);

  return (
    <>
      <div className={styles.bar}>
        {FEEDBACK_OPTIONS.map((option, i) => (
          <motion.button
            key={option.type}
            ref={(el) => { buttonRefs.current[i] = el; }}
            className={`${styles.button} ${styles[option.className]}`}
            onClick={() => handleFeedback(option.type, i)}
            disabled={disabled}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_CONFIG.buttonPress}
          >
            <span className={styles.label}>{option.label}</span>
            <span className={styles.sublabel}>{option.sublabel}</span>
          </motion.button>
        ))}
      </div>
      <ParticleEffect
        x={particles.x}
        y={particles.y}
        active={particles.active}
        onComplete={() => setParticles(p => ({ ...p, active: false }))}
      />
    </>
  );
}
