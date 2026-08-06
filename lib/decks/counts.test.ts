import { describe, it, expect } from 'vitest';
import { summarizeDeckCounts } from '@/lib/decks/counts';
import type { QuestionProgress } from '@/lib/types';

/**
 * 首页入口卡的计数纯函数（票 12）。口径与 useStudyQueue.counters /
 * todayDueCount 逐条对齐：
 *   新卡 = 无进度 / state 'new' / proficiency 'new'；
 *   待复习 = learning/relearning 无论到期与否 + review 且到期。
 */

const NOW = Date.now();

function review(dueAt: number, extra?: Partial<QuestionProgress>): QuestionProgress {
  return {
    state: 'review',
    learningStep: 0,
    dueAt,
    intervalDays: 1,
    easeFactor: 2.5,
    level: 1,
    proficiency: 'good',
    lastReviewDate: NOW - 86_400_000,
    ...extra,
  };
}

function learning(dueAt: number, state: 'learning' | 'relearning' = 'learning'): QuestionProgress {
  return {
    state,
    learningStep: 0,
    dueAt,
    intervalDays: 0,
    easeFactor: 2.5,
    level: 0,
    proficiency: 'good',
    lastReviewDate: NOW,
  };
}

describe('summarizeDeckCounts', () => {
  it('空进度时 newCount = 全部卡数、dueCount = 0', () => {
    expect(summarizeDeckCounts(['a', 'b', 'c'], {}, NOW)).toEqual({ dueCount: 0, newCount: 3 });
  });

  it('无进度、state=new、proficiency=new 都计入 newCount', () => {
    const progress = {
      noProgress: undefined as unknown as QuestionProgress,
      stateNew: { ...review(NOW - 1), state: 'new' },
      profNew: { ...review(NOW - 1), proficiency: 'new' },
    };
    const counts = summarizeDeckCounts(['noProgress', 'stateNew', 'profNew'], progress, NOW);
    expect(counts.newCount).toBe(3);
    expect(counts.dueCount).toBe(0);
  });

  it('review 到期计入 dueCount，已复习未到期的不计入', () => {
    const progress = {
      due: review(NOW - 1000),
      notDue: review(NOW + 86_400_000),
    };
    expect(summarizeDeckCounts(['due', 'notDue'], progress, NOW)).toEqual({ dueCount: 1, newCount: 0 });
  });

  it('review 用 nextReviewDate 兜底（旧字段向下兼容）', () => {
    const legacy = { ...review(0), dueAt: 0, nextReviewDate: NOW - 1000 };
    expect(summarizeDeckCounts(['legacy'], { legacy }, NOW)).toEqual({ dueCount: 1, newCount: 0 });
  });

  it('learning/relearning 无论到期与否都计入 dueCount（对齐 todayDueCount = dueReview + learningNow + learningSoon）', () => {
    const progress = {
      learningDue: learning(NOW - 1000),
      learningSoon: learning(NOW + 60_000),
      relearningSoon: learning(NOW + 60_000, 'relearning'),
    };
    expect(summarizeDeckCounts(['learningDue', 'learningSoon', 'relearningSoon'], progress, NOW)).toEqual(
      { dueCount: 3, newCount: 0 },
    );
  });

  it('混合：新卡与到期卡分别计入', () => {
    const progress = {
      new1: { ...review(NOW - 1), state: 'new' },
      dueReview: review(NOW - 1),
      learning: learning(NOW + 60_000),
    };
    expect(summarizeDeckCounts(['new1', 'dueReview', 'learning'], progress, NOW)).toEqual({
      dueCount: 2,
      newCount: 1,
    });
  });

  it('只统计传入的 cardIds，进度里多余的卡不影响', () => {
    const progress = { extra: review(NOW - 1) };
    expect(summarizeDeckCounts([], progress, NOW)).toEqual({ dueCount: 0, newCount: 0 });
  });
});
