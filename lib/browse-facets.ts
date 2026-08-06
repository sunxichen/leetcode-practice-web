import { getAllTags } from '@/lib/questions';

/**
 * 题库页多选筛选组的静态描述（票 13 的 FilterPanel 参数化）。
 *
 * FilterPanel 从"难度 + 标签硬编码 + 内部 getAllTags"重构为按注入的筛选组
 * 驱动：它不再认识任何题集的具体数据源，选项由调用方注入。这里保存 Hot100
 * 题库页那两组的静态配置——重构前 DIFFICULTIES 常量、getAllTags() 顺序、
 * 标签折叠阈值 10、清除按钮，逐位搬到这里，供页面注入与测试断言共用，
 * 保证参数化后可见项与顺序和重构前一致（零回归钉子）。
 *
 * 动态部分（当前选中 Set、toggle 回调）是页面组件状态，不在这里。
 */

/** 一个多选组选项：value 是卡片上的裸字段值，label 是展示文案。 */
export interface BrowseFacetOption {
  value: string;
  label: string;
}

/** 一个多选组的静态配置：组件只按 label 渲染、按 options 铺 chip，并对
 * 可折叠组做「+N 展开/收起」与「清除 (N)」。 */
export interface BrowseFacetStatic {
  /** 组唯一标识（React key，也是页面区分该组状态用）。 */
  key: string;
  /** 组标签，如「难度」「标签」「分类」「重要度」。 */
  label: string;
  options: BrowseFacetOption[];
  /** 是否显示「清除 (N)」按钮（现有 LeetCode 标签组有）。 */
  showClear?: boolean;
  /** 折叠阈值：选项数超过该值折叠为「+N」展开/收起；undefined = 不折叠
   *（面试题集的分类/重要度组不折叠）。 */
  collapsibleThreshold?: number;
}

/** Hot100 题库页的两个多选组：难度 + 标签。顺序（难度在前、标签在后）
 * 与重构前 FilterPanel 的渲染顺序一致，可见项与顺序逐位不变。 */
export function hot100FacetGroups(): BrowseFacetStatic[] {
  return [
    {
      key: 'difficulty',
      label: '难度',
      options: (['Easy', 'Medium', 'Hard'] as const).map((v) => ({ value: v, label: v })),
    },
    {
      key: 'tags',
      label: '标签',
      options: getAllTags().map((t) => ({ value: t, label: t })),
      showClear: true,
      collapsibleThreshold: 10,
    },
  ];
}
