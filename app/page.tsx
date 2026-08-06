'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useDeckProgress } from '@/context/ProgressContext';
import { DECK_IDS, type DeckId } from '@/lib/decks/ids';
import { getDeckMeta } from '@/lib/decks/meta';
import { summarizeDeckCounts } from '@/lib/decks/counts';
import { BackupControls } from '@/components/backup/BackupControls';
import deckSummary from '@/data/deck-summary.json';
import styles from './page.module.css';

/**
 * 首页 — 两个题集的入口页（票 12）。打开应用第一眼就知道今天该刷哪边。
 *
 * 计数只读轻量摘要 data/deck-summary.json（几 KB）与该题集的进度文档求交集，
 * 绝不静态引入任何完整题库（lib/questions / lib/interview / questions.json /
 * data/interview/*.json）——首屏不能因第二个题集变重（硬要求，审查会看
 * import 图）。题集名与路由来自轻量模块 lib/decks/meta.ts。
 */
export default function Home() {
  // 每个题集各取一份进度（ADR-0002 按题集分键），与摘要 id 列表求交集算计数。
  const decks = {
    hot100: useDeckProgress('hot100'),
    interview: useDeckProgress('interview'),
  };

  const entries = useMemo(() => {
    return DECK_IDS.map((id) => {
      const meta = getDeckMeta(id);
      const deck = decks[id];
      // 加载中显示占位，不显示错误的 0。now() 快照仅用于本 render 的计数派生。
      const now = Date.now();
      const counts = deck.isLoading ? null : summarizeDeckCounts(summaryCardIds(id), deck.progressData.progress, now);
      return { id, meta, isLoading: deck.isLoading, counts };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks.hot100.progressData.progress, decks.hot100.isLoading, decks.interview.progressData.progress, decks.interview.isLoading]);

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <h1 className={styles.title}>今天刷哪边？</h1>
        <p className={styles.subtitle}>两个题集各自的待复习与新卡一目了然</p>
      </header>

      <div className={styles.deckList}>
        {entries.map(({ id, meta, isLoading, counts }) => (
          <Link key={id} href={meta.studyPath} className={styles.card}>
            <span className={styles.cardTitle}>{meta.name}</span>
            <span className={styles.cardCounts}>
              {isLoading || counts === null
                ? '—'
                : `${counts.dueCount} 待复习 · ${counts.newCount} 新卡`}
            </span>
            <span className={styles.cardGo}>开始学习 →</span>
          </Link>
        ))}
      </div>

      <BackupControls />
    </div>
  );
}

/** 从轻量摘要取某题集的 id 列表（题集标识是编译期受检的联合类型）。
 * 只读摘要，不触及任何完整题库。 */
function summaryCardIds(id: DeckId): string[] {
  return deckSummary.decks[id].cardIds;
}
