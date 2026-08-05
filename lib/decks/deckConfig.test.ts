import { describe, it, expect } from 'vitest';
import { getDeckConfig, DECK_IDS } from '@/lib/decks';
import { generateQueue } from '@/lib/studyQueue';
import { getAllQuestions } from '@/lib/questions';
import { getAllInterviewCards } from '@/lib/interview';
import { HOT100_SCHEDULING_PARAMS } from '@/lib/schedulingParams';

/**
 * 题集注册表与题集配置的行为断言，外加票 4 设计难点的类型验证：
 * 队列引擎不绑死在 Question 上，InterviewCard 不改动即可流入 generateQueue
 * ——本文件能被 `next build` 类型检查通过，就是这个事实的证明（vitest 运行
 * 不做类型检查，类型证据由构建给出；下面的运行断言证明引擎在该卡片形状上
 * 行为正确）。
 */

const NOW = new Date(2026, 2, 15, 10, 30, 0, 0).getTime();

describe('题集注册表 (deck registry)', () => {
  it('按题集标识取出 LeetCode 题集的完整配置', () => {
    const deck = getDeckConfig('hot100');

    expect(deck.id).toBe('hot100');
    // 数据源：与既有题库接口是同一份数据
    expect(deck.dataSource.getAllCards()).toBe(getAllQuestions());
    const first = getAllQuestions()[0];
    expect(deck.dataSource.getCardById(first.id)).toBe(first);
    // 调度参数：与票 2 锁定的取值是同一份对象
    expect(deck.schedulingParams).toBe(HOT100_SCHEDULING_PARAMS);
    // 可选会话模式清单：LeetCode 题集提供的全部模式
    expect(deck.sessionModes).toEqual(['smart', 'difficulty', 'tag', 'weakest', 'single']);
    // 卡片正反面渲染组件
    expect(typeof deck.components.CardFront).toBe('function');
    expect(typeof deck.components.CardBack).toBe('function');
  });

  it('DECK_IDS 列出全部已注册题集', () => {
    expect(DECK_IDS).toEqual(['hot100']);
  });
});

describe('题集配置的会话外壳能力（票 6）', () => {
  const deck = getDeckConfig('hot100');
  const cards = getAllQuestions();

  it('背面分页数就是该卡的解法数（键盘"上一/下一"的钳制边界）', () => {
    for (const q of cards) {
      expect(deck.getBackPageCount(q)).toBe(q.solutions.length);
    }
  });

  it('ModePicker 统计与卡片集一致：难度分布逐档相等', () => {
    const data = deck.getModePickerData(cards);
    expect(data.difficultyCounts.Easy).toBe(cards.filter(q => q.difficulty === 'Easy').length);
    expect(data.difficultyCounts.Medium).toBe(cards.filter(q => q.difficulty === 'Medium').length);
    expect(data.difficultyCounts.Hard).toBe(cards.filter(q => q.difficulty === 'Hard').length);
  });

  it('ModePicker 统计与卡片集一致：标签云按频次降序、至多 8 条、榜首即全库最高频标签', () => {
    const data = deck.getModePickerData(cards);
    expect(data.topTags.length).toBeLessThanOrEqual(8);

    const tally = new Map<string, number>();
    for (const q of cards) {
      for (const t of q.tags) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    const freq = (t: string) => tally.get(t) ?? 0;
    for (let i = 1; i < data.topTags.length; i++) {
      expect(freq(data.topTags[i - 1])).toBeGreaterThanOrEqual(freq(data.topTags[i]));
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(data.topTags[0]).toBe(top);
  });
});

describe('队列引擎的最小卡片约束 (SessionCard)', () => {
  const interviewCards = getAllInterviewCards();

  it('InterviewCard 不改动即可流入智能队列：全部为新卡时按题库顺序排出', () => {
    const queue = generateQueue({ kind: 'smart' }, interviewCards, {}, HOT100_SCHEDULING_PARAMS, NOW);
    expect(queue).toEqual(interviewCards.map(c => c.id));
  });

  it('InterviewCard 流入攻克最弱：从未学过的卡被跳过', () => {
    expect(generateQueue({ kind: 'weakest' }, interviewCards, {}, HOT100_SCHEDULING_PARAMS, NOW)).toEqual([]);
  });

  it('InterviewCard 流入单卡模式：按注入的卡片集解析', () => {
    const target = interviewCards[0];
    expect(
      generateQueue({ kind: 'single', questionId: target.id }, interviewCards, {}, HOT100_SCHEDULING_PARAMS, NOW),
    ).toEqual([target.id]);
    expect(
      generateQueue({ kind: 'single', questionId: 'no-such-card' }, interviewCards, {}, HOT100_SCHEDULING_PARAMS, NOW),
    ).toEqual([]);
  });
});
