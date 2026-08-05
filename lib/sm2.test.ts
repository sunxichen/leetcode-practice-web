import { describe, it, expect } from 'vitest';
import { scheduleNext } from '@/lib/sm2';
import { HOT100_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import type { CardState, FeedbackType, QuestionProgress } from '@/lib/types';

/**
 * Regression anchor for the LeetCode deck's scheduling behaviour.
 *
 * Every expected number here is written out literally rather than derived from
 * `lib/constants`, so a scheduling param that drifts away from today's
 * calibration fails these tests instead of silently changing review intervals.
 */

const MIN = 60_000;
const DAY = 86_400_000;

/** Fixed injected "now": 2026-03-15 10:30 local time. */
const NOW = new Date(2026, 2, 15, 10, 30, 0, 0).getTime();
/** Local midnight of that same day — the base for day-level (review) due times. */
const TODAY = new Date(2026, 2, 15).getTime();

function card(overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    state: 'new',
    learningStep: 0,
    dueAt: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    level: 0,
    proficiency: 'new',
    lastReviewDate: 0,
    ...overrides,
  };
}

interface Expected {
  state: CardState;
  dueAt: number;
  intervalDays: number;
  easeFactor: number;
  learningStep: number;
  level: number;
}

interface TransitionCase {
  name: string;
  current: QuestionProgress;
  feedback: FeedbackType;
  expected: Expected;
}

const NEW_CARD = card();
const LEARNING_STEP_1 = card({ state: 'learning', learningStep: 1, proficiency: 'good' });
const REVIEW_CARD = card({
  state: 'review',
  intervalDays: 10,
  easeFactor: 2.5,
  level: 3,
  proficiency: 'good',
});
const RELEARNING_CARD = card({
  state: 'relearning',
  intervalDays: 10,
  easeFactor: 2.0,
  level: 3,
  proficiency: 'again',
});

/** The 4 lifecycle states × 4 feedback grades. */
const TRANSITIONS: TransitionCase[] = [
  // --- new ---
  {
    name: 'new + again → learning step 0, back in 10 min',
    current: NEW_CARD,
    feedback: 'again',
    expected: { state: 'learning', dueAt: NOW + 10 * MIN, intervalDays: 0, easeFactor: 2.5, learningStep: 0, level: 0 },
  },
  {
    name: 'new + hard → learning step 0, back in 35 min (midpoint of 10 and 60)',
    current: NEW_CARD,
    feedback: 'hard',
    expected: { state: 'learning', dueAt: NOW + 35 * MIN, intervalDays: 0, easeFactor: 2.5, learningStep: 0, level: 0 },
  },
  {
    name: 'new + good → learning step 1, back in 60 min',
    current: NEW_CARD,
    feedback: 'good',
    expected: { state: 'learning', dueAt: NOW + 60 * MIN, intervalDays: 0, easeFactor: 2.5, learningStep: 1, level: 0 },
  },
  {
    name: 'new + easy → review in 4 days, skipping learning',
    current: NEW_CARD,
    feedback: 'easy',
    expected: { state: 'review', dueAt: TODAY + 4 * DAY, intervalDays: 4, easeFactor: 2.5, learningStep: 0, level: 1 },
  },

  // --- learning (final step) ---
  {
    name: 'learning + again → restart at step 0, back in 10 min',
    current: LEARNING_STEP_1,
    feedback: 'again',
    expected: { state: 'learning', dueAt: NOW + 10 * MIN, intervalDays: 0, easeFactor: 2.5, learningStep: 0, level: 0 },
  },
  {
    name: 'learning + hard → stay on the same step, back in 35 min',
    current: LEARNING_STEP_1,
    feedback: 'hard',
    expected: { state: 'learning', dueAt: NOW + 35 * MIN, intervalDays: 0, easeFactor: 2.5, learningStep: 1, level: 0 },
  },
  {
    name: 'learning + good on the last step → graduate to a 1-day review',
    current: LEARNING_STEP_1,
    feedback: 'good',
    expected: { state: 'review', dueAt: TODAY + 1 * DAY, intervalDays: 1, easeFactor: 2.5, learningStep: 0, level: 1 },
  },
  {
    name: 'learning + easy → graduate to a 4-day review',
    current: LEARNING_STEP_1,
    feedback: 'easy',
    expected: { state: 'review', dueAt: TODAY + 4 * DAY, intervalDays: 4, easeFactor: 2.5, learningStep: 0, level: 1 },
  },

  // --- review (intervalDays 10, EF 2.5) ---
  {
    name: 'review + again → lapse into relearning in 10 min, EF -0.2, prior interval kept',
    current: REVIEW_CARD,
    feedback: 'again',
    expected: { state: 'relearning', dueAt: NOW + 10 * MIN, intervalDays: 10, easeFactor: 2.3, learningStep: 0, level: 3 },
  },
  {
    name: 'review + hard → interval ×1.2, EF -0.15, level unchanged',
    current: REVIEW_CARD,
    feedback: 'hard',
    expected: { state: 'review', dueAt: TODAY + 12 * DAY, intervalDays: 12, easeFactor: 2.35, learningStep: 0, level: 3 },
  },
  {
    name: 'review + good → interval ×EF, EF unchanged, level +1',
    current: REVIEW_CARD,
    feedback: 'good',
    expected: { state: 'review', dueAt: TODAY + 25 * DAY, intervalDays: 25, easeFactor: 2.5, learningStep: 0, level: 4 },
  },
  {
    name: 'review + easy → interval ×EF×1.15 using the pre-bonus EF, EF +0.15, level +1',
    current: REVIEW_CARD,
    feedback: 'easy',
    expected: { state: 'review', dueAt: TODAY + 29 * DAY, intervalDays: 29, easeFactor: 2.65, learningStep: 0, level: 4 },
  },

  // --- relearning (intervalDays 10, EF 2.0) ---
  {
    name: 'relearning + again → stay in relearning, back in 10 min',
    current: RELEARNING_CARD,
    feedback: 'again',
    expected: { state: 'relearning', dueAt: NOW + 10 * MIN, intervalDays: 10, easeFactor: 2.0, learningStep: 0, level: 3 },
  },
  {
    name: 'relearning + hard → same as again, back in 10 min',
    current: RELEARNING_CARD,
    feedback: 'hard',
    expected: { state: 'relearning', dueAt: NOW + 10 * MIN, intervalDays: 10, easeFactor: 2.0, learningStep: 0, level: 3 },
  },
  {
    name: 'relearning + good → review at a 1-day interval, level unchanged',
    current: RELEARNING_CARD,
    feedback: 'good',
    expected: { state: 'review', dueAt: TODAY + 1 * DAY, intervalDays: 1, easeFactor: 2.0, learningStep: 0, level: 3 },
  },
  {
    name: 'relearning + easy → review at half the prior interval, level unchanged',
    current: RELEARNING_CARD,
    feedback: 'easy',
    expected: { state: 'review', dueAt: TODAY + 5 * DAY, intervalDays: 5, easeFactor: 2.0, learningStep: 0, level: 3 },
  },
];

describe('scheduleNext — the 16 lifecycle × feedback transitions', () => {
  it.each(TRANSITIONS)('$name', ({ current, feedback, expected }) => {
    const next = scheduleNext(current, feedback, HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.state).toBe(expected.state);
    expect(next.dueAt).toBe(expected.dueAt);
    expect(next.intervalDays).toBe(expected.intervalDays);
    expect(next.easeFactor).toBeCloseTo(expected.easeFactor, 10);
    expect(next.learningStep).toBe(expected.learningStep);
    expect(next.level).toBe(expected.level);
  });

  it('records the feedback and the injected review time on every transition', () => {
    const next = scheduleNext(REVIEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.proficiency).toBe('good');
    expect(next.lastReviewDate).toBe(NOW);
  });

  it('mirrors dueAt / intervalDays onto the deprecated legacy fields', () => {
    const next = scheduleNext(REVIEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.nextReviewDate).toBe(next.dueAt);
    expect(next.interval).toBe(next.intervalDays);
  });
});

describe('scheduleNext — injected time', () => {
  it('treats a missing progress entry as a new card', () => {
    const fromUndefined = scheduleNext(undefined, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    const fromNewCard = scheduleNext(NEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(fromUndefined).toEqual(fromNewCard);
  });

  it('is a pure function of the injected time: the same input yields the same output', () => {
    expect(scheduleNext(REVIEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW)).toEqual(scheduleNext(REVIEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW));
  });

  it('falls back to the system clock when no time is injected', () => {
    const before = Date.now();
    const next = scheduleNext(NEW_CARD, 'again', HOT100_SCHEDULING_PARAMS);
    const after = Date.now();
    expect(next.dueAt).toBeGreaterThanOrEqual(before + 10 * MIN);
    expect(next.dueAt).toBeLessThanOrEqual(after + 10 * MIN);
  });
});

describe('scheduleNext — ordering of learning delays', () => {
  it('orders due times again < hard < good on a learning card', () => {
    const again = scheduleNext(NEW_CARD, 'again', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    const hard = scheduleNext(NEW_CARD, 'hard', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    const good = scheduleNext(NEW_CARD, 'good', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    expect(again).toBeLessThan(hard);
    expect(hard).toBeLessThan(good);
  });

  it('keeps that order on the final learning step, where good graduates to a day-level interval', () => {
    const again = scheduleNext(LEARNING_STEP_1, 'again', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    const hard = scheduleNext(LEARNING_STEP_1, 'hard', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    const good = scheduleNext(LEARNING_STEP_1, 'good', HOT100_SCHEDULING_PARAMS, NOW).dueAt;
    expect(again).toBeLessThan(hard);
    expect(hard).toBeLessThan(good);
  });
});

describe('scheduleNext — lapse and recovery', () => {
  it('sends a lapsed review card into relearning inside the same session', () => {
    const lapsed = scheduleNext(card({ state: 'review', intervalDays: 20, easeFactor: 2.5, level: 5 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.dueAt).toBe(NOW + 10 * MIN);
    expect(lapsed.intervalDays).toBe(20);
  });

  it('restarts from a 1-day interval after successful relearning, rather than halving the prior one', () => {
    const lapsed = scheduleNext(card({ state: 'review', intervalDays: 20, easeFactor: 2.5, level: 5 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    const recovered = scheduleNext(lapsed, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(recovered.state).toBe('review');
    expect(recovered.intervalDays).toBe(1);
    expect(recovered.dueAt).toBe(TODAY + 1 * DAY);
  });

  it('halves the prior interval only when relearning is graded easy', () => {
    const lapsed = scheduleNext(card({ state: 'review', intervalDays: 20, easeFactor: 2.5, level: 5 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    const recovered = scheduleNext(lapsed, 'easy', HOT100_SCHEDULING_PARAMS, NOW);
    expect(recovered.state).toBe('review');
    expect(recovered.intervalDays).toBe(10);
  });
});

describe('scheduleNext — clamps', () => {
  it('caps the review interval at 30 days on good', () => {
    const next = scheduleNext(card({ state: 'review', intervalDays: 28, easeFactor: 2.5, level: 6 }), 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.intervalDays).toBe(30);
    expect(next.dueAt).toBe(TODAY + 30 * DAY);
  });

  it('caps the review interval at 30 days on hard and easy too', () => {
    const base = card({ state: 'review', intervalDays: 28, easeFactor: 2.5, level: 6 });
    expect(scheduleNext(base, 'hard', HOT100_SCHEDULING_PARAMS, NOW).intervalDays).toBe(30);
    expect(scheduleNext(base, 'easy', HOT100_SCHEDULING_PARAMS, NOW).intervalDays).toBe(30);
  });

  it('caps the recovery interval at 30 days when relearning is graded easy', () => {
    const next = scheduleNext(card({ state: 'relearning', intervalDays: 90, easeFactor: 2.0, level: 6 }), 'easy', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.intervalDays).toBe(30);
  });

  it('never lets the interval fall below 1 day', () => {
    const next = scheduleNext(card({ state: 'review', intervalDays: 1, easeFactor: 2.5, level: 2 }), 'hard', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.intervalDays).toBe(1);
  });

  it('floors the ease factor at 1.3 on again', () => {
    const next = scheduleNext(card({ state: 'review', intervalDays: 5, easeFactor: 1.4, level: 2 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.easeFactor).toBeCloseTo(1.3, 10);
  });

  it('floors the ease factor at 1.3 on hard', () => {
    const next = scheduleNext(card({ state: 'review', intervalDays: 5, easeFactor: 1.4, level: 2 }), 'hard', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.easeFactor).toBeCloseTo(1.3, 10);
  });

  it('keeps an already-floored ease factor at 1.3', () => {
    const next = scheduleNext(card({ state: 'review', intervalDays: 5, easeFactor: 1.3, level: 2 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.easeFactor).toBeCloseTo(1.3, 10);
  });

  it('leaves the ease factor untouched while a card is still in learning', () => {
    const next = scheduleNext(card({ state: 'learning', learningStep: 0, easeFactor: 2.5 }), 'again', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.easeFactor).toBeCloseTo(2.5, 10);
  });
});

describe('scheduleNext — legacy progress entries', () => {
  it('reads a state-less legacy entry as a review card and its interval from the legacy field', () => {
    const legacy = { proficiency: 'good', interval: 6, level: 2, dueAt: 0, lastReviewDate: 0 } as unknown as QuestionProgress;
    const next = scheduleNext(legacy, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.state).toBe('review');
    expect(next.intervalDays).toBe(15);
    expect(next.easeFactor).toBeCloseTo(2.5, 10);
  });

  it('reads a state-less legacy entry with proficiency "new" as a new card', () => {
    const legacy = { proficiency: 'new', level: 0, dueAt: 0, lastReviewDate: 0 } as unknown as QuestionProgress;
    const next = scheduleNext(legacy, 'good', HOT100_SCHEDULING_PARAMS, NOW);
    expect(next.state).toBe('learning');
    expect(next.learningStep).toBe(1);
    expect(next.dueAt).toBe(NOW + 60 * MIN);
  });
});
