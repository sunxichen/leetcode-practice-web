import type { ComponentType } from 'react';
import type { SchedulingParams } from '@/lib/schedulingParams';
import type { SessionCard } from '@/lib/studyQueue';
import type { CardState, Difficulty, FeedbackType, SessionMode } from '@/lib/types';
import type { DeckId } from '@/lib/decks/ids';

/**
 * 题集 (Deck) 配置 — 一个题集聚合它的卡片数据源、调度参数、可选会话模式清单
 * 与卡片正反面渲染组件。所有题集共用同一套记忆算法、队列引擎与进度存储机制，
 * 差异全部通过这份配置注入（ADR-0001 / ADR-0005）。
 *
 * 每个字段的当下消费者：
 * - id：注册表键名；票 5 起也作为进度文档键名（user_progress:<id>）与白名单
 * - dataSource：useStudyQueue 取卡片集与当前卡
 * - schedulingParams：队列生成（generateQueue）、自评写入（updateProgress →
 *   scheduleNext）、自评条各档到期预览（FeedbackBar）
 * - sessionModes：ModePicker 决定提供哪些模式入口
 * - components：会话外壳经 FlashCard 容器渲染卡片正反面
 * - getBackPageCount：会话外壳钳制键盘"上一/下一"键的背面分页下标
 * - getModePickerData：ModePicker 的标签云与难度分布统计
 * - sortNewCards：useStudyQueue 注入纯队列函数的 brand-new 段排序（票 10）
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

/**
 * ModePicker 需要的统计数据。标签云与难度分布这类统计只对提供对应模式的
 * 题集有意义（按标签/按难度模式要求卡片带相应字段），所以统计逻辑是题集
 * 特定的，由题集配置从卡片集派生后注入——会话外壳与 ModePicker 都不直接
 * 对卡片做 tags/difficulty 判断。
 */
export interface ModePickerData {
  /** 按卡片数排序的顶部标签（按标签模式的 chips），条数上限由题集配置决定。
   * 仅提供按标签模式的题集需要给出；不提供该模式的题集留 undefined，
   * 不要编造零值。 */
  topTags?: string[];
  /** 各难度卡片总数（按难度模式的 chips）。仅提供按难度模式的题集需要给出。 */
  difficultyCounts?: Record<Difficulty, number>;
}

export interface DeckConfig<C extends SessionCard = SessionCard> {
  /** 题集标识：注册表键名，必须在白名单 (DECK_IDS) 内——票 5 起它也是
   * 进度文档键名（user_progress:<id>）与读写校验的凭据。 */
  id: DeckId;
  /** 题集显示名：会话总结等需要标明所属题集的文案使用。 */
  name: string;
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
  /**
   * 背面分页数：背面轮播一共有多少页（LeetCode 题集是解法数，面试题集是
   * 代码段数）。会话外壳的键盘"上一/下一"键用它钳制下标边界，不直接读取
   * 任何题集特定的卡片字段。
   */
  getBackPageCount(card: C): number;
  /** ModePicker 统计：从卡片集派生标签云与难度分布（见 ModePickerData）。
   * 题集不提供按标签/按难度模式时，对应字段留 undefined。 */
  getModePickerData(cards: C[]): ModePickerData;
  /**
   * 题库页路径：会话总结"浏览题库"与空状态"浏览全部题目"的去向。
   * 没有题库页的题集为 undefined，那两个按钮不渲染——绝不指向 404，
   * 也不把用户送去别的题集的题库页。
   */
  browsePath?: string;
  /**
   * 自评条副标签：按当前卡派生四档标注（面试题集的要点命中区间锚，
   * ADR-0003）。缺省时自评条显示各档到期时间预览（LeetCode 题集现状，
   * 外观与文案不变）。标注只是按钮上的辅助文案，不是交互——自评仍然是
   * 四个按钮一击完成。
   */
  getFeedbackAnchors?(card: C): Record<FeedbackType, string>;
  /**
   * smart 队列 brand-new 段的引入顺序：有限的新卡额度先花在哪些卡上
   * （面试题集按重要度，ADR-0004）。由 useStudyQueue 注入纯队列函数，
   * 只作用于 brand-new 段——learning 逾期、review 逾期、3:1 编织与
   * learning 插回的既有顺序不受影响。缺省 = 保持输入题库数组顺序
   * （LeetCode 题集现状，逐位钉死）。实现不得改动入参数组。
   */
  sortNewCards?(cards: C[]): C[];
}
