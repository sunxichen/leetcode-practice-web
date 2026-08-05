import type { InterviewCard, Priority } from '@/lib/interview-types';
import dlBasicsData from '@/data/interview/dl-basics.json';
import projectData from '@/data/interview/project.json';
import techStackData from '@/data/interview/tech-stack.json';

/** 题库按分类分文件（LLM 一次只产出一个分类、diff 可读），在这里合并成一份。
 * 全部静态 import 以保证 PWA 离线可用；只被面试题集自己的路由引入，
 * 靠按路由代码分割与 LeetCode 题库互不拖累。
 *
 * 顺序与 lib/interview-schema.mjs 的 DECK_FILES 一致 —— 摘要里的 id 列表按同一
 * 顺序生成，不一致会让 `pnpm deck:sync` 的产物在两边看起来不同。 */
const cards: InterviewCard[] = [
  ...(dlBasicsData as InterviewCard[]),
  ...(projectData as InterviewCard[]),
  ...(techStackData as InterviewCard[]),
];

export function getAllInterviewCards(): InterviewCard[] {
  return cards;
}

export function getInterviewCardById(id: string): InterviewCard | undefined {
  return cards.find(c => c.id === id);
}

export function getAllInterviewTags(): string[] {
  const tagSet = new Set<string>();
  cards.forEach(c => c.tags.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

/** 重要度的引入顺序：高频必答 → 常见 → 加分项（ADR-0004）。 */
const PRIORITY_RANK: Record<Priority, number> = { must: 0, common: 1, bonus: 2 };

/**
 * smart 队列 brand-new 段的引入顺序（题集配置的 sortNewCards）：按重要度，
 * 同级按 id 的码元顺序——稳定、确定，与运行环境 locale 无关。排序只在
 * 这份副本上进行，不改动入参（题库数组顺序对其他消费者保持原样）。
 */
export function sortInterviewNewCards(cards: InterviewCard[]): InterviewCard[] {
  return [...cards].sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
