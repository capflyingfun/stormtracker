interface PersonalWeatherStationProps {
  onOpenApiKeys?: () => void;
}

export default function PersonalWeatherStation({ onOpenApiKeys }: PersonalWeatherStationProps) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
      <div className="text-base font-semibold text-slate-300 mb-2">📡 Personal Weather Station</div>
      <p className="text-xs text-slate-400">
        Connect a personal weather station to see hyper-local conditions.
      </p>
      {onOpenApiKeys && (
        <button
          onClick={onOpenApiKeys}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
        >
          Configure API Keys
        </button>
      )}
    </div>
  );
}
