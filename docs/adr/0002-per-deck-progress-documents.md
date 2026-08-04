# 每个题集一份独立的进度文档

复习进度按题集分键存放（KV 与 localStorage 各自 `user_progress:hot100`、`user_progress:interview`），而不是在单份文档里嵌套 decks 结构。

决定性理由是 `reconcileProgress` 的语义：它对整份文档比较 `lastUpdatedAt`，赢者全取。两个题集若共用一份文档，"手机上刷面试题、电脑上刷 LeetCode"会让其中一份被整体覆盖，直接丢进度。分键之后两个题集的写入天然不冲突，且现有 hot100 数据零迁移。

代价是 `dailyStats` 与 `streak` 成为题集内的概念，不存在全局连续天数。这是接受的：两个题集在用户心智上完全独立，各有入口，连续天数分别统计即可。
