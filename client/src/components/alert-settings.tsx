import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { X, Volume2, Bell, AlertTriangle, Filter, Settings } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';

interface AlertPreferences {
  minimumDbz: number;
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
  impactThreshold: number;
  onImpactThresholdChange: (value: number) => void;
  useMetric: boolean;
  onUnitsChange: (useMetric: boolean) => void;
}

export default function AlertSettings({ isOpen, onClose, preferences, onSave, impactThreshold, onImpactThresholdChange, useMetric, onUnitsChange }: AlertSettingsProps) {
  const [localPreferences, setLocalPreferences] = useState<AlertPreferences>(preferences);
  const [localThreshold, setLocalThreshold] = useState(impactThreshold);
  const [localMetric, setLocalMetric] = useState(useMetric);
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localPreferences);
    onImpactThresholdChange(localThreshold);
    onUnitsChange(localMetric);
    localStorage.setItem('stormtracker_impact_threshold', localThreshold.toString());
    onClose();
  };

  const updatePreference = (key: keyof AlertPreferences, value: any) => {
    setLocalPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const getDbzDescription = (dbz: number) => {
    if (dbz >= 61) return { category: 'Extreme Thunderstorms', color: 'text-purple-400', description: '250+ mm/h (10+ in/h), large hail likely' };
    if (dbz >= 55) return { category: 'Very Heavy Rain/Hail', color: 'text-red-400', description: '100-205 mm/h (4-8 in/h), hail potential' };
    if (dbz >= 46) return { category: 'Heavy Rain', color: 'text-orange-400', description: '28.8-48.6 mm/h (1.1-1.9 in/h)' };
    if (dbz >= 35) return { category: 'Moderate Rain', color: 'text-yellow-400', description: '5.6-23.7 mm/h (0.22-0.93 in/h)' };
    if (dbz >= 20) return { category: 'Light Rain', color: 'text-green-400', description: '0.6-2.7 mm/h (0.02-0.11 in/h)' };
    return { category: 'No Precipitation', color: 'text-gray-400', description: 'Clear conditions' };
  };

  const getThresholdDescription = (pct: number) => {
    if (pct === 0) return { label: 'Show all storms', color: 'text-green-400', desc: 'All storm clusters shown, including those with <5% impact chance.' };
    if (pct <= 20) return { label: 'Very low filter', color: 'text-green-400', desc: 'Only hides storms with very minimal impact chance.' };
    if (pct <= 40) return { label: 'Low filter', color: 'text-yellow-400', desc: 'Hides low-probability storms. Shows moderate threats and above.' };
    if (pct <= 60) return { label: 'Medium filter', color: 'text-orange-400', desc: 'Shows only storms with meaningful impact probability.' };
    if (pct <= 85) return { label: 'High filter', color: 'text-red-400', desc: 'Only shows storms with high probability of direct impact.' };
    return { label: 'Maximum filter', color: 'text-red-400', desc: 'Only shows storms with 85%+ impact probability.' };
  };

  const dbzInfo = getDbzDescription(localPreferences.minimumDbz);
  const thresholdInfo = getThresholdDescription(localThreshold);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700 max-h-[90vh] sm:max-h-[95vh] overflow-y-auto m-2 sm:m-0">
        <CardHeader className="pb-3 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between min-h-[2rem]">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2 pr-3">
              <Settings className="h-5 w-5" />
              {t.settings}
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
        
        <CardContent className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Units</h3>
            <div className="flex gap-2">
              <Button
                variant={!localMetric ? "default" : "secondary"}
                size="sm"
                onClick={() => setLocalMetric(false)}
                className="flex-1 text-xs"
              >
                Imperial (mph, mi, °F)
              </Button>
              <Button
                variant={localMetric ? "default" : "secondary"}
                size="sm"
                onClick={() => setLocalMetric(true)}
                className="flex-1 text-xs"
              >
                Metric (km/h, km, °C)
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Impact Threshold
            </h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-300">Minimum impact % to show</Label>
                  <span className="text-sm text-white font-mono">{localThreshold}%</span>
                </div>
                <Slider
                  value={[localThreshold]}
                  onValueChange={(value) => setLocalThreshold(value[0])}
                  max={85}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0% (show all)</span>
                  <span>85% (max)</span>
                </div>
              </div>
              
              <div className="bg-slate-700/50 p-2.5 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm font-medium ${thresholdInfo.color}`}>
                    {thresholdInfo.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {localThreshold}%+
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  {thresholdInfo.desc}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Storm Intensity
            </h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-300">Minimum dBZ</Label>
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
              
              <div className="bg-slate-700/50 p-2.5 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between mb-0.5">
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
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Alert Radius & Frequency</h3>
            <div className="space-y-3">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-300">Minimum interval</Label>
                  <span className="text-sm text-white">{localPreferences.alertFrequency} min</span>
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
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Notifications</h3>
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

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
              <span className="text-slate-400">OpenWeather</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
              <span className="text-slate-400">NWS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
              <span className="text-slate-400">RainViewer</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
              <span className="text-slate-400">Map</span>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-600">
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
