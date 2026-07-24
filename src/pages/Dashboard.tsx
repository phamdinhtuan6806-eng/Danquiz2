import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useStore } from '../store/useStore';
import { type QuestionStats } from '../db/db';
import { supabase } from '../lib/supabase';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { Brain, Target, Flame, Trophy, TrendingUp, Clock, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

export function Dashboard() {
  const { progress } = useStore();
  const [stats, setStats] = useState({
    totalQuestions: 0,
    mastered: 0,
    learning: 0,
    new: 0,
    accuracy: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const { data: allStats } = await supabase.from('question_stats').select('*');
    const { count: totalQ } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    
    let mastered = 0;
    let learning = 0;
    let totalCorrect = 0;
    let totalAttempts = 0;
    
    if (allStats) {
      allStats.forEach(s => {
        if (s.mastery_score >= 80) mastered++;
        else if (s.times_seen > 0) learning++;
        
        totalCorrect += s.times_correct;
        totalAttempts += s.times_seen;
      });
    }
    
    setStats({
      totalQuestions: totalQ || 0,
      mastered,
      learning,
      new: (totalQ || 0) - mastered - learning,
      accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    });
  };

  const mockWeeklyData = [
    { name: 'Mon', xp: 120 },
    { name: 'Tue', xp: 300 },
    { name: 'Wed', xp: 250 },
    { name: 'Thu', xp: 400 },
    { name: 'Fri', xp: 200 },
    { name: 'Sat', xp: 600 },
    { name: 'Sun', xp: 800 },
  ];

  const masteryData = [
    { name: 'Mastered', value: stats.mastered, color: '#22c55e' },
    { name: 'Learning', value: stats.learning, color: '#eab308' },
    { name: 'New', value: stats.new, color: '#94a3b8' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
          <p className="text-muted-foreground mt-1">You're on a {progress.currentStreak} day streak. Keep it up!</p>
        </div>
        
        <div className="flex items-center gap-6 glass-card px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-full"><Trophy className="text-primary" size={20} /></div>
            <div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Level {progress.level}</div>
              <div className="text-lg font-bold">{progress.xp} <span className="text-sm font-normal text-muted-foreground">XP</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card glass>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-orange-500/20 p-4 rounded-2xl"><Flame className="text-orange-500" size={24} /></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current Streak</p>
              <h3 className="text-2xl font-bold">{progress.currentStreak} Days</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card glass>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-green-500/20 p-4 rounded-2xl"><Target className="text-green-500" size={24} /></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Accuracy</p>
              <h3 className="text-2xl font-bold">{stats.accuracy}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-blue-500/20 p-4 rounded-2xl"><Brain className="text-blue-500" size={24} /></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Mastered</p>
              <h3 className="text-2xl font-bold">{stats.mastered} <span className="text-sm font-normal text-muted-foreground">/ {stats.totalQuestions}</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-purple-500/20 p-4 rounded-2xl"><BookOpen className="text-purple-500" size={24} /></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Learning</p>
              <h3 className="text-2xl font-bold">{stats.learning}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card glass className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp size={18} className="text-primary" />
              XP Earned (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockWeeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                  itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="xp" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorXp)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card glass className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg text-center">Mastery Progress</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={masteryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {masteryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none pb-6">
              <div className="text-3xl font-bold text-primary">{stats.mastered > 0 && stats.totalQuestions > 0 ? Math.round((stats.mastered / stats.totalQuestions) * 100) : 0}%</div>
              <div className="text-xs text-muted-foreground">Mastered</div>
            </div>
            
            <div className="flex gap-4 mt-auto">
              {masteryData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs font-medium">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
