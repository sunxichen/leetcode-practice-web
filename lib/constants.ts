export const SPRING_CONFIG = {
  flip: { type: 'spring' as const, stiffness: 300, damping: 30 },
  enter: { type: 'spring' as const, stiffness: 260, damping: 25 },
  exitPositive: { type: 'spring' as const, stiffness: 200, damping: 20 },
  exitNegative: { type: 'spring' as const, stiffness: 400, damping: 50 },
  carousel: { type: 'spring' as const, stiffness: 350, damping: 30 },
  buttonPress: { type: 'spring' as const, stiffness: 600, damping: 15 },
};

export const QUALITY_MAP: Record<string, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const LOW_WATER_MARK = 3;

export const DEBOUNCE_MS = 5000;

export const LOCAL_STORAGE_KEY = 'user_progress:hot100';

// === Spaced-repetition scheduling (Anki-like) ===

/** Learning steps for new cards, in minutes.
 * Tuned for short (10–15 min) sessions: at ~2 cards/min, step 1 re-shows after ~2 cards,
 * step 2 after ~10 cards — so a brand-new card is seen 3 times within a typical session
 * before graduating to a 1-day review. */
export const LEARNING_STEPS_MIN = [1, 5];

/** Relearning steps after a lapse on a review card, in minutes */
export const RELEARNING_STEPS_MIN = [5];

/** First review interval after graduating from learning (days) */
export const GRADUATING_INTERVAL_DAYS = 1;

/** Interval when user marks a new card as Easy (days) */
export const EASY_INTERVAL_DAYS = 4;

/** Multiplier for Hard on review cards */
export const HARD_INTERVAL_FACTOR = 1.2;

/** Bonus multiplier for Easy on review cards */
export const EASY_BONUS_FACTOR = 1.3;

/** EF adjustment on Again (review) */
export const EF_PENALTY_AGAIN = 0.2;

/** EF adjustment on Hard (review) */
export const EF_PENALTY_HARD = 0.15;

/** EF adjustment on Easy (review) */
export const EF_BONUS_EASY = 0.15;

/** Min ease factor */
export const EF_MIN = 1.3;

/** Default starting ease factor */
export const EF_DEFAULT = 2.5;

/** Milliseconds in a day */
export const DAY_MS = 24 * 60 * 60 * 1000;

export const FEEDBACK_COLORS = {
  again: { color: 'var(--color-again)', bg: 'var(--color-again-bg)', pressed: 'var(--color-again-pressed)' },
  hard: { color: 'var(--color-hard-btn)', bg: 'var(--color-hard-bg)', pressed: 'var(--color-hard-pressed)' },
  good: { color: 'var(--color-good)', bg: 'var(--color-good-bg)', pressed: 'var(--color-good-pressed)' },
  easy: { color: 'var(--color-easy-btn)', bg: 'var(--color-easy-bg)', pressed: 'var(--color-easy-pressed)' },
} as const;

export const EXIT_ANIMATIONS = {
  easy: { y: -300, opacity: 0, scale: 0.8 },
  good: { x: 300, opacity: 0, rotate: 5 },
  hard: { x: 250, opacity: 0 },
  again: { y: 200, opacity: 0, scale: 0.95 },
} as const;

export const ENTER_ANIMATION = {
  initial: { y: 60, opacity: 0 },
  animate: { y: 0, opacity: 1 },
};
