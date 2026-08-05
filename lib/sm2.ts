import { DAY_MS } from '@/lib/constants';
import type { SchedulingParams } from '@/lib/schedulingParams';
import type { FeedbackType, QuestionProgress } from '@/lib/types';

function startOfDay(ms: number): number {
  return new Date(ms).setHours(0, 0, 0, 0);
}

function clampEF(ef: number, params: SchedulingParams): number {
  return Math.max(params.efMin, ef);
}

function makeInitial(params: SchedulingParams): QuestionProgress {
  return {
    state: 'new',
    learningStep: 0,
    dueAt: 0,
    intervalDays: 0,
    easeFactor: params.efDefault,
    level: 0,
    proficiency: 'new',
    lastReviewDate: 0,
  };
}

/**
 * Compute the next progress entry given the current one and the feedback.
 * Implements an Anki-like FSM: new/learning -> learning/review, review -> review/relearning, etc.
 *
 * `params` carries the deck's scheduling calibration (调度参数); the state
 * machine itself reads no module-level constants.
 *
 * `now` is the current time in ms. Callers may inject it to make scheduling
 * deterministic; omitting it falls back to the system clock.
 */
export function scheduleNext(
  current: QuestionProgress | undefined,
  feedback: FeedbackType,
  params: SchedulingParams,
  now: number = Date.now(),
): QuestionProgress {
  const cur: QuestionProgress = current ? { ...current } : makeInitial(params);

  // Normalise legacy/missing fields just in case.
  if (!cur.state) cur.state = cur.proficiency === 'new' ? 'new' : 'review';
  if (cur.easeFactor === undefined) cur.easeFactor = params.efDefault;
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
        next.dueAt = now + params.learningStepsMin[0] * 60_000;
      } else if (feedback === 'hard') {
        next.state = 'learning';
        // Stay at current step. Delay must sit strictly between Again and the
        // Good-advancement interval so the queue ordering is Again < Hard < Good.
        const againMin = params.learningStepsMin[0];
        const goodMin = params.learningStepsMin[Math.min(cur.learningStep + 1, params.learningStepsMin.length - 1)];
        const hardMin = Math.max(againMin + 1, Math.round((againMin + goodMin) / 2));
        next.dueAt = now + hardMin * 60_000;
      } else if (feedback === 'good') {
        const nextStep = cur.learningStep + 1;
        if (nextStep >= params.learningStepsMin.length) {
          // Graduate to review
          next.state = 'review';
          next.learningStep = 0;
          next.intervalDays = params.graduatingIntervalDays;
          next.dueAt = startOfDay(now) + params.graduatingIntervalDays * DAY_MS;
          next.level = cur.level + 1;
        } else {
          next.state = 'learning';
          next.learningStep = nextStep;
          next.dueAt = now + params.learningStepsMin[nextStep] * 60_000;
        }
      } else if (feedback === 'easy') {
        next.state = 'review';
        next.learningStep = 0;
        next.intervalDays = params.easyIntervalDays;
        next.dueAt = startOfDay(now) + params.easyIntervalDays * DAY_MS;
        next.level = cur.level + 1;
      }
      break;
    }
    case 'review': {
      if (feedback === 'again') {
        // Lapse: drop into relearning, keep prior intervalDays for half-recovery later
        next.easeFactor = clampEF(cur.easeFactor - params.efPenaltyAgain, params);
        next.state = 'relearning';
        next.learningStep = 0;
        next.dueAt = now + params.relearningStepsMin[0] * 60_000;
      } else if (feedback === 'hard') {
        next.easeFactor = clampEF(cur.easeFactor - params.efPenaltyHard, params);
        const newInterval = Math.min(
          params.maxReviewIntervalDays,
          Math.max(1, Math.round(cur.intervalDays * params.hardIntervalFactor)),
        );
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
      } else if (feedback === 'good') {
        const newInterval = Math.min(
          params.maxReviewIntervalDays,
          Math.max(1, Math.round(cur.intervalDays * cur.easeFactor)),
        );
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
        next.level = cur.level + 1;
      } else if (feedback === 'easy') {
        next.easeFactor = cur.easeFactor + params.efBonusEasy;
        const newInterval = Math.min(
          params.maxReviewIntervalDays,
          Math.max(1, Math.round(cur.intervalDays * cur.easeFactor * params.easyBonusFactor)),
        );
        next.intervalDays = newInterval;
        next.dueAt = startOfDay(now) + newInterval * DAY_MS;
        next.level = cur.level + 1;
      }
      break;
    }
    case 'relearning': {
      if (feedback === 'again' || feedback === 'hard') {
        next.dueAt = now + params.relearningStepsMin[0] * 60_000;
      } else if (feedback === 'good') {
        // Reset to a short interval rather than halving the prior one.
        // If you forgot it at N days, the pattern wasn't internalised — restart
        // from day-1 and rebuild the interval from there.
        next.state = 'review';
        next.intervalDays = params.lapseRecoveryIntervalDays;
        next.dueAt = startOfDay(now) + params.lapseRecoveryIntervalDays * DAY_MS;
      } else if (feedback === 'easy') {
        // Easy on relearning: keep half the prior interval as a small mercy.
        next.state = 'review';
        const recovered = Math.max(1, Math.round((cur.intervalDays || 1) * 0.5));
        next.intervalDays = Math.min(params.maxReviewIntervalDays, recovered);
        next.dueAt = startOfDay(now) + next.intervalDays * DAY_MS;
      }
      break;
    }
  }

  // Keep legacy mirrors in sync so existing UI (browse page) keeps working.
  next.nextReviewDate = next.dueAt;
  next.interval = next.intervalDays;
  return next;
}
