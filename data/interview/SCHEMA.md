# 面试卡片 schema

面试**题集**的内容模型。这份文档是内容生产的唯一依据：字段定义、范例、以及一段可直接复制给 LLM 的生成 prompt。领域词汇见 [CONTEXT.md](../../CONTEXT.md)，为什么答案以**要点**为单位见 [ADR-0003](../../docs/adr/0003-key-points-as-the-answer-unit.md)，为什么没有难度字段见 [ADR-0004](../../docs/adr/0004-priority-not-difficulty-caps-new-cards.md)。

## 文件划分

题库按**分类**分文件，一个文件一个 JSON 数组：

| 文件 | 分类 | id 前缀 |
| --- | --- | --- |
| `data/interview/dl-basics.json` | `dl-basics`（深度学习基础） | `dl-` |
| `data/interview/project.json` | `project`（项目） | `proj-` |
| `data/interview/tech-stack.json` | `tech-stack`（技术路线） | `tech-` |

分文件是为了让 LLM 一次只产出一个领域、diff 可读。新增分类要同时改三处：`lib/interview-schema.mjs` 的 `DECK_FILES`、`ID_PREFIX_BY_CATEGORY`，以及 `lib/interview.ts` 的静态 import；校验脚本会拒绝目录下未登记的 `.json` 文件。

## 字段

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| `id` | 是 | string | 带分类前缀的语义 slug：小写字母、数字、单连字符分段，全库唯一 |
| `question` | 是 | string | 卡片正面的问题文本，一句话 |
| `category` | 是 | enum | `project` / `tech-stack` / `dl-basics`，必须与所在文件一致 |
| `tags` | 是 | string[] | 至少一个，细粒度主题，用于题库页搜索与筛选 |
| `priority` | 是 | enum | `must`（高频必答）/ `common`（常见）/ `bonus`（加分项） |
| `hint` | 否 | string | 一句话方向指引，**不能泄露答案内容** |
| `answer.key_points` | 是 | string[] | **3-6 条**，每条是可判定"说到没说到"的原子陈述 |
| `answer.elaboration` | 否 | string | 展开叙述、推导。背面默认折叠 |
| `answer.code` | 否 | CodeSnippet[] | 见下表；不需要就整个字段省掉，不要写 `[]` |
| `answer.pitfalls` | 否 | string[] | 常见坑与面试官容易追问的点 |
| `follow_ups` | 否 | string[] | 可能的追问，写成面试官的原话 |
| `related_ids` | 否 | string[] | 互链，必须指向存在的卡且不能是自己 |

`CodeSnippet`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `label` | 是 | 如「朴素实现」「带 mask 的版本」，多段代码时作为轮播标签 |
| `language` | 是 | 见下方支持列表，走数据字段而不是硬编码 Python |
| `code` | 是 | 代码本体，注释解释"为什么这样"而不是"这行做什么" |
| `note` | 否 | 一句话补充：复杂度、适用条件、与生产实现的差异 |

**没有 `difficulty` 字段**（ADR-0004）。代码片段**不复用算法题的 `Solution` 类型**——后者强制时间/空间复杂度与思路摘要三个必填字段，对 loss 实现是纯噪音。

支持的 `language`（`lib/interview-schema.mjs` 的 `SUPPORTED_CODE_LANGUAGES`，每一项在高亮器里都有对应语法）：

```
python  text  json  yaml  sql  javascript  typescript  cpp  c  rust  go  markdown
```

伪码、配置片段、纯文本用 `text`：它原样渲染，而不是被当作 Python 高亮。

## 硬规则

这两条不是建议，写内容时先自查：

1. **卡片粒度**：一张卡 = 一次 1-2 分钟内可口述完的回答，要点 3-6 条。超出的大题拆成「一分钟概述卡 + 若干深挖卡」，用 `related_ids` 互链，而不是把要点堆到 7 条。
2. **要点是原子陈述**：写完每条要点问自己一句"面试时我能明确说这条我说到了还是没说到？"。答不出来就说明它是答案摘要而不是要点，要拆开或改写。

对比：

- ✗ `"讲清楚注意力的计算过程"` —— 无法判定说到没说到，这是提纲。
- ✓ `"分数除以 √d_k 后在 key 那一维做 softmax"` —— 说了就是说了。

**重要度按"真实面试里会不会被问到"标注，不是按知识点难不难**。冷门但很难的题是 `bonus`，简单但每场都问的题是 `must`。

**技术陈述必须准确**：不确定的宁可不写。用户会把这些要点背下来去面试，写错比缺失更糟。

## 范例

### 1. 最小卡：只有要点

```json
{
  "id": "dl-bce-multilabel",
  "question": "多标签分类为什么用 sigmoid + BCE，而不是 softmax + 交叉熵？",
  "category": "dl-basics",
  "tags": ["损失函数"],
  "priority": "common",
  "answer": {
    "key_points": [
      "softmax 强制各类概率和为 1，隐含类别互斥；多标签任务里一个样本可以同时属于多个类。",
      "sigmoid 把每个类当独立的二分类，各自输出 (0,1) 的概率，彼此不归一化。",
      "损失是每个类的二元交叉熵再求和/平均，对每个 logit 的梯度仍是 σ(z) − y。"
    ]
  }
}
```

### 2. 全字段卡：提示、代码、常见坑、追问、互链

```json
{
  "id": "dl-softmax-stability",
  "question": "softmax 为什么要减去最大值？不减会发生什么？",
  "category": "dl-basics",
  "tags": ["数值稳定性", "损失函数"],
  "priority": "must",
  "hint": "先说它为什么合法，再说它防的是哪一侧的溢出。",
  "answer": {
    "key_points": [
      "softmax 对输入平移不变：分子分母同乘 e^{-c} 结果不变，所以减最大值不改变数学结果。",
      "不减会上溢：float32 在输入大于约 88 时 exp 就是 inf，inf/inf 得到 NaN。",
      "减完之后最大项恰好是 exp(0)=1，分母至少为 1，不会出现 0/0。",
      "另一侧的下溢是安全的：过小的项变成 0 只损失精度，不产生 NaN。"
    ],
    "elaboration": "log-softmax 进一步用 log-sum-exp 形式，全程停在 log 域。",
    "code": [
      {
        "label": "稳定的 softmax",
        "language": "python",
        "code": "def softmax(x, axis=-1):\n    # 平移不变性保证结果不变，减最大值把最大指数项压成 exp(0)=1\n    x = x - x.max(axis=axis, keepdims=True)\n    e = np.exp(x)\n    return e / e.sum(axis=axis, keepdims=True)",
        "note": "分母至少为 1，不会出现 0/0。"
      }
    ],
    "pitfalls": ["减最大值只解决上溢；真正的 NaN 常来自整行被屏蔽的 softmax。"]
  },
  "follow_ups": ["为什么框架的交叉熵接口要求传 logits？"],
  "related_ids": ["dl-ce-from-logits"]
}
```

### 3. 大题拆分：概述卡 + 深挖卡互链

概述卡给 STAR 骨架，深挖卡各管一个追问方向，两边都在 `related_ids` 里指向对方。

```json
[
  {
    "id": "proj-rag-overview",
    "question": "介绍一下你做的那个检索增强问答项目。",
    "category": "project",
    "tags": ["RAG", "项目概述"],
    "priority": "must",
    "hint": "一分钟：背景、你的角色、做了什么、量化结果。",
    "answer": {
      "key_points": [
        "背景：客服工单里 60% 的问题答案已经写在文档里，但人工检索平均耗时 4 分钟。",
        "我的角色：独立负责检索与评测两块，模型服务由另一位同事负责。",
        "做法：把文档切块后建向量索引，检索 top-k 交给生成模型，附带引用出处。",
        "结果：首次响应时间从 4 分钟降到 40 秒，答案采纳率 71%。"
      ]
    },
    "follow_ups": ["为什么选向量检索而不是关键词检索？", "最大的技术难点是什么？"],
    "related_ids": ["proj-rag-retrieval-choice"]
  },
  {
    "id": "proj-rag-retrieval-choice",
    "question": "这个项目为什么选向量检索而不是关键词检索？",
    "category": "project",
    "tags": ["RAG", "技术取舍"],
    "priority": "must",
    "answer": {
      "key_points": [
        "工单里的口语化表述与文档术语几乎不重叠，BM25 的召回只有 38%。",
        "向量检索把召回提到 76%，代价是要维护索引与 embedding 版本。",
        "最终是混合检索：BM25 保住精确的型号/编号匹配，向量补语义召回。"
      ],
      "pitfalls": ["别把它说成「向量检索更先进」——面试官要的是数字和取舍。"]
    },
    "related_ids": ["proj-rag-overview"]
  }
]
```

## 工作流

```bash
# 1. 把新卡写进对应的分类文件
# 2. 校验并重新生成首页摘要（data/deck-summary.json）
pnpm deck:sync
# 3. 跑测试与构建
pnpm test && pnpm build
```

`pnpm build` 里串了 `node scripts/validate-deck.mjs --check`（不走 `prebuild`——pnpm 10 默认不执行 pre/post 脚本）。它会在两种情况下让构建失败：

- 题库有坏数据 —— 报出文件、下标、卡片 id、字段与错误码
- `data/deck-summary.json` 过期 —— 加了卡但忘了 `pnpm deck:sync`，否则首页计数会静默偏差

所以 `data/deck-summary.json` 是生成物但必须提交。

## 校验规则

`lib/interview-validate.mjs` 的 `validateInterviewDeck` 是纯函数，返回错误列表。错误码：

| code | 含义 |
| --- | --- |
| `duplicate-id` | id 在题库里重复 |
| `invalid-id-format` | id 不是小写 kebab 语义 slug |
| `invalid-id-prefix` | id 缺少该分类的前缀 |
| `invalid-category` / `invalid-priority` | 分类或重要度取值非法 |
| `category-file-mismatch` | 卡片的分类与所在文件不符 |
| `key-points-count` | 要点缺失或条数不在 3-6 |
| `empty-key-point` | 要点是空字符串 |
| `dangling-related-id` / `self-related-id` | 互链指向不存在的卡 / 指向自己 |
| `unsupported-code-language` | 代码语言不被高亮器支持 |
| `missing-field` / `empty-string` / `empty-array` / `invalid-shape` | 必填字段缺失、可选字段写了却是空值、类型不对 |

## 生成 prompt

以下整段可直接复制给 LLM，末尾附上你的项目文档 / 技术方案 / 笔记。

---

你是我的面试准备助手。我在用一个间隔重复应用背面试答案，需要你把我提供的材料转成符合 schema 的**面试卡片** JSON。

**输出要求**：只输出一个 JSON 数组，不要 markdown 代码块以外的任何解释文字。

**字段**：

```jsonc
{
  "id": "带分类前缀的语义 slug，小写字母数字与单连字符，如 dl-attention-mask",
  "question": "卡片正面的问题，写成面试官会问出的原话",
  "category": "project | tech-stack | dl-basics（三选一，且与文件对应）",
  "tags": ["细粒度主题，至少一个"],
  "priority": "must | common | bonus",
  "hint": "可选。一句话方向指引，不能泄露答案内容",
  "answer": {
    "key_points": ["3-6 条原子陈述，必填"],
    "elaboration": "可选。推导或展开叙述",
    "code": [
      { "label": "如「朴素实现」", "language": "python", "code": "…", "note": "可选" }
    ],
    "pitfalls": ["可选。常见坑与追问点"]
  },
  "follow_ups": ["可选。可能的追问"],
  "related_ids": ["可选。互链，必须指向本批次或已有题库里存在的 id"]
}
```

id 前缀：`project` → `proj-`，`tech-stack` → `tech-`，`dl-basics` → `dl-`。
`language` 只能取：`python` `text` `json` `yaml` `sql` `javascript` `typescript` `cpp` `c` `rust` `go` `markdown`。伪码与纯文本用 `text`。

**硬规则**：

1. 一张卡 = 一次 1-2 分钟内可口述完的回答，要点 3-6 条。超出的大题必须拆成「一分钟概述卡 + 深挖卡」，用 `related_ids` 双向互链，不要把要点堆到 7 条以上。
2. 每条要点必须是可判定"说到没说到"的原子陈述，不是答案摘要。"讲清楚 X 的原理"这种写法不合格。
3. `priority` 按"真实面试里会不会被问到"标注，不是按知识点难度。每场都问的简单题是 `must`，冷门但难的题是 `bonus`。
4. 技术陈述必须准确。**不确定的不要写**，宁可少一张卡。如果材料里的信息不足以支撑一条准确的要点，就把这条去掉，并在 JSON 之后单独列出你不确定的地方。
5. 代码要真的能跑通逻辑，注释解释"为什么这样"而不是"这行做什么"。
6. 全中文，专有名词与公式保留原文（如 softmax、LayerNorm、√d_k）。
7. 可选字段不需要就整个省掉，不要写成空数组或空字符串。

**格式范例**（照这个结构，别照抄内容）：

```json
{
  "id": "dl-attention-mask",
  "question": "注意力里的 mask 怎么实现？causal mask 和 padding mask 有什么区别？",
  "category": "dl-basics",
  "tags": ["Transformer", "注意力"],
  "priority": "common",
  "hint": "关键是「填在 softmax 之前」，以及两种 mask 的形状不同。",
  "answer": {
    "key_points": [
      "mask 作用在 softmax 之前的分数上：被屏蔽位填成极小值，softmax 后权重恰好为 0。",
      "causal mask 是上三角屏蔽，形状 (L, L)，与 batch 无关。",
      "padding mask 屏蔽 batch 内补齐出来的位置，形状 (B, 1, 1, L_k)，每个样本不同。"
    ],
    "pitfalls": ["整行全被屏蔽时 softmax 会得到 NaN。"]
  },
  "related_ids": ["dl-attention-scaled-dot-product"]
}
```

现在，材料如下：

（把项目文档 / 技术方案 / 笔记贴在这里）
