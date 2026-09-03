import type { InterviewCard } from '@/lib/interview-types';
import { getAllResumeCards, getResumeCardById } from '@/lib/resume';
import { getInterviewBackPageCount } from '@/lib/interview-back';
import { INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { interviewFeedbackAnchors } from '@/lib/feedbackAnchors';
import { sortInterviewNewCards } from '@/lib/interview-sorting';
import { buildCategoryChips } from '@/lib/interview-facets';
import { InterviewCardFront } from '@/components/interview/InterviewCardFront';
import { InterviewCardBack } from '@/components/interview/InterviewCardBack';
import type { DeckConfig, ModePickerData } from '@/lib/decks/types';
import { DECK_META } from '@/lib/decks/meta';

/**
 * 简历题集。
 *
 * 与面试题集共用同一套卡片 schema（InterviewCard）与调度标定值——内容形态
 * 相同，卡片正反面组件、自评锚、新卡引入顺序与背面分页全部复用面试题集的；
 * 差异只有数据源与路由。卡片正反面渲染组件由会话外壳经 FlashCard 注入，
 * 互链与"去复习"的去向由外壳按题集学习路由构建（InterviewCardBack 的
 * studyHref/getCardById 参数）。
 */
export const resumeDeck: DeckConfig<InterviewCard> = {
  id: 'resume',
  name: DECK_META.resume.name,
  studyPath: DECK_META.resume.studyPath,
  browsePath: DECK_META.resume.browsePath,
  dataSource: {
    getAllCards: getAllResumeCards,
    getCardById: getResumeCardById,
  },
  schedulingParams: INTERVIEW_SCHEDULING_PARAMS,
  sessionModes: ['smart', 'sequential', 'sweep', 'single'],
  components: {
    CardFront: InterviewCardFront,
    CardBack: InterviewCardBack,
  },
  getBackPageCount: getInterviewBackPageCount,
  getModePickerData: (cards): ModePickerData => buildCategoryChips(cards),
  getFeedbackAnchors: interviewFeedbackAnchors,
  sortNewCards: sortInterviewNewCards,
};
