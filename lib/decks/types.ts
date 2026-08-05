import type { ComponentType } from 'react';
import type { SchedulingParams } from '@/lib/schedulingParams';
import type { SessionCard } from '@/lib/studyQueue';
import type { CardState, SessionMode } from '@/lib/types';

/**
 * 题集 (Deck) 配置 — 一个题集聚合它的卡片数据源、调度参数、可选会话模式清单
 * 与卡片正反面渲染组件。所有题集共用同一套记忆算法、队列引擎与进度存储机制，
 * 差异全部通过这份配置注入（ADR-0001 / ADR-0005）。
 *
 * 每个字段的当下消费者：
 * - id：注册表键名；票 5 起也作为进度文档键名（user_progress:<id>）与白名单
 * - dataSource：useStudyQueue 取卡片集与当前卡；ModePicker 统计标签与难度分布
 * - schedulingParams：队列生成（generateQueue）、自评写入（updateProgress →
 *   scheduleNext）、自评条各档到期预览（FeedbackBar）
 * - sessionModes：ModePicker 决定提供哪些模式入口
 * - components：学习页经 FlashCard 容器渲染卡片正反面
 *
 * 本文件只含类型，不引用任何具体题集的实现，因此可以被 hook、页面、配置
 * 任意方向 import 而不构成环。
 */

/** 卡片数据源：题集全部卡片的读取接口。 */
export interface DeckDataSource<C extends SessionCard> {
  getAllCards(): C[];
  getCardById(id: string): C | undefined;
}

/** 卡片正面渲染组件的 props。 */
export interface DeckCardFrontProps<C extends SessionCard> {
  card: C;
  cardState?: CardState;
}

/** 卡片背面渲染组件的 props。 */
export interface DeckCardBackProps<C extends SessionCard> {
  card: C;
  /** 背面轮播（LeetCode 的多种解法；面试题集的多段代码）当前下标，由会话外壳持有 */
  activeSolutionIndex: number;
  onSolutionIndexChange: (index: number) => void;
  cardState?: CardState;
  learningStep?: number;
  intervalDays?: number;
}

/** 卡片正反面渲染组件。翻卡容器（FlashCard）是所有题集共享的外壳，不在配置里。 */
export interface DeckCardComponents<C extends SessionCard> {
  CardFront: ComponentType<DeckCardFrontProps<C>>;
  CardBack: ComponentType<DeckCardBackProps<C>>;
}

export interface DeckConfig<C extends SessionCard = SessionCard> {
  /** 题集标识：注册表键名。 */
  id: string;
  dataSource: DeckDataSource<C>;
  schedulingParams: SchedulingParams;
  /**
   * 可选会话模式清单：该题集提供哪些会话模式。这是"某模式对题集不适用"的
   * 语义边界——例如面试题集的卡片没有 difficulty，它的清单里就没有
   * 'difficulty'。'single'（单卡）由深链触发、不出现在模式选择器里，
   * 但属于题集支持的模式，应在清单中。
   */
  sessionModes: readonly SessionMode['kind'][];
  components: DeckCardComponents<C>;
}
