import type { UserProgressData, QuestionProgress } from '@/lib/types';
import { LOCAL_STORAGE_KEY, EF_DEFAULT } from '@/lib/constants';

/**
 * Migrate a single QuestionProgress entry from any prior shape to the current one.
 * Idempotent: if `state` and `dueAt` are already present, returns input unchanged.
 */
function migrateProgressEntry(raw: Partial<QuestionProgress>): QuestionProgress {
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
    easeFactor: raw.easeFactor ?? EF_DEFAULT,
    level: raw.level ?? 0,
    proficiency,
    lastReviewDate: raw.lastReviewDate ?? 0,
    nextReviewDate: dueAt,
    interval: intervalDays,
  };
}

function migrateProgressData(data: UserProgressData): UserProgressData {
  const migrated: Record<string, QuestionProgress> = {};
  for (const [id, raw] of Object.entries(data.progress ?? {})) {
    migrated[id] = migrateProgressEntry(raw as Partial<QuestionProgress>);
  }
  return { ...data, progress: migrated };
}

interface StorageAdapter {
  get(): Promise<UserProgressData | null>;
  set(data: UserProgressData): Promise<void>;
}

class LocalStorageAdapter implements StorageAdapter {
  async get(): Promise<UserProgressData | null> {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async set(data: UserProgressData): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  }
}

class VercelKVAdapter implements StorageAdapter {
  private token = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_TOKEN ?? '')
    : '';

  async get(): Promise<UserProgressData | null> {
    const res = await fetch('/api/progress', {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!res.ok) throw new Error('Failed to fetch progress');
    return res.json();
  }

  async set(data: UserProgressData): Promise<void> {
    await fetch('/api/progress', {
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

export function createStorageAdapter(): StorageAdapter {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE === 'true') {
    return new LocalStorageAdapter();
  }
  return new VercelKVAdapter();
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
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[storage] failed to parse local progress, dropping', err);
    return null;
  }
}

export async function reconcileProgress(
  remoteAdapter: StorageAdapter,
): Promise<UserProgressData> {
  const [remoteData, localRaw] = await Promise.all([
    remoteAdapter.get().catch(() => null),
    Promise.resolve(
      typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null
    ),
  ]);

  const localData: UserProgressData | null = safeParse(localRaw);

  const remoteTs = remoteData?.lastUpdatedAt ?? 0;
  const localTs = localData?.lastUpdatedAt ?? 0;

  let winner: UserProgressData;

  if (!remoteData && !localData) {
    winner = createInitialProgress();
  } else if (localTs > remoteTs) {
    winner = localData!;
    remoteAdapter.set(winner).catch(() => {});
  } else {
    winner = remoteData!;
  }

  winner = migrateProgressData(winner);

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(winner));
  }

  return winner;
}

export type { StorageAdapter };
