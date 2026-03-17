import { useState, useEffect } from 'react';

const tiers: Record<string, number> = {};
let initialized = false;

function initTiers() {
  if (initialized) return;
  initialized = true;
  tiers['tier1'] = 0;
  tiers['tier2'] = 600;
  tiers['tier3'] = 1400;
  tiers['tier4'] = 2200;
}

export function useLoadingTier(tier: 'tier1' | 'tier2' | 'tier3' | 'tier4'): boolean {
  initTiers();
  const delay = tiers[tier] || 0;
  const [ready, setReady] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return ready;
}

export function LoadingSkeleton({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700/40 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-slate-700/40 rounded w-3/4" />
            <div className="h-2.5 bg-slate-700/30 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionSkeleton({ title, icon, height = 'h-32' }: { title: string; icon: string; height?: string }) {
  return (
    <div className={`bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 ${height} animate-pulse`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm opacity-50">{icon}</span>
        <span className="text-xs text-slate-600 font-medium">{title}</span>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-slate-700/30 rounded w-2/3" />
        <div className="h-3 bg-slate-700/20 rounded w-1/2" />
        <div className="h-3 bg-slate-700/15 rounded w-3/4" />
      </div>
    </div>
  );
}

export function GaugeSkeleton() {
  return (
    <div className="flex flex-col items-center animate-pulse">
      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-700/20 border-4 border-slate-700/30" />
      <div className="h-2.5 bg-slate-700/30 rounded w-16 mt-2" />
    </div>
  );
}
