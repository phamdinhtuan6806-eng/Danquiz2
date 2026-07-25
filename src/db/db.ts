import Dexie, { type Table } from 'dexie';

export type QuestionType = 'single' | 'multiple' | 'matching';

export interface Question {
  id: string;
  type?: QuestionType; // Defaults to 'single' if missing
  question: string;
  options: string[];
  correctAnswer: string; // Used for all types, but stores stringified JSON for multiple/matching
  explanation: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface QuestionStats {
  questionId: string;
  timesSeen: number;
  timesCorrect: number;
  timesIncorrect: number;
  masteryScore: number; // 0 to 100
  isFavorite: boolean;
  isBookmarked: boolean;
  
  // Spaced Repetition (SM-2 Algorithm)
  easeFactor: number;
  interval: number; // in days
  nextReviewDate: number; // timestamp
}

export interface ActivityLog {
  date: string; // YYYY-MM-DD
  xpEarned: number;
  questionsAnswered: number;
  correctCount: number;
}

export class QuizDatabase extends Dexie {
  questions!: Table<Question, string>;
  stats!: Table<QuestionStats, string>;
  activity!: Table<ActivityLog, string>;

  constructor() {
    super('QuizDatabase');
    this.version(1).stores({
      questions: 'id, category, difficulty, createdAt',
      stats: 'questionId, isFavorite, isBookmarked, nextReviewDate, masteryScore',
      activity: 'date'
    });
  }
}

export const db = new QuizDatabase();
