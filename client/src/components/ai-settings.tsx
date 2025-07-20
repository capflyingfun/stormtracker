import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Zap, MessageCircle, Smile } from 'lucide-react';

interface AISettingsProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

interface UserSettings {
  aiTone: 'professional' | 'friendly' | 'humorous';
  detailLevel: 'minimal' | 'standard' | 'technical';
  includeHumor: boolean;
  simplifiedLanguage: boolean;
}

export function AISettings({ isOpen, onClose, sessionId }: AISettingsProps) {
  const [settings, setSettings] = useState<UserSettings>({
    aiTone: 'professional',
    detailLevel: 'standard',
    includeHumor: false,
    simplifiedLanguage: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load user settings
  useEffect(() => {
    if (isOpen && sessionId) {
      loadUserSettings();
    }
  }, [isOpen, sessionId]);

  const loadUserSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/user-settings/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load user settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...settings })
      });
      
      if (response.ok) {
        onClose();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <Card className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Settings className="w-5 h-5" />
            AI Assistant Settings
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-300">
            Customize your AI weather assistant tone and style (like Carrot Weather)
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Dynamic AI Tone */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-900 dark:text-white">Assistant Tone</Label>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Dynamic Tone Active</span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                AI automatically adjusts tone based on weather severity:
              </p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-1">
                <li>• <strong>Severe weather:</strong> Direct, urgent, life-safety focused</li>
                <li>• <strong>Moderate conditions:</strong> Professional, clear guidance</li>
                <li>• <strong>Clear weather:</strong> Relaxed, conversational, with humor</li>
              </ul>
            </div>
          </div>

          {/* Detail Level */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-900 dark:text-white">Detail Level</Label>
            <RadioGroup 
              value={settings.detailLevel} 
              onValueChange={(value) => setSettings({...settings, detailLevel: value as any})}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="minimal" id="minimal" />
                <Label htmlFor="minimal" className="text-slate-700 dark:text-slate-200">Minimal - Essential safety info only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="standard" />
                <Label htmlFor="standard" className="text-slate-700 dark:text-slate-200">Standard - Balanced weather information</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="technical" id="technical" />
                <Label htmlFor="technical" className="text-slate-700 dark:text-slate-200">Technical - Detailed meteorological analysis</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Additional Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="simplified" className="text-sm text-slate-700 dark:text-slate-200">Simplified Language</Label>
              <Switch
                id="simplified"
                checked={settings.simplifiedLanguage}
                onCheckedChange={(checked) => setSettings({...settings, simplifiedLanguage: checked})}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="humor" className="text-sm text-slate-700 dark:text-slate-200">Allow Humor (Clear Weather)</Label>
              <Switch
                id="humor"
                checked={settings.includeHumor}
                onCheckedChange={(checked) => setSettings({...settings, includeHumor: checked})}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}