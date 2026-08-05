import type { DailyStat, QuestionProgress } from '@/lib/types';

/**
 * 每日统计 (DailyStat) —— 题集内按本地日期 (YYYY-MM-DD) 归档的聚合计数。
 *
 * 纯函数缝（与 lib/studyQueue.ts 同一模式）：useProgress 的自评写入路径
 * 与 useStudyQueue 的新卡额度读取都走这里，Node 下可独立测试。归档键的
 * 时区规则全仓库只有这一份——跨天重置是它的自然结果：新日期从 0 建立，
 * 历史日期原样保留，绝不全量删除。
 */

/** 本地时区的 YYYY-MM-DD：每日统计与连续天数的归档键。 */
export function ymd(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 新日期的起始统计：全部计数从 0 建立。 */
export function emptyDailyStat(): DailyStat {
  return { reviewedCount: 0, graduatedCount: 0, lapseCount: 0, newIntroducedCount: 0 };
}

/**
 * 这次自评是不是一张全新卡的首次引入：与队列引擎的 brand-new 判定同一条
 * 规则（无进度条目 / state 为 new / proficiency 为 new）。对一张全新卡的
 * Again/Hard/Good/Easy 都只算引入 1 次；同卡再次自评时它已进入
 * learning/review，不再计入。
 */
export function isFirstIntroduction(prev: QuestionProgress | undefined): boolean {
  return !prev || prev.state === 'new' || prev.proficiency === 'new';
}

/**
 * 记录一次自评后的每日统计。reviewedCount 每次 +1；graduated / lapse 按
 * 状态迁移判定（语义与票 5 之前逐位相同）；newIntroducedCount 只在全新卡
 * 首次引入时 +1。撤销恢复整份 prevDailyStats，首次引入的额度随之归还。
 */
export function bumpDailyStats(
  stats: Record<string, DailyStat>,
  today: string,
  prevState: QuestionProgress | undefined,
  nextState: QuestionProgress,
): Record<string, DailyStat> {
  const cur: DailyStat = stats[today] ?? emptyDailyStat();
  const graduated =
    (!prevState || prevState.state === 'new' || prevState.state === 'learning') &&
    nextState.state === 'review';
  const lapsed = prevState?.state === 'review' && nextState.state === 'relearning';
  const introduced = isFirstIntroduction(prevState);
  return {
    ...stats,
    [today]: {
      reviewedCount: cur.reviewedCount + 1,
      graduatedCount: cur.graduatedCount + (graduated ? 1 : 0),
      lapseCount: cur.lapseCount + (lapsed ? 1 : 0),
      newIntroducedCount: cur.newIntroducedCount + (introduced ? 1 : 0),
    },
  };
}
