# Issue tracker: Local Markdown

本仓库是单人项目，issue 与 spec 以 markdown 文件的形式存放在 `.scratch/`。远端虽然指向 GitHub，但本机未安装 `gh` CLI，不使用 GitHub Issues。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- spec（PRD）位于 `.scratch/<feature-slug>/PRD.md`
- 实施 issue 位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 编号
- 三态状态记录为文件顶部的 `Status:` 行，取值见 `triage-labels.md`
- 讨论追加在文件底部的 `## Comments` 标题下

## 技能说"发布到 issue tracker"时

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 技能说"取出相关 ticket"时

读取被引用路径的文件。通常用户会直接给出路径或编号。

## PR 作为需求入口

否。本仓库不接收外部 PR。
