# 解答 follow-up 11/12：glob vs grep、压缩提示词自定义

Status: done

Source spec: [spec-recap-blog.md](../spec-recap-blog.md)
Follow-ups: [follow-ups.md](../follow-ups.md) #11 #12

## What to build

- fragments/f11-glob-vs-grep.md：glob 与 grep 的区别（语义、输入输出、适用场景），并结合 deepagents 0.6.12 中二者作为工具/后端能力的实际形态说明（源码核实）。
- fragments/f12-compaction-prompt.md：上下文压缩所用提示词是否可自定义、如何自定义——以 deepagents 0.6.12 SummarizationMiddleware 真实接口为准（构造参数/默认值/覆盖方式），并说明本项目当前是否自定义。

## Acceptance criteria

- [ ] 结论必须有框架源码行级证据。
- [ ] 本项目"是否自定义"的结论须有 develop 基线证据，没有就明确写"未自定义"。

## Blocked by

- [14 - 执行终检与修订](14-final-verification-and-revision.md)
