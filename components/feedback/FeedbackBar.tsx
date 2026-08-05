'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { FeedbackType, QuestionProgress } from '@/lib/types';
import type { SchedulingParams } from '@/lib/schedulingParams';
import { ParticleEffect } from '@/components/ui/ParticleEffect';
import { SPRING_CONFIG } from '@/lib/constants';
import { scheduleNext } from '@/lib/sm2';
import styles from './FeedbackBar.module.css';

interface FeedbackBarProps {
  onFeedback: (type: FeedbackType) => void;
  disabled?: boolean;
  currentProgress?: QuestionProgress;
  /** 调度参数：由题集配置注入，用于各档位按钮的到期时间预览。 */
  schedulingParams: SchedulingParams;
}

const FEEDBACK_BASE: { type: FeedbackType; label: string; className: string }[] = [
  { type: 'again', label: '重来', className: 'again' },
  { type: 'hard', label: '困难', className: 'hard' },
  { type: 'good', label: '良好', className: 'good' },
  { type: 'easy', label: '简单', className: 'easy' },
];

function formatPreview(dueAtMs: number): string {
  const ms = dueAtMs - Date.now();
  if (ms <= 0) return '马上';
  const min = ms / 60000;
  if (min < 60) return `<${Math.max(1, Math.round(min))}分钟`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}小时`;
  const days = Math.round(hr / 24);
  return `${days}天`;
}

export function FeedbackBar({ onFeedback, disabled, currentProgress, schedulingParams }: FeedbackBarProps) {
  const options = useMemo(
    () =>
      FEEDBACK_BASE.map(opt => {
        const preview = scheduleNext(currentProgress, opt.type, schedulingParams);
        return { ...opt, sublabel: formatPreview(preview.dueAt) };
      }),
    [currentProgress, schedulingParams],
  );

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
        {options.map((option, i) => (
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
