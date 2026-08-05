/**
 * Scheduling params (调度参数) — one algorithm, calibrated per deck (ADR-0001).
 *
 * Every calibration value that used to live in module-level constants now
 * arrives through this object: `scheduleNext` (lib/sm2.ts) and the queue
 * weaving (hooks/useStudyQueue.ts) both receive it explicitly, so a second
 * deck can run the same state machine on its own calibration.
 */
export interface SchedulingParams {
  // === Scheduling state machine (lib/sm2.ts) ===

  /** Learning steps for new cards, in minutes. */
  learningStepsMin: number[];
  /** Relearning steps after a lapse on a review card, in minutes. */
  relearningStepsMin: number[];
  /** First review interval after graduating from learning (days) */
  graduatingIntervalDays: number;
  /** Interval when a new/learning card is graded Easy (days) */
  easyIntervalDays: number;
  /** Multiplier for Hard on review cards */
  hardIntervalFactor: number;
  /** Bonus multiplier for Easy on review cards */
  easyBonusFactor: number;
  /** Hard cap on review interval (days) */
  maxReviewIntervalDays: number;
  /** Interval to reset to after a lapse followed by successful relearning (days) */
  lapseRecoveryIntervalDays: number;
  /** EF adjustment on Again (review) */
  efPenaltyAgain: number;
  /** EF adjustment on Hard (review) */
  efPenaltyHard: number;
  /** EF adjustment on Easy (review) */
  efBonusEasy: number;
  /** Min ease factor */
  efMin: number;
  /** Default starting ease factor */
  efDefault: number;

  // === Queue weaving (hooks/useStudyQueue.ts) ===

  /** Estimated cards per minute, used to place a pending learning card back
   * into the queue at roughly the position where it becomes due. */
  cardsPerMinute: number;
  /** Lower bound (queue positions) for re-showing a learning card. */
  learningReinsertMin: number;
  /** Upper bound (queue positions) for re-showing a learning card. */
  learningReinsertMax: number;
  /** Max brand-new cards introduced per day. null = unlimited. */
  newCardsPerDay: number | null;
}

/**
 * LeetCode Hot 100 题集 — values identical to the module-level constants that
 * predate parameterisation, so external scheduling behaviour is unchanged.
 *
 * Tuned for ~4 min per problem, 10–15 problems/session:
 *   - learning step 0 (10 min) re-shows after ~2–3 problems, enough to clear
 *     the short-term memory buffer so the re-test is a genuine recall attempt,
 *     not parrot-back.
 *   - learning step 1 (60 min) re-shows near the end of a typical session,
 *     verifying the pattern survived beyond immediate working memory.
 *   - then graduates to a 1-day review.
 * Steps are spaced wide enough to avoid "I just memorised the answer" false
 * positives. Relearning is kept short so an "Again"-marked review problem
 * comes back inside the same session.
 *
 * Queue weaving, at 4 min/problem:
 *   - 0.25 cards/minute drives the reinsert-position estimate.
 *   - reinsert MIN=2 ⇒ at least two other problems (~8 min) before recurrence,
 *     slightly under the 10-min step-0 interval, preventing the immediate
 *     "I just saw this" feel.
 *   - reinsert MAX=15 ⇒ guaranteed recurrence within ~60 min, matching the
 *     60-min step-1 interval. If the session is shorter, the card simply
 *     appears next session.
 *
 * The 30-day interval cap prevents intervals from exploding to months after a
 * streak of Good/Easy, which is too aggressive for algorithm pattern retention
 * where forgetting is gradual but real. Lapse recovery goes back to day-1
 * rather than halving: if you forgot it at N days, the pattern wasn't
 * internalised.
 */
export const HOT100_SCHEDULING_PARAMS: SchedulingParams = {
  learningStepsMin: [10, 60],
  relearningStepsMin: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  hardIntervalFactor: 1.2,
  easyBonusFactor: 1.15,
  maxReviewIntervalDays: 30,
  lapseRecoveryIntervalDays: 1,
  efPenaltyAgain: 0.2,
  efPenaltyHard: 0.15,
  efBonusEasy: 0.15,
  efMin: 1.3,
  efDefault: 2.5,
  cardsPerMinute: 0.25,
  learningReinsertMin: 2,
  learningReinsertMax: 15,
  newCardsPerDay: null,
};
