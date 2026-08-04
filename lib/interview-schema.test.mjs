import { describe, it, expect } from 'vitest';
import { Prism } from 'prism-react-renderer';

import {
  CATEGORIES,
  PRIORITIES,
  DECK_FILES,
  ID_PREFIX_BY_CATEGORY,
  ID_PATTERN,
  KEY_POINTS_MIN,
  KEY_POINTS_MAX,
  SUPPORTED_CODE_LANGUAGES,
} from './interview-schema.mjs';

describe('interview-schema 取值清单', () => {
  it('SUPPORTED_CODE_LANGUAGES 的每一项在高亮器里都有对应语法', () => {
    for (const language of SUPPORTED_CODE_LANGUAGES) {
      expect(Prism.languages[language]).toBeTruthy();
    }
  });

  it('分类与重要度的取值与 lib/interview-types.ts 的联合类型逐项一致', () => {
    // .mjs 里的清单是运行时唯一来源；这里把 TS 侧的联合类型手写一遍，
    // 两边任何一边改了取值，这个断言都会红。
    expect(CATEGORIES).toEqual(['project', 'tech-stack', 'dl-basics']);
    expect(PRIORITIES).toEqual(['must', 'common', 'bonus']);
  });

  it('每个分类都有登记文件与 id 前缀，且前缀去掉连字符后本身是合法 slug', () => {
    expect(DECK_FILES.map((d) => d.category).sort()).toEqual([...CATEGORIES].sort());
    for (const { category, file } of DECK_FILES) {
      expect(file.endsWith('.json')).toBe(true);
      const prefix = ID_PREFIX_BY_CATEGORY[category];
      expect(prefix.endsWith('-')).toBe(true);
      expect(ID_PATTERN.test(prefix.slice(0, -1))).toBe(true);
    }
  });

  it('要点条数上下界是 ADR-0003 定死的 3-6', () => {
    expect(KEY_POINTS_MIN).toBe(3);
    expect(KEY_POINTS_MAX).toBe(6);
  });

  it('id 语义 slug 规范：小写、数字、单连字符分段', () => {
    expect(ID_PATTERN.test('dl-attention-mask')).toBe(true);
    expect(ID_PATTERN.test('proj-rag-overview-2')).toBe(true);
    expect(ID_PATTERN.test('dl--double-dash')).toBe(false);
    expect(ID_PATTERN.test('Dl-Upper')).toBe(false);
    expect(ID_PATTERN.test('dl_under_score')).toBe(false);
    expect(ID_PATTERN.test('-leading')).toBe(false);
    expect(ID_PATTERN.test('trailing-')).toBe(false);
  });
});
