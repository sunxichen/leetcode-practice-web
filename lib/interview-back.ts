import { Prism } from 'prism-react-renderer';
import type { CodeSnippet, InterviewCard } from '@/lib/interview-types';

/**
 * 面试卡背面补全（票 9）的纯函数缝：背面分页数、可选区块的归一化、代码语言
 * 兜底、互链解析与深链编码全部收在这里，组件只做条件渲染。空数组在这里被
 * 归一成 null，组件的 `{sections.x && …}` 因此不会把空数组渲染成空标题。
 */

/** 背面轮播页数 = 代码段数；无代码（或防御性的空数组）也是 1，
 * 保证键盘"上一/下一"的钳制边界永远不会落到非法下标。 */
export function getInterviewBackPageCount(card: InterviewCard): number {
  const count = card.answer.code?.length ?? 0;
  return count > 0 ? count : 1;
}

/** 代码语言兜底：schema 已保证语言在高亮器支持范围内（lib/interview-schema.mjs），
 * 这里再对运行期数据兜一次——未知语言落到 prism 的空语法 'text' 原样渲染，
 * 绝不静默当成 Python 高亮。 */
export function resolveCodeLanguage(language: string): string {
  return Prism.languages[language] ? language : 'text';
}

/** 互链解析后的入口：只保留指向真实卡的 id，带上目标卡的问题文本，
 * 让用户在跳转前知道将跳到哪里。 */
export interface RelatedCardEntry {
  id: string;
  question: string;
}

/** 解析 related_ids：保持声明顺序，过滤掉解析不到真实卡的 id
 * （数据校验已保证互链有效，这里是组件侧的防御，不渲染坏链接）。 */
export function resolveRelatedCards(
  card: InterviewCard,
  getCardById: (id: string) => InterviewCard | undefined,
): RelatedCardEntry[] {
  if (!card.related_ids) return [];
  const entries: RelatedCardEntry[] = [];
  for (const id of card.related_ids) {
    const target = getCardById(id);
    if (target) entries.push({ id: target.id, question: target.question });
  }
  return entries;
}

/** 互链入口的跳转目标：现有单卡深链（/interview/browse 题库页是票 13，
 * 绝不指向 404）。id 经 encodeURIComponent 编码，深链完成后的回跳行为不变。 */
export function interviewStudyHref(cardId: string): string {
  return `/interview/study?q=${encodeURIComponent(cardId)}`;
}

/** 背面各区块的归一化结果：可选字段缺省或为空数组时一律为 null，
 * 组件按 null 判断不渲染，空数组不会变成空标题/空盒子。 */
export interface InterviewBackSections {
  /** 要点：唯一必填的答案字段，主体，永远渲染 */
  keyPoints: string[];
  pitfalls: string[] | null;
  code: CodeSnippet[] | null;
  elaboration: string | null;
  followUps: string[] | null;
  /** 互链入口：已过滤掉解析不到的 id；全部解析失败时同样为 null */
  related: RelatedCardEntry[] | null;
}

const nonEmptyStrings = (value: string[] | undefined): string[] | null =>
  value && value.length > 0 ? value : null;

/** 把卡片答案归一成背面的渲染区块。渲染顺序（要点 → 坑 → 代码 → 展开叙述 →
 * 追问 → 互链）由组件按设计文档排布，本函数只负责"这个区块该不该存在"。 */
export function getInterviewBackSections(
  card: InterviewCard,
  getCardById: (id: string) => InterviewCard | undefined,
): InterviewBackSections {
  const related = resolveRelatedCards(card, getCardById);
  return {
    keyPoints: card.answer.key_points,
    pitfalls: nonEmptyStrings(card.answer.pitfalls),
    code: card.answer.code && card.answer.code.length > 0 ? card.answer.code : null,
    elaboration:
      card.answer.elaboration && card.answer.elaboration.length > 0 ? card.answer.elaboration : null,
    followUps: nonEmptyStrings(card.follow_ups),
    related: related.length > 0 ? related : null,
  };
}
