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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-white dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            AI Assistant Settings
          </CardTitle>
          <CardDescription>
            Customize your AI weather assistant tone and style (like Carrot Weather)
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* AI Tone Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Assistant Personality</Label>
            <RadioGroup 
              value={settings.aiTone} 
              onValueChange={(value) => setSettings({...settings, aiTone: value as any})}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="professional" id="professional" />
                <Label htmlFor="professional" className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Professional - Scientific weather analysis
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="friendly" id="friendly" />
                <Label htmlFor="friendly" className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Friendly - Conversational and easy to understand
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="humorous" id="humorous" />
                <Label htmlFor="humorous" className="flex items-center gap-2">
                  <Smile className="w-4 h-4" />
                  Humorous - Weather updates with personality
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Detail Level */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Detail Level</Label>
            <RadioGroup 
              value={settings.detailLevel} 
              onValueChange={(value) => setSettings({...settings, detailLevel: value as any})}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="minimal" id="minimal" />
                <Label htmlFor="minimal">Minimal - Essential safety info only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="standard" />
                <Label htmlFor="standard">Standard - Balanced weather information</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="technical" id="technical" />
                <Label htmlFor="technical">Technical - Detailed meteorological analysis</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Additional Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="simplified" className="text-sm">Simplified Language</Label>
              <Switch
                id="simplified"
                checked={settings.simplifiedLanguage}
                onCheckedChange={(checked) => setSettings({...settings, simplifiedLanguage: checked})}
              />
            </div>
            
            {settings.aiTone === 'humorous' && (
              <div className="flex items-center justify-between">
                <Label htmlFor="humor" className="text-sm">Include Weather Humor</Label>
                <Switch
                  id="humor"
                  checked={settings.includeHumor}
                  onCheckedChange={(checked) => setSettings({...settings, includeHumor: checked})}
                />
              </div>
            )}
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