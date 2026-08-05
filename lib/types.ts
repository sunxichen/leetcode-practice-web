/** Single solution */
export interface Solution {
  method_name: string;
  time_complexity: string;
  space_complexity: string;
  idea_summary: string;
  code: string;
}

/** LeetCode 题集题目的固有难度（内容的属性，不是一次自评表现）。
 * 面试题集没有这个概念——它用重要度 (Priority) 取代难度，见 ADR-0004。 */
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** Single question */
export interface Question {
  id: string;
  title: string;
  difficulty: Difficulty;
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
  /**
   * 当天首次引入的新卡数：对一张全新卡的首次自评记 1（四档自评同等），
   * 同卡再次自评不再计入。它是统计字段——每日新卡上限 (ADR-0004) 的
   * 额度消费凭据，不是从进度条目推断的累计值。票 10 之前的旧文档缺此
   * 字段，由 storage 迁移补 0。
   */
  newIntroducedCount: number;
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

/** A study-session configuration: drives which queue useStudyQueue builds.
 * 一个题集实际提供哪些模式由它的题集配置 (DeckConfig.sessionModes) 声明；
 * 按难度这类模式只对卡片带相应字段的题集有意义。 */
export type SessionMode =
  | { kind: 'smart' }
  | { kind: 'difficulty'; value: Difficulty }
  | { kind: 'tag'; value: string }
  | { kind: 'weakest' }
  | { kind: 'single'; questionId: string };
