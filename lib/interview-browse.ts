import type { InterviewCard, InterviewCategory, Priority } from '@/lib/interview-types';
import type { QuestionProgress } from '@/lib/types';
import { DAY_MS } from '@/lib/constants';

/**
 * 面试题库页（票 13）的纯函数缝：搜索 + 分类/重要度多选 + 语义筛选全部收在
 * 这里，页面只做渲染。筛选是**只读**的——输入卡片集与进度文档，输出过滤后的
 * 卡片集，绝不写任何调度状态。分类/重要度的中文标签也定义在本题集侧，不塞进
 * 通用组件（FilterPanel）。
 */

/** 语义筛选口径与 Hot100 题库页一致（复用同一套语义）。 */
export type InterviewSemanticFilter = 'all' | 'due-today' | 'due-soon' | 'lapse-prone' | 'new';

/** 分类 → 中文展示名（题库页筛选 chips 与列表徽章用，题集侧定义）。 */
export const INTERVIEW_CATEGORY_LABEL: Record<InterviewCategory, string> = {
  project: '项目深挖',
  'tech-stack': '技术路线',
  'dl-basics': '深度学习基础',
};

/** 重要度 → 中文展示名（题库页筛选 chips 与列表徽章用，题集侧定义）。 */
export const INTERVIEW_PRIORITY_LABEL: Record<Priority, string> = {
  must: '高频必答',
  common: '常见',
  bonus: '加分项',
};

/** 分类选项的展示顺序（与 lib/interview-schema.mjs 的 CATEGORIES 一致）。 */
export const INTERVIEW_CATEGORY_ORDER: InterviewCategory[] = ['project', 'tech-stack', 'dl-basics'];

/** 重要度选项的展示顺序（引入顺序：高频必答 → 常见 → 加分项，ADR-0004）。 */
export const INTERVIEW_PRIORITY_ORDER: Priority[] = ['must', 'common', 'bonus'];

export interface InterviewBrowseFilter {
  /** 搜索词：按问题文本与标签匹配（可含 id），大小写不敏感。空 = 不过滤。 */
  searchQuery: string;
  /** 分类多选（空 = 全部，选中取并集）。 */
  categories: Set<string>;
  /** 重要度多选（空 = 全部，选中取并集）。 */
  priorities: Set<string>;
  /** 语义筛选（沿用 Hot100 同口径：待复习 / 即将到期 / 易遗忘 / 未学习）。 */
  semantic: InterviewSemanticFilter;
}

/**
 * 面试题库筛选谓词：单卡是否命中。纯函数——由 filterInterviewCards 逐卡调用，
 * 不引用任何 React 状态，也不写任何进度。
 */
export function matchesInterviewBrowseFilter(
  card: InterviewCard,
  progress: Record<string, QuestionProgress>,
  filter: InterviewBrowseFilter,
  now: number,
): boolean {
  const { searchQuery, categories, priorities, semantic } = filter;

  // 搜索：问题文本、标签（可含 id），大小写不敏感。
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const matchQuestion = card.question.toLowerCase().includes(query);
    const matchId = card.id.toLowerCase().includes(query);
    const matchTag = card.tags.some((t) => t.toLowerCase().includes(query));
    if (!matchQuestion && !matchId && !matchTag) return false;
  }

  // 分类多选：空 = 全部；否则取并集。
  if (categories.size > 0 && !categories.has(card.category)) return false;

  // 重要度多选：空 = 全部；否则取并集。
  if (priorities.size > 0 && !priorities.has(card.priority)) return false;

  // 语义筛选：口径与 Hot100 题库页逐位一致。
  if (semantic !== 'all') {
    const prog = progress[card.id];
    switch (semantic) {
      case 'due-today': {
        if (!prog || prog.state === 'new') return false;
        const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
        if (due > now) return false;
        break;
      }
      case 'due-soon': {
        if (!prog || prog.state === 'new') return false;
        const due = prog.dueAt ?? prog.nextReviewDate ?? 0;
        if (due <= now || due > now + 7 * DAY_MS) return false;
        break;
      }
      case 'lapse-prone': {
        if (!prog || (prog.lapses ?? 0) < 1) return false;
        break;
      }
      case 'new': {
        if (prog && prog.state !== 'new') return false;
        break;
      }
    }
  }

  return true;
}

/**
 * 面试题库筛选：返回命中的卡片集（保持题库数组顺序）。纯函数，只读。
 * `now` 由调用方传入，保证可测（与 Hot100 页面 snap 当前时间同一做法）。
 */
export function filterInterviewCards(
  cards: InterviewCard[],
  progress: Record<string, QuestionProgress>,
  filter: InterviewBrowseFilter,
  now: number,
): InterviewCard[] {
  return cards.filter((card) => matchesInterviewBrowseFilter(card, progress, filter, now));
}
