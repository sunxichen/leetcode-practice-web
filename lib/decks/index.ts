import { hot100Deck } from '@/lib/decks/hot100';
import { interviewDeck } from '@/lib/decks/interview';
import { resumeDeck } from '@/lib/decks/resume';
import type { DeckId } from '@/lib/decks/ids';

/**
 * 题集注册表 — 按题集标识取出题集配置。
 *
 * 新增题集 = 在 lib/decks/ids.ts 的 DECK_IDS 加标识、在这里加一条映射；
 * 下面这条 satisfies 让两边不一致时直接编译失败（票 5 的进度读写白名单
 * 与并行加载以 DECK_IDS 为据，二者必须永远同步）。
 */
const DECKS = {
  hot100: hot100Deck,
  interview: interviewDeck,
  resume: resumeDeck,
} satisfies Record<DeckId, unknown>;

/** 按题集标识取出配置。标识是编译期受检的联合类型，非法标识在类型层即被拒绝；
 * 返回类型按传入的字面量收窄，调用方拿到的是该题集自己的卡片类型参数。 */
export function getDeckConfig<I extends DeckId>(id: I): (typeof DECKS)[I] {
  return DECKS[id];
}

export type { DeckId };
export { DECK_IDS, isDeckId } from '@/lib/decks/ids';
export type { DeckConfig } from '@/lib/decks/types';
