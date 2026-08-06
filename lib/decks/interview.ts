import type { InterviewCard, InterviewCategory } from '@/lib/interview-types';
import { getAllInterviewCards, getInterviewCardById, sortInterviewNewCards } from '@/lib/interview';
import { getInterviewBackPageCount } from '@/lib/interview-back';
import { INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import { keyPointAnchors } from '@/lib/feedbackAnchors';
import { InterviewCardFront } from '@/components/interview/InterviewCardFront';
import { InterviewCardBack } from '@/components/interview/InterviewCardBack';
import type { DeckConfig, ModePickerData } from '@/lib/decks/types';

/** 分类 → 中文展示名（全量扫题的 chips 用）。只在本题集侧定义，不塞进通用组件。 */
const CATEGORY_LABELS: Record<InterviewCategory, string> = {
  'dl-basics': '深度学习基础',
  project: '项目深挖',
  'tech-stack': '技术路线',
};

/** 分类的展示顺序（与 lib/interview-schema.mjs 的 CATEGORIES 一致）。 */
const CATEGORY_ORDER: InterviewCategory[] = ['project', 'tech-stack', 'dl-basics'];

/** 全量扫题的分类 chips：从卡片集派生各分类的卡数，只列有卡的分类（不编造零值）。 */
function getInterviewModePickerData(cards: InterviewCard[]): ModePickerData {
  const categories = CATEGORY_ORDER
    .map((cat) => {
      const count = cards.filter((c) => c.category === cat).length;
      return count > 0 ? { value: cat, label: CATEGORY_LABELS[cat], count } : null;
    })
    .filter((x): x is { value: InterviewCategory; label: string; count: number } => x !== null);
  return { categories };
}

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
 * - 本题集还没有题库页（/interview/browse 是票 13）：browsePath 留 undefined，
 *   会话总结与空状态不渲染"浏览题库"按钮。
 * - 背面分页数 = 代码段数（票 9 的多段代码轮播），无代码也是 1——键盘
 *   "上一/下一"键的钳制边界永远不会落到非法下标。
 */
export const interviewDeck: DeckConfig<InterviewCard> = {
  id: 'interview',
  name: '面试题集',
  dataSource: {
    getAllCards: getAllInterviewCards,
    getCardById: getInterviewCardById,
  },
  schedulingParams: INTERVIEW_SCHEDULING_PARAMS,
  sessionModes: ['smart', 'sweep', 'single'],
  components: {
    CardFront: InterviewCardFront,
    CardBack: InterviewCardBack,
  },
  getBackPageCount: getInterviewBackPageCount,
  // 本题集没有 tags/difficulty 维度（标签云与难度分布无意义，留 undefined）；
  // 只派生全量扫题的分类 chips。
  getModePickerData: getInterviewModePickerData,
  // 自评条的命中区间锚：按当前卡要点数派生四档标注（ADR-0003）。
  getFeedbackAnchors: (card) => keyPointAnchors(card.answer.key_points.length),
  // 新卡按重要度引入：有限的每日额度先花在会被问到的题上（ADR-0004）。
  sortNewCards: sortInterviewNewCards,
};
