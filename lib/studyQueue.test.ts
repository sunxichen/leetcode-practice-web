import { describe, it, expect } from 'vitest';
import { generateQueue } from '@/lib/studyQueue';
import { HOT100_SCHEDULING_PARAMS, INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { sortInterviewNewCards } from '@/lib/interview';
import type { InterviewCard, InterviewCategory, Priority } from '@/lib/interview-types';
import type { Question, QuestionProgress } from '@/lib/types';

/**
 * Regression anchor for the LeetCode deck's queue order.
 *
 * The weaving ratio and the reinsert clamp bounds are written out literally so a
 * calibration value that drifts fails here instead of silently reshuffling the
 * study session.
 */

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = new Date(2026, 2, 15, 10, 30, 0, 0).getTime();

function question(id: string, difficulty: Question['difficulty'] = 'Medium', tags: string[] = []): Question {
  return {
    id,
    title: `题 ${id}`,
    difficulty,
    tags,
    description: '',
    core_pattern: '',
    corner_cases: [],
    solutions: [],
  };
}

function reviewProgress(dueAt: number, overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    state: 'review',
    learningStep: 0,
    dueAt,
    intervalDays: 5,
    easeFactor: 2.5,
    level: 2,
    proficiency: 'good',
    lastReviewDate: NOW - DAY,
    ...overrides,
  };
}

function learningProgress(dueAt: number, overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    state: 'learning',
    learningStep: 0,
    dueAt,
    intervalDays: 0,
    easeFactor: 2.5,
    level: 0,
    proficiency: 'again',
    lastReviewDate: NOW - MIN,
    ...overrides,
  };
}

function smartQueue(questions: Question[], progress: Record<string, QuestionProgress>): string[] {
  return generateQueue({ kind: 'smart' }, questions, progress, HOT100_SCHEDULING_PARAMS, NOW);
}

describe('smart queue — front of the queue', () => {
  it('puts overdue learning cards first, ordered by how long they have been due', () => {
    const questions = [question('L1'), question('L2'), question('R1'), question('N1')];
    const queue = smartQueue(questions, {
      L1: learningProgress(NOW - 5 * MIN),
      L2: learningProgress(NOW - 60 * MIN),
      R1: reviewProgress(NOW - DAY),
    });
    expect(queue).toEqual(['L2', 'L1', 'R1', 'N1']);
  });

  it('treats overdue relearning cards the same as overdue learning cards', () => {
    const questions = [question('R1'), question('RL1')];
    const queue = smartQueue(questions, {
      R1: reviewProgress(NOW - DAY),
      RL1: learningProgress(NOW - MIN, { state: 'relearning' }),
    });
    expect(queue).toEqual(['RL1', 'R1']);
  });
});

describe('smart queue — weaving overdue reviews with new cards', () => {
  it('weaves 3 overdue reviews per new card, most overdue review first', () => {
    const questions = ['r1', 'r2', 'r3', 'r4', 'n1', 'n2', 'n3'].map(id => question(id));
    const queue = smartQueue(questions, {
      r1: reviewProgress(NOW - 4 * DAY),
      r2: reviewProgress(NOW - 3 * DAY),
      r3: reviewProgress(NOW - 2 * DAY),
      r4: reviewProgress(NOW - 1 * DAY),
    });
    expect(queue).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'n2', 'n3']);
  });

  it('appends the remaining new cards once overdue reviews run out', () => {
    const questions = ['r1', 'n1', 'n2', 'n3'].map(id => question(id));
    const queue = smartQueue(questions, { r1: reviewProgress(NOW - DAY) });
    expect(queue).toEqual(['r1', 'n1', 'n2', 'n3']);
  });

  it('introduces new cards in question-bank order, not sorted by id', () => {
    const questions = [question('30'), question('4'), question('100')];
    expect(smartQueue(questions, {})).toEqual(['30', '4', '100']);
  });

  it('leaves out cards that are not due yet', () => {
    const questions = [question('due'), question('later')];
    const queue = smartQueue(questions, {
      due: reviewProgress(NOW - DAY),
      later: reviewProgress(NOW + DAY),
    });
    expect(queue).toEqual(['due']);
  });

  it('counts a card due exactly now as due', () => {
    const questions = [question('exact')];
    expect(smartQueue(questions, { exact: reviewProgress(NOW) })).toEqual(['exact']);
  });

  it('falls back to the legacy due field for review cards that never got dueAt', () => {
    const questions = [question('legacy')];
    const legacy = reviewProgress(undefined as unknown as number, { nextReviewDate: NOW - DAY });
    expect(smartQueue(questions, { legacy })).toEqual(['legacy']);
  });
});

describe('smart queue — splicing back learning cards that are not due yet', () => {
  /** 20 overdue reviews, most overdue first, giving a long queue to splice into. */
  const fillerQuestions = Array.from({ length: 20 }, (_, i) => question(`r${String(i).padStart(2, '0')}`));
  const fillerProgress: Record<string, QuestionProgress> = Object.fromEntries(
    fillerQuestions.map((q, i) => [q.id, reviewProgress(NOW - (20 - i) * DAY)]),
  );

  function positionOfPending(minutesAway: number): number {
    const questions = [...fillerQuestions, question('P')];
    const queue = smartQueue(questions, {
      ...fillerProgress,
      P: learningProgress(NOW + minutesAway * MIN),
    });
    return queue.indexOf('P');
  }

  it('lands at the lower bound of 2 for a card due within minutes', () => {
    expect(positionOfPending(1)).toBe(2);
  });

  it('estimates the position from 0.25 cards per minute in between the bounds', () => {
    // 40 min away × 0.25 cards/min = 10 cards.
    expect(positionOfPending(40)).toBe(10);
  });

  it('lands at the upper bound of 15 for a card due much later', () => {
    expect(positionOfPending(600)).toBe(15);
  });

  it('keeps every estimate inside the clamp interval [2, 15]', () => {
    for (const minutesAway of [1, 5, 10, 30, 40, 60, 120, 600, 24 * 60]) {
      const pos = positionOfPending(minutesAway);
      expect(pos).toBeGreaterThanOrEqual(2);
      expect(pos).toBeLessThanOrEqual(15);
    }
  });

  it('measures the splice position from after the overdue learning cards, not from the head of the queue', () => {
    const questions = [question('LA'), question('LB'), ...fillerQuestions, question('P')];
    const queue = smartQueue(questions, {
      ...fillerProgress,
      LA: learningProgress(NOW - 2 * MIN),
      LB: learningProgress(NOW - MIN),
      P: learningProgress(NOW + 40 * MIN),
    });
    expect(queue.slice(0, 2)).toEqual(['LA', 'LB']);
    expect(queue.indexOf('P')).toBe(2 + 10);
  });

  it('appends the card at the tail when the queue is shorter than the estimated position', () => {
    const questions = [question('r1'), question('P')];
    const queue = smartQueue(questions, {
      r1: reviewProgress(NOW - DAY),
      P: learningProgress(NOW + 40 * MIN),
    });
    expect(queue).toEqual(['r1', 'P']);
  });

  it('keeps two learning cards with the same estimate in due order, sooner one first', () => {
    const questions = [...fillerQuestions, question('P1'), question('P2')];
    const queue = smartQueue(questions, {
      ...fillerProgress,
      P1: learningProgress(NOW + 39 * MIN),
      P2: learningProgress(NOW + 40 * MIN),
    });
    // Both estimate position 10; the later-due card is spliced first, then the
    // sooner-due one is inserted in front of it.
    expect(queue.indexOf('P1')).toBe(10);
    expect(queue.indexOf('P2')).toBe(11);
  });

  it('pushes a later-due learning card back one slot per card spliced in ahead of it', () => {
    const questions = [...fillerQuestions, question('P1'), question('P2')];
    const queue = smartQueue(questions, {
      ...fillerProgress,
      P1: learningProgress(NOW + 40 * MIN),
      P2: learningProgress(NOW + 41 * MIN),
    });
    // P2 estimates 11 and is spliced first; P1 estimates 10 and lands ahead of it,
    // so P2 ends up at 12 rather than at its own estimate.
    expect(queue.indexOf('P1')).toBe(10);
    expect(queue.indexOf('P2')).toBe(12);
  });
});

describe('weakest queue', () => {
  it('ranks by ease factor penalised by lapses, hardest first', () => {
    const questions = ['a', 'b', 'c', 'd'].map(id => question(id));
    const queue = generateQueue({ kind: 'weakest' }, questions, {
      a: reviewProgress(NOW, { easeFactor: 2.5, lapses: 0 }),
      b: reviewProgress(NOW, { easeFactor: 2.5, lapses: 2 }),
      c: reviewProgress(NOW, { easeFactor: 1.6, lapses: 0 }),
      d: reviewProgress(NOW, { easeFactor: 2.0, lapses: 1 }),
    }, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['c', 'd', 'b', 'a']);
  });

  it('lets lapses outweigh a higher ease factor', () => {
    const questions = ['low-ef', 'many-lapses'].map(id => question(id));
    const queue = generateQueue({ kind: 'weakest' }, questions, {
      'low-ef': reviewProgress(NOW, { easeFactor: 1.9, lapses: 0 }),
      'many-lapses': reviewProgress(NOW, { easeFactor: 2.5, lapses: 3 }),
    }, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['many-lapses', 'low-ef']);
  });

  it('skips cards that have never been studied', () => {
    const questions = ['seen', 'untouched', 'still-new'].map(id => question(id));
    const queue = generateQueue({ kind: 'weakest' }, questions, {
      seen: reviewProgress(NOW, { easeFactor: 2.0 }),
      'still-new': reviewProgress(NOW, { state: 'new', proficiency: 'new' }),
    }, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['seen']);
  });

  it('ignores due times and caps the queue at 10 cards', () => {
    const questions = Array.from({ length: 12 }, (_, i) => question(`q${String(i).padStart(2, '0')}`));
    const progress = Object.fromEntries(
      questions.map((q, i) => [q.id, reviewProgress(NOW + 10 * DAY, { easeFactor: 1.5 + i * 0.1 })]),
    );
    const queue = generateQueue({ kind: 'weakest' }, questions, progress, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toHaveLength(10);
    expect(queue[0]).toBe('q00');
  });
});

describe('filtered queues', () => {
  it('keeps only the picked difficulty, overdue first, then most-lapsed, then by numeric id', () => {
    const questions = [
      question('10', 'Easy'),
      question('1', 'Easy'),
      question('2', 'Easy'),
      question('3', 'Easy'),
      question('99', 'Hard'),
    ];
    const queue = generateQueue({ kind: 'difficulty', value: 'Easy' }, questions, {
      '1': reviewProgress(NOW - MIN),
      '2': reviewProgress(NOW - DAY),
    }, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['2', '1', '3', '10']);
  });

  it('orders equally non-overdue cards by lapse count before falling back to id', () => {
    const questions = [question('1', 'Easy'), question('2', 'Easy')];
    const queue = generateQueue({ kind: 'difficulty', value: 'Easy' }, questions, {
      '1': reviewProgress(NOW + DAY, { lapses: 0 }),
      '2': reviewProgress(NOW + DAY, { lapses: 4 }),
    }, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['2', '1']);
  });

  it('keeps only cards carrying the picked tag', () => {
    const questions = [
      question('1', 'Medium', ['动态规划']),
      question('2', 'Medium', ['哈希表', '动态规划']),
      question('3', 'Medium', ['二分查找']),
    ];
    const queue = generateQueue({ kind: 'tag', value: '动态规划' }, questions, {}, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['1', '2']);
  });
});

describe('single-card queue', () => {
  it('contains exactly the requested card when it is in the given card set', () => {
    const questions = [question('7'), question('8')];
    const queue = generateQueue({ kind: 'single', questionId: '8' }, questions, {}, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['8']);
  });

  it('is empty when the requested card is not in the given card set', () => {
    const questions = [question('7')];
    const queue = generateQueue({ kind: 'single', questionId: 'nope' }, questions, {}, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual([]);
  });
});

/**
 * 票 10：brand-new 排序注入与每日新卡上限。
 *
 * 上面的全部用例都不传 options——它们逐位钉死 Hot100 的既有行为，本组
 * 新增断言不得影响它们。排序与上限只作用于 smart 模式的 brand-new 段；
 * 引擎本身不认识 priority，排序能力由题集配置以函数注入（这里是面试
 * 题集真实的 sortInterviewNewCards）。
 */

function interviewCard(id: string, priority: Priority): InterviewCard {
  return {
    id,
    question: `卡 ${id}`,
    category: 'dl-basics',
    tags: [],
    priority,
    answer: { key_points: ['a', 'b', 'c'] },
  };
}

describe('smart queue — brand-new 排序注入（票 10）', () => {
  it('面试新卡按重要度引入：must → common → bonus，同级按 id', () => {
    const cards = [
      interviewCard('dl-bonus-b', 'bonus'),
      interviewCard('dl-common-b', 'common'),
      interviewCard('dl-must-b', 'must'),
      interviewCard('dl-bonus-a', 'bonus'),
      interviewCard('dl-must-a', 'must'),
      interviewCard('dl-common-a', 'common'),
    ];
    const queue = generateQueue({ kind: 'smart' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      sortNewCards: sortInterviewNewCards,
    });
    expect(queue).toEqual([
      'dl-must-a', 'dl-must-b',
      'dl-common-a', 'dl-common-b',
      'dl-bonus-a', 'dl-bonus-b',
    ]);
  });

  it('排序函数不改动入参数组（题库顺序对其他消费者保持原样）', () => {
    const cards = [interviewCard('dl-bonus-a', 'bonus'), interviewCard('dl-must-a', 'must')];
    const before = cards.map(c => c.id);
    sortInterviewNewCards(cards);
    expect(cards.map(c => c.id)).toEqual(before);
  });

  it('未传 sorter 时输入顺序保持不变——通用队列没有暗含排序', () => {
    const cards = [
      interviewCard('dl-bonus-b', 'bonus'),
      interviewCard('dl-must-a', 'must'),
      interviewCard('dl-common-a', 'common'),
    ];
    // 即使传了 options（只有额度统计），顺序仍是题库数组顺序。
    const queue = generateQueue({ kind: 'smart' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      newCardsIntroducedToday: 0,
    });
    expect(queue).toEqual(['dl-bonus-b', 'dl-must-a', 'dl-common-a']);
  });

  it('排序只作用于 brand-new 段：learning 逾期与 review 逾期的既有顺序不变', () => {
    const cards = [
      interviewCard('n-bonus', 'bonus'),
      interviewCard('L1', 'must'),
      interviewCard('R1', 'bonus'),
      interviewCard('n-must', 'must'),
      interviewCard('L2', 'bonus'),
      interviewCard('R2', 'must'),
    ];
    const queue = generateQueue({ kind: 'smart' }, cards, {
      L1: learningProgress(NOW - 5 * MIN),
      L2: learningProgress(NOW - 60 * MIN),
      R1: reviewProgress(NOW - DAY),
      R2: reviewProgress(NOW - 2 * DAY),
    }, INTERVIEW_SCHEDULING_PARAMS, NOW, { sortNewCards: sortInterviewNewCards });
    // L/R 卡带什么 priority 都不影响：learning 逾期按 dueAt、review 逾期按
    // 逾期时长排；只有 brand-new 两张按重要度交换了位置。
    expect(queue).toEqual(['L2', 'L1', 'R2', 'R1', 'n-must', 'n-bonus']);
  });
});

describe('smart queue — 每日新卡上限（票 10，INTERVIEW newCardsPerDay = 15）', () => {
  const twentyNew = Array.from({ length: 20 }, (_, i) =>
    interviewCard(`n${String(i).padStart(2, '0')}`, 'must'));

  function cappedQueue(introducedToday: number): string[] {
    return generateQueue({ kind: 'smart' }, twentyNew, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      newCardsIntroducedToday: introducedToday,
    });
  }

  it('今日已引入 0 张时取前 15 张新卡', () => {
    expect(cappedQueue(0)).toEqual(twentyNew.slice(0, 15).map(c => c.id));
  });

  it('今日已引入 14 张时只剩 1 张额度', () => {
    expect(cappedQueue(14)).toEqual(['n00']);
  });

  it('今日已引入 15 张时额度为 0，不含任何新卡', () => {
    expect(cappedQueue(15)).toEqual([]);
  });

  it('今日已引入 20 张（旧数据超限）按 0 剩余额度处理，不抛错', () => {
    expect(cappedQueue(20)).toEqual([]);
  });

  it('额度先给最重要的卡：排序先于截断', () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, i) => interviewCard(`bonus-${i}`, 'bonus')),
      ...Array.from({ length: 5 }, (_, i) => interviewCard(`common-${i}`, 'common')),
      interviewCard('must-2', 'must'),
      interviewCard('must-1', 'must'),
    ];
    const queue = generateQueue({ kind: 'smart' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      newCardsIntroducedToday: 14,
      sortNewCards: sortInterviewNewCards,
    });
    expect(queue).toEqual(['must-1']);

    const full = generateQueue({ kind: 'smart' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      newCardsIntroducedToday: 0,
      sortNewCards: sortInterviewNewCards,
    });
    expect(full).toEqual([
      'must-1', 'must-2',
      'common-0', 'common-1', 'common-2', 'common-3', 'common-4',
      'bonus-0', 'bonus-1', 'bonus-2', 'bonus-3', 'bonus-4', 'bonus-5', 'bonus-6', 'bonus-7',
    ]);
  });

  it('额度为 0 时队列仍包含全部到期 learning / review 卡', () => {
    const cards = [
      interviewCard('L', 'must'),
      interviewCard('R', 'must'),
      ...twentyNew.slice(0, 3),
    ];
    const queue = generateQueue({ kind: 'smart' }, cards, {
      L: learningProgress(NOW - MIN),
      R: reviewProgress(NOW - DAY),
    }, INTERVIEW_SCHEDULING_PARAMS, NOW, { newCardsIntroducedToday: 15 });
    expect(queue).toEqual(['L', 'R']);
  });

  it('single 深链不受额度影响：额度用尽后仍返回请求的卡', () => {
    const cards = [interviewCard('target', 'bonus'), ...twentyNew.slice(0, 2)];
    const queue = generateQueue(
      { kind: 'single', questionId: 'target' },
      cards,
      {},
      INTERVIEW_SCHEDULING_PARAMS,
      NOW,
      { newCardsIntroducedToday: 999, sortNewCards: sortInterviewNewCards },
    );
    expect(queue).toEqual(['target']);
  });
});

describe('smart queue — Hot100 零回归（票 10）', () => {
  it('newCardsPerDay 为 null 时无上限：传入巨大的已引入数也不截断、不按 id/priority 重排', () => {
    const questions = [question('30'), question('4'), question('100')];
    const queue = generateQueue({ kind: 'smart' }, questions, {}, HOT100_SCHEDULING_PARAMS, NOW, {
      newCardsIntroducedToday: 999,
    });
    expect(queue).toEqual(['30', '4', '100']);
  });
});

/**
 * 票 11：全量扫题（sweep）。无视到期时间、按重要度遍历全部卡，可限定分类。
 * 排序沿用工卡引入的注入（sortInterviewNewCards = 按重要度）——通用队列仍
 * 不认识 priority；cap 只存在于 smart 分支，sweep 不读 dailyStats、不受额度约束。
 */

function sweepCard(id: string, priority: Priority, category: InterviewCategory = 'dl-basics'): InterviewCard {
  return { ...interviewCard(id, priority), category };
}

describe('sweep queue — 不限分类（票 11）', () => {
  it('包含未到期/新/learning/review 全部卡，按重要度 must→common→bonus、同级 id 排序', () => {
    const cards = [
      sweepCard('dl-bonus-b', 'bonus'),
      sweepCard('dl-note-new', 'bonus'),   // 全新卡，无进度
      sweepCard('dl-common-a', 'common'),  // review，未到期
      sweepCard('dl-must-b', 'must'),
      sweepCard('dl-must-a', 'must'),      // learning，未到期
    ];
    const queue = generateQueue({ kind: 'sweep' }, cards, {
      'dl-must-a': learningProgress(NOW + 10 * MIN),
      'dl-common-a': reviewProgress(NOW + DAY),
    }, INTERVIEW_SCHEDULING_PARAMS, NOW, { sortNewCards: sortInterviewNewCards });
    expect(queue).toEqual([
      'dl-must-a', 'dl-must-b',
      'dl-common-a',
      'dl-bonus-b', 'dl-note-new',
    ]);
  });

  it('未注入排序时保持题库数组顺序（通用队列不暗含排序）', () => {
    const cards = [sweepCard('dl-bonus', 'bonus'), sweepCard('dl-must', 'must')];
    const queue = generateQueue({ kind: 'sweep' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(['dl-bonus', 'dl-must']);
  });
});

describe('sweep queue — 限定分类（票 11）', () => {
  it('只含该分类的卡，其余分类不出现，且排序正确', () => {
    const cards = [
      sweepCard('dl-must', 'must', 'dl-basics'),
      sweepCard('proj-common', 'common', 'project'),
      sweepCard('dl-bonus', 'bonus', 'dl-basics'),
      sweepCard('tech-must', 'must', 'tech-stack'),
    ];
    const queue = generateQueue({ kind: 'sweep', category: 'dl-basics' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, {
      sortNewCards: sortInterviewNewCards,
    });
    expect(queue).toEqual(['dl-must', 'dl-bonus']);
  });
});

describe('sweep queue — 无视到期（票 11）', () => {
  it('全部卡都未到期时队列仍非空且含全部卡（与 smart 的到期筛选不同）', () => {
    const cards = [
      sweepCard('dl-facing', 'must'),
      sweepCard('dl-later', 'common'),
    ];
    const queue = generateQueue({ kind: 'sweep' }, cards, {
      'dl-facing': reviewProgress(NOW + 10 * DAY),
      'dl-later': learningProgress(NOW + 60 * MIN),
    }, INTERVIEW_SCHEDULING_PARAMS, NOW, { sortNewCards: sortInterviewNewCards });
    expect(queue).toEqual(['dl-facing', 'dl-later']);
  });
});

describe('sweep queue — 不受每日新卡上限影响（票 11）', () => {
  it('额度很小且今日已引入若干时仍返回全部新卡（对照 smart 会被截断）', () => {
    const cards = Array.from({ length: 20 }, (_, i) => sweepCard(`n${String(i).padStart(2, '0')}`, 'must'));
    const options = { newCardsIntroducedToday: 14, sortNewCards: sortInterviewNewCards };

    // 同一输入下 smart 被每日额度截断到 1 张。
    const smart = generateQueue({ kind: 'smart' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, options);
    expect(smart).toEqual(['n00']);

    // sweep 是刻意的全量遍历：20 张新卡一张不少。
    const sweep = generateQueue({ kind: 'sweep' }, cards, {}, INTERVIEW_SCHEDULING_PARAMS, NOW, options);
    expect(sweep).toEqual(cards.map(c => c.id));
  });
});
