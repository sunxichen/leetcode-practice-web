import { describe, it, expect } from 'vitest';
import { getDeckConfig, DECK_IDS } from '@/lib/decks';
import { generateQueue } from '@/lib/studyQueue';
import { getAllQuestions } from '@/lib/questions';
import { getAllInterviewCards } from '@/lib/interview';
import { getAllResumeCards } from '@/lib/resume';
import { HOT100_SCHEDULING_PARAMS, INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { keyPointAnchors } from '@/lib/feedbackAnchors';

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
    // 路由元数据（票 12）：学习与题库路由收进配置
    expect(deck.studyPath).toBe('/study');
    expect(deck.browsePath).toBe('/browse');
    // 数据源：与既有题库接口是同一份数据
    expect(deck.dataSource.getAllCards()).toBe(getAllQuestions());
    const first = getAllQuestions()[0];
    expect(deck.dataSource.getCardById(first.id)).toBe(first);
    // 调度参数：与票 2 锁定的取值是同一份对象
    expect(deck.schedulingParams).toBe(HOT100_SCHEDULING_PARAMS);
    // 可选会话模式清单：LeetCode 题集提供的全部模式
    expect(deck.sessionModes).toEqual(['smart', 'sequential', 'difficulty', 'tag', 'weakest', 'single']);
    // 卡片正反面渲染组件
    expect(typeof deck.components.CardFront).toBe('function');
    expect(typeof deck.components.CardBack).toBe('function');
  });

  it('DECK_IDS 列出全部已注册题集', () => {
    expect(DECK_IDS).toEqual(['hot100', 'interview', 'resume']);
  });
});

describe('题集注册表：面试题集（票 8）', () => {
  const deck = getDeckConfig('interview');
  const cards = getAllInterviewCards();

  it('按题集标识取出面试题集的完整配置', () => {
    expect(deck.id).toBe('interview');
    expect(deck.name).toBe('面试题集');
    // 路由元数据（票 12/13）：有学习路由，题库页（票 13）指向 /interview/browse
    expect(deck.studyPath).toBe('/interview/study');
    expect(deck.browsePath).toBe('/interview/browse');
    // 数据源：与面试题库接口是同一份数据
    expect(deck.dataSource.getAllCards()).toBe(cards);
    expect(deck.dataSource.getCardById(cards[0].id)).toBe(cards[0]);
    // 调度参数：照方案文档对照表取值的那份对象
    expect(deck.schedulingParams).toBe(INTERVIEW_SCHEDULING_PARAMS);
    // 提供智能复习、按顺序刷题、全量扫题与单卡（按分类/按重要度复习维度不在本线范围）
    expect(deck.sessionModes).toEqual(['smart', 'sequential', 'sweep', 'single']);
    expect(typeof deck.components.CardFront).toBe('function');
    expect(typeof deck.components.CardBack).toBe('function');
  });

  it('背面分页数 = 代码段数（票 9 多段代码轮播的钳制边界），无代码也是 1', () => {
    for (const card of cards) {
      // 当前真实数据每卡至多一段代码，所以逐卡都是 1；多段的合成用例见
      // lib/interview-back.test.ts。
      expect(deck.getBackPageCount(card)).toBe(Math.max(1, card.answer.code?.length ?? 0));
    }
  });

  it('ModePicker 统计不编造零值：本题集不提供标签云与难度分布', () => {
    const data = deck.getModePickerData(cards);
    expect(data.topTags).toBeUndefined();
    expect(data.difficultyCounts).toBeUndefined();
  });

  it('题库页（票 13）：browsePath 为 /interview/browse，会话总结与空状态据此渲染浏览按钮', () => {
    expect(deck.browsePath).toBe('/interview/browse');
  });

  it('自评锚按当前卡要点数派生，与纯函数 keyPointAnchors 一致', () => {
    for (const card of cards) {
      expect(deck.getFeedbackAnchors?.(card)).toEqual(keyPointAnchors(card.answer.key_points.length));
    }
  });

  it('LeetCode 题集的自评条不走锚映射（到期时间预览现状不变），且有题库页去向', () => {
    const hot100 = getDeckConfig('hot100');
    expect(hot100.getFeedbackAnchors).toBeUndefined();
    expect(hot100.browsePath).toBe('/browse');
  });

  it('面试题集注入新卡排序（票 10）：真实题库排序后 must 全在 common 前、common 全在 bonus 前，同级按 id，且不改动题库数组', () => {
    expect(typeof deck.sortNewCards).toBe('function');
    const before = cards.map(c => c.id);
    const sorted = deck.sortNewCards!(cards);
    // 不改动入参：题库数组顺序对其他消费者保持原样
    expect(cards.map(c => c.id)).toEqual(before);

    const rank = { must: 0, common: 1, bonus: 2 } as const;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      expect(rank[cur.priority]).toBeGreaterThanOrEqual(rank[prev.priority]);
      if (cur.priority === prev.priority) {
        expect(cur.id > prev.id).toBe(true);
      }
    }
  });

  it('LeetCode 题集不注入新卡排序：brand-new 保持题库数组顺序（票 10 零回归）', () => {
    expect(getDeckConfig('hot100').sortNewCards).toBeUndefined();
  });

  it('Hot100 不提供全量扫题：sessionModes 不含 sweep，既有模式逐位不变，categories 为 undefined（票 11 零回归）', () => {
    const hot100 = getDeckConfig('hot100');
    expect(hot100.sessionModes).toEqual(['smart', 'sequential', 'difficulty', 'tag', 'weakest', 'single']);
    expect(hot100.sessionModes).not.toContain('sweep');
    expect(hot100.getModePickerData(getAllQuestions()).categories).toBeUndefined();
  });

  it('面试题集提供全量扫题：sessionModes 含 sweep，分类 chips 计数与卡片集一致、中文标签正确', () => {
    const deck = getDeckConfig('interview');
    expect(deck.sessionModes).toContain('sweep');

    const data = deck.getModePickerData(cards);
    const tally = new Map<string, number>();
    for (const c of cards) tally.set(c.category, (tally.get(c.category) ?? 0) + 1);
    const byValue = new Map((data.categories ?? []).map(c => [c.value, c]));

    // 每个有卡的分类都出现，计数一致；没有卡的分类不编造零值。
    for (const [cat, count] of tally) {
      expect(byValue.get(cat)?.count).toBe(count);
    }
    expect(byValue.size).toBe(tally.size);
    // 中文标签在题集侧定义。
    expect(byValue.get('dl-basics')?.label).toBe('深度学习基础');
  });
});

describe('题集注册表：简历题集', () => {
  const deck = getDeckConfig('resume');
  const cards = getAllResumeCards();

  it('按题集标识取出简历题集的完整配置', () => {
    expect(deck.id).toBe('resume');
    expect(deck.name).toBe('简历题集');
    expect(deck.studyPath).toBe('/resume/study');
    expect(deck.browsePath).toBe('/resume/browse');
    expect(deck.dataSource.getAllCards()).toBe(cards);
    expect(deck.dataSource.getCardById(cards[0]?.id ?? '')).toBe(cards[0]);
    // 调度参数、卡面组件、新卡排序与背面分页复用面试题集的同一份
    expect(deck.schedulingParams).toBe(INTERVIEW_SCHEDULING_PARAMS);
    expect(deck.sessionModes).toEqual(['smart', 'sequential', 'sweep', 'single']);
    expect(typeof deck.components.CardFront).toBe('function');
    expect(typeof deck.components.CardBack).toBe('function');
    expect(typeof deck.getBackPageCount).toBe('function');
  });

  it('与面试题集共享同一份卡面组件、调度参数与注入能力', () => {
    const interview = getDeckConfig('interview');
    expect(deck.schedulingParams).toBe(interview.schedulingParams);
    expect(deck.components.CardFront).toBe(interview.components.CardFront);
    expect(deck.components.CardBack).toBe(interview.components.CardBack);
    expect(deck.getBackPageCount).toBe(interview.getBackPageCount);
    expect(deck.getFeedbackAnchors).toBe(interview.getFeedbackAnchors);
    expect(deck.sortNewCards).toBe(interview.sortNewCards);
  });

  it('提供全量扫题：分类 chips 从卡片集派生，空题库不编造零值', () => {
    expect(deck.sessionModes).toContain('sweep');
    // chips 只列有卡的分类：project 已有卡，tech-stack 题库为空，不编造零值
    const projectCount = cards.filter((c) => c.category === 'project').length;
    expect(deck.getModePickerData(cards).categories).toEqual([
      { value: 'project', label: '项目深挖', count: projectCount },
    ]);
    // 空题库同样从卡片集派生：空入参得到空 chips，而不是零值占位
    const empty = deck.getModePickerData([]);
    expect(empty.categories).toEqual([]);
    expect(empty.topTags).toBeUndefined();
    expect(empty.difficultyCounts).toBeUndefined();
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
