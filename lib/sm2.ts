import { QUALITY_MAP } from '@/lib/constants';
import type { FeedbackType } from '@/lib/types';

interface SM2Input {
  quality: number;
  repetition: number;
  easeFactor: number;
  interval: number;
}

interface SM2Output {
  repetition: number;
  easeFactor: number;
  interval: number;
  nextReviewDate: number;
}

export function calculateSM2(input: SM2Input): SM2Output {
  const { quality, repetition, easeFactor, interval } = input;

  let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEF = Math.max(1.3, newEF);

  let newInterval: number;
  let newRepetition: number;

  if (quality < 3) {
    newRepetition = 0;
    newInterval = 1;
  } else {
    newRepetition = repetition + 1;
    if (repetition === 0) {
      newInterval = 1;
    } else if (repetition === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEF);
    }
  }

  // Fix "absolute 24-hour trap": base on today's midnight
  const todayStart = new Date().setHours(0, 0, 0, 0);
  let nextReviewDate: number;

  if (quality < 3) {
    nextReviewDate = Date.now();
  } else {
    nextReviewDate = todayStart + newInterval * 24 * 60 * 60 * 1000;
  }

  return {
    repetition: newRepetition,
    easeFactor: newEF,
    interval: newInterval,
    nextReviewDate,
  };
}

export function getFeedbackQuality(feedback: FeedbackType): number {
  return QUALITY_MAP[feedback];
}
