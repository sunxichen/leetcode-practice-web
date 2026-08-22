import type { Question } from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';
import { HOT100_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { CardFront } from '@/components/card/CardFront';
import { CardBack } from '@/components/card/CardBack';
import type { DeckConfig, ModePickerData } from '@/lib/decks/types';
import { DECK_META } from '@/lib/decks/meta';

/** ModePicker 标签云的 chip 数上限（与参数化之前 ModePicker 内部常量相同）。 */
const MAX_TAG_CHIPS = 8;

/**
 * ModePicker 统计：标签云（按题目数排序的顶部标签）与难度分布。
 * 就是票 6 之前 ModePicker 内部的那两段统计，逐位搬到题集配置——输出不变。
 */
function getModePickerData(cards: Question[]): ModePickerData {
  const tally: Record<string, number> = {};
  for (const q of cards) {
    for (const t of q.tags) tally[t] = (tally[t] ?? 0) + 1;
  }
  const topTags = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAG_CHIPS)
    .map(([t]) => t);

  const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0 };
  for (const q of cards) difficultyCounts[q.difficulty]++;

  return { topTags, difficultyCounts };
}

/**
 * LeetCode Hot 100 题集。
 *
 * 调度参数取值与参数化之前的模块级常量逐位相同（票 2 锁定），卡面组件就是
 * 学习页一直在用的那对——本配置只是把学习页原来直接引用的东西聚到一处，
 * 用户可见行为零变化。
 */
export const hot100Deck: DeckConfig<Question> = {
  id: 'hot100',
  name: DECK_META.hot100.name,
  dataSource: {
    getAllCards: getAllQuestions,
    getCardById: getQuestionById,
  },
  schedulingParams: HOT100_SCHEDULING_PARAMS,
  sessionModes: ['smart', 'sequential', 'difficulty', 'tag', 'weakest', 'single'],
  components: {
    CardFront,
    CardBack,
  },
  // 背面轮播一页 = 一种解法；键盘"上一/下一"的边界即解法数。
  getBackPageCount: (card) => card.solutions.length,
  getModePickerData,
  browsePath: DECK_META.hot100.browsePath,
  studyPath: DECK_META.hot100.studyPath,
};
