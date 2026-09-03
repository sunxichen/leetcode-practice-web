# Ticket 28: follow-up #18 — Daytona stopped vs delete 辨析 fragment

Status: done

## 目标
产出 `fragments/f13-daytona-stopped-vs-delete.md`：清晰辨析 Daytona 沙箱 stopped 与 delete（删除/回收）两种状态的区别，并映射回 langAgent Workspace 状态机。

## 要求
- 事实源：`.scratch/langagent-framework-sources/langchain_daytona/`（Daytona SDK 封装）与 `.scratch/langagent-develop-reference` 的 `workspace_service.py`、`daytona_runtime.py`；语义不明处可引 Daytona 公开语义但须标注"未在本地源码核实"。
- 必须覆盖：stopped 的语义（磁盘/文件系统保留、可 start 恢复、auto_stop 触发、计费/资源占用口径以源码注释或 SDK 为准）、delete 的语义（不可恢复、查询返回 not_found）、两者在 Workspace 状态机中的映射（stopped→stopped 态可 resume；delete/not_found→reclaimed→冷启动重建+OSS 产物回灌）、与 `_resume_workspace` 超时/失败路径的关系。
- 与 `fragments/f06-workspace-daytona-states.md` 保持一致、不重复展开，聚焦"区别"本身。
- 纪律：真实函数/状态名逐一核实并标路径行号；不写 commit hash；不虚构。

## 验收标准
1. 所有 Daytona/Workspace 状态名与路径行号经独立 reviewer 核实。
2. 与 f06、recap-blog §2.3 无冲突。
