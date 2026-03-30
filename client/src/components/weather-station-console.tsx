interface WeatherStationConsoleProps {
  lat: number;
  lon: number;
  locationName?: string;
}

export default function WeatherStationConsole({ lat, lon, locationName }: WeatherStationConsoleProps) {
  return (
    <div className="text-slate-400 text-sm py-4 text-center">
      <div className="text-base font-semibold text-slate-300 mb-1">🌤️ Weather Station</div>
      {locationName && <div className="text-xs text-slate-500 mb-2">{locationName}</div>}
      <div className="text-xs text-slate-500">{lat.toFixed(4)}°, {lon.toFixed(4)}°</div>
    </div>
  );
}
