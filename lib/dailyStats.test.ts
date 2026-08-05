import { describe, it, expect } from 'vitest';
import { bumpDailyStats, emptyDailyStat, isFirstIntroduction, ymd } from '@/lib/dailyStats';
import { scheduleNext } from '@/lib/sm2';
import { INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import type { FeedbackType, QuestionProgress } from '@/lib/types';

/**
 * 每日统计的纯函数缝（票 10）：newIntroducedCount 的首次引入判定、跨天行为，
 * 以及票 5 之前既有的 graduated / lapse 语义的回归钉。
 *
 * 首次引入判定与队列引擎的 brand-new 判定（lib/studyQueue.ts）是同一条
 * 规则：无进度条目 / state 为 new / proficiency 为 new——两条路径必须永远
 * 一致，否则"队列放了新卡但统计没记"或反之，每日上限就会漂移。
 */

const PARAMS = INTERVIEW_SCHEDULING_PARAMS;

function progressEntry(overrides: Partial<QuestionProgress>): QuestionProgress {
  return {
    state: 'review',
    learningStep: 0,
    dueAt: 1_700_000_000_000,
    intervalDays: 3,
    easeFactor: 2.5,
    level: 2,
    proficiency: 'good',
    lastReviewDate: 1_699_000_000_000,
    ...overrides,
  };
}

describe('ymd — 本地日期归档键', () => {
  it('按本地时区格式化并补零', () => {
    expect(ymd(new Date(2026, 7, 5, 23, 30).getTime())).toBe('2026-08-05');
    expect(ymd(new Date(2026, 0, 3, 0, 1).getTime())).toBe('2026-01-03');
  });
});

describe('isFirstIntroduction — 与队列 brand-new 同一条规则', () => {
  it('无进度条目是首次引入', () => {
    expect(isFirstIntroduction(undefined)).toBe(true);
  });

  it('state 为 new 或 proficiency 为 new 都是首次引入', () => {
    expect(isFirstIntroduction(progressEntry({ state: 'new', proficiency: 'new' }))).toBe(true);
    // 与队列判定一致的怪癖：proficiency 为 new 即视为 brand-new，不问 state。
    expect(isFirstIntroduction(progressEntry({ state: 'review', proficiency: 'new' }))).toBe(true);
  });

  it('已进入 learning / review 的卡不是首次引入', () => {
    expect(isFirstIntroduction(progressEntry({ state: 'learning', proficiency: 'again' }))).toBe(false);
    expect(isFirstIntroduction(progressEntry({ state: 'review', proficiency: 'good' }))).toBe(false);
  });
});

describe('bumpDailyStats — newIntroducedCount（票 10）', () => {
  const TODAY = '2026-08-05';

  it('对一张全新卡的 Again/Hard/Good/Easy 都只增加 1', () => {
    for (const feedback of ['again', 'hard', 'good', 'easy'] as FeedbackType[]) {
      const nextQ = scheduleNext(undefined, feedback, PARAMS);
      const stats = bumpDailyStats({}, TODAY, undefined, nextQ);
      expect(stats[TODAY].newIntroducedCount, `feedback=${feedback}`).toBe(1);
      expect(stats[TODAY].reviewedCount).toBe(1);
    }
  });

  it('同一天再次评价同一张已进入 learning 的卡不再增加', () => {
    const afterFirst = scheduleNext(undefined, 'again', PARAMS);
    expect(afterFirst.state).toBe('learning');
    let stats = bumpDailyStats({}, TODAY, undefined, afterFirst);

    const afterSecond = scheduleNext(afterFirst, 'good', PARAMS);
    stats = bumpDailyStats(stats, TODAY, afterFirst, afterSecond);

    expect(stats[TODAY].newIntroducedCount).toBe(1);
    expect(stats[TODAY].reviewedCount).toBe(2);
  });

  it('普通 review 卡自评不增加', () => {
    const prev = progressEntry({ state: 'review', proficiency: 'good' });
    const next = scheduleNext(prev, 'good', PARAMS);
    const stats = bumpDailyStats({}, TODAY, prev, next);
    expect(stats[TODAY].newIntroducedCount).toBe(0);
    expect(stats[TODAY].reviewedCount).toBe(1);
  });

  it('跨天新日期从 0 建立，历史日期原样保留', () => {
    const YESTERDAY = '2026-08-04';
    const newCard = scheduleNext(undefined, 'good', PARAMS);
    let stats = bumpDailyStats({}, YESTERDAY, undefined, newCard);

    const prev = progressEntry({ state: 'review', proficiency: 'good' });
    const next = scheduleNext(prev, 'good', PARAMS);
    stats = bumpDailyStats(stats, TODAY, prev, next);

    expect(stats[YESTERDAY].newIntroducedCount).toBe(1);
    expect(stats[TODAY]).toEqual({
      reviewedCount: 1,
      graduatedCount: 0,
      lapseCount: 0,
      newIntroducedCount: 0,
    });
  });
});

describe('bumpDailyStats — 既有语义回归（graduated / lapse）', () => {
  const TODAY = '2026-08-05';

  it('emptyDailyStat 从全 0 建立', () => {
    expect(emptyDailyStat()).toEqual({
      reviewedCount: 0,
      graduatedCount: 0,
      lapseCount: 0,
      newIntroducedCount: 0,
    });
  });

  it('new/learning → review 记一次毕业', () => {
    const graduatedFromNew = scheduleNext(undefined, 'easy', PARAMS);
    expect(graduatedFromNew.state).toBe('review');
    expect(bumpDailyStats({}, TODAY, undefined, graduatedFromNew)[TODAY].graduatedCount).toBe(1);

    const learning = progressEntry({ state: 'learning', proficiency: 'again' });
    const graduated = progressEntry({ state: 'review', proficiency: 'good' });
    expect(bumpDailyStats({}, TODAY, learning, graduated)[TODAY].graduatedCount).toBe(1);
  });

  it('review → relearning 记一次失手，其余迁移不计', () => {
    const review = progressEntry({ state: 'review', proficiency: 'good' });
    const relapsed = progressEntry({ state: 'relearning', proficiency: 'again' });
    expect(bumpDailyStats({}, TODAY, review, relapsed)[TODAY].lapseCount).toBe(1);

    const learning = progressEntry({ state: 'learning', proficiency: 'again' });
    const stillLearning = progressEntry({ state: 'learning', proficiency: 'hard' });
    const stats = bumpDailyStats({}, TODAY, learning, stillLearning)[TODAY];
    expect(stats.graduatedCount).toBe(0);
    expect(stats.lapseCount).toBe(0);
  });

  it('在同一天上累加，而不是覆盖', () => {
    const base = {
      [TODAY]: { reviewedCount: 5, graduatedCount: 2, lapseCount: 1, newIntroducedCount: 3 },
    };
    const newCard = scheduleNext(undefined, 'good', PARAMS);
    const stats = bumpDailyStats(base, TODAY, undefined, newCard);
    expect(stats[TODAY]).toEqual({
      reviewedCount: 6,
      graduatedCount: 2,
      lapseCount: 1,
      newIntroducedCount: 4,
    });
  });
});
