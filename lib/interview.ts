import type { InterviewCard } from '@/lib/interview-types';
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
