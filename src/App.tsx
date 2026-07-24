import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Brain, LayoutDashboard, Settings, FileDown, BookOpen, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { ImportQuestions } from './pages/ImportQuestions';
import { QuizEngine } from './pages/QuizEngine';
import { Dashboard } from './pages/Dashboard';
import { SettingsPage } from './pages/SettingsPage';
import { MockExam } from './pages/MockExam';

function Sidebar() {
  const location = useLocation();
  const links = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/quiz', icon: <BookOpen size={20} />, label: 'Study' },
    { to: '/mock-exam', icon: <Trophy size={20} />, label: 'Mock Exam' },
    { to: '/import', icon: <FileDown size={20} />, label: 'Import' },
    { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className="w-64 border-r border-border bg-card/50 backdrop-blur-xl h-screen flex flex-col hidden md:flex">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary/20 p-2 rounded-xl">
          <Brain className="text-primary" size={24} />
        </div>
        <h1 className="font-bold text-lg tracking-tight">QuizMaster AI</h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4">
        {links.map((link) => {
          const active = location.pathname === link.to || (link.to !== '/' && location.pathname.startsWith(link.to));
          return (
            <Link key={link.to} to={link.to} className="block relative">
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
                {link.icon}
                <span className="font-medium">{link.label}</span>
              </div>
              {active && (
                <motion.div 
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-primary/10 rounded-xl border border-primary/20 -z-10"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 m-4 glass-card">
        <div className="text-xs text-muted-foreground font-medium mb-2">Daily Streak</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">3</span>
          <span className="text-sm font-medium">Days</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { settings } = useStore();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (settings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(settings.theme);
    }
  }, [settings.theme]);

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Ambient background blur */}
        <div className="fixed top-[-50%] left-[-10%] w-[70%] h-[70%] rounded-full bg-primary/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="fixed bottom-[-50%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent/20 blur-[100px] -z-10 pointer-events-none" />

        <Sidebar />
        
        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/import" element={<ImportQuestions />} />
              <Route path="/quiz/*" element={<QuizEngine />} />
              <Route path="/mock-exam" element={<MockExam />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
