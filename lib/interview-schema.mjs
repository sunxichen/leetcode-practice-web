/** 面试题集内容模型的取值清单：分类、重要度、代码语言、要点条数上下界、
 * 分类文件与 id 前缀的对应关系。
 *
 * 这是这些取值的唯一来源。之所以是 .mjs 而不是 .ts：校验器与构建脚本要在
 * `node scripts/validate-deck.mjs` 下直接跑（build 串联在 next build 之前），
 * 没有编译步骤可用。TS 侧的联合类型见 lib/interview-types.ts。 */

/** @typedef {'project' | 'tech-stack' | 'dl-basics'} InterviewCategory */
/** @typedef {'must' | 'common' | 'bonus'} Priority */

/** 分类的取值清单。顺序即摘要里分布字段的键顺序。 */
export const CATEGORIES = ['project', 'tech-stack', 'dl-basics'];

/** 重要度的取值清单。顺序即新卡引入的优先顺序（高频必答 → 常见 → 加分项）。 */
export const PRIORITIES = ['must', 'common', 'bonus'];

/** 分类 → 题库文件名。新增分类时这里与 lib/interview.ts 的静态 import 都要加，
 * 校验脚本会拒绝 data/interview/ 下未在此登记的 .json 文件。 */
export const DECK_FILES = [
  { category: 'dl-basics', file: 'dl-basics.json' },
  { category: 'project', file: 'project.json' },
  { category: 'tech-stack', file: 'tech-stack.json' },
];

/**
 * 面试卡片题库的数据目录注册表：每个面试型题集一个目录，目录里的 .json
 * 必须与登记的文件一一对应——校验脚本拒绝未登记的文件（静默不进题库）
 * 与已登记但缺失的文件（静态 import 直接构建失败）。
 */
export const DATA_DECKS = [
  {
    deckId: 'interview',
    dir: 'data/interview',
    files: DECK_FILES,
  },
  {
    deckId: 'resume',
    dir: 'data/resume',
    files: [
      { category: 'project', file: 'project.json' },
      { category: 'tech-stack', file: 'tech-stack.json' },
    ],
  },
];

/** 分类 → id 前缀。id 人眼可读、能直接看出属于哪个分类，
 * 插入新题时不需要重排编号。 */
export const ID_PREFIX_BY_CATEGORY = {
  'dl-basics': 'dl-',
  project: 'proj-',
  'tech-stack': 'tech-',
};

/** 语义 slug：小写字母、数字，用单个连字符分段。 */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 要点条数的硬下界与上界（ADR-0003 的卡片粒度规则）。 */
export const KEY_POINTS_MIN = 3;
export const KEY_POINTS_MAX = 6;

/** 高亮器（prism-react-renderer 内置语法）支持的语言。写在这里的每一项都在
 * Prism.languages 里有对应语法，lib/interview-schema.test.mjs 对着真实的高亮器断言。
 * 伪码与纯文本用 'text'：它是 prism 的空语法，原样渲染而不是当作 Python 高亮。 */
export const SUPPORTED_CODE_LANGUAGES = [
  'python',
  'text',
  'json',
  'yaml',
  'sql',
  'javascript',
  'typescript',
  'cpp',
  'c',
  'rust',
  'go',
  'markdown',
];
