'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudySessionShell } from '@/components/study/StudySessionShell';
import { resumeDeck } from '@/lib/decks/resume';

/**
 * /resume/study — 简历题集的学习路由（与面试题集并列，ADR-0005）。薄壳：
 * 只负责题集、读路由 query（?q= 单卡深链）与单卡完成后的路由动作；会话
 * 状态机全部在与题集无关的 useStudySession + StudySessionShell 里。
 */
function ResumeStudyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedCardId = searchParams?.get('q') ?? null;

  const handleSingleComplete = useCallback(() => {
    router.push(resumeDeck.studyPath);
  }, [router]);

  return (
    <StudySessionShell
      deck={resumeDeck}
      focusedCardId={focusedCardId}
      onSingleComplete={handleSingleComplete}
    />
  );
}

export default function ResumeStudyPage() {
  return (
    <Suspense fallback={null}>
      <ResumeStudyPageInner />
    </Suspense>
  );
}
