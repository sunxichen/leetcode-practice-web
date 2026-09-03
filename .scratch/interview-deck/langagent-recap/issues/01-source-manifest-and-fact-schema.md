# 建立 Source Manifest 与 Fact Schema

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)

## What to build

建立本次 recap 的证据基础设施：固定所有可用源码和文档基线，定义统一 claim schema，并将已确认的机制清单映射为待核验主题。后续 worker 应能用同一套成熟度、置信度和可发布状态记录事实。

## Acceptance criteria

- [x] Source manifest 覆盖最新 `develop`、A2UI 实现分支、相关设计材料、测试、Git 演进和需要下钻的框架仓库。
- [x] 每个 source 标明版本或时间基线、用途、权威性和已知局限。
- [x] Fact schema 至少包含 claim、主题、成熟度、证据类型、证据位置、置信度、脱敏要求和确认状态。
- [x] 已确认机制清单全部进入覆盖矩阵，没有静默遗漏。
- [x] 明确 fact base 只作为共享证据索引，不替代后续 writing worker 的独立源码 research。
- [x] 全过程不修改 `langAgent` 当前工作目录。

## Blocked by

None - can start immediately.

## Comments

- 产物已完成：
  - [source-manifest.md](../source-manifest.md)
  - [fact-base.md](../fact-base.md)
  - [mechanism-coverage.md](../mechanism-coverage.md)
  - [evidence-gaps.md](../evidence-gaps.md)


