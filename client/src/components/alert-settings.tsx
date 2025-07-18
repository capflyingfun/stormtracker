import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Volume2, Bell, Mail, AlertTriangle } from 'lucide-react';

interface AlertPreferences {
  minimumDbz: number; // Minimum dBZ to trigger alerts
  alertRadius: number;
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

  const getDbzDescription = (dbz: number) => {
    if (dbz >= 61) return { category: 'Extreme Thunderstorms', color: 'text-purple-400', description: '250+ mm/h, large hail likely' };
    if (dbz >= 55) return { category: 'Very Heavy Rain/Hail', color: 'text-red-400', description: '100-205 mm/h, hail potential' };
    if (dbz >= 46) return { category: 'Heavy Rain', color: 'text-orange-400', description: '28.8-48.6 mm/h' };
    if (dbz >= 35) return { category: 'Moderate Rain', color: 'text-yellow-400', description: '5.6-23.7 mm/h' };
    if (dbz >= 20) return { category: 'Light Rain', color: 'text-green-400', description: '0.6-2.7 mm/h' };
    return { category: 'No Precipitation', color: 'text-gray-400', description: 'Clear conditions' };
  };

  const dbzInfo = getDbzDescription(localPreferences.minimumDbz);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700 max-h-[90vh] sm:max-h-[95vh] overflow-y-auto m-2 sm:m-0">
        <CardHeader className="pb-3 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between min-h-[2rem]">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2 pr-3">
              <AlertTriangle className="h-5 w-5" />
              Alert Settings
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-10 w-10 p-0 text-slate-400 hover:text-white shrink-0 flex-none -mr-2"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Minimum Storm Intensity */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Alert Threshold</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-300">Minimum Storm Intensity</Label>
                  <span className="text-sm text-white font-mono">{localPreferences.minimumDbz} dBZ</span>
                </div>
                <Slider
                  value={[localPreferences.minimumDbz]}
                  onValueChange={(value) => updatePreference('minimumDbz', value[0])}
                  max={70}
                  min={20}
                  step={5}
                  className="w-full"
                />
              </div>
              
              {/* Current threshold description */}
              <div className="bg-slate-700/50 p-3 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${dbzInfo.color}`}>
                    {dbzInfo.category}
                  </span>
                  <span className="text-xs text-slate-400">
                    {localPreferences.minimumDbz}+ dBZ
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  {dbzInfo.description}
                </p>
              </div>
              
              <p className="text-xs text-slate-400">
                Alerts will be triggered for storms at or above this intensity level. 
                The system will find the closest qualifying storm within your alert radius.
              </p>
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