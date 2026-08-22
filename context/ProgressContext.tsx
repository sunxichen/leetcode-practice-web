'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useProgress, type DeckProgressValue } from '@/hooks/useProgress';
import { DECK_IDS, type DeckId } from '@/lib/decks/ids';

const defaultDeckValue: DeckProgressValue = {
  progressData: { lastUpdatedAt: 0, lastSessionCursor: null, progress: {} },
  updateProgress: () => {},
  saveSessionCursor: () => {},
  saveSequentialCursor: () => {},
  undoLast: () => false,
  undoSnapshot: null,
  isLoading: true,
};

/**
 * 进度按题集分键存放（ADR-0002）：Context 持有每个题集各一份的文档，
 * 并行加载、按题集标识取用，写入只影响对应那一份。
 */
const ProgressContext = createContext<Record<DeckId, DeckProgressValue>>(
  Object.fromEntries(DECK_IDS.map((id) => [id, defaultDeckValue])) as Record<DeckId, DeckProgressValue>,
);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { byDeck } = useProgress();
  return <ProgressContext.Provider value={byDeck}>{children}</ProgressContext.Provider>;
}

/** 按题集取用进度。标识是编译期受检的联合类型，非法标识在类型层即被拒绝。 */
export function useDeckProgress(deckId: DeckId): DeckProgressValue {
  return useContext(ProgressContext)[deckId];
}

export type { DeckProgressValue };
export type { UndoSnapshot } from '@/hooks/useProgress';
