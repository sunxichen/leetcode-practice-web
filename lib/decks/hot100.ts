import type { Question } from '@/lib/types';
import { getAllQuestions, getQuestionById } from '@/lib/questions';
import { HOT100_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { CardFront } from '@/components/card/CardFront';
import { CardBack } from '@/components/card/CardBack';
import type { DeckConfig } from '@/lib/decks/types';

/**
 * LeetCode Hot 100 题集。
 *
 * 调度参数取值与参数化之前的模块级常量逐位相同（票 2 锁定），卡面组件就是
 * 学习页一直在用的那对——本配置只是把学习页原来直接引用的东西聚到一处，
 * 用户可见行为零变化。
 */
export const hot100Deck: DeckConfig<Question> = {
  id: 'hot100',
  name: 'LeetCode Hot 100',
  dataSource: {
    getAllCards: getAllQuestions,
    getCardById: getQuestionById,
  },
  schedulingParams: HOT100_SCHEDULING_PARAMS,
  sessionModes: ['smart', 'difficulty', 'tag', 'weakest', 'single'],
  components: {
    CardFront,
    CardBack,
  },
};
