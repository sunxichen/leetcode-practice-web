import { hot100Deck } from '@/lib/decks/hot100';

/**
 * 题集注册表 — 按题集标识取出题集配置。
 *
 * 目前只注册 LeetCode 题集；面试题集在票 8 注册。新增题集 = 在这里加一条
 * 映射，DECK_IDS 与 DeckId 随之自动扩展（票 5 的进度读写白名单与并行加载
 * 以 DECK_IDS 为据）。
 */
const DECKS = {
  hot100: hot100Deck,
} as const;

/** 题集标识：已注册题集的键名。 */
export type DeckId = keyof typeof DECKS;

/** 全部已注册题集的标识。 */
export const DECK_IDS = Object.keys(DECKS) as DeckId[];

/** 按题集标识取出配置。标识是编译期受检的联合类型，非法标识在类型层即被拒绝。 */
export function getDeckConfig(id: DeckId): (typeof DECKS)[DeckId] {
  return DECKS[id];
}

export type { DeckConfig } from '@/lib/decks/types';
