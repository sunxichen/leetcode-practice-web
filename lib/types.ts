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

/** Single question progress */
export interface QuestionProgress {
  level: number;
  nextReviewDate: number;
  easeFactor: number;
  interval: number;
  proficiency: 'again' | 'hard' | 'good' | 'easy' | 'new';
  lastReviewDate: number;
}

/** Session cursor for resume */
export interface SessionCursor {
  mode: 'ebbinghaus' | 'difficulty' | 'proficiency';
  currentQuestionId: string;
  queue: string[];
  queueIndex: number;
  timestamp: number;
}

/** Complete user progress data stored in KV */
export interface UserProgressData {
  lastUpdatedAt: number;
  lastSessionCursor: SessionCursor | null;
  progress: Record<string, QuestionProgress>;
}

export type FeedbackType = 'again' | 'hard' | 'good' | 'easy';
