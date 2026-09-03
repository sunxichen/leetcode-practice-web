import type { InterviewCard } from '@/lib/interview-types';
import projectData from '@/data/resume/project.json';
import techStackData from '@/data/resume/tech-stack.json';

/**
 * 简历题集的数据模块。题库按来源分文件（LLM 一次只产出一个领域、diff 可读），
 * 在这里合并成一份；全部静态 import 以保证 PWA 离线可用。只被简历题集自己的
 * 路由与题集配置引入，与面试题库互不拖累。
 *
 * 文件顺序与 lib/interview-schema.mjs 的 DATA_DECKS.resume.files 保持一致。
 */
const cards: InterviewCard[] = [
  ...(projectData as InterviewCard[]),
  ...(techStackData as InterviewCard[]),
];

export function getAllResumeCards(): InterviewCard[] {
  return cards;
}

export function getResumeCardById(id: string): InterviewCard | undefined {
  return cards.find((card) => card.id === id);
}
