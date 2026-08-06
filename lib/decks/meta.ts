import type { DeckId } from './ids';

/**
 * 题集的路由与展示元数据 — 只含字符串，不含任何题库数据。
 *
 * 首页要同时显示两个题集的入口（name + studyPath）并据此计算计数，但绝不能
 * 为此静态引入完整题库（首屏会变重，见票 12 硬要求）。所以 name / studyPath /
 * browsePath 收在这么一份轻量模块里（与 ids.ts 同一理由：只为几个字符串
 * 引入题库数据不值得）。题集配置 (lib/decks/*.ts) 里的同名字段引用这里，
 * 保证单一事实源 — 改路由只改这一处。
 *
 * 新增题集 = 在 ids.ts 加标识、在这里加一条元数据、在注册表加映射。
 */
export interface DeckMeta {
  id: DeckId;
  /** 题集显示名：首页入口卡、路径感知头部品牌的标题。 */
  name: string;
  /** 学习路由：首页入口卡与底部导航「学习」的去向。 */
  studyPath: string;
  /** 题库页路由：底部导航「题库」的去向。题集没有题库页时为 undefined，
   * 「题库」tab 不渲染（面试题集当前如此，票 13 落地后补上）。 */
  browsePath?: string;
}

export const DECK_META: Record<DeckId, DeckMeta> = {
  hot100: {
    id: 'hot100',
    name: 'LeetCode Hot 100',
    studyPath: '/study',
    browsePath: '/browse',
  },
  interview: {
    id: 'interview',
    name: '面试题集',
    studyPath: '/interview/study',
    // 本题集还没有题库页（票 13）：「题库」tab 本票不渲染。
  },
};

/** 按题集标识取出路由/展示元数据。标识是编译期受检的联合类型。 */
export function getDeckMeta(id: DeckId): DeckMeta {
  return DECK_META[id];
}
