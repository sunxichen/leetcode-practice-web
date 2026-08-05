import { describe, it, expect } from 'vitest';
import { keyPointAnchors } from '@/lib/feedbackAnchors';

/**
 * 要点锚的边界钉死：困难档下界 ceil(0.4n)、良好档下界 ceil(0.8n) 的上取整
 * 边界，用题库校验允许的四种真实取值（n = 3, 4, 5, 6）各钉一组完整标注。
 * 0.4/0.8 恰落在整数上的情况（n = 5 的 0.8n = 4）尤其要钉——上取整与
 * 四舍五入在这些点上结果不同。
 */

describe('keyPointAnchors — 要点数 → 四档命中区间', () => {
  it('n = 3：困难档与良好档都收敛为单点', () => {
    expect(keyPointAnchors(3)).toEqual({
      again: '命中 0-1 条',
      hard: '命中 2 条',
      good: '命中 3 条',
      easy: '全中且流畅',
    });
  });

  it('n = 4：良好档收敛为单点', () => {
    expect(keyPointAnchors(4)).toEqual({
      again: '命中 0-1 条',
      hard: '命中 2-3 条',
      good: '命中 4 条',
      easy: '全中且流畅',
    });
  });

  it('n = 5：设计文档的示例——重来 0-1 / 困难 2-3 / 良好 4-5 / 简单 全中且流畅', () => {
    // ceil(0.8 · 5) = 4：0.8n 恰为整数时上取整不再加一，良好档从 4 起。
    expect(keyPointAnchors(5)).toEqual({
      again: '命中 0-1 条',
      hard: '命中 2-3 条',
      good: '命中 4-5 条',
      easy: '全中且流畅',
    });
  });

  it('n = 6：困难档下界越过 0-1 档，四档都是区间', () => {
    expect(keyPointAnchors(6)).toEqual({
      again: '命中 0-2 条',
      hard: '命中 3-4 条',
      good: '命中 5-6 条',
      easy: '全中且流畅',
    });
  });

  it('四档区间无重叠且无缝覆盖 0..n（n = 3..6 全量验证）', () => {
    const parse = (label: string): [number, number] | null => {
      const m = label.match(/^命中 (\d+)(?:-(\d+))? 条$/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2] ?? m[1])];
    };
    for (const n of [3, 4, 5, 6]) {
      const anchors = keyPointAnchors(n);
      expect(anchors.easy).toBe('全中且流畅');
      const [againLo, againHi] = parse(anchors.again)!;
      const [hardLo, hardHi] = parse(anchors.hard)!;
      const [goodLo, goodHi] = parse(anchors.good)!;
      expect(againLo).toBe(0);
      expect(hardLo).toBe(againHi + 1);
      expect(goodLo).toBe(hardHi + 1);
      expect(goodHi).toBe(n);
      // 困难档下界 = ceil(0.4n)，良好档下界 = ceil(0.8n)
      expect(hardLo).toBe(Math.ceil(0.4 * n));
      expect(goodLo).toBe(Math.ceil(0.8 * n));
    }
  });
});
