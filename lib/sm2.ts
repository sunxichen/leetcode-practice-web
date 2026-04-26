import {
  LEARNING_STEPS_MIN,
  RELEARNING_STEPS_MIN,
  GRADUATING_INTERVAL_DAYS,
  EASY_INTERVAL_DAYS,
  HARD_INTERVAL_FACTOR,
  EASY_BONUS_FACTOR,
  EF_PENALTY_AGAIN,
  EF_PENALTY_HARD,
  EF_BONUS_EASY,
  EF_MIN,
  EF_DEFAULT,
  DAY_MS,
} from '@/lib/constants';
import type { FeedbackType, QuestionProgress } from '@/lib/types';

function startOfDay(ms: number): number {
  return new Date(ms).setHours(0, 0, 0, 0);
}

function clampEF(ef: number): number {
  return Math.max(EF_MIN, ef);
}

function makeInitial(): QuestionProgress {
  return {
    state: 'new',
    learningStep: 0,
    dueAt: 0,
    intervalDays: 0,
    easeFactor: EF_DEFAULT,
    level: 0,
    proficiency: 'new',
    lastReviewDate: 0,
  };
}

/**
 * Compute the next progress entry given the current one and the feedback.
 * Implements an Anki-like FSM: new/learning -> learning/review, review -> review/relearning, etc.
 */
export function scheduleNext(
  current: QuestionProgress | undefined,
  feedback: FeedbackType,
): QuestionProgress {
  const now = Date.now();
  const cur: QuestionProgress = current ? { ...current } : makeInitial();

  // Normalise legacy/missing fields just in case.
  if (!cur.state) cur.state = cur.proficiency === 'new' ? 'new' : 'review';
  if (cur.easeFactor === undefined) cur.easeFactor = EF_DEFAULT;
  if (cur.intervalDays === undefined) cur.intervalDays = cur.interval ?? 0;
  if (cur.learningStep === undefined) cur.learningStep = 0;
  if (cur.level === undefined) cur.level = 0;

  const next: QuestionProgress = { ...cur, lastReviewDate: now, proficiency: feedback };

  switch (cur.state) {
    case 'new':
    case 'learning': {
      if (feedback === 'again') {
        next.state = 'learning';
        next.learningStep = 0;
        next.dueAt = now + LEARNING_STEPS_MIN[0] * 60_000;
      } else if (feedback === 'hard') {
        next.state = 'learning';
        // Stay at current step. Delay must sit strictly between Again and the
        // Good-advancement interval so the queue ordering is Again < Hard < Good.
        const againMin = LEARNING_STEPS_MIN[0];
        const goodMin = LEARNING_STEPS_MIN[Math.min(cur.learningStep + 1, LEARNING_STEPS_MIN.length - 1)];
        const hardMin = Math.max(againMin + 1, Math.round((againMin + goodMin) / 2));
        next.dueAt = now + hardMin * 60_000;
      } else if (feedback === 'good') {
        const nextStep = cur.learningStep + 1;
        if (nextStep >= LEARNING_STEPS_MIN.length) {
          // Graduate to review
          next.state = 'review';
          next.learningStep = 0;
          next.intervalDays = GRADUATING_INTERVAL_DAYS;
          next.dueAt = startOfDay(now) + GRADUATING_INTERVAL_DAYS * DAY_MS;
          next.level = cur.level + 1;
        } else {
          next.state = 'learning';
          next.learningStep = nextStep;
          next.dueAt = now + LEARNING_STEPS_MIN[nextStep] * 60_000;
        }
      } else if (feedback === 'easy') {
        next.state = 'review';
        next.learningStep = 0;
        next.intervalDays = EASY_INTERVAL_DAYS;
        next.dueAt = startOfDay(now) + EASY_INTERVAL_DAYS * DAY_MS;
        next.level = cur.level + 1;
      }
      break;
    }
    case 'review': {
      if (feedback === 'again') {
        // Lapse: drop into relearning, keep prior intervalDays for half-recovery later
        next.easeFactor = clampEF(cur.easeFactor - EF_PENALTY_AGAIN);
        next.state = 'relearning';
        next.learningStep = 0;
        next.dueAt = now + RELEARNING_STEPS_MIN[0] * 60_000;
      } else if (feedback === 'hard') {
        next.easeFactor = clampEF(cur.easeFactor - EF_PENALTY_HARD);
        const newInterval = Math.max(1, Math.round(cur.intervalDays * HARD_INTERVAL_FACTOR));
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
      } else if (feedback === 'good') {
        const newInterval = Math.max(1, Math.round(cur.intervalDays * cur.easeFactor));
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
        next.level = cur.level + 1;
      } else if (feedback === 'easy') {
        next.easeFactor = cur.easeFactor + EF_BONUS_EASY;
        const newInterval = Math.max(
          1,
          Math.round(cur.intervalDays * cur.easeFactor * EASY_BONUS_FACTOR),
        );
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
        next.level = cur.level + 1;
      }
      break;
    }
    case 'relearning': {
      if (feedback === 'again' || feedback === 'hard') {
        next.dueAt = now + RELEARNING_STEPS_MIN[0] * 60_000;
      } else if (feedback === 'good') {
        next.state = 'review';
        const recovered = Math.max(1, Math.round((cur.intervalDays || 1) * 0.5));
        next.intervalDays = recovered;
        next.dueAt = startOfDay(now) + recovered * DAY_MS;
      } else if (feedback === 'easy') {
        next.state = 'review';
        const recovered = Math.max(1, cur.intervalDays || 1);
        next.intervalDays = recovered;
        next.dueAt = startOfDay(now) + recovered * DAY_MS;
      }
      break;
    }
  }

  // Keep legacy mirrors in sync so existing UI (browse page) keeps working.
  next.nextReviewDate = next.dueAt;
  next.interval = next.intervalDays;
  return next;
}
