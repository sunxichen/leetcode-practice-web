/**
 * 题集标识白名单 — 全仓库唯一的题集标识清单（票 5）。
 *
 * 单独成模块、不引用任何题集配置的原因：进度读写的两侧——浏览器端
 * (lib/storage.ts) 与 API 路由 (app/api/progress/route.ts)——都要按这份
 * 白名单校验题集标识，而 API 路由不应为了几个字符串把题集配置里的题库
 * 数据与卡面组件一起打进 serverless 包。
 *
 * 与注册表 (lib/decks/index.ts) 的同步由编译期保证：DECKS 声明了
 * `satisfies Record<DeckId, unknown>`，清单与注册表键集不一致即编译失败。
 */
export const DECK_IDS = ['hot100', 'interview', 'resume'] as const;

/** 题集标识：已注册题集的键名。 */
export type DeckId = (typeof DECK_IDS)[number];

/**
 * 运行时白名单校验。非法标识必须被明确拒绝，绝不能回落到默认题集——
 * 一次拼错的请求若静默写到 hot100 的键，就会用空文档覆盖真实进度。
 */
export function isDeckId(value: unknown): value is DeckId {
  return typeof value === 'string' && (DECK_IDS as readonly string[]).includes(value);
}
