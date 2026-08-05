import { describe, it, expect } from 'vitest';
import type { InterviewCard } from '@/lib/interview-types';
import {
  getInterviewBackPageCount,
  getInterviewBackSections,
  resolveCodeLanguage,
  resolveRelatedCards,
  interviewStudyHref,
} from '@/lib/interview-back';
import { getAllInterviewCards, getInterviewCardById } from '@/lib/interview';

/**
 * 票 9（面试卡背面补全）的窄测试：只覆盖本票引入的纯函数缝——背面分页数、
 * 可选区块归一化（空数组不渲染的实现边界）、代码语言兜底、互链解析与深链
 * 编码。仓库没有 React 测试工具，组件的条件渲染就是对这些返回值做
 * `{x && …}` 判断，因此"空数组不渲染"在这里钉死。
 */

/** 合成卡：只保证本文件用到的字段，可选字段按需覆盖。 */
function makeCard(overrides: Partial<InterviewCard> = {}): InterviewCard {
  return {
    id: 'dl-synthetic',
    question: '合成卡',
    category: 'dl-basics',
    tags: ['合成'],
    priority: 'common',
    answer: {
      key_points: ['要点一', '要点二', '要点三'],
    },
    ...overrides,
  };
}

const byId = (id: string) => getInterviewCardById(id);

describe('getInterviewBackPageCount（背面分页数）', () => {
  it('无 code 字段返回 1', () => {
    expect(getInterviewBackPageCount(makeCard())).toBe(1);
  });

  it('单段代码返回 1', () => {
    const card = makeCard({
      answer: {
        key_points: ['a', 'b', 'c'],
        code: [{ label: '唯一一段', language: 'python', code: 'pass' }],
      },
    });
    expect(getInterviewBackPageCount(card)).toBe(1);
  });

  it('多段代码返回段数 n', () => {
    const card = makeCard({
      answer: {
        key_points: ['a', 'b', 'c'],
        code: [
          { label: '朴素实现', language: 'python', code: 'pass' },
          { label: '向量化', language: 'python', code: 'pass' },
          { label: 'SQL 版', language: 'sql', code: 'select 1;' },
        ],
      },
    });
    expect(getInterviewBackPageCount(card)).toBe(3);
  });

  it('防御：空 code 数组也返回 1（schema 不允许，但下标钳制不能落到 0 页）', () => {
    const card = makeCard({ answer: { key_points: ['a', 'b', 'c'], code: [] } });
    expect(getInterviewBackPageCount(card)).toBe(1);
  });

  it('与真实题库逐卡一致：无代码 1、有代码即段数', () => {
    for (const card of getAllInterviewCards()) {
      expect(getInterviewBackPageCount(card)).toBe(Math.max(1, card.answer.code?.length ?? 0));
    }
  });
});

describe('getInterviewBackSections（可选字段组合）', () => {
  it('只有 key_points：其余区块全部为 null', () => {
    const s = getInterviewBackSections(makeCard(), byId);
    expect(s.keyPoints).toHaveLength(3);
    expect(s.pitfalls).toBeNull();
    expect(s.code).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.followUps).toBeNull();
    expect(s.related).toBeNull();
  });

  it('只有 code：只有代码区块存在', () => {
    const card = makeCard({
      answer: {
        key_points: ['a', 'b', 'c'],
        code: [{ label: '实现', language: 'python', code: 'pass' }],
      },
    });
    const s = getInterviewBackSections(card, byId);
    expect(s.code).toHaveLength(1);
    expect(s.pitfalls).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.followUps).toBeNull();
    expect(s.related).toBeNull();
  });

  it('只有 pitfalls', () => {
    const card = makeCard({
      answer: { key_points: ['a', 'b', 'c'], pitfalls: ['坑一'] },
    });
    const s = getInterviewBackSections(card, byId);
    expect(s.pitfalls).toEqual(['坑一']);
    expect(s.code).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.followUps).toBeNull();
    expect(s.related).toBeNull();
  });

  it('只有 elaboration', () => {
    const card = makeCard({
      answer: { key_points: ['a', 'b', 'c'], elaboration: '展开叙述全文' },
    });
    const s = getInterviewBackSections(card, byId);
    expect(s.elaboration).toBe('展开叙述全文');
    expect(s.pitfalls).toBeNull();
    expect(s.code).toBeNull();
    expect(s.followUps).toBeNull();
    expect(s.related).toBeNull();
  });

  it('只有 follow_ups', () => {
    const card = makeCard({ follow_ups: ['追问一', '追问二'] });
    const s = getInterviewBackSections(card, byId);
    expect(s.followUps).toEqual(['追问一', '追问二']);
    expect(s.pitfalls).toBeNull();
    expect(s.code).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.related).toBeNull();
  });

  it('只有 related_ids：解析到真实卡才有入口', () => {
    const card = makeCard({ related_ids: ['dl-attention-mask'] });
    const s = getInterviewBackSections(card, byId);
    expect(s.related).toEqual([
      { id: 'dl-attention-mask', question: byId('dl-attention-mask')!.question },
    ]);
    expect(s.pitfalls).toBeNull();
    expect(s.code).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.followUps).toBeNull();
  });

  it('全字段同时存在：每个区块都在，且要点仍是主体', () => {
    const card = makeCard({
      answer: {
        key_points: ['a', 'b', 'c', 'd'],
        elaboration: '全文',
        code: [{ label: '实现', language: 'rust', code: 'fn main() {}' }],
        pitfalls: ['坑'],
      },
      follow_ups: ['追问'],
      related_ids: ['dl-attention-mask'],
    });
    const s = getInterviewBackSections(card, byId);
    expect(s.keyPoints).toHaveLength(4);
    expect(s.pitfalls).toEqual(['坑']);
    expect(s.code).toHaveLength(1);
    expect(s.elaboration).toBe('全文');
    expect(s.followUps).toEqual(['追问']);
    expect(s.related).toHaveLength(1);
  });

  it('空数组与空字符串一律归一成 null：空数组不会渲染成空标题/空盒子', () => {
    const card = makeCard({
      answer: {
        key_points: ['a', 'b', 'c'],
        pitfalls: [],
        code: [],
        elaboration: '',
      },
      follow_ups: [],
      related_ids: [],
    });
    const s = getInterviewBackSections(card, byId);
    expect(s.pitfalls).toBeNull();
    expect(s.code).toBeNull();
    expect(s.elaboration).toBeNull();
    expect(s.followUps).toBeNull();
    expect(s.related).toBeNull();
  });
});

describe('resolveCodeLanguage（语言传递与兜底）', () => {
  it('数据声明的语言原样传给高亮器，包括非 Python 语言', () => {
    expect(resolveCodeLanguage('python')).toBe('python');
    expect(resolveCodeLanguage('sql')).toBe('sql');
    expect(resolveCodeLanguage('typescript')).toBe('typescript');
    expect(resolveCodeLanguage('rust')).toBe('rust');
    expect(resolveCodeLanguage('text')).toBe('text');
  });

  it('未知语言兜底到 text 原样渲染，绝不静默当 Python', () => {
    expect(resolveCodeLanguage('cobol')).toBe('text');
    expect(resolveCodeLanguage('')).toBe('text');
    expect(resolveCodeLanguage('python3')).toBe('text');
  });

  it('真实题库的每段代码语言都原样通过兜底（schema 已保证合法）', () => {
    for (const card of getAllInterviewCards()) {
      for (const snippet of card.answer.code ?? []) {
        expect(resolveCodeLanguage(snippet.language)).toBe(snippet.language);
      }
    }
  });
});

describe('resolveRelatedCards（互链解析与过滤）', () => {
  it('保持声明顺序，带上目标卡的问题文本', () => {
    const card = makeCard({
      related_ids: ['dl-attention-complexity', 'dl-attention-mask'],
    });
    const entries = resolveRelatedCards(card, byId);
    expect(entries.map((e) => e.id)).toEqual(['dl-attention-complexity', 'dl-attention-mask']);
    for (const entry of entries) {
      expect(entry.question).toBe(byId(entry.id)!.question);
    }
  });

  it('解析不到的 id 被过滤，不渲染坏链接', () => {
    const card = makeCard({
      related_ids: ['dl-attention-mask', 'dl-no-such-card'],
    });
    const entries = resolveRelatedCards(card, byId);
    expect(entries.map((e) => e.id)).toEqual(['dl-attention-mask']);
  });

  it('全部解析失败时返回空数组（sections 再归一成 null，整块不渲染）', () => {
    const card = makeCard({ related_ids: ['dl-no-such-card'] });
    expect(resolveRelatedCards(card, byId)).toEqual([]);
    expect(getInterviewBackSections(card, byId).related).toBeNull();
  });

  it('无 related_ids 字段返回空数组', () => {
    expect(resolveRelatedCards(makeCard(), byId)).toEqual([]);
  });
});

describe('interviewStudyHref（互链跳转目标）', () => {
  it('指向现有单卡深链 /interview/study?q=，不指向 404', () => {
    expect(interviewStudyHref('dl-attention-mask')).toBe('/interview/study?q=dl-attention-mask');
  });

  it('id 经 URL 安全编码', () => {
    expect(interviewStudyHref('dl-a b?c&d=e')).toBe(
      `/interview/study?q=${encodeURIComponent('dl-a b?c&d=e')}`,
    );
    expect(interviewStudyHref('dl-a b?c&d=e')).toBe('/interview/study?q=dl-a%20b%3Fc%26d%3De');
  });
});
