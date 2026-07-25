import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { type Question } from '../db/db';
import { supabase } from '../lib/supabase';
import { Upload, Copy, CheckCircle2, AlertCircle, Trash2, Edit2, Save, X, Database, FileText, Loader2, Link as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setExistingQuestions(data.map(q => {
        let type: QuestionType = 'single';
        let parsedCorrectAnswer = q.correct_answer;
        
        if (typeof q.correct_answer === 'string') {
          if (q.correct_answer.startsWith('MATCHING:')) {
            type = 'matching';
            parsedCorrectAnswer = q.correct_answer.substring(9);
          } else if (q.correct_answer.startsWith('[')) {
            try {
              JSON.parse(q.correct_answer);
              type = 'multiple';
            } catch (e) {}
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
          updatedAt: new Date(q.updated_at).getTime()
        };
      }));
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
    let finalCorrectAnswer = editForm.correctAnswer;
    if (editForm.type === 'matching') {
      finalCorrectAnswer = `MATCHING:${editForm.correctAnswer}`;
    } else if (editForm.type === 'multiple') {
      // It's already stringified array if they edited it properly, or we ensure it's stringified.
      // Wait, we'll handle multiple correctly in the UI. Assuming it's correctly formatted string array.
      if (Array.isArray(editForm.correctAnswer)) {
        finalCorrectAnswer = JSON.stringify(editForm.correctAnswer);
      } else if (typeof editForm.correctAnswer === 'string' && !editForm.correctAnswer.startsWith('[')) {
        finalCorrectAnswer = JSON.stringify([editForm.correctAnswer]);
      }
    }

    const { error } = await supabase.from('questions').update({
      question: editForm.question,
      options: editForm.options,
      correct_answer: finalCorrectAnswer,
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setProcessingStatus('Đang đọc PDF...');
    
    try {
      // 1. Extract Text from PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
        setProcessingStatus(`Đang đọc PDF... (${i}/${pdf.numPages} trang)`);
      }

      if (!fullText.trim()) {
        throw new Error("Không tìm thấy chữ trong file PDF này (có thể là file ảnh chụp không chứa text).");
      }

      setProcessingStatus('Đang gửi cho AI phân tích (chờ 5-20s)...');
      
      // 2. Send to Gemini AI
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Chưa cấu hình API Key của Gemini. Vui lòng thêm VITE_GEMINI_API_KEY vào biến môi trường.");
      }
      
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const prompt = `
Bạn là một chuyên gia trích xuất dữ liệu. Hãy đọc văn bản sau và TRÍCH XUẤT TẤT CẢ CÁC CÂU HỎI có trong đó.
BỎ QUA TẤT CẢ phần lý thuyết, tiêu đề, hoặc văn bản không liên quan.

Hỗ trợ 3 loại câu hỏi:
1. Câu hỏi 1 đáp án đúng (Single)
2. Câu hỏi nhiều đáp án đúng (Multiple)
3. Câu hỏi nối bảng (Matching)

CHỈ TRẢ VỀ ĐÚNG ĐỊNH DẠNG SAU (Không dùng thẻ markdown như \`\`\`):

=== SINGLE ===
Câu 1: [Nội dung câu hỏi]
A. [Lựa chọn 1]
B. [Lựa chọn 2]
C. [Lựa chọn 3]
D. [Lựa chọn 4]
Đáp án: A
Giải thích: [Giải thích nếu có]

=== MULTIPLE ===
Câu 2: [Nội dung câu hỏi có nhiều đáp án đúng]
A. [Lựa chọn 1]
B. [Lựa chọn 2]
C. [Lựa chọn 3]
D. [Lựa chọn 4]
Đáp án: A, C
Giải thích: [Giải thích nếu có]

=== MATCHING ===
Câu 3: [Nội dung yêu cầu nối bảng]
1. [Mục trái 1] -> a. [Mục phải 1]
2. [Mục trái 2] -> b. [Mục phải 2]
3. [Mục trái 3] -> c. [Mục phải 3]
Giải thích: [Giải thích nếu có]

Quy tắc:
- Bắt buộc bắt đầu mỗi loại bằng chuỗi === SINGLE ===, === MULTIPLE ===, hoặc === MATCHING === tương ứng trước nhóm câu hỏi đó. Hoặc dùng chữ TYPE: SINGLE trước mỗi câu.
- Dùng đúng format như trên. Đối với MATCHING, dùng dấu -> để nối giữa mục trái và phải.

Văn bản gốc:
${fullText}
`;

      const modelsToTry = ["gemini-1.5-flash-8b", "gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
      let aiResponse = "";
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        try {
          console.log("Đang thử model: " + modelName);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          aiResponse = result.response.text();
          break; // Thành công thì thoát vòng lặp
        } catch (err: any) {
          console.warn(`Lỗi khi dùng ${modelName}:`, err.message);
          lastError = err;
        }
      }

      if (!aiResponse) {
        throw new Error("Tài khoản của bạn đã bị khóa tính năng miễn phí trên mọi phiên bản AI. Chi tiết lỗi: " + (lastError?.message || 'Không xác định'));
      }
      
      setRawText(aiResponse);
      parseText(aiResponse);

    } catch (e: any) {
      alert("Lỗi xử lý file: " + e.message);
    } finally {
      setIsProcessingFile(false);
      setProcessingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      let currentType: 'single' | 'multiple' | 'matching' = 'single';
      
      const saveQuestion = () => {
        if (currentQ && (currentOptions.length > 0 || currentType === 'matching')) {
          let correctText = currentAnswer;
          
          if (currentType === 'single') {
            const indexMap: { [key: string]: number } = { A: 0, B: 1, C: 2, D: 3, E: 4 };
            let ansUpper = currentAnswer.toUpperCase();
            if (ansUpper.length === 1 && indexMap[ansUpper] !== undefined && currentOptions[indexMap[ansUpper]]) {
               correctText = currentOptions[indexMap[ansUpper]];
            } else if (!currentAnswer) {
               correctText = currentOptions[0]; // Default
            }
          } else if (currentType === 'multiple') {
             // currentAnswer might be "A, C"
             const parts = currentAnswer.split(/[,;&]/).map(p => p.trim().toUpperCase());
             const indexMap: { [key: string]: number } = { A: 0, B: 1, C: 2, D: 3, E: 4 };
             const selectedOptions = parts.map(p => {
                if (p.length === 1 && indexMap[p] !== undefined && currentOptions[indexMap[p]]) {
                   return currentOptions[indexMap[p]];
                }
                return p;
             }).filter(p => currentOptions.includes(p) || p.length > 1);
             
             if (selectedOptions.length === 0 && currentAnswer) selectedOptions.push(currentAnswer);
             correctText = JSON.stringify(selectedOptions);
          } else if (currentType === 'matching') {
             // options are used to store pairs temporarily during parsing
             const pairs = currentOptions.map(opt => {
                const parts = opt.split('->').map(p => p.trim());
                if (parts.length >= 2) return { left: parts[0], right: parts.slice(1).join('->') };
                return null;
             }).filter(Boolean);
             
             currentOptions = []; // No options for matching, only pairs
             correctText = JSON.stringify(pairs);
          }

          parsed.push({
            id: crypto.randomUUID(),
            type: currentType,
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

        if (line.includes('=== SINGLE ===') || line.includes('TYPE: SINGLE')) {
          currentType = 'single';
          continue;
        } else if (line.includes('=== MULTIPLE ===') || line.includes('TYPE: MULTIPLE') || line.toLowerCase().includes('(choose')) {
          currentType = 'multiple';
          continue;
        } else if (line.includes('=== MATCHING ===') || line.includes('TYPE: MATCHING')) {
          currentType = 'matching';
          continue;
        }
        
        // auto detect inline multiple choice prompt like "(Choose three)"
        if (line.toLowerCase().includes('(choose ') || line.toLowerCase().includes('chọn nhiều')) {
           currentType = 'multiple';
        }

        const isQ = line.match(/^[\*\#]*\s*(Question|Q|Câu|Câu hỏi)\s*\d*[\*\#]*[:\.]?\s*(.*)/i);
        const isOpt = line.match(/^[\*\#]*\s*([A-Z])[\.\)][\*\#]*\s*(.*)/i);
        const isAns = line.match(/^[\*\#]*\s*(Answer|Correct Answer|Đáp án|Trả lời)[\*\#]*[:\.]?\s*(.*)/i);
        const isExp = line.match(/^[\*\#]*\s*(Explanation|Exp|Giải thích)[\*\#]*[:\.]?\s*(.*)/i);
        const isNumQ = line.match(/^[\*\#]*\s*(\d+)[\.\)][\*\#]*\s+(.*)/); 
        const isMatchingPair = line.match(/^[\*\#]*\s*(.*?)[\s]*->[\s]*(.*)/);

        if (isQ || isNumQ) {
          saveQuestion();
          currentQ = isQ ? isQ[2] : (isNumQ ? isNumQ[2] : line);
          state = 'question';
        } else if (isAns) {
          currentAnswer = isAns[2].replace(/[\*\#]/g, '').trim(); 
          state = 'answer';
        } else if (isExp) {
          currentExp = isExp[2];
          state = 'explanation';
        } else if (currentType === 'matching' && isMatchingPair) {
          currentOptions.push(line.replace(/^[0-9\.\-\*]*\s*/, '')); // push raw pair to options
          state = 'options';
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
             if (currentOptions.length >= 2 && !line.match(/^[\*\#]*\s*[a-z][\.\)]/i) && currentType !== 'matching') {
               saveQuestion();
               currentQ = line;
               state = 'question';
             } else {
               if (currentOptions.length > 0) {
                 if (currentType === 'matching') {
                    currentOptions.push(line);
                 } else {
                    currentOptions[currentOptions.length - 1] += '\n' + line;
                 }
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
      const supabaseQuestions = parsedQuestions.map(q => {
        let finalCorrectAnswer = q.correctAnswer;
        if (q.type === 'matching') {
          finalCorrectAnswer = `MATCHING:${q.correctAnswer}`;
        }

        return {
          id: q.id,
          question: q.question,
          options: q.options,
          correct_answer: finalCorrectAnswer,
          explanation: q.explanation,
          category: q.category,
          difficulty: q.difficulty,
          tags: q.tags,
          created_at: new Date(q.createdAt).toISOString(),
          updated_at: new Date(q.updatedAt).toISOString()
        };
      });

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
          <p className="text-muted-foreground mt-2">Dán văn bản hoặc tải lên file PDF để AI tự động bóc tách câu hỏi.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
        <Card glass className="flex flex-col h-full relative overflow-hidden">
          {isProcessingFile && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="font-semibold text-lg">{processingStatus}</div>
              <p className="text-sm text-muted-foreground max-w-xs text-center">Vui lòng không đóng trang. File PDF lớn có thể mất thời gian để xử lý.</p>
            </div>
          )}
          
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Copy size={20} className="text-primary" />
                Nội dung thêm mới
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileText size={16} className="mr-2" />
                Tải lên PDF (AI)
              </Button>
              <input 
                type="file" 
                accept=".pdf" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
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
              placeholder="Dán văn bản vào đây hoặc tải lên file PDF để AI tự phân tích..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <Button onClick={() => parseText(rawText)} className="w-full">
              Phân tích thủ công (Parse Text)
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
                        
                        <select 
                          className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-1 rounded mb-2 border-none outline-none cursor-pointer appearance-none text-center"
                          value={q.type || 'single'}
                          onChange={(e) => {
                             const newQs = [...parsedQuestions];
                             const newType = e.target.value as 'single' | 'multiple' | 'matching';
                             newQs[i].type = newType;
                             
                             if (newType === 'matching') {
                                newQs[i].options = [];
                                newQs[i].correctAnswer = JSON.stringify([{left: 'Mục trái 1', right: 'Mục phải 1'}]);
                             } else if (newType === 'multiple') {
                                newQs[i].correctAnswer = '[]';
                                if (newQs[i].options.length === 0) newQs[i].options = ['Option 1', 'Option 2'];
                             } else {
                                newQs[i].correctAnswer = newQs[i].options.length > 0 ? newQs[i].options[0] : '';
                                if (newQs[i].options.length === 0) newQs[i].options = ['Option 1', 'Option 2'];
                             }
                             setParsedQuestions(newQs);
                          }}
                        >
                          <option value="single">LOẠI: 1 ĐÁP ÁN ▾</option>
                          <option value="multiple">LOẠI: NHIỀU ĐÁP ÁN ▾</option>
                          <option value="matching">LOẠI: NỐI BẢNG ▾</option>
                        </select>
                        {q.type === 'matching' ? (() => {
                           let pairs: any[] = [];
                           try { pairs = JSON.parse(q.correctAnswer); } catch {}
                           return (
                             <div className="space-y-1">
                                {pairs.map((p: any, j: number) => (
                                   <div key={j} className="text-xs p-2 rounded-lg border border-primary/50 bg-primary/5 text-primary flex items-center justify-between">
                                      <span>{p.left}</span> <span className="text-muted-foreground">-&gt;</span> <span>{p.right}</span>
                                   </div>
                                ))}
                             </div>
                           );
                        })() : (
                          <div className="grid grid-cols-1 gap-2 text-xs">
                            {q.options.map((opt, j) => {
                               let isSelected = false;
                               if (q.type === 'multiple') {
                                  try { isSelected = JSON.parse(q.correctAnswer).includes(opt); } catch {}
                               } else {
                                  isSelected = opt === q.correctAnswer;
                               }
                               
                               return (
                                 <button 
                                   key={j} 
                                   onClick={() => {
                                     const newQs = [...parsedQuestions];
                                     if (q.type === 'multiple') {
                                        let arr: string[] = [];
                                        try { arr = JSON.parse(q.correctAnswer); } catch {}
                                        if (arr.includes(opt)) arr = arr.filter(x => x !== opt);
                                        else arr.push(opt);
                                        newQs[i].correctAnswer = JSON.stringify(arr);
                                     } else {
                                        newQs[i].correctAnswer = opt;
                                     }
                                     setParsedQuestions(newQs);
                                   }}
                                   className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between ${
                                     isSelected 
                                       ? 'border-primary bg-primary/10 text-primary font-medium' 
                                       : 'border-border hover:border-primary/50'
                                   }`}
                                 >
                                   <span>{opt}</span>
                                   {isSelected && <CheckCircle2 size={14} />}
                                 </button>
                               );
                            })}
                          </div>
                        )}
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
                            <select 
                              className="w-full p-2 text-sm bg-background border border-input rounded-lg"
                              value={editForm.type || 'single'}
                              onChange={e => {
                                 const newType = e.target.value as 'single' | 'multiple' | 'matching';
                                 let newCorrectAnswer = '';
                                 let newOptions = editForm.options || [];
                                 if (newType === 'matching') {
                                    newOptions = [];
                                    newCorrectAnswer = JSON.stringify([{left: 'Cột trái 1', right: 'Cột phải 1'}]);
                                 } else if (newType === 'multiple') {
                                    newCorrectAnswer = '[]';
                                    if (newOptions.length === 0) newOptions = ['Option 1', 'Option 2'];
                                 } else {
                                    newCorrectAnswer = newOptions.length > 0 ? newOptions[0] : '';
                                    if (newOptions.length === 0) newOptions = ['Option 1', 'Option 2'];
                                 }
                                 setEditForm({...editForm, type: newType, correctAnswer: newCorrectAnswer, options: newOptions});
                              }}
                            >
                              <option value="single">Loại: 1 Đáp án (Single Choice)</option>
                              <option value="multiple">Loại: Nhiều đáp án (Multiple Choice)</option>
                              <option value="matching">Loại: Nối bảng (Matching)</option>
                            </select>
                            <textarea 
                              className="w-full p-2 text-sm bg-background border border-input rounded-lg"
                              value={editForm.question}
                              onChange={e => setEditForm({...editForm, question: e.target.value})}
                              rows={2}
                              placeholder="Nội dung câu hỏi"
                            />
                            <div className="space-y-2">
                              {editForm.type === 'matching' ? (() => {
                                 let pairs: any[] = [];
                                 try { pairs = JSON.parse(editForm.correctAnswer || '[]'); } catch {}
                                 return (
                                   <div className="space-y-2">
                                     {pairs.map((p: any, pIdx: number) => (
                                       <div key={pIdx} className="flex gap-2 items-center">
                                         <input className="flex-1 p-2 text-xs bg-background border border-input rounded-lg" value={p.left} onChange={e => {
                                            const newPairs = [...pairs];
                                            newPairs[pIdx].left = e.target.value;
                                            setEditForm({...editForm, correctAnswer: JSON.stringify(newPairs)});
                                         }} placeholder="Cột trái" />
                                         <LinkIcon size={14} className="text-muted-foreground shrink-0" />
                                         <input className="flex-1 p-2 text-xs bg-background border border-input rounded-lg" value={p.right} onChange={e => {
                                            const newPairs = [...pairs];
                                            newPairs[pIdx].right = e.target.value;
                                            setEditForm({...editForm, correctAnswer: JSON.stringify(newPairs)});
                                         }} placeholder="Cột phải" />
                                         <button onClick={() => {
                                            const newPairs = pairs.filter((_, idx) => idx !== pIdx);
                                            setEditForm({...editForm, correctAnswer: JSON.stringify(newPairs)});
                                         }} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={14}/></button>
                                       </div>
                                     ))}
                                     <Button variant="secondary" size="sm" className="text-xs" onClick={() => {
                                        const newPairs = [...pairs, {left: `Trái ${pairs.length + 1}`, right: `Phải ${pairs.length + 1}`}];
                                        setEditForm({...editForm, correctAnswer: JSON.stringify(newPairs)});
                                     }}>
                                       + Thêm cặp nối
                                     </Button>
                                   </div>
                                 );
                              })() : (
                                <>
                                  {editForm.options?.map((opt, oIdx) => {
                                     let isChecked = false;
                                     if (editForm.type === 'multiple') {
                                        try { isChecked = JSON.parse(editForm.correctAnswer || '[]').includes(opt); } catch {}
                                     } else {
                                        isChecked = editForm.correctAnswer === opt;
                                     }
                                     return (
                                       <div key={oIdx} className="flex gap-2 items-center">
                                         <input 
                                           type={editForm.type === 'multiple' ? 'checkbox' : 'radio'} 
                                           name={`correct-${q.id}`}
                                           checked={isChecked}
                                           onChange={() => {
                                              if (editForm.type === 'multiple') {
                                                 let arr: string[] = [];
                                                 try { arr = JSON.parse(editForm.correctAnswer || '[]'); } catch {}
                                                 if (arr.includes(opt)) arr = arr.filter(x => x !== opt);
                                                 else arr.push(opt);
                                                 setEditForm({...editForm, correctAnswer: JSON.stringify(arr)});
                                              } else {
                                                 setEditForm({...editForm, correctAnswer: opt});
                                              }
                                           }}
                                         />
                                         <input 
                                           className="flex-1 p-2 text-xs bg-background border border-input rounded-lg"
                                           value={opt}
                                           onChange={e => {
                                             const newOpts = [...(editForm.options || [])];
                                             const oldOpt = newOpts[oIdx];
                                             newOpts[oIdx] = e.target.value;
                                             
                                             let newCorrect = editForm.correctAnswer;
                                             if (editForm.type === 'multiple') {
                                                try {
                                                   let arr = JSON.parse(newCorrect || '[]');
                                                   arr = arr.map((x: string) => x === oldOpt ? e.target.value : x);
                                                   newCorrect = JSON.stringify(arr);
                                                } catch {}
                                             } else {
                                                if (newCorrect === oldOpt) newCorrect = e.target.value;
                                             }
                                             
                                             setEditForm({...editForm, options: newOpts, correctAnswer: newCorrect});
                                           }}
                                         />
                                         <button 
                                           onClick={() => setEditForm({...editForm, options: editForm.options?.filter((_, idx) => idx !== oIdx)})}
                                           className="p-1 text-destructive hover:bg-destructive/10 rounded"
                                         ><Trash2 size={14}/></button>
                                       </div>
                                     );
                                  })}
                                  <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    className="text-xs"
                                    onClick={() => setEditForm({...editForm, options: [...(editForm.options || []), `Option ${editForm.options!.length + 1}`]})}
                                  >
                                    + Thêm lựa chọn
                                  </Button>
                                </>
                              )}
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
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                               {q.type === 'single' ? 'Single Choice' : q.type === 'multiple' ? 'Multiple Choice' : 'Matching'}
                            </div>
                            {q.type === 'matching' ? (() => {
                               let pairs: any[] = [];
                               try { pairs = JSON.parse(q.correctAnswer); } catch {}
                               return (
                                 <div className="space-y-1">
                                    {pairs.map((p: any, j: number) => (
                                       <div key={j} className="text-xs p-2 rounded border border-green-500/30 bg-green-500/5 text-green-700 flex items-center justify-between">
                                          <span>{p.left}</span> <span>-&gt;</span> <span>{p.right}</span>
                                       </div>
                                    ))}
                                 </div>
                               );
                            })() : (
                                <div className="text-xs space-y-1">
                                  {q.options.map((opt, idx) => {
                                     let isCorrect = false;
                                     if (q.type === 'multiple') {
                                        try { isCorrect = JSON.parse(q.correctAnswer).includes(opt); } catch {}
                                     } else {
                                        isCorrect = opt === q.correctAnswer;
                                     }
                                     return (
                                       <div key={idx} className={`px-2 py-1.5 rounded border ${isCorrect ? 'border-green-500/50 bg-green-500/10 text-green-700' : 'border-transparent text-muted-foreground'}`}>
                                         {opt} {isCorrect && <CheckCircle2 size={12} className="inline ml-1" />}
                                       </div>
                                     );
                                  })}
                                </div>
                            )}
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
