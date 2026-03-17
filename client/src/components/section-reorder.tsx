import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, GripVertical, X, LayoutList } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export interface SectionConfig {
  id: string;
  label: string;
  icon: string;
}

export const ALL_SECTIONS: SectionConfig[] = [
  { id: 'isa', label: 'Immediate Safety Alerts', icon: '🚨' },
  { id: 'weather', label: 'Weather Dashboard', icon: '🌤️' },
  { id: 'station', label: 'Weather Station', icon: '🏠' },
  { id: 'summary', label: 'Storm Summary', icon: '⚡' },
  { id: 'ai', label: 'AI Weather Assistant', icon: '🤖' },
  { id: 'radar', label: 'Radar / Sonar / 3D', icon: '📡' },
  { id: 'impact', label: 'Storm Impact Predictions', icon: '⚠️' },
  { id: 'cells', label: 'Storm Cells', icon: '🌩️' },
];

const STORAGE_KEY = 'stormtracker_section_order';
const DEFAULT_ORDER = ALL_SECTIONS.map(s => s.id);

export function getSectionOrder(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      const allIds = new Set(DEFAULT_ORDER);
      const valid = parsed.filter(id => allIds.has(id));
      const missing = DEFAULT_ORDER.filter(id => !parsed.includes(id));
      return [...valid, ...missing];
    }
  } catch {}
  return [...DEFAULT_ORDER];
}

export function saveSectionOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

interface SectionReorderProps {
  onClose: () => void;
  onOrderChange: (order: string[]) => void;
  currentOrder: string[];
}

export default function SectionReorder({ onClose, onOrderChange, currentOrder }: SectionReorderProps) {
  const [order, setOrder] = useState<string[]>(currentOrder);
  const { t } = useLanguage();

  const translatedLabels: Record<string, string> = {
    'isa': t.immediacySafetyAlert,
    'weather': t.weatherDashboard,
    'summary': t.stormSummary,
    'ai': t.aiWeatherAssistant,
    'radar': t.radarDisplay,
    'impact': t.stormImpactPredictions,
    'cells': t.stormCells,
  };

  const sectionMap = new Map(ALL_SECTIONS.map(s => [s.id, { ...s, label: translatedLabels[s.id] || s.label }]));

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrder(newOrder);
  };

  const moveDown = (index: number) => {
    if (index >= order.length - 1) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrder(newOrder);
  };

  const handleSave = () => {
    saveSectionOrder(order);
    onOrderChange(order);
    onClose();
  };

  const handleReset = () => {
    setOrder([...DEFAULT_ORDER]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-600 rounded-xl p-4 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LayoutList className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold text-base">{t.layout}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-400 text-xs mb-3">Move sections up or down to reorder the page layout.</p>

        <div className="space-y-1.5 mb-4">
          {order.map((id, index) => {
            const section = sectionMap.get(id);
            if (!section) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600/50"
              >
                <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-base shrink-0">{section.icon}</span>
                <span className="text-white text-sm flex-1 min-w-0 truncate">{section.label}</span>
                <span className="text-slate-500 text-[10px] shrink-0 w-4 text-center">{index + 1}</span>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 rounded hover:bg-slate-600 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === order.length - 1}
                    className="p-0.5 rounded hover:bg-slate-600 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
            className="text-xs border-slate-600 text-slate-300"
          >
            {t.refreshData}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="text-xs text-slate-400"
          >
            {t.cancel}
          </Button>
          <Button
            onClick={handleSave}
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            {t.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
