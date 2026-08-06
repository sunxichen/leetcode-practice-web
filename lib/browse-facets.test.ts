import { describe, it, expect } from 'vitest';
import { hot100FacetGroups } from '@/lib/browse-facets';
import { getAllTags } from '@/lib/questions';

/**
 * 票 13 的 Hot100 零回归钉子：FilterPanel 从"难度 + 标签硬编码 + 内部
 * getAllTags"参数化为按注入筛选组驱动后，Hot100 题库页注入的两个多选组的
 * 静态配置必须与重构前逐位一致——可见项、顺序、标签折叠阈值 10、清除按钮。
 * 这里对 hot100FacetGroups() 做结构断言（页面直接用这份配置，测试即钉住
 * 页面会渲染出的可见项与顺序）。
 */

describe('hot100 题库页注入的多选组（参数化后与重构前一致）', () => {
  const groups = hot100FacetGroups();

  it('两组、顺序为难度在前标签在后，与重构前 FilterPanel 渲染顺序一致', () => {
    expect(groups.map((g) => g.key)).toEqual(['difficulty', 'tags']);
    expect(groups.map((g) => g.label)).toEqual(['难度', '标签']);
  });

  it('难度组：Easy / Medium / Hard 顺序与值一致，无折叠无清除', () => {
    const difficulty = groups[0];
    expect(difficulty.options).toEqual([
      { value: 'Easy', label: 'Easy' },
      { value: 'Medium', label: 'Medium' },
      { value: 'Hard', label: 'Hard' },
    ]);
    expect(difficulty.collapsibleThreshold).toBeUndefined();
    expect(difficulty.showClear).toBeUndefined();
  });

  it('标签组：选项 = getAllTags() 顺序，折叠阈值 10，有清除按钮', () => {
    const tags = groups[1];
    expect(tags.options.map((o) => o.value)).toEqual(getAllTags());
    // 选项顺序=值顺序，且与 getAllTags 逐位一致（含中文标签原样）
    expect(tags.options.map((o) => o.label)).toEqual(getAllTags());
    expect(tags.collapsibleThreshold).toBe(10);
    expect(tags.showClear).toBe(true);
  });

  it('标签组选项数仍与 getAllTags() 一致（折叠 "+N" 的 N 依赖它）', () => {
    const tags = groups[1];
    expect(tags.options.length).toBe(getAllTags().length);
  });
});
