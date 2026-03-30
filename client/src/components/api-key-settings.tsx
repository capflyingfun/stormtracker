import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiKeySettings({ isOpen, onClose }: ApiKeySettingsProps) {
  const [key, setKey] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-xl max-w-md w-full p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">🔑 API Key Settings</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">✕</Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">OpenAI API Key</label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <Button
            onClick={() => { if (key) localStorage.setItem('openai_key', key); onClose(); }}
            className="w-full"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
