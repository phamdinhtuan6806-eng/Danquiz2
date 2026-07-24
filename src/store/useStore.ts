import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  autoNext: boolean;
  soundEffects: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

interface UserProgress {
  level: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
}

interface AppState {
  settings: UserSettings;
  progress: UserProgress;
  updateSettings: (settings: Partial<UserSettings>) => void;
  addXP: (amount: number) => void;
  updateStreak: () => void;
}

const initialSettings: UserSettings = {
  theme: 'system',
  autoNext: false,
  soundEffects: true,
  shuffleQuestions: true,
  shuffleOptions: true,
};

const initialProgress: UserProgress = {
  level: 1,
  xp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: '',
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      settings: initialSettings,
      progress: initialProgress,
      
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
        
      addXP: (amount) =>
        set((state) => {
          const newXp = state.progress.xp + amount;
          const newLevel = Math.floor(newXp / 1000) + 1; // 1000 XP per level as a simple formula
          return {
            progress: {
              ...state.progress,
              xp: newXp,
              level: newLevel,
            },
          };
        }),
        
      updateStreak: () =>
        set((state) => {
          const today = new Date().toISOString().split('T')[0];
          if (state.progress.lastStudyDate === today) return state; // Already studied today
          
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          
          let newStreak = 1;
          if (state.progress.lastStudyDate === yesterday) {
            newStreak = state.progress.currentStreak + 1;
          }
          
          return {
            progress: {
              ...state.progress,
              currentStreak: newStreak,
              longestStreak: Math.max(newStreak, state.progress.longestStreak),
              lastStudyDate: today,
            },
          };
        }),
    }),
    {
      name: 'quiz-app-storage',
    }
  )
);
