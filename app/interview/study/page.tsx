'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudySessionShell } from '@/components/study/StudySessionShell';
import { getDeckConfig } from '@/lib/decks';

/**
 * 本页服务的题集。卡片数据源、调度参数、可选会话模式清单与卡片正反面组件
 * 全部从题集配置取用，本页不直接引用任何题集的常量与卡面组件。
 */
const deck = getDeckConfig('interview');

/**
 * /interview/study — 面试题集的学习路由（票 8，ADR-0005 并列路由）。薄壳：
 * 只负责选题集、读路由 query（?q= 单卡深链）、提供单卡完成后的路由动作；
 * 会话状态机全部在与题集无关的 useStudySession + StudySessionShell 里。
 * 现有 /study 与 ?q= 深链一律不变。
 */
function InterviewStudyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedCardId = searchParams?.get('q') ?? null;

  // 单卡模式自评完成后回本题集的模式选择页——面试题集的题库页是票 13，
  // 本票没有可回的列表页。
  const handleSingleComplete = useCallback(() => {
    router.push('/interview/study');
  }, [router]);

  return (
    <StudySessionShell
      deck={deck}
      focusedCardId={focusedCardId}
      onSingleComplete={handleSingleComplete}
    />
  );
}

export default function InterviewStudyPage() {
  return (
    <Suspense fallback={null}>
      <InterviewStudyPageInner />
    </Suspense>
  );
}
