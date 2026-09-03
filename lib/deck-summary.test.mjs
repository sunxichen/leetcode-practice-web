import { describe, it, expect } from 'vitest';

import { CATEGORIES, PRIORITIES } from './interview-schema.mjs';
import {
  DECK_SUMMARY_VERSION,
  buildDeckSummary,
  serializeDeckSummary,
  summaryStaleReason,
} from './deck-summary.mjs';

const hot100 = [{ id: '1' }, { id: '2' }, { id: 'LCR 140' }];

const interview = [
  { id: 'dl-a', category: 'dl-basics', priority: 'must' },
  { id: 'dl-b', category: 'dl-basics', priority: 'common' },
  { id: 'dl-c', category: 'dl-basics', priority: 'must' },
  { id: 'proj-a', category: 'project', priority: 'bonus' },
];

describe('buildDeckSummary', () => {
  it('摘要与输入题库一致：id 列表逐位相同、计数与分布对得上', () => {
    expect(buildDeckSummary({ hot100, interview })).toEqual({
      version: DECK_SUMMARY_VERSION,
      decks: {
        hot100: {
          cardCount: 3,
          cardIds: ['1', '2', 'LCR 140'],
        },
        interview: {
          cardCount: 4,
          cardIds: ['dl-a', 'dl-b', 'dl-c', 'proj-a'],
          byCategory: { project: 1, 'tech-stack': 0, 'dl-basics': 3 },
          byPriority: { must: 2, common: 1, bonus: 1 },
        },
      },
    });
  });

  it('取值清单里的每个键都出现，计数为 0 也出现', () => {
    const summary = buildDeckSummary({ hot100: [], interview: [] });
    expect(Object.keys(summary.decks.interview.byCategory)).toEqual(CATEGORIES);
    expect(Object.keys(summary.decks.interview.byPriority)).toEqual(PRIORITIES);
    expect(Object.values(summary.decks.interview.byCategory)).toEqual([0, 0, 0]);
  });

  it('resume 题集传了才产出键；空题库也产出零计数', () => {
    const without = buildDeckSummary({ hot100, interview });
    expect('resume' in without.decks).toBe(false);

    const summary = buildDeckSummary({ hot100, interview, resume: [] }).decks.resume;
    expect(summary.cardCount).toBe(0);
    expect(summary.cardIds).toEqual([]);
    expect(Object.keys(summary.byCategory)).toEqual(CATEGORIES);
    expect(Object.keys(summary.byPriority)).toEqual(PRIORITIES);
  });

  it('分布之和等于卡片总数', () => {
    const { interview: summary } = buildDeckSummary({ hot100, interview }).decks;
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(summary.byCategory)).toBe(summary.cardCount);
    expect(sum(summary.byPriority)).toBe(summary.cardCount);
  });

  it('同一份题库两次生成的序列化结果完全相同（不含时间戳）', () => {
    const once = serializeDeckSummary(buildDeckSummary({ hot100, interview }));
    const twice = serializeDeckSummary(buildDeckSummary({ hot100, interview }));
    expect(once).toBe(twice);
    expect(once.endsWith('\n')).toBe(true);
  });
});

describe('summaryStaleReason', () => {
  const expected = serializeDeckSummary(buildDeckSummary({ hot100, interview }));

  it('内容一致时判为最新', () => {
    expect(summaryStaleReason(expected, expected)).toBeNull();
  });

  it('摘要文件不存在时判为过期', () => {
    expect(summaryStaleReason(null, expected)).toBe('摘要文件不存在');
  });

  it('题库加了卡但摘要没重新生成时判为过期', () => {
    const stale = serializeDeckSummary(buildDeckSummary({ hot100, interview: interview.slice(0, 3) }));
    expect(summaryStaleReason(stale, expected)).toContain('不一致');
  });
});
