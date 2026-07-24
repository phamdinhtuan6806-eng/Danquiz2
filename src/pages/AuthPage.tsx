import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Brain, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Optional: show a message to verify email, but by default Supabase allows login if email confirmations are off
        alert('Đăng ký thành công! Bạn có thể bắt đầu sử dụng.');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="text-center mb-8 space-y-4">
          <div className="mx-auto bg-primary/20 w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/20">
            <Brain size={40} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">QuizMaster AI</h1>
          <p className="text-muted-foreground">Khám phá vũ trụ kiến thức của riêng bạn</p>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background/50 focus:ring-2 focus:ring-primary outline-none transition-all"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Mật khẩu</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="password" 
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background/50 focus:ring-2 focus:ring-primary outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
                {loading ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <button 
                onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
                className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
                <ArrowRight size={14} />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
