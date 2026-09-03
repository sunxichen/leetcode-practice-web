import type { InterviewCard, Priority } from '@/lib/interview-types';

/**
 * 面试题集新卡引入顺序（ADR-0004）——与题集无关的排序缝。
 *
 * 从 lib/interview.ts 挪到这里：resume 题集的题集配置也要注入同一个排序
 * 能力，而它绝不能为了十行纯函数把 lib/interview 的题库数据一起打进自己的
 * 路由包。lib/interview 从本模块 re-export，现有消费者不变。
 */

/** 重要度的引入顺序：高频必答 → 常见 → 加分项。 */
export const PRIORITY_RANK: Record<Priority, number> = {
  must: 0,
  common: 1,
  bonus: 2,
};

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
