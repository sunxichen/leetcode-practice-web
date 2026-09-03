# 专题七：Agent Teams 详解——Orchestrator 工具与内部实现逻辑

Status: done

Follow-ups: [follow-ups.md](../follow-ups.md) #16

## What to build

detail-notes/07-agent-teams-orchestrator-tools.md：Agent Teams 详解，至少包含：为 Orchestrator 设计了哪些工具（delegate_and_wait、delegate_in_background、send_follow_up、interrupt_and_redirect、cancel_team_work、list_team_tasks、check_team_task 等）及每个工具的内部实现逻辑（调度器交互、槽位、队列、超时、事件）。

## Acceptance criteria

- [ ] 全篇明确标注 design_complete（PRD/ADR 为据，运行时尚未实施），不得写成已实现。
- [ ] 工具内部逻辑以 Master PRD + ADR 0001-0006 为准，可用 recap-code/evolution/workflow_agent_teams.py 作白板参照。
- [ ] 与 recap-blog §6.3 一致且更深一层。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
