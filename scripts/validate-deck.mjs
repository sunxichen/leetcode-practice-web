#!/usr/bin/env node
/** 校验面试题库，并顺带生成首页用的题集摘要。
 *
 * 这个文件是薄壳：读盘 → 调 lib/ 里的纯函数 → 打印 → 设退出码。
 * 校验规则本身在 lib/interview-validate.mjs，摘要结构在 lib/deck-summary.mjs。
 *
 *   node scripts/validate-deck.mjs           校验并写入 data/deck-summary.json
 *   node scripts/validate-deck.mjs --check   校验，且摘要过期即失败（build 用这个）
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DECKS, CATEGORIES, PRIORITIES } from '../lib/interview-schema.mjs';
import { validateInterviewDeck, formatValidationErrors } from '../lib/interview-validate.mjs';
import { buildDeckSummary, serializeDeckSummary, summaryStaleReason } from '../lib/deck-summary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUMMARY_FILE = 'data/deck-summary.json';
const QUESTIONS_FILE = 'data/questions.json';

const CHECK_ONLY = process.argv.includes('--check');

async function readText(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

async function readTextOrNull(relPath) {
  try {
    return await readText(relPath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function die(title, details) {
  console.error(`\n✗ ${title}`);
  if (details) console.error(details);
  console.error('');
  process.exit(1);
}

/** 每个 registered 目录里的 .json 必须与其登记的 files 一一对应：多出来的不会被
 * 静态 import，静默地不进题库；少了则 import 直接构建失败。 */
async function collectDeckGroups({ deckId, dir, files }) {
  const onDisk = (await readdir(path.join(ROOT, dir)))
    .filter((name) => name.endsWith('.json'));
  const declared = files.map((d) => d.file);

  const undeclared = onDisk.filter((name) => !declared.includes(name));
  const missing = declared.filter((name) => !onDisk.includes(name));
  const problems = [
    ...undeclared.map((name) => `  ${dir}/${name} → 未在 lib/interview-schema.mjs 的 DATA_DECKS.${deckId} 登记`),
    ...missing.map((name) => `  ${dir}/${name} → 登记了但文件不存在`),
  ];
  if (problems.length > 0) {
    die(`题库文件清单与登记不一致（${deckId}）`, problems.join('\n'));
  }

  const groups = [];
  const parseErrors = [];
  for (const { category, file } of files) {
    const relPath = `${dir}/${file}`;
    try {
      groups.push({ file: relPath, category, cards: JSON.parse(await readText(relPath)) });
    } catch (err) {
      parseErrors.push(`  ${relPath} → ${err.message}`);
    }
  }
  if (parseErrors.length > 0) {
    die(`题库 JSON 解析失败（${deckId}）`, parseErrors.join('\n'));
  }
  return groups;
}

function reportDeck(deckId, cards) {
  const count = (keys, pick) =>
    keys.map((k) => `${k} ${cards.filter((c) => pick(c) === k).length}`).join(' / ');
  console.log(`  ${deckId}: ${cards.length} 张卡`);
  console.log(`    分类：${count(CATEGORIES, (c) => c.category)}`);
  console.log(`    重要度：${count(PRIORITIES, (c) => c.priority)}`);
  console.log(`    带代码：${cards.filter((c) => c.answer?.code?.length > 0).length} 张`);
}

async function main() {
  const byDeck = {};
  for (const deck of DATA_DECKS) {
    const groups = await collectDeckGroups(deck);
    const errors = validateInterviewDeck(groups);
    if (errors.length > 0) {
      die(`题库校验失败（${deck.deckId}），${errors.length} 处问题`, formatValidationErrors(errors));
    }
    byDeck[deck.deckId] = groups.flatMap((g) => g.cards);
  }

  const hot100 = JSON.parse(await readText(QUESTIONS_FILE));
  const expected = serializeDeckSummary(buildDeckSummary({ hot100, ...byDeck }));
  const onDisk = await readTextOrNull(SUMMARY_FILE);

  if (CHECK_ONLY) {
    const staleReason = summaryStaleReason(onDisk, expected);
    if (staleReason) {
      die(`${SUMMARY_FILE} ${staleReason}`, '  跑 `pnpm deck:sync` 重新生成，并把它一起提交');
    }
    console.log(`\n✓ 题库校验通过，${SUMMARY_FILE} 是最新的`);
  } else {
    await writeFile(path.join(ROOT, SUMMARY_FILE), expected, 'utf8');
    const verb = onDisk === expected ? '无变化' : '已更新';
    console.log(`\n✓ 题库校验通过，${SUMMARY_FILE} ${verb}`);
  }

  for (const [deckId, cards] of Object.entries(byDeck)) {
    reportDeck(deckId, cards);
  }
  console.log('');
}

await main();
