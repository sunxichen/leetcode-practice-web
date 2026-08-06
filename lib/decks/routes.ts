import type { DeckId } from './ids';
import { getDeckMeta } from './meta';

/**
 * 题集路由推导 — 「我在哪个题集」的唯一判断处。
 *
 * 组件（Header / BottomNav / 首页）一律走这里的纯函数做 pathname → 题集
 * 的映射，不在组件里散落 pathname 判断。纯函数在 Node 下可测。
 */

/**
 * 把 pathname 映射到题集标识。
 *
 * 规则（按段前缀匹配，避免 `/studyxyz` 之类被误判成 `/study`）：
 *   - `/`（首页）→ null
 *   - `/interview` 及其子路径 → 'interview'
 *   - `/study`、`/browse` 及其子路径 → 'hot100'
 *   - 其余 → null
 */
export function deckIdFromPathname(pathname: string): DeckId | null {
  if (pathname === '/') return null;
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first === 'interview') return 'interview';
  if (first === 'study' || first === 'browse') return 'hot100';
  return null;
}

/** 底部导航的一项。 */
export interface DeckNavItem {
  label: '学习' | '题库';
  href: string;
}

/**
 * 当前题集 → 底部导航项列表。组件只做渲染，推导全在这里（Node 可测）。
 *
 *   - 首页（deckId 为 null）→ []，底部导航不渲染；
 *   - 题集 → 「学习」指向该题集的 studyPath；「题库」仅当该题集定义了
 *     browsePath 时才出现（面试题集当前没有 → 只有「学习」，绝不指向
 *     /interview/browse 而 404）。
 */
export function navItemsForDeck(deckId: DeckId | null): DeckNavItem[] {
  if (deckId === null) return [];
  const meta = getDeckMeta(deckId);
  const items: DeckNavItem[] = [{ label: '学习', href: meta.studyPath }];
  if (meta.browsePath) items.push({ label: '题库', href: meta.browsePath });
  return items;
}
