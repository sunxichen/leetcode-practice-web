import { describe, it, expect } from 'vitest';
import { resolveSessionView, type SessionViewInput } from '@/components/study/sessionView';

/**
 * 会话视图分支的回归锚点（票 6）：钉死"无模式先选模式、非 single 队列耗尽
 * 或手动结束后显示总结、single 不显示本地总结、空队列显示空状态"这组规则，
 * 与抽出前学习页的内联 if 链逐位一致。
 */

const base: SessionViewInput = {
  hasMode: true,
  forceFinished: false,
  isEmpty: false,
  feedbackTotal: 0,
  isSingle: false,
};

describe('会话视图状态机 (resolveSessionView)', () => {
  it('没有会话模式时先显示模式选择，其余状态不影响该分支', () => {
    expect(resolveSessionView({ ...base, hasMode: false })).toBe('picker');
    expect(resolveSessionView({ ...base, hasMode: false, isEmpty: true, feedbackTotal: 3 })).toBe('picker');
    expect(resolveSessionView({ ...base, hasMode: false, forceFinished: true })).toBe('picker');
  });

  it('队列未耗尽时显示刷卡视图，与已给出的自评数无关', () => {
    expect(resolveSessionView(base)).toBe('card');
    expect(resolveSessionView({ ...base, feedbackTotal: 5 })).toBe('card');
    expect(resolveSessionView({ ...base, isSingle: true })).toBe('card');
  });

  it('非 single 模式队列耗尽且已有自评时显示会话总结', () => {
    expect(resolveSessionView({ ...base, isEmpty: true, feedbackTotal: 1 })).toBe('summary');
    expect(resolveSessionView({ ...base, isEmpty: true, feedbackTotal: 12 })).toBe('summary');
  });

  it('手动"结束本次"无论队列是否耗尽、有无自评都显示会话总结', () => {
    expect(resolveSessionView({ ...base, forceFinished: true })).toBe('summary');
    expect(resolveSessionView({ ...base, forceFinished: true, isEmpty: true, feedbackTotal: 0 })).toBe('summary');
  });

  it('single 模式不显示本地总结：队列耗尽后落到空状态，去向由路由层接管', () => {
    expect(resolveSessionView({ ...base, isSingle: true, isEmpty: true, feedbackTotal: 1 })).toBe('empty');
  });

  it('空队列且没有自评时显示空状态', () => {
    expect(resolveSessionView({ ...base, isEmpty: true })).toBe('empty');
    expect(resolveSessionView({ ...base, isSingle: true, isEmpty: true })).toBe('empty');
  });
});
