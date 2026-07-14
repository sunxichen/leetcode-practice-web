/** Single solution */
export interface Solution {
  method_name: string;
  time_complexity: string;
  space_complexity: string;
  idea_summary: string;
  code: string;
}

/** Single question */
export interface Question {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  description: string;
  core_pattern: string;
  corner_cases: string[];
  solutions: Solution[];
}

/** Card lifecycle state (Anki-style) */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** Single question progress */
export interface QuestionProgress {
  /** Card lifecycle state */
  state: CardState;
  /** Index in learning steps array (only meaningful in learning/relearning) */
  learningStep: number;
  /** Absolute ms timestamp of next due time (sub-day for learning, day-level for review) */
  dueAt: number;
  /** Interval in days for review state */
  intervalDays: number;
  /** SM-2 ease factor */
  easeFactor: number;
  /** Successful graduations / repetition count */
  level: number;
  /** Last user feedback */
  proficiency: 'again' | 'hard' | 'good' | 'easy' | 'new';
  /** Last review timestamp */
  lastReviewDate: number;
  /** Cumulative lapse count (review → relearning transitions) */
  lapses?: number;

  // ---- Legacy fields, kept for backward compatibility with existing KV / browse page ----
  /** @deprecated use dueAt */
  nextReviewDate?: number;
  /** @deprecated use intervalDays */
  interval?: number;
}

/** Session cursor for resume */
export interface SessionCursor {
  mode: 'ebbinghaus' | 'difficulty' | 'proficiency';
  currentQuestionId: string;
  queue: string[];
  queueIndex: number;
  timestamp: number;
}

/** Per-day aggregate counters for streaks + summary */
export interface DailyStat {
  reviewedCount: number;   // total feedbacks given
  graduatedCount: number;  // new/learning → review transitions
  lapseCount: number;      // review → relearning transitions
}

/** Streak tracking (consecutive active days) */
export interface StreakInfo {
  currentDays: number;
  longestDays: number;
  lastActiveDay: string;   // YYYY-MM-DD in local timezone
}

/** Complete user progress data stored in KV */
export interface UserProgressData {
  lastUpdatedAt: number;
  lastSessionCursor: SessionCursor | null;
  progress: Record<string, QuestionProgress>;
  dailyStats?: Record<string, DailyStat>;
  streak?: StreakInfo;
}

export type FeedbackType = 'again' | 'hard' | 'good' | 'easy';

/** A study-session configuration: drives which queue useStudyQueue builds. */
export type SessionMode =
  | { kind: 'smart' }
  | { kind: 'difficulty'; value: 'Easy' | 'Medium' | 'Hard' }
  | { kind: 'tag'; value: string }
  | { kind: 'weakest' }
  | { kind: 'single'; questionId: string };
