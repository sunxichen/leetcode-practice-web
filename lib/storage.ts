import type { DailyStat, UserProgressData, QuestionProgress } from '@/lib/types';
import { isDeckId, type DeckId } from '@/lib/decks/ids';
import type { SchedulingParams } from '@/lib/schedulingParams';

/**
 * 进度文档的键名派生：localStorage 与 KV 共用同一条规则 `user_progress:<deckId>`
 * （ADR-0002，每个题集一份独立文档）。
 *
 * hot100 派生出的字符串与重构前硬编码的历史键名**逐字节相同**——用户的真实
 * 进度就存在那个键下，这一点有测试钉死。非法题集标识在这里抛错：绝不回落到
 * 任何默认键，否则一次拼错就会用空文档覆盖真实进度。
 */
export function progressKeyFor(deckId: DeckId): string {
  if (!isDeckId(deckId)) {
    throw new Error(`[storage] refusing to derive progress key for unknown deck: ${String(deckId)}`);
  }
  return `user_progress:${deckId}`;
}

/**
 * Migrate a single QuestionProgress entry from any prior shape to the current one.
 * Idempotent: if `state` and `dueAt` are already present, returns input unchanged.
 *
 * 缺省 EF 取自调用方注入的调度参数（按题集标定），不再直接引用某个题集的常量。
 */
function migrateProgressEntry(raw: Partial<QuestionProgress>, params: SchedulingParams): QuestionProgress {
  if (raw.state && typeof raw.dueAt === 'number') {
    return raw as QuestionProgress;
  }

  const proficiency = (raw.proficiency ?? 'new') as QuestionProgress['proficiency'];
  const isNew = proficiency === 'new' || (!raw.nextReviewDate && !raw.dueAt);

  const dueAt = raw.dueAt ?? raw.nextReviewDate ?? 0;
  const intervalDays = raw.intervalDays ?? raw.interval ?? 0;

  return {
    state: isNew ? 'new' : 'review',
    learningStep: 0,
    dueAt,
    intervalDays,
    easeFactor: raw.easeFactor ?? params.efDefault,
    level: raw.level ?? 0,
    proficiency,
    lastReviewDate: raw.lastReviewDate ?? 0,
    nextReviewDate: dueAt,
    interval: intervalDays,
  };
}

/**
 * 日统计迁移：票 10 之前的 DailyStat 没有 newIntroducedCount，补 0；
 * 已有此字段的条目原值保留，其余计数逐字段不动。损坏条目（JSON 合法
 * 但不是对象）安全丢弃——与 progress 条目同一原则，不让一次自评的
 * 统计更新抛错。幂等：对已迁移结果再跑一次，输出逐字段相同。
 */
function migrateDailyStats(raw: UserProgressData['dailyStats']): Record<string, DailyStat> {
  const migrated: Record<string, DailyStat> = {};
  for (const [day, stat] of Object.entries(raw ?? {})) {
    if (!stat || typeof stat !== 'object' || Array.isArray(stat)) continue;
    migrated[day] = {
      ...stat,
      newIntroducedCount: (stat as Partial<DailyStat>).newIntroducedCount ?? 0,
    };
  }
  return migrated;
}

function migrateProgressData(data: UserProgressData, params: SchedulingParams): UserProgressData {
  const migrated: Record<string, QuestionProgress> = {};
  const rawProgress =
    data.progress && typeof data.progress === 'object' && !Array.isArray(data.progress)
      ? data.progress
      : {};
  for (const [id, raw] of Object.entries(rawProgress)) {
    // 损坏条目（JSON 合法但不是对象）安全丢弃，而不是让整份文档的读取抛错。
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    migrated[id] = migrateProgressEntry(raw as Partial<QuestionProgress>, params);
  }
  return {
    ...data,
    progress: migrated,
    dailyStats: migrateDailyStats(data.dailyStats),
    streak: data.streak ?? { currentDays: 0, longestDays: 0, lastActiveDay: '' },
  };
}

interface StorageAdapter {
  get(): Promise<UserProgressData | null>;
  set(data: UserProgressData): Promise<void>;
}

class LocalStorageAdapter implements StorageAdapter {
  constructor(private key: string) {}

  async get(): Promise<UserProgressData | null> {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : null;
  }

  async set(data: UserProgressData): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}

class VercelKVAdapter implements StorageAdapter {
  private token = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_TOKEN ?? '')
    : '';

  constructor(private deckId: DeckId) {}

  private url(): string {
    return `/api/progress?deck=${encodeURIComponent(this.deckId)}`;
  }

  async get(): Promise<UserProgressData | null> {
    const res = await fetch(this.url(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!res.ok) throw new Error('Failed to fetch progress');
    return res.json();
  }

  async set(data: UserProgressData): Promise<void> {
    await fetch(this.url(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(data),
      keepalive: true,
    });
  }
}

export function createStorageAdapter(deckId: DeckId): StorageAdapter {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true') {
    return new LocalStorageAdapter(progressKeyFor(deckId));
  }
  return new VercelKVAdapter(deckId);
}

function createInitialProgress(): UserProgressData {
  return {
    lastUpdatedAt: Date.now(),
    lastSessionCursor: null,
    progress: {},
  };
}

function safeParse(raw: string | null): UserProgressData | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // JSON 合法但形状不是文档（标量、数组）同样视为损坏，安全丢弃。
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as UserProgressData;
  } catch (err) {
    console.warn('[storage] failed to parse local progress, dropping', err);
    return null;
  }
}

/** JSON 反序列化来的远端数据同样先做形状检查，垃圾按"不存在"处理。 */
function asProgressDocument(data: UserProgressData | null): UserProgressData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data;
}

/**
 * 双源归并：对一整份进度文档比 lastUpdatedAt，赢者全取（语义不变，见
 * ADR-0002——正因如此两个题集绝不能共用一份文档）。按题集各跑一次，
 * 只读写该题集自己的键。
 */
export async function reconcileProgress(
  deckId: DeckId,
  remoteAdapter: StorageAdapter,
  params: SchedulingParams,
): Promise<UserProgressData> {
  const key = progressKeyFor(deckId);
  const [remoteData, localRaw] = await Promise.all([
    remoteAdapter.get().catch(() => null),
    Promise.resolve(
      typeof window !== 'undefined' ? localStorage.getItem(key) : null
    ),
  ]);

  const remote = asProgressDocument(remoteData);
  const localData: UserProgressData | null = safeParse(localRaw);

  const remoteTs = remote?.lastUpdatedAt ?? 0;
  const localTs = localData?.lastUpdatedAt ?? 0;

  let winner: UserProgressData;

  if (!remote && !localData) {
    winner = createInitialProgress();
  } else if (localTs > remoteTs) {
    winner = localData!;
    remoteAdapter.set(winner).catch(() => {});
  } else {
    winner = remote!;
  }

  winner = migrateProgressData(winner, params);

  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(winner));
  }

  return winner;
}

export type { StorageAdapter };
