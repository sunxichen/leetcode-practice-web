import { describe, it, expect } from 'vitest';
import { generateQueue } from '@/hooks/useStudyQueue';
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
  return generateQueue({ kind: 'smart' }, questions, progress, NOW);
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
    }, NOW);
    expect(queue).toEqual(['c', 'd', 'b', 'a']);
  });

  it('lets lapses outweigh a higher ease factor', () => {
    const questions = ['low-ef', 'many-lapses'].map(id => question(id));
    const queue = generateQueue({ kind: 'weakest' }, questions, {
      'low-ef': reviewProgress(NOW, { easeFactor: 1.9, lapses: 0 }),
      'many-lapses': reviewProgress(NOW, { easeFactor: 2.5, lapses: 3 }),
    }, NOW);
    expect(queue).toEqual(['many-lapses', 'low-ef']);
  });

  it('skips cards that have never been studied', () => {
    const questions = ['seen', 'untouched', 'still-new'].map(id => question(id));
    const queue = generateQueue({ kind: 'weakest' }, questions, {
      seen: reviewProgress(NOW, { easeFactor: 2.0 }),
      'still-new': reviewProgress(NOW, { state: 'new', proficiency: 'new' }),
    }, NOW);
    expect(queue).toEqual(['seen']);
  });

  it('ignores due times and caps the queue at 10 cards', () => {
    const questions = Array.from({ length: 12 }, (_, i) => question(`q${String(i).padStart(2, '0')}`));
    const progress = Object.fromEntries(
      questions.map((q, i) => [q.id, reviewProgress(NOW + 10 * DAY, { easeFactor: 1.5 + i * 0.1 })]),
    );
    const queue = generateQueue({ kind: 'weakest' }, questions, progress, NOW);
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
    }, NOW);
    expect(queue).toEqual(['2', '1', '3', '10']);
  });

  it('orders equally non-overdue cards by lapse count before falling back to id', () => {
    const questions = [question('1', 'Easy'), question('2', 'Easy')];
    const queue = generateQueue({ kind: 'difficulty', value: 'Easy' }, questions, {
      '1': reviewProgress(NOW + DAY, { lapses: 0 }),
      '2': reviewProgress(NOW + DAY, { lapses: 4 }),
    }, NOW);
    expect(queue).toEqual(['2', '1']);
  });

  it('keeps only cards carrying the picked tag', () => {
    const questions = [
      question('1', 'Medium', ['动态规划']),
      question('2', 'Medium', ['哈希表', '动态规划']),
      question('3', 'Medium', ['二分查找']),
    ];
    const queue = generateQueue({ kind: 'tag', value: '动态规划' }, questions, {}, NOW);
    expect(queue).toEqual(['1', '2']);
  });
});
