/**
 * 会话视图状态机 — 学习会话外壳在各渲染分支之间的判定（票 6）。
 *
 * 抽成纯函数是为了脱离 DOM 钉死这组分支规则（模式选择 → 会话总结 →
 * 空状态 → 刷卡），分支顺序与条件与抽出前学习页的内联 if 链逐位一致。
 * loading 分支不属于会话状态（它是进度数据的加载态），留在外壳里判断。
 */
export type SessionView = 'picker' | 'summary' | 'empty' | 'card';

export interface SessionViewInput {
  /** 是否已有会话模式（ModePicker 手动选择，或 ?q= 深链强制的 single）。 */
  hasMode: boolean;
  /** 用户手动点了"结束本次"。 */
  forceFinished: boolean;
  /** 队列已空（或游标越界）。 */
  isEmpty: boolean;
  /** 本次会话已给出的自评总数。 */
  feedbackTotal: number;
  /**
   * 是否单卡模式：单卡自评后的去向是路由策略（由路由层注入的动作接管），
   * 本地不显示会话总结。
   */
  isSingle: boolean;
}

export function resolveSessionView(input: SessionViewInput): SessionView {
  if (!input.hasMode) return 'picker';
  if (input.forceFinished || (input.isEmpty && input.feedbackTotal > 0 && !input.isSingle)) {
    return 'summary';
  }
  if (input.isEmpty) return 'empty';
  return 'card';
}
