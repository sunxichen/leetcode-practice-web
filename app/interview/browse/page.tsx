'use client';

import { BrowseDeckPage } from '@/components/browse/BrowseDeckPage';
import { interviewDeck } from '@/lib/decks/interview';

/**
 * /interview/browse — 面试题库页。查阅与复习是两种行为：就地展开只读答案
 * 不写任何调度状态；「去复习」行内入口进单卡自评。题集差异全部由
 * BrowseDeckPage 的 props 注入，本页只提供题集配置与标题。
 */
export default function InterviewBrowsePage() {
  return <BrowseDeckPage deck={interviewDeck} title="面试题库" />;
}
