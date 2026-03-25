import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Key, Upload, Download, Eye, EyeOff, Trash2, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { API_KEY_CONFIGS, useApiKeys } from '@/hooks/use-api-keys';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiKeySettings({ isOpen, onClose }: ApiKeySettingsProps) {
  const { keys, setKey, removeKey, importFromText, exportToText, getKeyStatus, getGroupStatus } = useApiKeys();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [importResult, setImportResult] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = useCallback((text: string) => {
    const count = importFromText(text);
    setImportResult(count > 0 ? `Imported ${count} key${count > 1 ? 's' : ''} successfully` : 'No valid keys found in file');
    setTimeout(() => setImportResult(null), 4000);
  }, [importFromText]);

  if (!isOpen) return null;

  const groups = Array.from(new Set(API_KEY_CONFIGS.map(c => c.group)));

  const handleStartEdit = (configId: string) => {
    setEditingKey(configId);
    setEditValue(keys[configId] || '');
  };

  const handleSaveEdit = () => {
    if (editingKey) {
      setKey(editingKey, editValue);
      setEditingKey(null);
      setEditValue('');
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const toggleShowValue = (configId: string) => {
    setShowValues(prev => ({ ...prev, [configId]: !prev[configId] }));
  };

  const maskValue = (val: string) => {
    if (val.length <= 8) return '••••••••';
    return val.substring(0, 4) + '••••' + val.substring(val.length - 4);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) handleFileImport(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) handleFileImport(text);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const text = exportToText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stormtracker-keys.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusIcon = (status: 'active' | 'partial' | 'empty') => {
    if (status === 'active') return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === 'partial') return <AlertCircle className="w-4 h-4 text-yellow-400" />;
    return <div className="w-4 h-4 rounded-full border-2 border-slate-500" />;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 p-3 sm:p-4 pt-[max(12px,env(safe-area-inset-top))] overflow-y-auto">
      <Card className="w-full max-w-lg bg-slate-800 border-slate-700 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto my-2 sm:my-0">
        <CardHeader className="pb-3 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between min-h-[2rem]">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2 pr-3">
              <Key className="h-5 w-5" />
              API Keys
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

        <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
          <div
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-900/20' : 'border-slate-600 bg-slate-700/20'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-300 mb-1">
              Drop your key file here or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                browse
              </button>
            </p>
            <p className="text-[10px] text-slate-500">
              Format: AMBIENT_WEATHER_API_KEY=xxx (one per line)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.env,.cfg,.conf,.config"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>

          {importResult && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              importResult.includes('successfully') 
                ? 'bg-green-900/30 border border-green-500/40 text-green-300' 
                : 'bg-yellow-900/30 border border-yellow-500/40 text-yellow-300'
            }`}>
              {importResult}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              variant="outline"
              size="sm"
              className="flex-1 text-xs bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Keys
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 border border-amber-500/30 p-3">
            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-200 font-medium">Keep your key file safe</p>
              <p className="text-[10px] text-amber-300/70 mt-0.5">
                Keys are stored locally in your browser. Export a backup and keep it in a secure location. Keys are sent securely to our server only when fetching your station data.
              </p>
            </div>
          </div>

          {groups.map(group => {
            const groupConfigs = API_KEY_CONFIGS.filter(c => c.group === group);
            const groupStat = getGroupStatus(group);
            return (
              <div key={group} className="rounded-xl bg-slate-700/30 border border-slate-600/50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-700/40">
                  {statusIcon(groupStat)}
                  <span className="text-sm font-semibold text-white">{group}</span>
                  <span className={`text-[10px] ml-auto ${
                    groupStat === 'active' ? 'text-green-400' : groupStat === 'partial' ? 'text-yellow-400' : 'text-slate-500'
                  }`}>
                    {groupStat === 'active' ? 'Configured' : groupStat === 'partial' ? 'Incomplete' : 'Not configured'}
                  </span>
                </div>

                <div className="divide-y divide-slate-600/30">
                  {groupConfigs.map(config => {
                    const status = getKeyStatus(config.id);
                    const isEditing = editingKey === config.id;
                    const isShowing = showValues[config.id];
                    const value = keys[config.id] || '';

                    return (
                      <div key={config.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-200">{config.label}</span>
                          <div className="flex items-center gap-1">
                            {status === 'active' && (
                              <div className="w-2 h-2 rounded-full bg-green-400" />
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2">{config.description}</p>

                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder={config.placeholder}
                              className="text-xs h-8 bg-slate-800 border-slate-600"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <Button onClick={handleSaveEdit} size="sm" className="h-8 px-2 text-xs bg-blue-600 hover:bg-blue-500">
                              Save
                            </Button>
                            <Button onClick={handleCancelEdit} variant="ghost" size="sm" className="h-8 px-2 text-xs">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {value ? (
                              <>
                                <code className="flex-1 text-[11px] bg-slate-800/60 rounded px-2 py-1 text-slate-300 font-mono truncate">
                                  {isShowing ? value : maskValue(value)}
                                </code>
                                <button onClick={() => toggleShowValue(config.id)} className="p-1 text-slate-400 hover:text-slate-200">
                                  {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => handleStartEdit(config.id)} className="p-1 text-slate-400 hover:text-blue-400">
                                  <Key className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => removeKey(config.id)} className="p-1 text-slate-400 hover:text-red-400">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <Button
                                onClick={() => handleStartEdit(config.id)}
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 bg-slate-800/50 border-slate-600 hover:bg-slate-700"
                              >
                                + Add Key
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="pt-2 border-t border-slate-600">
            <Button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
