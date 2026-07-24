import React, { useState, useEffect } from 'react';
import { type Question } from '../db/db';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronRight, ChevronLeft, CheckCircle2, XCircle, Trophy, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';

export function MockExam() {
  const [step, setStep] = useState<'setup' | 'exam' | 'result'>('setup');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (step === 'exam' && timeLimit > 0 && timeRemaining > 0) {
      const timerId = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerId);
            submitExam(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerId);
    }
  }, [step, timeLimit, timeRemaining]);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('questions').select('category');
    if (data) {
      const unique = Array.from(new Set(data.map(d => d.category))).filter(Boolean) as string[];
      setSubjects(unique);
      if (unique.length > 0) setSelectedSubject(unique[0]);
    }
    setLoading(false);
  };

  const startExam = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('category', selectedSubject);

    if (data && data.length > 0) {
      const formattedQs: Question[] = data.map(q => ({
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
      }));
      
      // Shuffle and pick up to questionCount questions
      formattedQs.sort(() => Math.random() - 0.5);
      const finalQs = questionCount === 0 ? formattedQs : formattedQs.slice(0, questionCount);
      setQuestions(finalQs);
      setAnswers({});
      setCurrentIndex(0);
      setTimeRemaining(timeLimit * 60);
      setStep('exam');
    } else {
      alert('Không tìm thấy câu hỏi nào cho môn học này!');
    }
    setLoading(false);
  };

  const submitExam = (isAuto = false) => {
    if (isAuto === true || window.confirm('Bạn có chắc chắn muốn nộp bài?')) {
      setStep('result');
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="animate-spin"><BookOpen size={48} className="text-primary opacity-50" /></div></div>;
  }

  if (step === 'setup') {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
          <div className="mx-auto bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center">
            <Trophy size={40} className="text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Thi Thử (Mock Exam)</h1>
          <p className="text-muted-foreground text-lg">Kiểm tra kiến thức của bạn với một bài thi mô phỏng</p>
        </div>

        <Card glass className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Cài đặt bài thi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Chọn Môn học</label>
              {subjects.length === 0 ? (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">Chưa có môn học nào. Hãy import thêm câu hỏi!</div>
              ) : (
                <select 
                  className="w-full p-3 rounded-xl border border-input bg-background/50 focus:ring-2 focus:ring-primary outline-none"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                >
                  {subjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="p-4 bg-secondary/50 rounded-xl space-y-4 text-sm text-muted-foreground">
              <div className="flex justify-between items-center">
                <span>Số câu hỏi:</span> 
                <select 
                  className="p-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                >
                  <option value={10}>10 câu</option>
                  <option value={20}>20 câu</option>
                  <option value={30}>30 câu</option>
                  <option value={50}>50 câu</option>
                  <option value={0}>Tất cả</option>
                </select>
              </div>
              <div className="flex justify-between items-center">
                <span>Thời gian:</span> 
                <select 
                  className="p-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                >
                  <option value={0}>Không giới hạn</option>
                  <option value={10}>10 phút</option>
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={60}>60 phút</option>
                </select>
              </div>
            </div>
            <Button className="w-full" size="lg" disabled={subjects.length === 0} onClick={startExam}>
              Bắt đầu thi ngay
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'exam') {
    const currentQ = questions[currentIndex];
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <div className="bg-primary/20 px-4 py-2 rounded-full text-primary font-bold">
            Câu {currentIndex + 1} / {questions.length}
          </div>
          {timeLimit > 0 && (
            <div className="flex items-center gap-2 font-mono text-xl font-bold text-orange-500">
              <Clock size={24} />
              {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </div>
          )}
          <Button variant="secondary" onClick={() => submitExam(false)} className="font-medium text-destructive hover:bg-destructive/10 hover:text-destructive">
            Nộp bài sớm
          </Button>
        </div>

        <div className="flex-1 flex flex-col">
          <Card glass className="p-8 mb-8">
            <h2 className="text-2xl font-semibold leading-relaxed">
              {currentQ.question}
            </h2>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQ.options.map((option, i) => {
              const isSelected = answers[currentIndex] === option;
              return (
                <button
                  key={i}
                  onClick={() => setAnswers(prev => ({ ...prev, [currentIndex]: option }))}
                  className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 flex items-start gap-4 ${
                    isSelected 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-primary" : "border-muted-foreground opacity-50"}`}>
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="text-lg font-medium">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-12 flex items-center justify-between">
            <Button 
              variant="secondary" 
              size="lg" 
              onClick={() => setCurrentIndex(c => Math.max(0, c - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-2" /> Câu trước
            </Button>

            {currentIndex === questions.length - 1 ? (
              <Button size="lg" onClick={() => submitExam(false)} className="px-12 bg-green-600 hover:bg-green-700 text-white">
                Nộp bài <CheckCircle2 className="ml-2" />
              </Button>
            ) : (
              <Button size="lg" onClick={() => setCurrentIndex(c => c + 1)}>
                Câu tiếp <ChevronRight className="ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    const score = questions.reduce((acc, q, idx) => acc + (answers[idx] === q.correctAnswer ? 1 : 0), 0);
    const percentage = Math.round((score / questions.length) * 100);

    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card glass className="text-center p-12">
          <h1 className="text-4xl font-bold mb-6">Kết Quả Thi Thử</h1>
          <div className="flex items-center justify-center gap-12">
            <div>
              <p className="text-muted-foreground mb-2">Điểm số</p>
              <p className={`text-6xl font-black ${percentage >= 80 ? 'text-green-500' : percentage >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                {score}/{questions.length}
              </p>
            </div>
            <div className="h-24 w-px bg-border"></div>
            <div>
              <p className="text-muted-foreground mb-2">Tỉ lệ</p>
              <p className="text-6xl font-black text-primary">{percentage}%</p>
            </div>
          </div>
          <Button size="lg" className="mt-8" onClick={() => setStep('setup')}>
            Thi lại môn khác
          </Button>
        </Card>

        <h3 className="text-2xl font-bold pt-8 border-t border-border">Chi tiết bài làm</h3>
        <div className="space-y-6">
          {questions.map((q, idx) => {
            const isCorrect = answers[idx] === q.correctAnswer;
            const isSkipped = !answers[idx];

            return (
              <Card key={q.id} className="p-6 bg-card/50">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {isCorrect ? <CheckCircle2 className="text-green-500" /> : <XCircle className="text-red-500" />}
                  </div>
                  <div className="flex-1 space-y-4">
                    <h4 className="font-semibold text-lg">Câu {idx + 1}: {q.question}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options.map((opt, oIdx) => {
                        let btnClass = "p-3 rounded-xl border text-sm flex items-center justify-between opacity-50 border-border";
                        
                        if (opt === q.correctAnswer) {
                          btnClass = "p-3 rounded-xl border text-sm flex items-center justify-between border-green-500 bg-green-500/10 text-green-700 font-bold opacity-100";
                        } else if (opt === answers[idx] && !isCorrect) {
                          btnClass = "p-3 rounded-xl border text-sm flex items-center justify-between border-red-500 bg-red-500/10 text-red-700 font-bold opacity-100";
                        }

                        return (
                          <div key={oIdx} className={btnClass}>
                            <span>{opt}</span>
                            {opt === q.correctAnswer && <CheckCircle2 size={16} />}
                            {opt === answers[idx] && !isCorrect && <XCircle size={16} />}
                          </div>
                        );
                      })}
                    </div>
                    {isSkipped && <div className="text-red-500 text-sm font-medium mt-2">Bạn chưa trả lời câu này!</div>}
                    {!isCorrect && q.explanation && (
                      <div className="p-4 bg-secondary/50 rounded-lg text-sm mt-4">
                        <span className="font-bold">Giải thích:</span> {q.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
