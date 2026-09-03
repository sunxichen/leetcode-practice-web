import type { InterviewCategory, InterviewCard, Priority } from '@/lib/interview-types';
import type { ModePickerData } from '@/lib/decks/types';

/**
 * 面试卡片分类/重要度的展示取值——两个面试型题集（面试题集、简历题集）共用
 * 同一套 schema（分类与重要度枚举相同），这些取值因此对两个题集都是
 * schema 级的，不是某个题集特定的。从 lib/decks/interview.ts 与
 * 题库页的题集侧常量收编到这里：resume 题集的配置绝不能为了几条
 * 标签把 lib/interview 的题库数据一起打进自己的路由包。
 */

/** 分类 → 中文展示名。题库页徽章与全量扫题 chips 共用。 */
export const CATEGORY_LABEL: Record<InterviewCategory, string> = {
  project: '项目深挖',
  'tech-stack': '技术路线',
  'dl-basics': '深度学习基础',
};

/** 重要度 → 中文展示名。题库页徽章与筛选 chips 共用。 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  must: '高频必答',
  common: '常见',
  bonus: '加分项',
};

/** 分类的展示顺序（与 lib/interview-schema.mjs 的 CATEGORIES 一致）。 */
export const CATEGORY_ORDER: InterviewCategory[] = ['project', 'tech-stack', 'dl-basics'];

/** 重要度选项的展示顺序（引入顺序：高频必答 → 常见 → 加分项，ADR-0004）。 */
export const PRIORITY_ORDER: Priority[] = ['must', 'common', 'bonus'];

/** 全量扫题的多选筛选组：分类 + 重要度。两个面试型题集共用同一份。 */
export const FACET_GROUPS: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'category',
    label: '分类',
    options: CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
  },
  {
    key: 'priority',
    label: '重要度',
    options: PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
  },
];

/** 全量扫题的分类 chips：从卡片集派生各分类的卡数，只列有卡的分类（不编造零值）。 */
export function buildCategoryChips(cards: InterviewCard[]): ModePickerData {
  const categories = CATEGORY_ORDER.map((cat) => {
    const count = cards.filter((card) => card.category === cat).length;
    return count > 0 ? { value: cat, label: CATEGORY_LABEL[cat], count } : null;
  }).filter((x): x is { value: InterviewCategory; label: string; count: number } => x !== null);
  return { categories };
}
