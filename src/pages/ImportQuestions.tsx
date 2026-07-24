import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { type Question } from '../db/db';
import { supabase } from '../lib/supabase';
import { Upload, Copy, CheckCircle2, AlertCircle, Trash2, Edit2, Save, X, Database } from 'lucide-react';
import { motion } from 'framer-motion';

export function ImportQuestions() {
  const [rawText, setRawText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [subject, setSubject] = useState('');
  
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [existingQuestions, setExistingQuestions] = useState<Question[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Question>>({});

  useEffect(() => {
    if (!subject.trim()) {
      setExistingQuestions([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchExisting(subject.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [subject]);

  const fetchExisting = async (cat: string) => {
    setLoadingExisting(true);
    const { data } = await supabase.from('questions').select('*').eq('category', cat).order('created_at', { ascending: false });
    if (data) {
      setExistingQuestions(data.map(q => ({
        id: q.id,
        question: q.question,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
        category: q.category,
        difficulty: q.difficulty,
        tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : q.tags,
        createdAt: new Date(q.created_at).getTime(),
        updatedAt: new Date(q.updated_at).getTime()
      })));
    }
    setLoadingExisting(false);
  };

  const handleDeleteExisting = async (id: string) => {
    if (!confirm('Chắc chắn xóa câu này khỏi CSDL?')) return;
    await supabase.from('questions').delete().eq('id', id);
    setExistingQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.question || !editForm.options || editForm.options.length === 0) return;
    const { error } = await supabase.from('questions').update({
      question: editForm.question,
      options: editForm.options,
      correct_answer: editForm.correctAnswer,
      explanation: editForm.explanation,
      updated_at: new Date().toISOString()
    }).eq('id', editingId);
    
    if (!error) {
      setExistingQuestions(prev => prev.map(q => q.id === editingId ? { ...q, ...editForm } as Question : q));
      setEditingId(null);
    } else {
      alert('Lỗi cập nhật: ' + error.message);
    }
  };

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

        const isQ = line.match(/^[\*\#]*\s*(Question|Q|Câu|Câu hỏi)\s*\d*[\*\#]*[:\.]?\s*(.*)/i);
        const isOpt = line.match(/^[\*\#]*\s*([A-E])[\.\)][\*\#]*\s*(.*)/i);
        const isAns = line.match(/^[\*\#]*\s*(Answer|Correct Answer|Đáp án|Trả lời)[\*\#]*[:\.]?\s*(.*)/i);
        const isExp = line.match(/^[\*\#]*\s*(Explanation|Exp|Giải thích)[\*\#]*[:\.]?\s*(.*)/i);
        const isNumQ = line.match(/^[\*\#]*\s*(\d+)[\.\)][\*\#]*\s+(.*)/); 

        if (isQ || isNumQ) {
          saveQuestion();
          currentQ = isQ ? isQ[2] : (isNumQ ? isNumQ[2] : line);
          state = 'question';
        } else if (isAns) {
          currentAnswer = isAns[2].replace(/[\*\#]/g, '').trim(); // Remove any trailing markdown like **A** -> A
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
             if (currentOptions.length >= 2 && !line.match(/^[\*\#]*\s*[a-e][\.\)]/i)) {
               saveQuestion();
               currentQ = line;
               state = 'question';
             } else {
               if (currentOptions.length > 0) {
                 currentOptions[currentOptions.length - 1] += '\n' + line;
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
      setActiveTab('new');
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
      
      // Auto refresh existing questions
      if (subject.trim()) fetchExisting(subject.trim());
      
      setParsedQuestions([]);
      setRawText('');
      
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg('Failed to save to database: ' + e.message);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Thêm / Quản lý câu hỏi</h1>
          <p className="text-muted-foreground mt-2">Dán văn bản để thêm câu hỏi mới, và quản lý các câu hỏi đã có.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
        <Card glass className="flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy size={20} className="text-primary" />
              Nội dung thêm mới
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Môn học (Subject)</label>
              <input 
                type="text" 
                placeholder="VD: Toán cao cấp, Mạng máy tính..." 
                className="w-full p-3 rounded-xl border border-input bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <textarea
              className="flex-1 w-full p-4 rounded-xl border border-input bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
              placeholder="Question: What is React?\nA. A library\nB. A framework\nC. A language\nD. A database\nAnswer: A\nExplanation: React is a UI library."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <Button onClick={() => parseText(rawText)} className="w-full">
              Phân tích (Parse)
            </Button>
          </CardContent>
        </Card>

        <Card glass className="flex flex-col h-full">
          <CardHeader className="pb-0">
            <div className="flex items-center gap-4 border-b border-border">
              <button 
                onClick={() => setActiveTab('new')} 
                className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Upload size={16} /> Câu mới tải lên {parsedQuestions.length > 0 && `(${parsedQuestions.length})`}
              </button>
              <button 
                onClick={() => setActiveTab('existing')} 
                className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'existing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Database size={16} /> Đã có trong CSDL {existingQuestions.length > 0 && `(${existingQuestions.length})`}
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4 pt-4">
            
            {activeTab === 'new' ? (
              <>
                {status === 'error' && (
                  <div className="p-4 bg-destructive/10 text-destructive rounded-xl flex items-start gap-3">
                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">{errorMsg}</span>
                  </div>
                )}
                
                {status === 'success' && (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-4 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center gap-3 h-full flex-col">
                    <CheckCircle2 size={48} />
                    <span className="text-lg font-bold">Thêm thành công!</span>
                  </motion.div>
                )}

                {parsedQuestions.length > 0 && status !== 'success' && (
                  <div className="space-y-4">
                    <div className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                      <span>Phát hiện {parsedQuestions.length} câu hợp lệ.</span>
                      <span className="text-xs text-primary">Click vào 1 đáp án để chọn nó là đáp án đúng</span>
                    </div>
                    {parsedQuestions.map((q, i) => (
                      <div key={i} className="p-4 rounded-xl border border-border bg-card/50 space-y-3 relative group">
                        <button 
                          onClick={() => setParsedQuestions(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-3 right-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                          title="Xóa khỏi danh sách chờ"
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
                      Xác nhận lưu ({parsedQuestions.length}) câu
                    </Button>
                  </div>
                )}
                
                {parsedQuestions.length === 0 && status !== 'success' && status !== 'error' && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-8">
                    <div className="bg-secondary p-4 rounded-full mb-4">
                      <Upload size={32} className="opacity-50" />
                    </div>
                    <p className="text-sm">Bấm phân tích bên trái, các câu hỏi sẽ hiện ở đây để bạn kiểm tra trước khi lưu.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Tab: Existing Questions */}
                {!subject.trim() ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-8">
                    <Database size={32} className="opacity-50 mb-4" />
                    <p className="text-sm">Nhập tên môn học ở cột trái để xem các câu hỏi đã có.</p>
                  </div>
                ) : loadingExisting ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin text-primary w-8 h-8 rounded-full border-4 border-current border-t-transparent" />
                  </div>
                ) : existingQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-8">
                    <p className="text-sm">Chưa có câu hỏi nào trong môn "{subject}".</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {existingQuestions.map((q) => (
                      <div key={q.id} className="p-4 rounded-xl border border-border bg-card/50 relative group">
                        
                        {editingId === q.id ? (
                          <div className="space-y-3">
                            <textarea 
                              className="w-full p-2 text-sm bg-background border border-input rounded-lg"
                              value={editForm.question}
                              onChange={e => setEditForm({...editForm, question: e.target.value})}
                              rows={2}
                            />
                            <div className="space-y-2">
                              {editForm.options?.map((opt, oIdx) => (
                                <div key={oIdx} className="flex gap-2 items-center">
                                  <input 
                                    type="radio" 
                                    name={`correct-${q.id}`}
                                    checked={editForm.correctAnswer === opt}
                                    onChange={() => setEditForm({...editForm, correctAnswer: opt})}
                                  />
                                  <input 
                                    className="flex-1 p-2 text-xs bg-background border border-input rounded-lg"
                                    value={opt}
                                    onChange={e => {
                                      const newOpts = [...(editForm.options || [])];
                                      const oldOpt = newOpts[oIdx];
                                      newOpts[oIdx] = e.target.value;
                                      
                                      // If they edit the correct answer text, update it too
                                      let newCorrect = editForm.correctAnswer;
                                      if (newCorrect === oldOpt) newCorrect = e.target.value;
                                      
                                      setEditForm({...editForm, options: newOpts, correctAnswer: newCorrect});
                                    }}
                                  />
                                  <button 
                                    onClick={() => setEditForm({...editForm, options: editForm.options?.filter((_, idx) => idx !== oIdx)})}
                                    className="p-1 text-destructive hover:bg-destructive/10 rounded"
                                  ><Trash2 size={14}/></button>
                                </div>
                              ))}
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="text-xs"
                                onClick={() => setEditForm({...editForm, options: [...(editForm.options || []), `Option ${editForm.options!.length + 1}`]})}
                              >
                                + Thêm lựa chọn
                              </Button>
                            </div>
                            <div>
                              <input 
                                type="text"
                                placeholder="Giải thích (tùy chọn)"
                                className="w-full p-2 text-xs bg-background border border-input rounded-lg"
                                value={editForm.explanation || ''}
                                onChange={e => setEditForm({...editForm, explanation: e.target.value})}
                              />
                            </div>
                            
                            <div className="flex gap-2 justify-end pt-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X size={16} className="mr-1"/> Hủy</Button>
                              <Button size="sm" onClick={handleSaveEdit}><Save size={16} className="mr-1"/> Lưu</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="absolute top-3 right-3 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingId(q.id);
                                  setEditForm(q);
                                }}
                                className="text-muted-foreground hover:text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteExisting(q.id)}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div className="font-semibold text-sm pr-16 mb-2">{q.question}</div>
                            <div className="text-xs space-y-1">
                              {q.options.map((opt, idx) => (
                                <div key={idx} className={`px-2 py-1.5 rounded border ${opt === q.correctAnswer ? 'border-green-500/50 bg-green-500/10 text-green-700' : 'border-transparent text-muted-foreground'}`}>
                                  {opt} {opt === q.correctAnswer && <CheckCircle2 size={12} className="inline ml-1" />}
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <div className="mt-2 text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                                <span className="font-bold">Giải thích:</span> {q.explanation}
                              </div>
                            )}
                          </>
                        )}
                        
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
