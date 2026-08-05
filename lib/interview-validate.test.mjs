import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { DECK_FILES } from './interview-schema.mjs';
import { validateInterviewDeck, formatValidationErrors } from './interview-validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 一张合规的深度学习基础卡，各测试只覆盖自己关心的字段。 */
function card(overrides = {}) {
  return {
    id: 'dl-sample-card',
    question: '示例问题？',
    category: 'dl-basics',
    tags: ['示例'],
    priority: 'common',
    answer: {
      key_points: ['要点一。', '要点二。', '要点三。'],
    },
    ...overrides,
  };
}

/** 把若干张卡包成一个 dl-basics.json 文件组。 */
function deck(cards, file = 'dl-basics.json') {
  return [{ file, category: 'dl-basics', cards }];
}

/** 只关心错误码时用这个，避免断言绑死在文案上。 */
const codes = (errors) => errors.map((e) => e.code);

describe('validateInterviewDeck', () => {
  it('合规题库返回空列表', () => {
    const cards = [
      card({ id: 'dl-first-card', related_ids: ['dl-second-card'] }),
      card({
        id: 'dl-second-card',
        priority: 'must',
        hint: '一句话方向指引。',
        answer: {
          key_points: ['要点一。', '要点二。', '要点三。', '要点四。'],
          elaboration: '展开叙述。',
          code: [{ label: '朴素实现', language: 'python', code: 'x = 1', note: 'O(1)' }],
          pitfalls: ['常见坑。'],
        },
        follow_ups: ['追问？'],
        related_ids: ['dl-first-card'],
      }),
    ];
    expect(validateInterviewDeck(deck(cards))).toEqual([]);
  });

  it('检出 id 重复，并指向后出现的那张卡', () => {
    const groups = [
      { file: 'dl-basics.json', category: 'dl-basics', cards: [card({ id: 'dl-dup' })] },
      { file: 'project.json', category: 'project', cards: [card({ id: 'dl-dup', category: 'project' })] },
    ];
    const errors = validateInterviewDeck(groups).filter((e) => e.code === 'duplicate-id');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'project.json', index: 0, cardId: 'dl-dup', field: 'id' });
    expect(errors[0].message).toContain('dl-basics.json[0]');
  });

  it('检出 id 不是语义 slug', () => {
    const errors = validateInterviewDeck(deck([card({ id: 'dl-Attention_Mask' })]));
    expect(codes(errors)).toContain('invalid-id-format');
  });

  it('检出 id 缺少分类前缀', () => {
    const errors = validateInterviewDeck(deck([card({ id: 'attention-mask' })]));
    expect(codes(errors)).toEqual(['invalid-id-prefix']);
  });

  it('只有前缀、前缀后没有内容的 id 也不合规', () => {
    const errors = validateInterviewDeck(deck([card({ id: 'dl' })]));
    expect(codes(errors)).toContain('invalid-id-prefix');
  });

  it('检出分类取值非法', () => {
    const errors = validateInterviewDeck(deck([card({ category: '深度学习' })]));
    expect(codes(errors)).toEqual(['invalid-category']);
    expect(errors[0].field).toBe('category');
  });

  it('检出卡片分类与所在文件不符', () => {
    const errors = validateInterviewDeck(deck([card({ id: 'dl-x-card', category: 'project' })]));
    expect(codes(errors)).toEqual(['category-file-mismatch']);
  });

  it('检出重要度取值非法', () => {
    const errors = validateInterviewDeck(deck([card({ priority: 'high' })]));
    expect(codes(errors)).toEqual(['invalid-priority']);
    expect(errors[0].field).toBe('priority');
  });

  it('检出要点条数不足', () => {
    const errors = validateInterviewDeck(deck([card({ answer: { key_points: ['要点一。', '要点二。'] } })]));
    expect(codes(errors)).toEqual(['key-points-count']);
    expect(errors[0].message).toContain('当前 2 条');
  });

  it('检出要点条数超出上界', () => {
    const key_points = ['一。', '二。', '三。', '四。', '五。', '六。', '七。'];
    const errors = validateInterviewDeck(deck([card({ answer: { key_points } })]));
    expect(codes(errors)).toEqual(['key-points-count']);
    expect(errors[0].message).toContain('当前 7 条');
  });

  it('检出缺少要点数组', () => {
    const errors = validateInterviewDeck(deck([card({ answer: { elaboration: '只有叙述。' } })]));
    expect(codes(errors)).toEqual(['key-points-count']);
  });

  it('检出空白要点，并定位到具体下标', () => {
    const errors = validateInterviewDeck(
      deck([card({ answer: { key_points: ['要点一。', '   ', '要点三。'] } })]),
    );
    expect(codes(errors)).toEqual(['empty-key-point']);
    expect(errors[0].field).toBe('answer.key_points[1]');
  });

  it('检出互链指向不存在的卡', () => {
    const errors = validateInterviewDeck(deck([card({ related_ids: ['dl-not-there'] })]));
    expect(codes(errors)).toEqual(['dangling-related-id']);
    expect(errors[0].field).toBe('related_ids[0]');
    expect(errors[0].message).toContain('dl-not-there');
  });

  it('互链可以跨分类文件', () => {
    const groups = [
      { file: 'dl-basics.json', category: 'dl-basics', cards: [card({ related_ids: ['proj-a-card'] })] },
      {
        file: 'project.json',
        category: 'project',
        cards: [card({ id: 'proj-a-card', category: 'project', related_ids: ['dl-sample-card'] })],
      },
    ];
    expect(validateInterviewDeck(groups)).toEqual([]);
  });

  it('检出互链指向自己', () => {
    const errors = validateInterviewDeck(deck([card({ related_ids: ['dl-sample-card'] })]));
    expect(codes(errors)).toEqual(['self-related-id']);
  });

  it('检出代码语言不被高亮器支持', () => {
    const answer = {
      key_points: ['一。', '二。', '三。'],
      code: [{ label: 'Java 版', language: 'java', code: 'int x = 1;' }],
    };
    const errors = validateInterviewDeck(deck([card({ answer })]));
    expect(codes(errors)).toEqual(['unsupported-code-language']);
    expect(errors[0].field).toBe('answer.code[0].language');
  });

  it('接受高亮器支持的非 python 语言', () => {
    const answer = {
      key_points: ['一。', '二。', '三。'],
      code: [{ label: '伪码', language: 'text', code: 'for each x: …' }],
    };
    expect(validateInterviewDeck(deck([card({ answer })]))).toEqual([]);
  });

  it('检出必填字段缺失与可选字段写成空值', () => {
    const errors = validateInterviewDeck(
      deck([
        card({ question: '  ', tags: [], hint: '', follow_ups: [], answer: { key_points: ['一。', '二。', '三。'] } }),
      ]),
    );
    expect(codes(errors).sort()).toEqual(['empty-array', 'empty-string', 'missing-field', 'missing-field']);
  });

  it('顶层不是数组、卡片不是对象时不抛错而是报错', () => {
    const errors = validateInterviewDeck([
      { file: 'dl-basics.json', category: 'dl-basics', cards: { id: 'dl-x' } },
      { file: 'project.json', category: 'project', cards: [null] },
    ]);
    expect(codes(errors)).toEqual(['invalid-shape', 'invalid-shape']);
  });

  it('一张卡的多处问题一次全部报出来，不是只报第一个', () => {
    const errors = validateInterviewDeck(
      deck([card({ id: 'BAD_ID', priority: 'high', answer: { key_points: [] } })]),
    );
    expect(codes(errors).sort()).toEqual([
      'invalid-id-format',
      'invalid-id-prefix',
      'invalid-priority',
      'key-points-count',
    ]);
  });
});

describe('formatValidationErrors', () => {
  it('每行都带上文件、下标、卡片 id、字段与错误码', () => {
    const errors = validateInterviewDeck(deck([card({ priority: 'high' })]));
    expect(formatValidationErrors(errors)).toBe(
      '  dl-basics.json[0] · dl-sample-card · priority → 重要度取值非法，可选：must / common / bonus [invalid-priority]',
    );
  });
});

describe('仓库里的真实题库', () => {
  it('通过校验', async () => {
    const groups = await Promise.all(
      DECK_FILES.map(async ({ category, file }) => ({
        file: `data/interview/${file}`,
        category,
        cards: JSON.parse(await readFile(path.join(ROOT, 'data/interview', file), 'utf8')),
      })),
    );
    expect(formatValidationErrors(validateInterviewDeck(groups))).toBe('');
  });
});
