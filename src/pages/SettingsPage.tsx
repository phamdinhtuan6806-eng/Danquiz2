import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Moon, Sun, Monitor, Trash2, Download, Upload } from 'lucide-react';
import { db } from '../db/db';

export function SettingsPage() {
  const { settings, updateSettings, progress } = useStore();
  const [clearing, setClearing] = useState(false);

  const handleClearData = async () => {
    if (confirm("Are you sure you want to clear ALL data? This cannot be undone.")) {
      setClearing(true);
      await db.questions.clear();
      await db.stats.clear();
      await db.activity.clear();
      alert("All data cleared successfully.");
      setClearing(false);
      window.location.reload();
    }
  };

  const themes = [
    { id: 'light', icon: <Sun size={20} />, label: 'Light' },
    { id: 'dark', icon: <Moon size={20} />, label: 'Dark' },
    { id: 'system', icon: <Monitor size={20} />, label: 'System' },
  ] as const;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your preferences and data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Appearance */}
        <Card glass className="md:col-span-2">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {themes.map(t => (
                <button
                  key={t.id}
                  onClick={() => updateSettings({ theme: t.id })}
                  className={`flex-1 flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                    settings.theme === t.id 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-border bg-card/50 hover:border-primary/50 text-muted-foreground'
                  }`}
                >
                  {t.icon}
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Study Preferences */}
        <Card glass>
          <CardHeader>
            <CardTitle>Study Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Auto-Next Question</div>
                <div className="text-sm text-muted-foreground">Automatically proceed after answering</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.autoNext}
                  onChange={(e) => updateSettings({ autoNext: e.target.checked })}
                />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Sound Effects</div>
                <div className="text-sm text-muted-foreground">Play sounds for correct/wrong answers</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.soundEffects}
                  onChange={(e) => updateSettings({ soundEffects: e.target.checked })}
                />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card glass>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-start text-left" disabled>
              <Download size={18} className="mr-3" />
              Export Backup (Coming Soon)
            </Button>
            <Button variant="outline" className="w-full justify-start text-left" disabled>
              <Upload size={18} className="mr-3" />
              Restore Backup (Coming Soon)
            </Button>
            <div className="pt-4 border-t border-border mt-4">
              <Button 
                variant="destructive" 
                className="w-full" 
                onClick={handleClearData}
                disabled={clearing}
              >
                <Trash2 size={18} className="mr-2" />
                {clearing ? 'Clearing...' : 'Clear All Data'}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                This will delete all questions, progress, and settings permanently.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
