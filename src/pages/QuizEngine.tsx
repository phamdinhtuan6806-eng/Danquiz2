import React, { useState, useEffect } from 'react';
import { type Question, type QuestionStats } from '../db/db';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, ArrowRight, Brain, Trash2, BookOpen, CheckSquare, Square, Link as LinkIcon, Unlink } from 'lucide-react';
import confetti from 'canvas-confetti';

export function QuizEngine() {
  const { addXP, updateStreak } = useStore();
  const [questions, setQuestions] = useState<(Question & { stats: QuestionStats })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // States for answers
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [multipleAnswers, setMultipleAnswers] = useState<string[]>([]);
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
  const [matchingSelection, setMatchingSelection] = useState<{left: string|null, right: string|null}>({left: null, right: null});
  
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionScore, setSessionScore] = useState(0);

  const [step, setStep] = useState<'select_subject' | 'study'>('select_subject');
  const [subjects, setSubjects] = useState<{name: string, count: number}[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Parse correctAnswer helper
  const getParsedCorrectAnswer = (q: Question) => {
    if (q.type === 'multiple') {
       try { return JSON.parse(q.correctAnswer) as string[]; } catch { return []; }
    }
    if (q.type === 'matching') {
       try { return JSON.parse(q.correctAnswer) as {left: string, right: string}[]; } catch { return []; }
    }
    return q.correctAnswer;
  };

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
       
       let type = 'single' as 'single' | 'multiple' | 'matching';
       let parsedCorrectAnswer = q.correct_answer;
       
       if (typeof q.correct_answer === 'string') {
         if (q.correct_answer.startsWith('MATCHING:')) {
           type = 'matching';
           parsedCorrectAnswer = q.correct_answer.substring(9);
         } else if (q.correct_answer.startsWith('[')) {
           try { JSON.parse(q.correct_answer); type = 'multiple'; } catch {}
         }
       }
       
       return {
         id: q.id,
         type,
         question: q.question,
         options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
         correctAnswer: parsedCorrectAnswer,
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

  const handleSelectSingle = (option: string) => {
    if (isRevealed) return;
    setSelectedAnswer(option);
    submitAnswer('single', option);
  };

  const toggleMultiple = (option: string) => {
    if (isRevealed) return;
    setMultipleAnswers(prev => 
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const handleMatchingClick = (side: 'left' | 'right', value: string) => {
    if (isRevealed) return;
    setMatchingSelection(prev => {
      const next = { ...prev, [side]: prev[side] === value ? null : value };
      if (next.left && next.right) {
        setMatchingAnswers(ans => ({ ...ans, [next.left!]: next.right! }));
        return { left: null, right: null };
      }
      return next;
    });
  };

  const removeMatchingPair = (left: string) => {
    if (isRevealed) return;
    setMatchingAnswers(prev => {
      const next = { ...prev };
      delete next[left];
      return next;
    });
  };

  const submitAnswer = async (type: 'single' | 'multiple' | 'matching', singleOpt?: string) => {
    if (isRevealed) return;
    setIsRevealed(true);
    
    const currentQ = questions[currentIndex];
    let isCorrect = false;

    if (type === 'single') {
       isCorrect = singleOpt === currentQ.correctAnswer;
    } else if (type === 'multiple') {
       const corrects = getParsedCorrectAnswer(currentQ) as string[];
       isCorrect = corrects.length === multipleAnswers.length && corrects.every(c => multipleAnswers.includes(c));
    } else if (type === 'matching') {
       const corrects = getParsedCorrectAnswer(currentQ) as {left: string, right: string}[];
       isCorrect = corrects.length > 0 && corrects.every(c => matchingAnswers[c.left] === c.right) && Object.keys(matchingAnswers).length === corrects.length;
    }
    
    if (isCorrect) {
      setSessionScore(s => s + 1);
      addXP(10);
      updateStreak();
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else {
      addXP(2);
      updateStreak();
    }
    
    // SM-2 update
    const qStats = currentQ.stats;
    let newInterval = qStats.interval;
    let newEase = qStats.easeFactor;
    
    const quality = isCorrect ? 4 : 0;
    
    if (isCorrect) {
      if (qStats.timesCorrect === 0) newInterval = 1;
      else if (qStats.timesCorrect === 1) newInterval = 6;
      else newInterval = Math.round(qStats.interval * qStats.easeFactor);
    } else {
      newInterval = 1;
    }
    
    newEase = newEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEase < 1.3) newEase = 1.3;
    
    const nextDate = Date.now() + (newInterval * 24 * 60 * 60 * 1000);
    
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
         if (currentIndex >= newQuestions.length) setCurrentIndex(0);
         resetState();
      }
    }
  };

  const resetState = () => {
      setSelectedAnswer(null);
      setMultipleAnswers([]);
      setMatchingAnswers({});
      setMatchingSelection({left: null, right: null});
      setIsRevealed(false);
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      resetState();
      setCurrentIndex(c => c + 1);
    } else {
      loadQuestions(selectedSubject!);
      setCurrentIndex(0);
      resetState();
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

  if (loading) return <div className="flex h-full items-center justify-center"><div className="animate-spin text-primary"><Brain size={48} /></div></div>;
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
  const qType = currentQ.type || 'single';

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
            <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
              {qType === 'single' ? 'Single Choice' : qType === 'multiple' ? 'Multiple Choice' : 'Matching'}
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold leading-relaxed pr-8">
              {currentQ.question}
            </h2>
          </Card>

          {qType === 'single' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {currentQ.options.map((option, i) => {
                 const isSelected = selectedAnswer === option;
                 const isCorrect = option === currentQ.correctAnswer;
                 let stateClass = "border-border hover:border-primary/50 hover:bg-primary/5";
                 if (isRevealed) {
                   if (isCorrect) stateClass = "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400";
                   else if (isSelected) stateClass = "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400";
                   else stateClass = "border-border opacity-50";
                 }
                 return (
                   <motion.button
                     key={i}
                     whileHover={!isRevealed ? { scale: 1.02 } : {}}
                     whileTap={!isRevealed ? { scale: 0.98 } : {}}
                     onClick={() => handleSelectSingle(option)}
                     disabled={isRevealed}
                     className={`p-6 rounded-2xl border-2 text-left transition-all duration-300 relative ${stateClass}`}
                   >
                     <div className="flex items-start gap-4">
                       <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 border-current opacity-70">
                         {String.fromCharCode(65 + i)}
                       </div>
                       <span className="text-lg font-medium">{option}</span>
                     </div>
                     {isRevealed && isCorrect && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500"><CheckCircle size={24} /></motion.div>}
                     {isRevealed && isSelected && !isCorrect && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500"><XCircle size={24} /></motion.div>}
                   </motion.button>
                 );
               })}
             </div>
          )}

          {qType === 'multiple' && (
             <div className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {currentQ.options.map((option, i) => {
                   const isSelected = multipleAnswers.includes(option);
                   const corrects = getParsedCorrectAnswer(currentQ) as string[];
                   const isCorrect = corrects.includes(option);
                   
                   let stateClass = "border-border hover:border-primary/50 hover:bg-primary/5";
                   if (isRevealed) {
                     if (isCorrect && isSelected) stateClass = "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400";
                     else if (isCorrect && !isSelected) stateClass = "border-green-500 bg-green-500/10 text-green-700 opacity-50";
                     else if (!isCorrect && isSelected) stateClass = "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400";
                     else stateClass = "border-border opacity-50";
                   } else if (isSelected) {
                     stateClass = "border-primary bg-primary/10 text-primary";
                   }
                   
                   return (
                     <button
                       key={i}
                       onClick={() => toggleMultiple(option)}
                       disabled={isRevealed}
                       className={`p-6 rounded-2xl border-2 text-left transition-all duration-300 relative ${stateClass}`}
                     >
                       <div className="flex items-start gap-4">
                         <div className="shrink-0 mt-1">
                            {isSelected ? <CheckSquare size={20} /> : <Square size={20} className="opacity-50" />}
                         </div>
                         <span className="text-lg font-medium">{option}</span>
                       </div>
                       {isRevealed && isCorrect && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500"><CheckCircle size={24} /></div>}
                       {isRevealed && isSelected && !isCorrect && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500"><XCircle size={24} /></div>}
                     </button>
                   );
                 })}
               </div>
               {!isRevealed && (
                 <div className="flex justify-center mt-6">
                   <Button size="lg" onClick={() => submitAnswer('multiple')}>Submit Answer</Button>
                 </div>
               )}
             </div>
          )}

          {qType === 'matching' && (() => {
             const corrects = getParsedCorrectAnswer(currentQ) as {left: string, right: string}[];
             // Extract left and right randomly, but stable across renders for this question
             // In real app, we should use a stable shuffle. Here we just take the lefts and rights.
             const lefts = corrects.map(c => c.left);
             const rights = corrects.map(c => c.right);
             
             return (
               <div className="space-y-6">
                 <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-3">
                     <h3 className="font-bold text-muted-foreground text-center mb-4">Cột trái</h3>
                     {lefts.map((l, i) => {
                        const isMatched = !!matchingAnswers[l];
                        const isSelected = matchingSelection.left === l;
                        let stateClass = isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50';
                        if (isRevealed) {
                          const correctRight = corrects.find(c => c.left === l)?.right;
                          const userRight = matchingAnswers[l];
                          if (correctRight === userRight) stateClass = "border-green-500 bg-green-500/10 text-green-700";
                          else if (userRight) stateClass = "border-red-500 bg-red-500/10 text-red-700";
                          else stateClass = "border-border opacity-50";
                        } else if (isMatched) {
                          stateClass = "border-primary/50 bg-secondary opacity-50";
                        }
                        
                        return (
                          <div key={i} className="flex items-center gap-2">
                             <button
                               disabled={isRevealed || isMatched}
                               onClick={() => handleMatchingClick('left', l)}
                               className={`flex-1 p-4 rounded-xl border-2 text-left transition-all text-sm font-medium ${stateClass}`}
                             >
                               {l}
                             </button>
                             {!isRevealed && isMatched && (
                               <button onClick={() => removeMatchingPair(l)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                                 <Unlink size={16} />
                               </button>
                             )}
                          </div>
                        )
                     })}
                   </div>
                   
                   <div className="space-y-3">
                     <h3 className="font-bold text-muted-foreground text-center mb-4">Cột phải</h3>
                     {rights.map((r, i) => {
                        const isMatched = Object.values(matchingAnswers).includes(r);
                        const isSelected = matchingSelection.right === r;
                        let stateClass = isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50';
                        if (isRevealed) {
                          stateClass = "border-border opacity-50";
                          // We'll show the correct pairings below
                        } else if (isMatched) {
                          stateClass = "border-primary/50 bg-secondary opacity-50";
                        }
                        
                        return (
                          <button
                            key={i}
                            disabled={isRevealed || isMatched}
                            onClick={() => handleMatchingClick('right', r)}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all text-sm font-medium ${stateClass}`}
                          >
                            {r}
                          </button>
                        )
                     })}
                   </div>
                 </div>
                 
                 {/* Visualized connections */}
                 {Object.keys(matchingAnswers).length > 0 && !isRevealed && (
                   <div className="p-4 bg-secondary/50 rounded-xl space-y-2">
                     <h4 className="text-sm font-bold text-muted-foreground">Đã nối:</h4>
                     {Object.entries(matchingAnswers).map(([l, r]) => (
                        <div key={l} className="flex items-center gap-2 text-sm font-medium">
                          <span className="flex-1 text-right">{l}</span>
                          <LinkIcon size={14} className="text-primary" />
                          <span className="flex-1">{r}</span>
                        </div>
                     ))}
                   </div>
                 )}
                 
                 {!isRevealed && (
                   <div className="flex justify-center mt-6">
                     <Button size="lg" onClick={() => submitAnswer('matching')} disabled={Object.keys(matchingAnswers).length === 0}>
                       Submit Answer
                     </Button>
                   </div>
                 )}
                 
                 {isRevealed && (
                   <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl space-y-2 mt-4">
                     <h4 className="text-sm font-bold text-green-700 dark:text-green-400">Đáp án đúng:</h4>
                     {corrects.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
                          <span className="flex-1 text-right">{c.left}</span>
                          <LinkIcon size={14} />
                          <span className="flex-1">{c.right}</span>
                        </div>
                     ))}
                   </div>
                 )}
               </div>
             );
          })()}

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
