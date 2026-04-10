'use client';

import { useEffect } from 'react';
import type { FeedbackType } from '@/lib/types';

interface KeyboardConfig {
  isFlipped: boolean;
  onFlip: () => void;
  onFeedback: (feedback: FeedbackType) => void;
  onPrevSolution: () => void;
  onNextSolution: () => void;
  onToggleTheme: () => void;
  onToggleSound: () => void;
}

export function useKeyboard(config: KeyboardConfig) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (!config.isFlipped) {
            config.onFlip();
          }
          break;
        case '1':
          if (config.isFlipped) config.onFeedback('again');
          break;
        case '2':
          if (config.isFlipped) config.onFeedback('hard');
          break;
        case '3':
          if (config.isFlipped) config.onFeedback('good');
          break;
        case '4':
          if (config.isFlipped) config.onFeedback('easy');
          break;
        case 'ArrowLeft':
          if (config.isFlipped) config.onPrevSolution();
          break;
        case 'ArrowRight':
          if (config.isFlipped) config.onNextSolution();
          break;
        case 'd':
        case 'D':
          config.onToggleTheme();
          break;
        case 'm':
        case 'M':
          config.onToggleSound();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config]);
}
