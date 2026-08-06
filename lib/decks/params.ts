import type { SchedulingParams } from '@/lib/schedulingParams';
import { HOT100_SCHEDULING_PARAMS, INTERVIEW_SCHEDULING_PARAMS } from '@/lib/schedulingParams';
import type { DeckId } from './ids';

/**
 * 题集 → 调度参数映射 — 轻量，不含任何题库数据。
 *
 * useProgress 的进度归并需要每个题集的调度参数，但进度 Context 被首页
 * 引入，绝不能为此静态拉进完整题库（首屏会因第二个题集变重，票 12 硬要求）。
 * 调度参数本身就是纯常量（lib/schedulingParams），这里单独成一份轻量映射；
 * 题集配置 (lib/decks/*.ts) 里的 schedulingParams 引用同一份常量对象，取值
 * 天然同步，标定仍只存在 lib/schedulingParams 一处。
 */
export const DECK_SCHEDULING_PARAMS: Record<DeckId, SchedulingParams> = {
  hot100: HOT100_SCHEDULING_PARAMS,
  interview: INTERVIEW_SCHEDULING_PARAMS,
};
