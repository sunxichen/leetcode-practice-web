import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InterviewCard } from '@/lib/interview-types';
import type { QuestionProgress } from '@/lib/types';
import { getAllInterviewCards } from '@/lib/interview';
import {
  filterInterviewCards,
  matchesInterviewBrowseFilter,
  INTERVIEW_CATEGORY_LABEL,
  INTERVIEW_PRIORITY_LABEL,
} from '@/lib/interview-browse';
import { DAY_MS } from '@/lib/constants';

/**
 * 票 13（面试题库页与查阅）的窄测试：只覆盖本票引入的纯函数缝——筛选谓词
 * （搜索 / 分类 / 重要度 / 语义）与「查阅不写调度」的契约保证。仓库没有
 * React/DOM 测试基建，页面只做渲染，逻辑全部收在 lib/interview-browse.ts。
 */

const NOW = new Date(2026, 2, 15, 10, 30, 0, 0).getTime();

/** 合成卡：分类/重要度/问题/标签可覆盖，默认填深度学习基础的常见字段。 */
function makeCard(overrides: Partial<InterviewCard> = {}): InterviewCard {
  return {
    id: 'synthetic-1',
    question: '讲一下 Transformer 的注意力机制',
    category: 'dl-basics',
    tags: ['Transformer', '注意力'],
    priority: 'must',
    answer: { key_points: ['要点一', '要点二', '要点三'] },
    ...overrides,
  };
}

/** 最小进度文档：只覆盖语义筛选用到的字段。 */
function makeProgress(overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    state: 'review',
    learningStep: 0,
    dueAt: NOW + 5 * DAY_MS,
    intervalDays: 5,
    easeFactor: 2.5,
    level: 1,
    proficiency: 'good',
    lastReviewDate: NOW,
    ...overrides,
  };
}

const EMPTY: Record<string, QuestionProgress> = {};

describe('筛选谓词：搜索（问题文本 / 标签 / id）', () => {
  it('空搜索命中全部', () => {
    const card = makeCard();
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: '', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(true);
  });

  it('按问题文本命中，大小写不敏感', () => {
    const card = makeCard({ question: 'Scaled Dot-Product Attention 怎么算' });
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: 'attention', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(true);
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: 'ATTENTION', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(true);
  });

  it('按标签命中', () => {
    const card = makeCard({ tags: ['Transformer', '复杂度'] });
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: '复杂度', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(true);
  });

  it('按 id 命中（可含 id）', () => {
    const card = makeCard({ id: 'dl-attention-mask' });
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: 'dl-attention-mask', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(true);
  });

  it('不匹配的搜索被排除', () => {
    const card = makeCard({ question: '损失函数', tags: ['优化器'] });
    expect(matchesInterviewBrowseFilter(card, EMPTY, {
      searchQuery: '不相干词汇', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW)).toBe(false);
  });
});

describe('筛选谓词：分类多选（空 = 全部，选中取并集）', () => {
  const project = makeCard({ id: 'p1', category: 'project' });
  const tech = makeCard({ id: 't1', category: 'tech-stack' });
  const dl = makeCard({ id: 'd1', category: 'dl-basics' });
  const cards = [project, tech, dl];

  it('空 = 全部', () => {
    expect(filterInterviewCards(cards, EMPTY, {
      searchQuery: '', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW).map((c) => c.id)).toEqual(['p1', 't1', 'd1']);
  });

  it('单选 = 只留该分类', () => {
    const out = filterInterviewCards(cards, EMPTY, {
      searchQuery: '', categories: new Set(['project']), priorities: new Set(), semantic: 'all',
    }, NOW);
    expect(out.map((c) => c.id)).toEqual(['p1']);
  });

  it('多选 = 取并集', () => {
    const out = filterInterviewCards(cards, EMPTY, {
      searchQuery: '', categories: new Set(['project', 'dl-basics']), priorities: new Set(), semantic: 'all',
    }, NOW);
    expect(out.map((c) => c.id)).toEqual(['p1', 'd1']);
  });

  it('中文标签映射完整（面试题集侧定义，不塞进通用组件）', () => {
    expect(INTERVIEW_CATEGORY_LABEL).toEqual({
      project: '项目深挖',
      'tech-stack': '技术路线',
      'dl-basics': '深度学习基础',
    });
  });
});

describe('筛选谓词：重要度多选（空 = 全部，选中取并集）', () => {
  const must = makeCard({ id: 'm1', priority: 'must' });
  const common = makeCard({ id: 'c1', priority: 'common' });
  const bonus = makeCard({ id: 'b1', priority: 'bonus' });
  const cards = [must, common, bonus];

  it('空 = 全部', () => {
    expect(filterInterviewCards(cards, EMPTY, {
      searchQuery: '', categories: new Set(), priorities: new Set(), semantic: 'all',
    }, NOW).length).toBe(3);
  });

  it('多选 = 取并集且保持题库顺序', () => {
    const out = filterInterviewCards(cards, EMPTY, {
      searchQuery: '', categories: new Set(), priorities: new Set(['must', 'bonus']), semantic: 'all',
    }, NOW);
    expect(out.map((c) => c.id)).toEqual(['m1', 'b1']);
  });

  it('中文标签映射完整', () => {
    expect(INTERVIEW_PRIORITY_LABEL).toEqual({
      must: '高频必答',
      common: '常见',
      bonus: '加分项',
    });
  });
});

describe('筛选谓词：语义四项（与 Hot100 同口径）', () => {
  const now = NOW;
  const base = { categories: new Set<string>(), priorities: new Set<string>(), semantic: 'all' as const };

  it('待复习 due-today：到期 <= now 才命中；未学 / 未来到期不命中', () => {
    const overdue = makeCard({ id: 'overdue' });
    const prog = { overdue: makeProgress({ state: 'review', dueAt: now - DAY_MS }) };
    expect(matchesInterviewBrowseFilter(overdue, prog, { ...base, semantic: 'due-today' }, now)).toBe(true);

    const future = makeCard({ id: 'future' });
    const prog2 = { future: makeProgress({ state: 'review', dueAt: now + DAY_MS }) };
    expect(matchesInterviewBrowseFilter(future, prog2, { ...base, semantic: 'due-today' }, now)).toBe(false);

    const fresh = makeCard({ id: 'fresh' });
    expect(matchesInterviewBrowseFilter(fresh, EMPTY, { ...base, semantic: 'due-today' }, now)).toBe(false);
  });

  it('即将到期 due-soon：7 天内（含今天今起）才命中', () => {
    const soon = makeCard({ id: 'soon' });
    const prog = { soon: makeProgress({ state: 'review', dueAt: now + 3 * DAY_MS }) };
    expect(matchesInterviewBrowseFilter(soon, prog, { ...base, semantic: 'due-soon' }, now)).toBe(true);

    const far = makeCard({ id: 'far' });
    const prog2 = { far: makeProgress({ state: 'review', dueAt: now + 8 * DAY_MS }) };
    expect(matchesInterviewBrowseFilter(far, prog2, { ...base, semantic: 'due-soon' }, now)).toBe(false);

    // 已逾期不归"即将到期"（那是待复习）
    const overdue = makeCard({ id: 'overdue' });
    const prog3 = { overdue: makeProgress({ state: 'review', dueAt: now - DAY_MS }) };
    expect(matchesInterviewBrowseFilter(overdue, prog3, { ...base, semantic: 'due-soon' }, now)).toBe(false);
  });

  it('易遗忘 lapse-prone：lapses >= 1 才命中', () => {
    const lapsed = makeCard({ id: 'lapsed' });
    const prog = { lapsed: makeProgress({ state: 'review', dueAt: now + DAY_MS, lapses: 2 }) };
    expect(matchesInterviewBrowseFilter(lapsed, prog, { ...base, semantic: 'lapse-prone' }, now)).toBe(true);

    const never = makeCard({ id: 'never' });
    const prog2 = { never: makeProgress({ state: 'review', dueAt: now + DAY_MS, lapses: 0 }) };
    expect(matchesInterviewBrowseFilter(never, prog2, { ...base, semantic: 'lapse-prone' }, now)).toBe(false);
  });

  it('未学习 new：无进度或 state === new 才命中', () => {
    const noProg = makeCard({ id: 'noProg' });
    expect(matchesInterviewBrowseFilter(noProg, EMPTY, { ...base, semantic: 'new' }, now)).toBe(true);

    const brandNew = makeCard({ id: 'brandNew' });
    const prog = { brandNew: makeProgress({ state: 'new', dueAt: 0 }) };
    expect(matchesInterviewBrowseFilter(brandNew, prog, { ...base, semantic: 'new' }, now)).toBe(true);

    const learned = makeCard({ id: 'learned' });
    const prog2 = { learned: makeProgress({ state: 'review', dueAt: now + DAY_MS }) };
    expect(matchesInterviewBrowseFilter(learned, prog2, { ...base, semantic: 'new' }, now)).toBe(false);
  });

  it('真实题库：无任何进度时语义 all 全命中、new 全命中、其余三种全不命中', () => {
    const cards = getAllInterviewCards();
    const allCats: Record<string, QuestionProgress> = {};
    expect(filterInterviewCards(cards, allCats, { ...base, semantic: 'all' }, now).length).toBe(cards.length);
    expect(filterInterviewCards(cards, allCats, { ...base, semantic: 'new' }, now).length).toBe(cards.length);
    expect(filterInterviewCards(cards, allCats, { ...base, semantic: 'due-today' }, now).length).toBe(0);
    expect(filterInterviewCards(cards, allCats, { ...base, semantic: 'due-soon' }, now).length).toBe(0);
    expect(filterInterviewCards(cards, allCats, { ...base, semantic: 'lapse-prone' }, now).length).toBe(0);
  });

  it('筛选是纯函数：不改动入参卡片集与进度文档', () => {
    const cards = [makeCard({ id: 'a', category: 'project' }), makeCard({ id: 'b', category: 'dl-basics' })];
    const beforeIds = cards.map((c) => c.id);
    const progress: Record<string, QuestionProgress> = { a: makeProgress() };
    filterInterviewCards(cards, progress, { ...base, semantic: 'all' }, now);
    expect(cards.map((c) => c.id)).toEqual(beforeIds);
    expect(Object.keys(progress)).toEqual(['a']);
  });
});

describe('查阅不写调度（契约保证）', () => {
  const src = (p: string) =>
    readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

  it('面试卡背面组件不引用任何进度写入 API', () => {
    // 本测试文件在 lib/ 下，向上到仓库根的相对路径是 ../。
    const back = src('../components/interview/InterviewCardBack.tsx');
    expect(back).not.toMatch(/\bupdateProgress\b|writeProgress|ProgressContext|useProgress/);
  });

  it('面试题库页只读进度（useDeckProgress 用于筛选），从不调用 updateProgress', () => {
    const page = src('../app/interview/browse/page.tsx');
    const shared = src('../components/browse/BrowseDeckPage.tsx');
    // 页面把进度读取委托给共享的 BrowseDeckPage——useDeckProgress 在组件里，
    // 页面与组件合并断言；只读的契约对两者分别成立。
    expect(page + shared).toMatch(/useDeckProgress/);
    // 契约：页面与组件都不调用 updateProgress（只读进度做筛选）。注释里出现该词不算调用。
    expect(page).not.toMatch(/updateProgress\s*\(/);
    expect(shared).not.toMatch(/updateProgress\s*\(/);
  });

  it('展开渲染只依赖卡片与本地状态：不变式——过滤谓词是只读纯函数', () => {
    // 谓词签名是 (cards, progress, filter, now) -> cards，契约上不可能写进度。
    const cards = [makeCard()];
    const before = JSON.stringify(cards);
    const progressIn: Record<string, QuestionProgress> = {};
    filterInterviewCards(cards, progressIn, { searchQuery: '', categories: new Set(), priorities: new Set(), semantic: 'all' }, NOW);
    expect(JSON.stringify(cards)).toBe(before);
    expect(JSON.stringify(progressIn)).toBe('{}');
  });
});
