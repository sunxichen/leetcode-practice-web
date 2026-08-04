# 题集路由并列，共享一个与题集无关的学习会话外壳

面试题集使用并列的新路由 `/interview/study` 与 `/interview/browse`，而不是把现有页面迁移到 `/decks/[deck]/study` 这样的动态段。同时把 `app/study/page.tsx` 里那约 300 行的会话状态机抽成与题集无关的 `useStudySession` + `StudySessionShell`，由一份 `DeckConfig` 注入三处差异：卡片正反面渲染组件、可选会话模式清单、调度参数。

统一动态路由的收益仅是 URL 好看，代价是现有的 `/study?q=` 深链与书签全部失效。而真正必须解决的问题是不要复制那个状态机（它承载翻卡、队列推进、退出动画、会话统计、撤销等纠缠逻辑），这个问题由 `StudySessionShell` 解决，与 URL 形态无关。

配套的形态变化：`ProgressProvider` 从"单份进度"改为并行加载所有题集的进度并暴露 `useDeckProgress(deckId)`，因为首页入口需要同时显示两个题集各自的待复习数；`Header` 与 `BottomNav` 变为路径感知——底部仍是"学习 / 题库"两个 tab（保护已形成的肌肉记忆），链接按当前题集解析，切换题集这一低频操作放在 Header 的品牌位。
