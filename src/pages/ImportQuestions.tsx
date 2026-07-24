import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { type Question } from '../db/db';
import { supabase } from '../lib/supabase';
import { Upload, Copy, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function ImportQuestions() {
  const [rawText, setRawText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [subject, setSubject] = useState('');

  const parseText = (text: string) => {
    setStatus('parsing');
    try {
      const parsed: Question[] = [];
      const lines = text.split('\n').map(l => l.trim());
      
      let currentQ = '';
      let currentOptions: string[] = [];
      let currentAnswer = '';
      let currentExp = '';
      
      const saveQuestion = () => {
        if (currentQ && currentOptions.length > 0) {
          // Find full text of correct answer
          let correctText = currentAnswer;
          const indexMap: { [key: string]: number } = { A: 0, B: 1, C: 2, D: 3, E: 4 };
          let ansUpper = currentAnswer.toUpperCase();
          
          if (ansUpper.length === 1 && indexMap[ansUpper] !== undefined && currentOptions[indexMap[ansUpper]]) {
             correctText = currentOptions[indexMap[ansUpper]];
          } else if (!currentAnswer) {
             correctText = currentOptions[0]; // Default to first option if no answer provided
          }

          parsed.push({
            id: crypto.randomUUID(),
            question: currentQ.trim(),
            options: [...currentOptions],
            correctAnswer: correctText,
            explanation: currentExp.trim(),
            category: subject.trim() || 'General',
            difficulty: 'Medium',
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }
        currentQ = '';
        currentOptions = [];
        currentAnswer = '';
        currentExp = '';
      };

      let state = 'question';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const isQ = line.match(/^(Question|Q|Câu|Câu hỏi)\s*\d*[:\.]?\s*(.*)/i);
        const isOpt = line.match(/^([A-E])[\.\)]\s+(.*)/i);
        const isAns = line.match(/^(Answer|Correct Answer|Đáp án|Trả lời)[:\.]?\s*(.*)/i);
        const isExp = line.match(/^(Explanation|Exp|Giải thích)[:\.]?\s*(.*)/i);
        const isNumQ = line.match(/^(\d+)[\.\)]\s+(.*)/); 

        if (isQ || isNumQ) {
          saveQuestion();
          currentQ = isQ ? isQ[2] : (isNumQ ? isNumQ[2] : line);
          state = 'question';
        } else if (isAns) {
          currentAnswer = isAns[2];
          state = 'answer';
        } else if (isExp) {
          currentExp = isExp[2];
          state = 'explanation';
        } else if (isOpt) {
          currentOptions.push(isOpt[2]);
          state = 'options';
        } else {
          if (state === 'question') {
             if (currentOptions.length > 0) {
               saveQuestion();
               currentQ = line;
             } else {
               currentQ += (currentQ ? '\n' : '') + line;
             }
          } else if (state === 'options') {
             if (currentOptions.length >= 2 && !line.match(/^[a-e][\.\)]/i)) {
               saveQuestion();
               currentQ = line;
               state = 'question';
             } else {
               if (currentOptions.length > 0) {
                 currentOptions[currentOptions.length - 1] += ' ' + line;
               }
             }
          } else if (state === 'explanation') {
             currentExp += '\n' + line;
          } else if (state === 'answer') {
             saveQuestion();
             currentQ = line;
             state = 'question';
          }
        }
      }
      
      saveQuestion();

      if (parsed.length === 0) {
        throw new Error('Could not parse any questions. Please check the format.');
      }

      setParsedQuestions(parsed);
      setStatus('idle');
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e.message);
    }
  };

  const handleImport = async () => {
    if (parsedQuestions.length === 0) return;
    try {
      const supabaseQuestions = parsedQuestions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        category: q.category,
        difficulty: q.difficulty,
        tags: q.tags,
        created_at: new Date(q.createdAt).toISOString(),
        updated_at: new Date(q.updatedAt).toISOString()
      }));

      const { error: qError } = await supabase.from('questions').insert(supabaseQuestions);
      if (qError) throw qError;
      
      const stats = parsedQuestions.map(q => ({
        question_id: q.id,
        times_seen: 0,
        times_correct: 0,
        times_incorrect: 0,
        mastery_score: 0,
        is_favorite: false,
        is_bookmarked: false,
        ease_factor: 2.5,
        interval: 0,
        next_review_date: 0
      }));
      
      const { error: sError } = await supabase.from('question_stats').insert(stats);
      if (sError) throw sError;
      
      setStatus('success');
      setParsedQuestions([]);
      setRawText('');
      
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg('Failed to save to database: ' + e.message);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Questions</h1>
          <p className="text-muted-foreground mt-2">Paste your questions or upload a file to start learning.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card glass className="flex flex-col h-[500px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy size={20} className="text-primary" />
              Paste Text
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Môn học (Subject)</label>
              <input 
                type="text" 
                placeholder="VD: Toán cao cấp, Mạng máy tính..." 
                className="w-full p-3 rounded-xl border border-input bg-background/50 focus:outline-none focus:ring-2 focus:ring-ring"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <textarea
              className="flex-1 w-full p-4 rounded-xl border border-input bg-background/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono text-sm"
              placeholder="Question: What is React?\nA. A library\nB. A framework\nC. A language\nD. A database\nAnswer: A\nExplanation: React is a UI library."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <Button onClick={() => parseText(rawText)} className="w-full">
              Parse Questions
            </Button>
          </CardContent>
        </Card>

        <Card glass className="flex flex-col h-[500px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload size={20} className="text-primary" />
              Preview & Import
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4">
            {status === 'error' && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-xl flex items-start gap-3">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span className="text-sm font-medium">{errorMsg}</span>
              </div>
            )}
            
            {status === 'success' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-4 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center gap-3 h-full flex-col">
                <CheckCircle2 size={48} />
                <span className="text-lg font-bold">Import Successful!</span>
              </motion.div>
            )}

            {parsedQuestions.length > 0 && status !== 'success' && (
              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                  <span>Found {parsedQuestions.length} questions ready to import.</span>
                  <span className="text-xs">Click an option to set as correct answer</span>
                </div>
                {parsedQuestions.map((q, i) => (
                  <div key={i} className="p-4 rounded-xl border border-border bg-card/50 space-y-3 relative group">
                    <button 
                      onClick={() => setParsedQuestions(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-3 right-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                      title="Delete Question"
                    >
                      <Trash2 size={16} />
                    </button>
                    
                    <div className="font-semibold text-sm pr-8">{q.question}</div>
                    
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {q.options.map((opt, j) => (
                        <button 
                          key={j} 
                          onClick={() => {
                            const newQs = [...parsedQuestions];
                            newQs[i].correctAnswer = opt;
                            setParsedQuestions(newQs);
                          }}
                          className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between ${
                            opt === q.correctAnswer 
                              ? 'border-primary bg-primary/10 text-primary font-medium' 
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <span>{opt}</span>
                          {opt === q.correctAnswer && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                
                <Button variant="primary" onClick={handleImport} className="w-full mt-4" size="lg">
                  Confirm Import ({parsedQuestions.length})
                </Button>
              </div>
            )}
            
            {parsedQuestions.length === 0 && status !== 'success' && status !== 'error' && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-8">
                <div className="bg-secondary p-4 rounded-full mb-4">
                  <Upload size={32} className="opacity-50" />
                </div>
                <p className="text-sm">Parsed questions will appear here for preview before importing.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
