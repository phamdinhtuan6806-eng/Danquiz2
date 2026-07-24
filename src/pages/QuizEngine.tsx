import React, { useState, useEffect } from 'react';
import { type Question, type QuestionStats } from '../db/db';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, ArrowRight, Brain, Trash2, BookOpen } from 'lucide-react';
import confetti from 'canvas-confetti';

export function QuizEngine() {
  const { addXP, updateStreak } = useStore();
  const [questions, setQuestions] = useState<(Question & { stats: QuestionStats })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionScore, setSessionScore] = useState(0);

  const [step, setStep] = useState<'select_subject' | 'study'>('select_subject');
  const [subjects, setSubjects] = useState<{name: string, count: number}[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('questions').select('category');
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach(d => {
        if (d.category) {
          counts[d.category] = (counts[d.category] || 0) + 1;
        }
      });
      const unique = Object.keys(counts).map(name => ({ name, count: counts[name] }));
      setSubjects(unique);
    }
    setLoading(false);
  };

  const startStudy = async (subject: string) => {
    setSelectedSubject(subject);
    setStep('study');
    setCurrentIndex(0);
    setSessionScore(0);
    await loadQuestions(subject);
  };

  const loadQuestions = async (subject: string) => {
    setLoading(true);
    const now = Date.now();
    
    const { data: qData } = await supabase
      .from('questions')
      .select('*')
      .eq('category', subject);
      
    if (!qData || qData.length === 0) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    const questionIds = qData.map(q => q.id);
    
    let { data: stats } = await supabase
      .from('question_stats')
      .select('*')
      .in('question_id', questionIds)
      .lte('next_review_date', now)
      .limit(20);
      
    if (!stats || stats.length === 0) {
      const res = await supabase.from('question_stats').select('*').in('question_id', questionIds).limit(20);
      stats = res.data || [];
    }

    if (stats.length === 0) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    const qs = stats.map(stat => {
       const q = qData.find(x => x.id === stat.question_id);
       if (!q) return null;
       return {
         id: q.id,
         question: q.question,
         options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
         correctAnswer: q.correct_answer,
         explanation: q.explanation,
         category: q.category,
         difficulty: q.difficulty,
         tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags,
         createdAt: new Date(q.created_at).getTime(),
         updatedAt: new Date(q.updated_at).getTime(),
         stats: {
           questionId: stat.question_id,
           timesSeen: stat.times_seen,
           timesCorrect: stat.times_correct,
           timesIncorrect: stat.times_incorrect,
           masteryScore: stat.mastery_score,
           isFavorite: stat.is_favorite,
           isBookmarked: stat.is_bookmarked,
           easeFactor: stat.ease_factor,
           interval: stat.interval,
           nextReviewDate: Number(stat.next_review_date)
         }
       };
    }).filter(Boolean) as (Question & { stats: QuestionStats })[];
    
    qs.sort(() => Math.random() - 0.5);
    setQuestions(qs);
    setLoading(false);
  };

  const handleSelect = async (option: string) => {
    if (isRevealed) return;
    setSelectedAnswer(option);
    setIsRevealed(true);
    
    const currentQ = questions[currentIndex];
    const isCorrect = option === currentQ.correctAnswer;
    
    if (isCorrect) {
      setSessionScore(s => s + 1);
      addXP(10); // Base XP for correct answer
      updateStreak();
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else {
      addXP(2); // Participation XP
      updateStreak();
    }
    
    // SuperMemo-2 (SM-2) simplified algorithm for Spaced Repetition
    const qStats = currentQ.stats;
    let newInterval = qStats.interval;
    let newEase = qStats.easeFactor;
    
    const quality = isCorrect ? 4 : 0; // Simplified quality: 4 (correct), 0 (wrong)
    
    if (isCorrect) {
      if (qStats.timesCorrect === 0) {
        newInterval = 1;
      } else if (qStats.timesCorrect === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(qStats.interval * qStats.easeFactor);
      }
    } else {
      newInterval = 1;
    }
    
    newEase = newEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEase < 1.3) newEase = 1.3;
    
    const now = Date.now();
    const nextDate = now + (newInterval * 24 * 60 * 60 * 1000);
    
    const updatedStats = {
      times_seen: qStats.timesSeen + 1,
      times_correct: isCorrect ? qStats.timesCorrect + 1 : qStats.timesCorrect,
      times_incorrect: isCorrect ? qStats.timesIncorrect : qStats.timesIncorrect + 1,
      mastery_score: isCorrect ? Math.min(100, qStats.masteryScore + 10) : Math.max(0, qStats.masteryScore - 20),
      ease_factor: newEase,
      interval: newInterval,
      next_review_date: nextDate
    };
    
    await supabase.from('question_stats').update(updatedStats).eq('question_id', qStats.questionId);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to permanently delete this question?')) {
      const currentQ = questions[currentIndex];
      await supabase.from('questions').delete().eq('id', currentQ.id);
      
      const newQuestions = questions.filter((_, i) => i !== currentIndex);
      setQuestions(newQuestions);
      
      if (newQuestions.length === 0) {
         setSessionScore(0);
         setCurrentIndex(0);
         loadQuestions(selectedSubject!);
      } else {
         if (currentIndex >= newQuestions.length) {
            setCurrentIndex(0);
         }
         setSelectedAnswer(null);
         setIsRevealed(false);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setSelectedAnswer(null);
      setIsRevealed(false);
      setCurrentIndex(c => c + 1);
    } else {
      // End of session
      loadQuestions(selectedSubject!);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setIsRevealed(false);
      setSessionScore(0);
    }
  };

  if (step === 'select_subject') {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold">Chọn môn học</h1>
          <p className="text-muted-foreground">Bạn muốn ôn tập môn nào hôm nay?</p>
        </div>
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin text-primary"><Brain size={48} /></div></div>
        ) : subjects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <BookOpen size={64} className="text-muted-foreground opacity-20" />
            <h2 className="text-xl font-bold">Chưa có môn học nào</h2>
            <p className="text-muted-foreground">Hãy vào phần Import để tạo câu hỏi và môn học mới.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((sub) => (
              <Card 
                key={sub.name} 
                glass 
                className="p-6 cursor-pointer hover:border-primary/50 transition-all hover:-translate-y-1 group relative overflow-hidden"
                onClick={() => startStudy(sub.name)}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{sub.name}</h3>
                <p className="text-sm text-muted-foreground font-medium">{sub.count} câu hỏi</p>
                <div className="mt-4 flex justify-end">
                  <div className="bg-primary/10 text-primary p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight size={16} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="animate-spin text-primary"><Brain size={48} /></div></div>;
  }
  
  if (questions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4">
        <Brain size={64} className="text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">Chưa có câu hỏi nào!</h2>
        <p className="text-muted-foreground">Môn này hiện tại chưa có câu hỏi nào để ôn tập.</p>
        <Button onClick={() => setStep('select_subject')}>Quay lại chọn môn</Button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <select 
            className="p-2 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary outline-none font-medium max-w-[200px] truncate"
            value={selectedSubject || ''}
            onChange={(e) => startStudy(e.target.value)}
          >
            {subjects.map(sub => (
              <option key={sub.name} value={sub.name}>{sub.name}</option>
            ))}
          </select>
          <div className="bg-primary/20 p-2 rounded-xl text-primary font-bold shrink-0">
            {currentIndex + 1} / {questions.length}
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            <span>Score: {sessionScore}</span>
          </div>
        </div>
        
        <div className="h-2 w-full md:w-64 bg-secondary rounded-full overflow-hidden shrink-0">
          <motion.div 
            className="h-full bg-primary" 
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col"
        >
          <Card glass className="p-8 mb-8 relative group">
            <button 
              onClick={handleDelete}
              className="absolute top-4 right-4 text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-2 rounded-xl transition-colors md:opacity-0 group-hover:opacity-100"
              title="Delete this question"
            >
              <Trash2 size={20} />
            </button>
            <h2 className="text-2xl md:text-3xl font-semibold leading-relaxed pr-8">
              {currentQ.question}
            </h2>
            {currentQ.category && (
              <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-medium">
                {currentQ.category}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQ.options.map((option, i) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === currentQ.correctAnswer;
              
              let stateClass = "border-border hover:border-primary/50 hover:bg-primary/5";
              
              if (isRevealed) {
                if (isCorrect) {
                  stateClass = "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400";
                } else if (isSelected) {
                  stateClass = "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400";
                } else {
                  stateClass = "border-border opacity-50";
                }
              }

              return (
                <motion.button
                  key={i}
                  whileHover={!isRevealed ? { scale: 1.02 } : {}}
                  whileTap={!isRevealed ? { scale: 0.98 } : {}}
                  onClick={() => handleSelect(option)}
                  disabled={isRevealed}
                  className={`p-6 rounded-2xl border-2 text-left transition-all duration-300 relative ${stateClass}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 border-current opacity-70">
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className="text-lg font-medium">{option}</span>
                  </div>
                  
                  {isRevealed && isCorrect && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                      <CheckCircle size={24} />
                    </motion.div>
                  )}
                  {isRevealed && isSelected && !isCorrect && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500">
                      <XCircle size={24} />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {isRevealed && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 flex flex-col items-center"
              >
                {currentQ.explanation && (
                  <div className="w-full p-6 mb-6 rounded-2xl bg-secondary/50 border border-border text-sm md:text-base leading-relaxed">
                    <span className="font-bold block mb-2 text-primary">Explanation:</span>
                    {currentQ.explanation}
                  </div>
                )}
                
                <Button size="lg" className="w-full md:w-auto px-12 group" onClick={handleNext}>
                  {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Session'}
                  <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
