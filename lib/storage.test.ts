import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  progressKeyFor,
  reconcileProgress,
  createStorageAdapter,
  type StorageAdapter,
} from '@/lib/storage';
import { DECK_IDS, isDeckId } from '@/lib/decks/ids';
import { HOT100_SCHEDULING_PARAMS, type SchedulingParams } from '@/lib/schedulingParams';
import type { UserProgressData, QuestionProgress } from '@/lib/types';

/**
 * 缝三：进度归并（PRD Testing Decisions）——全项目最坏失败模式（丢进度）所在。
 * 纯函数 + 可注入的存储适配器；localStorage 以内存实现 stub，window 置空对象
 * 让 storage.ts 的 `typeof window !== 'undefined'` 分支生效。
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HOT100_KEY = 'user_progress:hot100';

/** 区别于所有题集真实取值的哨兵 efDefault：断言缺省 EF 来自注入的参数对象。 */
const SENTINEL_PARAMS: SchedulingParams = { ...HOT100_SCHEDULING_PARAMS, efDefault: 1.999 };

function doc(partial: Partial<UserProgressData> & { lastUpdatedAt: number }): UserProgressData {
  return { lastSessionCursor: null, progress: {}, ...partial };
}

/** 当前形状的进度条目（state 与 dueAt 都在，迁移原样通过）。 */
function currentEntry(overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    state: 'review',
    learningStep: 0,
    dueAt: 1_700_000_000_000,
    intervalDays: 3,
    easeFactor: 2.5,
    level: 2,
    proficiency: 'good',
    lastReviewDate: 1_699_000_000_000,
    nextReviewDate: 1_700_000_000_000,
    interval: 3,
    ...overrides,
  };
}

function fakeRemote(initial: UserProgressData | null) {
  const state = { data: initial, setCalls: [] as UserProgressData[] };
  const adapter: StorageAdapter = {
    async get() {
      return state.data;
    },
    async set(data) {
      state.setCalls.push(data);
      state.data = data;
    },
  };
  return { adapter, state };
}

describe('进度键名派生 (progressKeyFor)', () => {
  it('hot100 派生出与历史键名逐字节相同的字符串', () => {
    // 历史键名 = 重构前 lib/constants.ts 的 LOCAL_STORAGE_KEY 与
    // app/api/progress/route.ts 的 KV_KEY 硬编码值 'user_progress:hot100'，
    // 用户的真实进度就存在这个键下。toBe 对字符串是逐字节比较。
    expect(progressKeyFor('hot100')).toBe('user_progress:hot100');
  });

  it('非法题集标识抛错，绝不回落到默认键', () => {
    const badIds = ['HOT100', 'hot100 ', ' hot100', 'hot100x', '', 'interviews', 'user_progress:hot100'];
    for (const bad of badIds) {
      expect(() => progressKeyFor(bad as never), `should reject "${bad}"`).toThrow();
    }
    expect(() => progressKeyFor(null as never)).toThrow();
    expect(() => progressKeyFor(undefined as never)).toThrow();
  });

  it('isDeckId 白名单只接受已注册题集', () => {
    expect(isDeckId('hot100')).toBe(true);
    expect(isDeckId('interview')).toBe(true); // 票 8 已注册
    expect(isDeckId('')).toBe(false);
    expect(isDeckId(null)).toBe(false);
    expect(isDeckId(42)).toBe(false);
    expect(DECK_IDS).toEqual(['hot100', 'interview']);
  });

  it('interview 派生出自己那份文档的键名', () => {
    expect(progressKeyFor('interview')).toBe('user_progress:interview');
  });
});

describe('进度归并 (reconcileProgress)', () => {
  it('本地较新时以本地为准并回写远端', async () => {
    const local = doc({ lastUpdatedAt: 2000, progress: { '1': currentEntry({ easeFactor: 2.3 }) } });
    storage.setItem(HOT100_KEY, JSON.stringify(local));
    const remote = fakeRemote(doc({ lastUpdatedAt: 1000, progress: {} }));

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(winner.lastUpdatedAt).toBe(2000);
    expect(winner.progress['1'].easeFactor).toBe(2.3);
    // 回写远端：本地赢家被推到远端适配器
    expect(remote.state.setCalls).toHaveLength(1);
    expect(remote.state.setCalls[0]).toEqual(local);
    // 本地落盘的是迁移后的 winner
    const persisted = JSON.parse(storage.getItem(HOT100_KEY)!) as UserProgressData;
    expect(persisted.progress['1'].easeFactor).toBe(2.3);
  });

  it('远端较新时以远端为准，不回写远端', async () => {
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 1000, progress: { old: currentEntry() } })));
    const remote = fakeRemote(doc({ lastUpdatedAt: 2000, progress: { '7': currentEntry() } }));

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(winner.lastUpdatedAt).toBe(2000);
    expect(winner.progress['7']).toBeDefined();
    expect(winner.progress.old).toBeUndefined();
    expect(remote.state.setCalls).toHaveLength(0);
    // 远端赢家落到本地
    const persisted = JSON.parse(storage.getItem(HOT100_KEY)!) as UserProgressData;
    expect(persisted.lastUpdatedAt).toBe(2000);
    expect(persisted.progress['7']).toBeDefined();
  });

  it('两侧皆空时产出初始结构', async () => {
    const remote = fakeRemote(null);
    const before = Date.now();

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(winner.progress).toEqual({});
    expect(winner.lastSessionCursor).toBeNull();
    expect(winner.lastUpdatedAt).toBeGreaterThanOrEqual(before);
    // 迁移补全的默认字段
    expect(winner.dailyStats).toEqual({});
    expect(winner.streak).toEqual({ currentDays: 0, longestDays: 0, lastActiveDay: '' });
    expect(remote.state.setCalls).toHaveLength(0);
    // 初始结构落盘，下次读取有文档可依
    expect(storage.getItem(HOT100_KEY)).toBeTruthy();
  });

  it('损坏的本地数据（JSON 解析失败）被安全丢弃而非抛错', async () => {
    storage.setItem(HOT100_KEY, '{not valid json');
    const remote = fakeRemote(doc({ lastUpdatedAt: 5000, progress: { '3': currentEntry() } }));

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(winner.lastUpdatedAt).toBe(5000);
    expect(winner.progress['3']).toBeDefined();
  });

  it('JSON 合法但不是文档形状的本地数据同样被安全丢弃', async () => {
    for (const garbage of ['"just a string"', '[1,2,3]', '42', 'null']) {
      storage.clear();
      storage.setItem(HOT100_KEY, garbage);
      const remote = fakeRemote(doc({ lastUpdatedAt: 5000, progress: { '3': currentEntry() } }));

      const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

      expect(winner.lastUpdatedAt).toBe(5000);
      expect(winner.progress['3']).toBeDefined();
    }
  });

  it('损坏的卡片条目被逐个丢弃，其余条目正常迁移，整体不抛错', async () => {
    const local = doc({
      lastUpdatedAt: 9000,
      progress: {
        good: currentEntry({ easeFactor: 2.2 }),
        corrupt1: null,
        corrupt2: 'garbage',
        corrupt3: 42,
        corrupt4: [1, 2],
      } as unknown as Record<string, QuestionProgress>,
    });
    storage.setItem(HOT100_KEY, JSON.stringify(local));
    const remote = fakeRemote(doc({ lastUpdatedAt: 1000 }));

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(Object.keys(winner.progress)).toEqual(['good']);
    expect(winner.progress.good.easeFactor).toBe(2.2);
  });

  it('旧字段结构迁移正确：无 state/dueAt 的条目按镜像字段重建', async () => {
    const legacy = {
      proficiency: 'good',
      nextReviewDate: 1_700_000_000_000,
      interval: 6,
      easeFactor: 2.1,
      level: 3,
      lastReviewDate: 1_699_990_000_000,
    };
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 9000, progress: { q1: legacy } })));
    const remote = fakeRemote(null);

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);
    const q = winner.progress.q1;

    expect(q.state).toBe('review');
    expect(q.dueAt).toBe(1_700_000_000_000);
    expect(q.intervalDays).toBe(6);
    expect(q.easeFactor).toBe(2.1);
    expect(q.level).toBe(3);
    expect(q.learningStep).toBe(0);
    expect(q.lastReviewDate).toBe(1_699_990_000_000);
    expect(q.proficiency).toBe('good');
    // 旧镜像字段保持同步
    expect(q.nextReviewDate).toBe(q.dueAt);
    expect(q.interval).toBe(q.intervalDays);
  });

  it('迁移幂等：对迁移结果再跑一次归并，结果逐字段相同', async () => {
    const legacy = { proficiency: 'hard', nextReviewDate: 1_700_000_100_000, interval: 2 };
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 9000, progress: { q1: legacy } })));
    const remote = fakeRemote(null);

    const first = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);
    // 第二次归并面对的是第一次写回的已迁移文档（本地）与未迁移的回写文档（远端），
    // 两条路径都必须产出与第一次逐字段相同的结果。
    const second = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(second).toEqual(first);
  });

  it('迁移缺省 EF 取自注入的调度参数，而非某个题集的常量', async () => {
    const legacyNoEF = { proficiency: 'good', nextReviewDate: 1_700_000_000_000, interval: 6 };
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 9000, progress: { q1: legacyNoEF } })));
    const remote = fakeRemote(null);

    const winner = await reconcileProgress('hot100', remote.adapter, SENTINEL_PARAMS);

    expect(winner.progress.q1.easeFactor).toBe(1.999);
    expect(winner.progress.q1.easeFactor).not.toBe(HOT100_SCHEDULING_PARAMS.efDefault);
  });

  it('【已知矛盾，按现状钉死】proficiency 非 new 但缺到期字段的旧条目被判为 new', async () => {
    // lib/sm2.ts 的归一化对同一条目按 proficiency 判为 review，与本迁移规则
    // （缺到期字段一律 new）矛盾。票 5 不统一两者，仅把迁移侧现状钉死，
    // 待决策者定夺后统一修改。
    const legacyNoDue = { proficiency: 'good', easeFactor: 2.4, lastReviewDate: 1_699_000_000_000 };
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 9000, progress: { q1: legacyNoDue } })));
    const remote = fakeRemote(null);

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(winner.progress.q1.state).toBe('new');
    expect(winner.progress.q1.dueAt).toBe(0);
    expect(winner.progress.q1.proficiency).toBe('good');
  });

  it('不同题集的读写互不干扰：归并 hot100 不触碰其他题集的键', async () => {
    // 模拟未来第二个题集的键（票 8 注册 interview 后它才进入白名单；
    // 这里直接放原始字符串验证键级隔离）。
    const INTERVIEW_KEY = 'user_progress:interview';
    const interviewRaw = JSON.stringify(
      doc({ lastUpdatedAt: 7777, progress: { x: currentEntry({ easeFactor: 1.8 }) } }),
    );
    storage.setItem(INTERVIEW_KEY, interviewRaw);
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 1000, progress: { h: currentEntry() } })));
    const remote = fakeRemote(doc({ lastUpdatedAt: 2000, progress: { h2: currentEntry() } }));

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    // hot100 按自己的两源归并（远端较新 → 远端赢），不含另一个题集的卡
    expect(winner.progress.h2).toBeDefined();
    expect(winner.progress.h).toBeUndefined();
    expect(winner.progress.x).toBeUndefined();
    // 另一个题集的本地键逐字节未被触碰
    expect(storage.getItem(INTERVIEW_KEY)).toBe(interviewRaw);
  });

  it('不同题集的读写互不干扰：本地较新时的回写只影响本题集', async () => {
    const INTERVIEW_KEY = 'user_progress:interview';
    const interviewRaw = JSON.stringify(doc({ lastUpdatedAt: 1 }));
    storage.setItem(INTERVIEW_KEY, interviewRaw);
    storage.setItem(HOT100_KEY, JSON.stringify(doc({ lastUpdatedAt: 9000, progress: { h: currentEntry() } })));
    const remote = fakeRemote(doc({ lastUpdatedAt: 1000 }));

    await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    expect(storage.getItem(INTERVIEW_KEY)).toBe(interviewRaw);
    // 回写远端的是 hot100 的文档
    expect(remote.state.data?.lastUpdatedAt).toBe(9000);
    expect(remote.state.data?.progress.h).toBeDefined();
  });
});

describe('存储适配器 (createStorageAdapter)', () => {
  it('KV 适配器按题集标识请求 API', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(null), { status: 200 });
      }),
    );

    const adapter = createStorageAdapter('hot100');
    await adapter.get();
    expect(calls[0].url).toBe('/api/progress?deck=hot100');

    await adapter.set(doc({ lastUpdatedAt: 1 }));
    expect(calls[1].url).toBe('/api/progress?deck=hot100');
    expect(calls[1].init?.method).toBe('POST');
  });

  it('本地适配器读写本题集的派生键', async () => {
    process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE = 'true';
    try {
      const adapter = createStorageAdapter('hot100');
      await adapter.set(doc({ lastUpdatedAt: 123 }));
      expect(storage.getItem('user_progress:hot100')).toBeTruthy();
      const got = await adapter.get();
      expect(got?.lastUpdatedAt).toBe(123);
    } finally {
      delete process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE;
    }
  });
});

/**
 * 真实数据验证的替身夹具（票 5 验收：既有进度读取无损）。
 *
 * 用户提供的生产快照 /tmp/droid-worker-settings/progress-snapshot.json 在本轮
 * 开工时不存在，故按 lib/types.ts 的真实形状构造这份尽量刻薄的夹具：当前形状
 * 条目、旧字段结构条目、缺 easeFactor 条目、损坏条目，外加每日统计、连续天数
 * 与会话游标。断言逐字段无损。真实快照到位后应把它喂进同一条读取路径重跑本组
 * 断言（真实数据验证待补）。
 */
describe('历史进度文档逐字段无损（刻薄夹具）', () => {
  const FIXTURE = {
    lastUpdatedAt: 1_754_000_000_000,
    lastSessionCursor: {
      mode: 'ebbinghaus',
      currentQuestionId: '42',
      queue: ['42', '17', '88'],
      queueIndex: 1,
      timestamp: 1_753_999_000_000,
    },
    progress: {
      // 当前形状的复习卡：应原样通过，含失手次数
      '1': {
        state: 'review',
        learningStep: 0,
        dueAt: 1_754_100_000_000,
        intervalDays: 6,
        easeFactor: 2.36,
        level: 4,
        proficiency: 'good',
        lastReviewDate: 1_753_900_000_000,
        lapses: 1,
        nextReviewDate: 1_754_100_000_000,
        interval: 6,
      },
      // 学习中的卡：亚日级到期时间
      '17': {
        state: 'learning',
        learningStep: 1,
        dueAt: 1_754_000_600_000,
        intervalDays: 0,
        easeFactor: 2.5,
        level: 0,
        proficiency: 'hard',
        lastReviewDate: 1_754_000_000_000,
        nextReviewDate: 1_754_000_600_000,
        interval: 0,
      },
      // 旧字段结构：无 state/dueAt/intervalDays，只有镜像字段
      '42': {
        proficiency: 'easy',
        nextReviewDate: 1_754_200_000_000,
        interval: 11,
        easeFactor: 2.8,
        level: 7,
        lastReviewDate: 1_753_800_000_000,
      },
      // 旧字段结构且缺 easeFactor：缺省 EF 来自注入的调度参数
      '88': {
        proficiency: 'again',
        nextReviewDate: 1_754_050_000_000,
        interval: 1,
        lastReviewDate: 1_753_950_000_000,
      },
      // 损坏条目：安全丢弃
      '99': null,
    },
    dailyStats: {
      '2026-08-03': { reviewedCount: 12, graduatedCount: 3, lapseCount: 1 },
      '2026-08-04': { reviewedCount: 9, graduatedCount: 2, lapseCount: 0 },
    },
    streak: { currentDays: 5, longestDays: 12, lastActiveDay: '2026-08-04' },
  };

  it('作为历史 localStorage 内容喂进读取路径，逐字段无损', async () => {
    storage.setItem(HOT100_KEY, JSON.stringify(FIXTURE));
    const remote = fakeRemote(null); // 远端空 → 本地这份历史文档获胜

    const winner = await reconcileProgress('hot100', remote.adapter, HOT100_SCHEDULING_PARAMS);

    // 文档级字段
    expect(winner.lastUpdatedAt).toBe(1_754_000_000_000);
    expect(winner.lastSessionCursor).toEqual(FIXTURE.lastSessionCursor);

    // 当前形状条目：逐字段原样
    expect(winner.progress['1']).toEqual(FIXTURE.progress['1']);
    expect(winner.progress['1'].lapses).toBe(1);
    expect(winner.progress['17']).toEqual(FIXTURE.progress['17']);

    // 旧字段条目：状态、到期时间、间隔、EF、级别按镜像重建
    const q42 = winner.progress['42'];
    expect(q42.state).toBe('review');
    expect(q42.dueAt).toBe(1_754_200_000_000);
    expect(q42.intervalDays).toBe(11);
    expect(q42.easeFactor).toBe(2.8);
    expect(q42.level).toBe(7);
    expect(q42.lastReviewDate).toBe(1_753_800_000_000);
    expect(q42.proficiency).toBe('easy');

    // 缺 EF 的旧条目：EF 取注入参数的缺省值，其余按镜像重建
    const q88 = winner.progress['88'];
    expect(q88.state).toBe('review');
    expect(q88.dueAt).toBe(1_754_050_000_000);
    expect(q88.intervalDays).toBe(1);
    expect(q88.easeFactor).toBe(HOT100_SCHEDULING_PARAMS.efDefault);
    expect(q88.lastReviewDate).toBe(1_753_950_000_000);

    // 损坏条目被丢弃
    expect(winner.progress['99']).toBeUndefined();

    // 每日统计与连续天数：题集内概念，随文档逐字段保留
    expect(winner.dailyStats).toEqual(FIXTURE.dailyStats);
    expect(winner.streak).toEqual(FIXTURE.streak);

    // 落盘的本地文档与返回值一致（迁移后的形态）
    const persisted = JSON.parse(storage.getItem(HOT100_KEY)!) as UserProgressData;
    expect(persisted).toEqual(winner);
  });
});
