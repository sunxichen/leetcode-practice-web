import type { Question } from '@/lib/types';
import questionsData from '@/data/questions.json';

const questions: Question[] = questionsData as Question[];

export function getAllQuestions(): Question[] {
  return questions;
}

export function getQuestionById(id: string): Question | undefined {
  return questions.find(q => q.id === id);
}

export function getAllTags(): string[] {
  const tagSet = new Set<string>();
  questions.forEach(q => q.tags.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}
