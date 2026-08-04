/** 题集摘要：首页要显示每个题集的待复习数与新卡数，但不能为此静态引入两份
 * 完整题库（questions.json 一份就 288 KB）。摘要只带 id 列表与分布，几 KB，
 * 首页拿它与进度文档求交集就能算出计数。
 *
 * 纯函数，输出必须是确定性的（不含时间戳），否则 --check 会永远判为过期。 */

import { CATEGORIES, PRIORITIES } from './interview-schema.mjs';

/** 摘要结构变更时递增，读方可以据此拒绝旧摘要。 */
export const DECK_SUMMARY_VERSION = 1;

/**
 * @param {{ hot100: { id: string }[], interview: import('./interview-types').InterviewCard[] }} decks
 * @returns {object} 可直接序列化的摘要
 */
export function buildDeckSummary({ hot100, interview }) {
  return {
    version: DECK_SUMMARY_VERSION,
    decks: {
      hot100: {
        cardCount: hot100.length,
        cardIds: hot100.map((q) => q.id),
      },
      interview: {
        cardCount: interview.length,
        cardIds: interview.map((c) => c.id),
        byCategory: countBy(interview, CATEGORIES, (c) => c.category),
        byPriority: countBy(interview, PRIORITIES, (c) => c.priority),
      },
    },
  };
}

/** 取值清单里的每个键都出现（计数为 0 也出现），读方不必判 undefined。 */
function countBy(cards, keys, pick) {
  const counts = {};
  for (const key of keys) counts[key] = 0;
  for (const card of cards) {
    const key = pick(card);
    if (key in counts) counts[key] += 1;
  }
  return counts;
}

/** 摘要落盘的唯一格式。写与比对都走这里，否则缩进差异会被误判成过期。 */
export function serializeDeckSummary(summary) {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

/**
 * 摘要是否已经跟不上题库了。
 * @param {string | null} onDiskText 摘要文件内容，文件不存在时传 null
 * @param {string} expectedText serializeDeckSummary 的输出
 * @returns {string | null} 过期原因；已是最新时返回 null
 */
export function summaryStaleReason(onDiskText, expectedText) {
  if (onDiskText === null) return '摘要文件不存在';
  if (onDiskText !== expectedText) return '摘要与题库不一致（题库改了但摘要没重新生成）';
  return null;
}
