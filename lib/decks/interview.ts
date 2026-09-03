import type { InterviewCard } from '@/lib/interview-types';
import { getAllInterviewCards, getInterviewCardById } from '@/lib/interview';
import { getInterviewBackPageCount } from '@/lib/interview-back';
import { INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { interviewFeedbackAnchors } from '@/lib/feedbackAnchors';
import { sortInterviewNewCards } from '@/lib/interview-sorting';
import { buildCategoryChips } from '@/lib/interview-facets';
import { InterviewCardFront } from '@/components/interview/InterviewCardFront';
import { InterviewCardBack } from '@/components/interview/InterviewCardBack';
import type { DeckConfig } from '@/lib/decks/types';
import { DECK_META } from '@/lib/decks/meta';

/**
 * 面试题集。
 *
 * - 调度参数照 docs/interview-deck-design.md 的对照表取值（更短的学习步长、
 *   更窄的插回窗口、更紧的间隔上限）；newCardsPerDay = 15 的每日新卡上限
 *   由队列引擎在 smart 模式执行（票 10）。
 * - 新卡按重要度引入（高频必答 → 常见 → 加分项，同级按 id）：排序能力经
 *   sortNewCards 注入通用队列引擎，引擎不认识 priority 字段（ADR-0004）。
 * - 会话模式：smart、sweep（全量扫题）与 single（单卡深链）。按分类/按重要度
 *   （复习维度）模式不在本票范围，全量扫题是票 11。
 * - 题库页（/interview/browse，票 13）：browsePath 与 meta 同一单一事实源，
 *   会话总结与空状态据此渲染"浏览题库"按钮。
 * - 背面分页数 = 代码段数（票 9 的多段代码轮播），无代码也是 1——键盘
 *   "上一/下一"键的钳制边界永远不会落到非法下标。
 */
export const interviewDeck: DeckConfig<InterviewCard> = {
  id: 'interview',
  name: DECK_META.interview.name,
  studyPath: DECK_META.interview.studyPath,
  browsePath: DECK_META.interview.browsePath,
  dataSource: {
    getAllCards: getAllInterviewCards,
    getCardById: getInterviewCardById,
  },
  schedulingParams: INTERVIEW_SCHEDULING_PARAMS,
  sessionModes: ['smart', 'sequential', 'sweep', 'single'],
  components: {
    CardFront: InterviewCardFront,
    CardBack: InterviewCardBack,
  },
  getBackPageCount: getInterviewBackPageCount,
  // 本题集没有 tags/difficulty 维度（标签云与难度分布无意义，留 undefined）；
  // 只派生全量扫题的分类 chips。
  getModePickerData: buildCategoryChips,
  // 自评条的命中区间锚：按当前卡要点数派生四档标注（ADR-0003）。
  getFeedbackAnchors: interviewFeedbackAnchors,
  // 新卡按重要度引入：有限的每日额度先花在会被问到的题上（ADR-0004）。
  sortNewCards: sortInterviewNewCards,
};
