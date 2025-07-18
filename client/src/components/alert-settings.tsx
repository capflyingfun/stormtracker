import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Volume2, Bell, Mail, AlertTriangle } from 'lucide-react';

interface AlertPreferences {
  lightRainEnabled: boolean;
  moderateRainEnabled: boolean;
  heavyRainEnabled: boolean;
  veryHeavyRainEnabled: boolean;
  extremeStormEnabled: boolean;
  alertRadius: number;
  riskLevel: 'low' | 'medium' | 'high';
  alertFrequency: number;
  soundEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

interface AlertSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: AlertPreferences;
  onSave: (preferences: AlertPreferences) => void;
}

export default function AlertSettings({ isOpen, onClose, preferences, onSave }: AlertSettingsProps) {
  const [localPreferences, setLocalPreferences] = useState<AlertPreferences>(preferences);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localPreferences);
    onClose();
  };

  const updatePreference = (key: keyof AlertPreferences, value: any) => {
    setLocalPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'light': return 'text-green-400';
      case 'moderate': return 'text-yellow-400';
      case 'heavy': return 'text-orange-400';
      case 'veryHeavy': return 'text-red-400';
      case 'extreme': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alert Settings
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Storm Intensity Alerts */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Storm Intensity Alerts</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="light-rain" className={`text-sm ${getIntensityColor('light')}`}>
                  Light Rain (20-34 dBZ)
                </Label>
                <Switch
                  id="light-rain"
                  checked={localPreferences.lightRainEnabled}
                  onCheckedChange={(checked) => updatePreference('lightRainEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="moderate-rain" className={`text-sm ${getIntensityColor('moderate')}`}>
                  Moderate Rain (35-45 dBZ)
                </Label>
                <Switch
                  id="moderate-rain"
                  checked={localPreferences.moderateRainEnabled}
                  onCheckedChange={(checked) => updatePreference('moderateRainEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="heavy-rain" className={`text-sm ${getIntensityColor('heavy')}`}>
                  Heavy Rain (46-54 dBZ)
                </Label>
                <Switch
                  id="heavy-rain"
                  checked={localPreferences.heavyRainEnabled}
                  onCheckedChange={(checked) => updatePreference('heavyRainEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="very-heavy-rain" className={`text-sm ${getIntensityColor('veryHeavy')}`}>
                  Very Heavy Rain (55-60 dBZ)
                </Label>
                <Switch
                  id="very-heavy-rain"
                  checked={localPreferences.veryHeavyRainEnabled}
                  onCheckedChange={(checked) => updatePreference('veryHeavyRainEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="extreme-storm" className={`text-sm ${getIntensityColor('extreme')}`}>
                  Extreme Storms (61+ dBZ)
                </Label>
                <Switch
                  id="extreme-storm"
                  checked={localPreferences.extremeStormEnabled}
                  onCheckedChange={(checked) => updatePreference('extremeStormEnabled', checked)}
                />
              </div>
            </div>
          </div>

          {/* Alert Radius */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Alert Radius</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">Detection Range</Label>
                <span className="text-sm text-white">{localPreferences.alertRadius} miles</span>
              </div>
              <Slider
                value={[localPreferences.alertRadius]}
                onValueChange={(value) => updatePreference('alertRadius', value[0])}
                max={50}
                min={5}
                step={5}
                className="w-full"
              />
            </div>
          </div>

          {/* Risk Sensitivity */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Risk Sensitivity</h3>
            <Select 
              value={localPreferences.riskLevel} 
              onValueChange={(value) => updatePreference('riskLevel', value)}
            >
              <SelectTrigger className="w-full bg-slate-700 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - Fewer alerts</SelectItem>
                <SelectItem value="medium">Medium - Balanced</SelectItem>
                <SelectItem value="high">High - More alerts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alert Frequency */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Alert Frequency</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">Minimum interval</Label>
                <span className="text-sm text-white">{localPreferences.alertFrequency} minutes</span>
              </div>
              <Slider
                value={[localPreferences.alertFrequency]}
                onValueChange={(value) => updatePreference('alertFrequency', value[0])}
                max={60}
                min={5}
                step={5}
                className="w-full"
              />
            </div>
          </div>

          {/* Notification Types */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Notification Types</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sound-alerts" className="text-sm text-slate-300 flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Sound Alerts
                </Label>
                <Switch
                  id="sound-alerts"
                  checked={localPreferences.soundEnabled}
                  onCheckedChange={(checked) => updatePreference('soundEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="push-alerts" className="text-sm text-slate-300 flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Visual Alerts
                </Label>
                <Switch
                  id="push-alerts"
                  checked={localPreferences.pushEnabled}
                  onCheckedChange={(checked) => updatePreference('pushEnabled', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="email-alerts" className="text-sm text-slate-300 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Alerts
                </Label>
                <Switch
                  id="email-alerts"
                  checked={localPreferences.emailEnabled}
                  onCheckedChange={(checked) => updatePreference('emailEnabled', checked)}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t border-slate-600">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-500"
            >
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}