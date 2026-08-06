import { describe, it, expect } from 'vitest';
import { deckIdFromPathname, navItemsForDeck } from '@/lib/decks/routes';

/**
 * 路径感知路由推导（票 12）：deckIdFromPathname 是「我在哪个题集」的唯一
 * 判断处，按段前缀匹配——绝不把 /studyxyz 之类误判成 /study。
 */

describe('deckIdFromPathname', () => {
  it('首页映射为 null', () => {
    expect(deckIdFromPathname('/')).toBeNull();
  });

  it('/study 与 /browse 及其子路径映射为 hot100', () => {
    expect(deckIdFromPathname('/study')).toBe('hot100');
    expect(deckIdFromPathname('/browse')).toBe('hot100');
    expect(deckIdFromPathname('/browse/xxx')).toBe('hot100');
    expect(deckIdFromPathname('/browse/foo/bar')).toBe('hot100');
  });

  it('/interview 及其子路径映射为 interview', () => {
    expect(deckIdFromPathname('/interview/study')).toBe('interview');
    expect(deckIdFromPathname('/interview/browse')).toBe('interview');
    expect(deckIdFromPathname('/interview')).toBe('interview');
  });

  it('未知路径映射为 null', () => {
    expect(deckIdFromPathname('/about')).toBeNull();
    expect(deckIdFromPathname('/foo/study')).toBeNull();
    expect(deckIdFromPathname('/')).toBeNull();
  });

  it('不被 /studyxyz 之类按前缀误判', () => {
    expect(deckIdFromPathname('/studyxyz')).toBeNull();
    expect(deckIdFromPathname('/browseabc')).toBeNull();
    expect(deckIdFromPathname('/study/extra')).toBe('hot100');
  });
});

describe('navItemsForDeck (底部导航项推导)', () => {
  it('hot100 → 学习 + 题库两项，href 正确', () => {
    expect(navItemsForDeck('hot100')).toEqual([
      { label: '学习', href: '/study' },
      { label: '题库', href: '/browse' },
    ]);
  });

  it('interview → 学习 + 题库（票 13 落地题库页后，题库指向 /interview/browse）', () => {
    expect(navItemsForDeck('interview')).toEqual([
      { label: '学习', href: '/interview/study' },
      { label: '题库', href: '/interview/browse' },
    ]);
  });

  it('首页（null）→ 空，底部导航隐藏', () => {
    expect(navItemsForDeck(null)).toEqual([]);
  });
});
