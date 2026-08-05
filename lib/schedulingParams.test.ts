import { describe, it, expect } from 'vitest';
import { HOT100_SCHEDULING_PARAMS, INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import type { SchedulingParams } from '@/lib/schedulingParams';

/**
 * 调度参数取值钉死（票 2 的回归锚思路，照它扩展到参数对象本身）：
 * 期望值全部写字面量而不是互相引用，任何一个标定值漂移都会让测试失败，
 * 而不是悄悄改变用户的复习间隔。
 *
 * hot100 的取值与参数化之前的模块级常量逐位相同——一个字节都不许动。
 * interview 的取值逐项照 docs/interview-deck-design.md 的调度参数对照表。
 */

const HOT100_LITERAL: SchedulingParams = {
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

/** docs/interview-deck-design.md 调度参数对照表的 interview 列。 */
const INTERVIEW_LITERAL: SchedulingParams = {
  learningStepsMin: [5, 25],
  relearningStepsMin: [5],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  hardIntervalFactor: 1.2,
  easyBonusFactor: 1.15,
  maxReviewIntervalDays: 21,
  lapseRecoveryIntervalDays: 1,
  efPenaltyAgain: 0.2,
  efPenaltyHard: 0.15,
  efBonusEasy: 0.15,
  efMin: 1.3,
  efDefault: 2.5,
  cardsPerMinute: 0.67,
  learningReinsertMin: 3,
  learningReinsertMax: 20,
  newCardsPerDay: 15,
};

describe('调度参数取值（按题集标定，ADR-0001）', () => {
  it('hot100 的参数与参数化之前的常量逐位相同', () => {
    expect(HOT100_SCHEDULING_PARAMS).toEqual(HOT100_LITERAL);
  });

  it('interview 的参数逐项照方案文档对照表取值', () => {
    expect(INTERVIEW_SCHEDULING_PARAMS).toEqual(INTERVIEW_LITERAL);
  });

  it('interview 与 hot100 的差异只在对照表声明的那几行', () => {
    // 对照表：学习步长、补习步长、每分钟卡片数、插回钳制、间隔上限、每日新卡
    // 上限不同；毕业间隔 / Easy 间隔 / EF 与 lapse 相关参数沿用 hot100。
    const sharedKeys: (keyof SchedulingParams)[] = [
      'graduatingIntervalDays',
      'easyIntervalDays',
      'hardIntervalFactor',
      'easyBonusFactor',
      'lapseRecoveryIntervalDays',
      'efPenaltyAgain',
      'efPenaltyHard',
      'efBonusEasy',
      'efMin',
      'efDefault',
    ];
    for (const key of sharedKeys) {
      expect(INTERVIEW_SCHEDULING_PARAMS[key], `shared param ${key}`).toBe(HOT100_SCHEDULING_PARAMS[key]);
    }
  });
});
