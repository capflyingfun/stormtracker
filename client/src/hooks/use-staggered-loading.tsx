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

export function WeatherCardSkeleton() {
  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-slate-700/40" />
        <div className="h-2.5 bg-slate-700/30 rounded w-20" />
      </div>
      <div className="text-center">
        <div className="h-8 bg-slate-700/30 rounded w-16 mx-auto mb-1" />
        <div className="h-2 bg-slate-700/20 rounded w-12 mx-auto" />
      </div>
    </div>
  );
}

export function WindCompassSkeleton() {
  return (
    <div className="col-span-2 sm:col-span-2 flex flex-col items-center justify-center rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 animate-pulse">
      <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-700/15 border-2 border-slate-700/30 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-slate-700/20" />
      </div>
      <div className="flex gap-4 mt-2">
        <div className="h-3 bg-slate-700/30 rounded w-12" />
        <div className="h-3 bg-slate-700/30 rounded w-12" />
      </div>
    </div>
  );
}

export function ForecastStripSkeleton() {
  return (
    <div className="flex gap-1 animate-pulse overflow-hidden">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center px-1.5 py-1 rounded-lg bg-slate-700/15 min-w-[42px]">
          <div className="h-2 bg-slate-700/20 rounded w-6 mb-1" />
          <div className="w-5 h-5 rounded bg-slate-700/25 my-0.5" />
          <div className="h-2 bg-slate-700/15 rounded w-4" />
        </div>
      ))}
    </div>
  );
}
