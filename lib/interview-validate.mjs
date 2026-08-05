/** 面试题库的校验器：纯函数，给定按分类分好的题库文件，返回可定位的错误列表。
 * 没有 I/O、没有 process.exit、不打印任何东西 —— 那些是 scripts/validate-deck.mjs 的事。 */

import {
  CATEGORIES,
  PRIORITIES,
  ID_PATTERN,
  ID_PREFIX_BY_CATEGORY,
  KEY_POINTS_MIN,
  KEY_POINTS_MAX,
  SUPPORTED_CODE_LANGUAGES,
} from './interview-schema.mjs';

/**
 * @typedef {object} DeckFileGroup
 * @property {string} file 文件名或路径，只用于错误定位
 * @property {string} category 该文件声明的分类
 * @property {unknown} cards 期望是卡片数组
 */

/**
 * @typedef {object} DeckValidationError
 * @property {string} code 机器可读的错误类别
 * @property {string} file 出错的题库文件
 * @property {number | null} index 卡片在文件内的下标
 * @property {string | null} cardId 卡片 id，取不到时为 null
 * @property {string | null} field 出错字段，形如 answer.key_points[2]
 * @property {string} message 中文说明
 */

const isString = (v) => typeof v === 'string';
const isFilled = (v) => isString(v) && v.trim().length > 0;
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 校验整个面试题库。互链与 id 唯一性是跨文件的，所以必须一次收下全部文件。
 * @param {DeckFileGroup[]} groups
 * @returns {DeckValidationError[]} 合规时为空数组
 */
export function validateInterviewDeck(groups) {
  /** @type {DeckValidationError[]} */
  const errors = [];
  const add = (file, index, cardId, field, code, message) =>
    errors.push({ code, file, index, cardId, field, message });

  // 先收一遍全量 id：related_ids 可以指向别的分类文件里的卡，
  // 逐文件校验时手上必须已经有完整的 id 集合。
  const knownIds = new Set();
  for (const group of groups) {
    if (!Array.isArray(group.cards)) continue;
    for (const card of group.cards) {
      if (isPlainObject(card) && isFilled(card.id)) knownIds.add(card.id);
    }
  }

  /** id → 首次出现的位置，用于把重复报在后出现的那张卡上 */
  const firstSeen = new Map();

  for (const group of groups) {
    const { file, category: fileCategory } = group;

    if (!Array.isArray(group.cards)) {
      add(file, null, null, null, 'invalid-shape', '题库文件的顶层必须是卡片数组');
      continue;
    }

    group.cards.forEach((card, index) => {
      if (!isPlainObject(card)) {
        add(file, index, null, null, 'invalid-shape', '卡片必须是对象');
        return;
      }

      const cardId = isFilled(card.id) ? card.id : null;

      // ---- id ----
      if (!isFilled(card.id)) {
        add(file, index, null, 'id', 'missing-field', '缺少 id');
      } else {
        if (!ID_PATTERN.test(card.id)) {
          add(file, index, cardId, 'id', 'invalid-id-format',
            'id 必须是小写字母、数字与单个连字符组成的语义 slug');
        }
        const prefix = ID_PREFIX_BY_CATEGORY[fileCategory];
        if (prefix && !(card.id.startsWith(prefix) && card.id.length > prefix.length)) {
          add(file, index, cardId, 'id', 'invalid-id-prefix',
            `id 必须以分类前缀 ${prefix} 开头，且前缀后还有内容`);
        }
        const previous = firstSeen.get(card.id);
        if (previous) {
          add(file, index, cardId, 'id', 'duplicate-id', `id 重复，首次出现于 ${previous}`);
        } else {
          firstSeen.set(card.id, `${file}[${index}]`);
        }
      }

      // ---- category / priority ----
      if (!CATEGORIES.includes(card.category)) {
        add(file, index, cardId, 'category', 'invalid-category',
          `分类取值非法，可选：${CATEGORIES.join(' / ')}`);
      } else if (card.category !== fileCategory) {
        add(file, index, cardId, 'category', 'category-file-mismatch',
          `卡片分类是 ${card.category}，与本文件声明的 ${fileCategory} 不符`);
      }
      if (!PRIORITIES.includes(card.priority)) {
        add(file, index, cardId, 'priority', 'invalid-priority',
          `重要度取值非法，可选：${PRIORITIES.join(' / ')}`);
      }

      // ---- question / tags / hint ----
      if (!isFilled(card.question)) {
        add(file, index, cardId, 'question', 'missing-field', '缺少问题文本');
      }
      if (!Array.isArray(card.tags) || card.tags.length === 0) {
        add(file, index, cardId, 'tags', 'missing-field', 'tags 至少要有一个');
      } else {
        card.tags.forEach((tag, i) => {
          if (!isFilled(tag)) {
            add(file, index, cardId, `tags[${i}]`, 'empty-string', 'tag 不能为空字符串');
          }
        });
      }
      if (card.hint !== undefined && !isFilled(card.hint)) {
        add(file, index, cardId, 'hint', 'empty-string', 'hint 写了就不能为空');
      }

      // ---- answer ----
      if (!isPlainObject(card.answer)) {
        add(file, index, cardId, 'answer', 'missing-field', '缺少 answer 对象');
      } else {
        validateAnswer(card.answer, { add, file, index, cardId });
      }

      // ---- follow_ups ----
      validateOptionalStringArray(card.follow_ups, 'follow_ups', { add, file, index, cardId });

      // ---- related_ids ----
      if (card.related_ids !== undefined) {
        if (!Array.isArray(card.related_ids)) {
          add(file, index, cardId, 'related_ids', 'invalid-shape', 'related_ids 必须是数组');
        } else if (card.related_ids.length === 0) {
          add(file, index, cardId, 'related_ids', 'empty-array', '可选字段写了就不能是空数组，不需要就整个删掉');
        } else {
          card.related_ids.forEach((relatedId, i) => {
            const field = `related_ids[${i}]`;
            if (!isFilled(relatedId)) {
              add(file, index, cardId, field, 'empty-string', '互链 id 不能为空字符串');
            } else if (relatedId === card.id) {
              add(file, index, cardId, field, 'self-related-id', '互链不能指向自己');
            } else if (!knownIds.has(relatedId)) {
              add(file, index, cardId, field, 'dangling-related-id',
                `互链指向不存在的卡片 ${relatedId}`);
            }
          });
        }
      }
    });
  }

  return errors;
}

function validateAnswer(answer, ctx) {
  const { add, file, index, cardId } = ctx;

  // ---- 要点：唯一的必填答案字段，条数是硬规则 ----
  if (!Array.isArray(answer.key_points)) {
    add(file, index, cardId, 'answer.key_points', 'key-points-count', '缺少 answer.key_points 数组');
  } else {
    if (answer.key_points.length < KEY_POINTS_MIN || answer.key_points.length > KEY_POINTS_MAX) {
      add(file, index, cardId, 'answer.key_points', 'key-points-count',
        `要点必须 ${KEY_POINTS_MIN}-${KEY_POINTS_MAX} 条，当前 ${answer.key_points.length} 条`);
    }
    answer.key_points.forEach((point, i) => {
      if (!isFilled(point)) {
        add(file, index, cardId, `answer.key_points[${i}]`, 'empty-key-point', '要点不能为空字符串');
      }
    });
  }

  if (answer.elaboration !== undefined && !isFilled(answer.elaboration)) {
    add(file, index, cardId, 'answer.elaboration', 'empty-string', 'elaboration 写了就不能为空');
  }

  validateOptionalStringArray(answer.pitfalls, 'answer.pitfalls', ctx);

  // ---- 代码片段 ----
  if (answer.code !== undefined) {
    if (!Array.isArray(answer.code)) {
      add(file, index, cardId, 'answer.code', 'invalid-shape', 'answer.code 必须是数组');
    } else if (answer.code.length === 0) {
      add(file, index, cardId, 'answer.code', 'empty-array', '可选字段写了就不能是空数组，不需要就整个删掉');
    } else {
      answer.code.forEach((snippet, i) => {
        const base = `answer.code[${i}]`;
        if (!isPlainObject(snippet)) {
          add(file, index, cardId, base, 'invalid-shape', '代码片段必须是对象');
          return;
        }
        if (!isFilled(snippet.label)) {
          add(file, index, cardId, `${base}.label`, 'missing-field', '代码片段缺少 label');
        }
        if (!isFilled(snippet.code)) {
          add(file, index, cardId, `${base}.code`, 'missing-field', '代码片段缺少 code');
        }
        if (!isFilled(snippet.language)) {
          add(file, index, cardId, `${base}.language`, 'missing-field', '代码片段缺少 language');
        } else if (!SUPPORTED_CODE_LANGUAGES.includes(snippet.language)) {
          add(file, index, cardId, `${base}.language`, 'unsupported-code-language',
            `高亮器不支持语言 ${snippet.language}，可选：${SUPPORTED_CODE_LANGUAGES.join(' / ')}`);
        }
        if (snippet.note !== undefined && !isFilled(snippet.note)) {
          add(file, index, cardId, `${base}.note`, 'empty-string', 'note 写了就不能为空');
        }
      });
    }
  }
}

function validateOptionalStringArray(value, field, ctx) {
  const { add, file, index, cardId } = ctx;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(file, index, cardId, field, 'invalid-shape', `${field} 必须是数组`);
    return;
  }
  if (value.length === 0) {
    add(file, index, cardId, field, 'empty-array', '可选字段写了就不能是空数组，不需要就整个删掉');
    return;
  }
  value.forEach((item, i) => {
    if (!isFilled(item)) {
      add(file, index, cardId, `${field}[${i}]`, 'empty-string', `${field}[${i}] 不能为空字符串`);
    }
  });
}

/**
 * 把错误列表排成人能直接按着去改的文本，每行一个错误。
 * @param {DeckValidationError[]} errors
 * @returns {string}
 */
export function formatValidationErrors(errors) {
  return errors
    .map((e) => {
      const where = e.index === null ? e.file : `${e.file}[${e.index}]`;
      const parts = [where];
      if (e.cardId) parts.push(e.cardId);
      if (e.field) parts.push(e.field);
      return `  ${parts.join(' · ')} → ${e.message} [${e.code}]`;
    })
    .join('\n');
}
