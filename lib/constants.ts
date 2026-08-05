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

// 进度文档键名不再硬编码：按题集标识派生（lib/storage.ts 的 progressKeyFor），
// hot100 派生值与历史键名 'user_progress:hot100' 逐字节相同，有测试钉死。

/** Window during which a feedback can be undone via the toast action button. */
export const UNDO_WINDOW_MS = 5000;

// === Spaced-repetition scheduling (Anki-like) ===
// The scheduling calibration values moved out of this module: they are now
// passed explicitly as a SchedulingParams object (see lib/schedulingParams.ts,
// HOT100_SCHEDULING_PARAMS for the LeetCode deck's values).

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
