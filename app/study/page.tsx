'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudySessionShell } from '@/components/study/StudySessionShell';
import { getDeckConfig } from '@/lib/decks';

/**
 * 本页服务的题集。卡片数据源、调度参数、可选会话模式清单与卡片正反面组件
 * 全部从题集配置取用，本页不直接引用任何题集的常量与卡面组件。
 */
const deck = getDeckConfig('hot100');

/**
 * /study — LeetCode 题集的学习路由。票 6 起是薄壳（ADR-0005）：只负责选
 * 题集、读路由 query（?q= 单卡深链）、提供单卡完成后的路由动作；会话
 * 状态机全部在与题集无关的 useStudySession + StudySessionShell 里。
 */
function StudyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedCardId = searchParams?.get('q') ?? null;

  // 单卡模式自评完成后回题库页——这是路由策略，注入通用会话外壳。
  const handleSingleComplete = useCallback(() => {
    router.push('/browse');
  }, [router]);

  return (
    <StudySessionShell
      deck={deck}
      focusedCardId={focusedCardId}
      onSingleComplete={handleSingleComplete}
    />
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <StudyPageInner />
    </Suspense>
  );
}
