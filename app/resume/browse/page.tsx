'use client';

import { BrowseDeckPage } from '@/components/browse/BrowseDeckPage';
import { resumeDeck } from '@/lib/decks/resume';

/** /resume/browse — 简历题库页。查阅不写入任何调度状态。 */
export default function ResumeBrowsePage() {
  return <BrowseDeckPage deck={resumeDeck} title="简历题库" />;
}
