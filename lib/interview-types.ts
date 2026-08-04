/** 面试题集的内容模型。调度状态复用 QuestionProgress，见 lib/types.ts。
 *
 * 取值清单（分类、重要度、代码语言、要点条数上下界）的唯一来源是
 * lib/interview-schema.mjs —— 校验器与构建脚本在纯 Node 下运行，读不了 .ts。
 * 这里的联合类型必须与那份清单一致，lib/interview-schema.test.mjs 有对应断言。 */

/** 分类：面试题集内部的一级划分，一张卡属于且只属于一个 */
export type InterviewCategory = 'project' | 'tech-stack' | 'dl-basics';

/** 重要度：这张卡在真实面试中被问到的可能性，不是题目难度（ADR-0004） */
export type Priority = 'must' | 'common' | 'bonus';

/** 答案中的一段代码。语言走数据字段，不复用算法题的 Solution
 * ——后者强制复杂度与思路摘要，对 loss 实现是纯噪音。 */
export interface CodeSnippet {
  /** 如「朴素实现」「带 mask 的版本」，多段代码时作为轮播标签 */
  label: string;
  /** 高亮器支持的语言标识，见 interview-schema.mjs 的 SUPPORTED_CODE_LANGUAGES */
  language: string;
  code: string;
  note?: string;
}

export interface InterviewAnswer {
  /** 要点：3-6 条原子陈述，判定标准是「能被明确地说到或没说到」（ADR-0003） */
  key_points: string[];
  /** 展开叙述、推导。背面默认折叠 */
  elaboration?: string;
  code?: CodeSnippet[];
  /** 常见坑与面试官追问点 */
  pitfalls?: string[];
}

/** 一张面试卡 = 一次 1-2 分钟内可口述完的回答。超出的大题拆成概述卡 +
 * 深挖卡，用 related_ids 互链，而不是把要点写到 6 条以上。 */
export interface InterviewCard {
  /** 带分类前缀的语义 slug，如 dl-attention-complexity */
  id: string;
  question: string;
  category: InterviewCategory;
  /** 细粒度主题，用于题库页搜索与筛选 */
  tags: string[];
  priority: Priority;
  /** 一句话方向指引，不泄露答案内容 */
  hint?: string;
  answer: InterviewAnswer;
  follow_ups?: string[];
  related_ids?: string[];
}
