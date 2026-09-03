import type { FeedbackType } from '@/lib/types';
import type { InterviewCard } from '@/lib/interview-types';

/**
 * 要点锚 (key-point anchors) — 面试卡自评条四档的命中区间标注。
 *
 * 要点是自评的客观锚（ADR-0003）：翻卡前用户就知道"这题该说几点"，翻卡后
 * 按说中几条来评，而不是凭感觉。四档的下界由当前卡要点数 n 派生：
 *
 *   困难档下界 = ceil(0.4 · n)     良好档下界 = ceil(0.8 · n)
 *   简单档 = 全中且能流畅串成话      重来档 = 困难档下界以下
 *
 * n = 5 时呈现为：重来 0-1 条 / 困难 2-3 条 / 良好 4-5 条 / 简单 全中且流畅。
 *
 * 纯函数：锚文案只是按钮上的辅助标签，不是交互——自评仍然是四个按钮一击
 * 完成，零额外点击。题库校验保证 n ∈ [3, 6]，此区间内各档区间均非空。
 */
export function keyPointAnchors(keyPointCount: number): Record<FeedbackType, string> {
  const hardMin = Math.ceil(0.4 * keyPointCount);
  const goodMin = Math.ceil(0.8 * keyPointCount);
  return {
    again: formatRange(0, hardMin - 1),
    hard: formatRange(hardMin, goodMin - 1),
    good: formatRange(goodMin, keyPointCount),
    easy: '全中且流畅',
  };
}

/** 命中区间文案：上下界相等时收敛为单个数（"命中 3 条"而非"3-3 条"）。 */
function formatRange(lo: number, hi: number): string {
  if (lo === hi) return `命中 ${lo} 条`;
  return `命中 ${lo}-${hi} 条`;
}

/**
 * 面试卡片自评锚的注入函数。两个面试型题集（面试题集、简历题集）共用同一
 * schema——锚函数因此是 schema 级的，提为命名共享函数：题集配置注入的是
 * 同一引用，共享性可断言。
 */
export const interviewFeedbackAnchors = (card: Pick<InterviewCard, 'answer'>): Record<FeedbackType, string> =>
  keyPointAnchors(card.answer.key_points.length);
