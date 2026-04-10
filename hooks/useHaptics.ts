'use client';

import { useCallback } from 'react';

export function useHaptics() {
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = useCallback((pattern: number | number[] = 10) => {
    if (canVibrate) {
      try { navigator.vibrate(pattern); } catch { /* silent fallback */ }
    }
  }, [canVibrate]);

  return { trigger, canVibrate };
}
