import { useState } from 'react';
import { Button } from '@/components/ui/button';

const DEFAULT_ORDER = ['isa', 'weather', 'station', 'pws', 'summary', 'storms', 'alerts'];
const STORAGE_KEY = 'st_sectionOrder';

export function getSectionOrder(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_ORDER];
}

const SECTION_LABELS: Record<string, string> = {
  isa: '⚠️ Safety Alerts',
  weather: '🌤️ Weather',
  station: '📡 Weather Station',
  pws: '🌡️ Personal Station',
  summary: '📊 Storm Summary',
  storms: '🌩️ Storms',
  alerts: '🔔 Alerts',
};

interface SectionReorderProps {
  currentOrder: string[];
  onOrderChange: (order: string[]) => void;
  onClose: () => void;
}

export default function SectionReorder({ currentOrder, onOrderChange, onClose }: SectionReorderProps) {
  const [order, setOrder] = useState<string[]>(currentOrder);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    onOrderChange(order);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-xl max-w-sm w-full p-5 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">⇅ Reorder Sections</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">✕</Button>
        </div>
        <div className="space-y-1 mb-4">
          {order.map((id, i) => (
            <div key={id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-slate-200">{SECTION_LABELS[id] ?? id}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-white disabled:opacity-30 px-1">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="text-slate-400 hover:text-white disabled:opacity-30 px-1">▼</button>
            </div>
          ))}
        </div>
        <Button onClick={save} className="w-full">Save Order</Button>
      </div>
    </div>
  );
}
