export const STORM_THRESHOLDS = {
  EXTREME: 65,
  SEVERE: 55,
  HEAVY: 46,
  MODERATE: 35,
} as const;

export type StormCategory = 'Extreme' | 'Severe' | 'Heavy' | 'Moderate' | 'Light';
export type StormFilterKey = 'extreme' | 'veryHeavy' | 'heavy' | 'moderate' | 'light';

export function getStormCategory(dBZ: number): StormCategory {
  if (dBZ >= STORM_THRESHOLDS.EXTREME) return 'Extreme';
  if (dBZ >= STORM_THRESHOLDS.SEVERE) return 'Severe';
  if (dBZ >= STORM_THRESHOLDS.HEAVY) return 'Heavy';
  if (dBZ >= STORM_THRESHOLDS.MODERATE) return 'Moderate';
  return 'Light';
}

export function getStormFilterKey(dBZ: number): StormFilterKey {
  if (dBZ >= 61) return 'extreme';
  if (dBZ >= STORM_THRESHOLDS.SEVERE) return 'veryHeavy';
  if (dBZ >= STORM_THRESHOLDS.HEAVY) return 'heavy';
  if (dBZ >= STORM_THRESHOLDS.MODERATE) return 'moderate';
  return 'light';
}

export function getStormColor(dBZ: number): string {
  if (dBZ >= STORM_THRESHOLDS.EXTREME) return '#A855F7';
  if (dBZ >= STORM_THRESHOLDS.SEVERE) return '#EF4444';
  if (dBZ >= STORM_THRESHOLDS.HEAVY) return '#F97316';
  if (dBZ >= STORM_THRESHOLDS.MODERATE) return '#EAB308';
  return '#22C55E';
}

export const COMPASS_16 = [
  'N','NNE','NE','ENE','E','ESE','SE','SSE',
  'S','SSW','SW','WSW','W','WNW','NW','NNW'
] as const;

export function getCompassDirection(degrees: number): string {
  return COMPASS_16[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

export function calculateApproachAngle(stormBearingFromUser: number, movementDirection: number): number {
  const bearingToUser = (stormBearingFromUser + 180) % 360;
  const normalized = ((movementDirection % 360) + 360) % 360;
  return Math.abs(((bearingToUser - normalized + 180) % 360) - 180);
}

export function calculateETA(distanceMiles: number, speedMph: number): number {
  if (speedMph <= 0) return 999;
  return (distanceMiles / speedMph) * 60;
}

export function formatStormEta(totalMinutes: number): string {
  if (totalMinutes < 60) {
    const totalSeconds = Math.round(totalMinutes * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}m:${s.toString().padStart(2, '0')}s`;
  }
  const totalMins = Math.round(totalMinutes);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m`;
}

export function isStormApproaching(stormBearingFromUser: number, movementDirection: number, movementSpeed: number, thresholdDegrees = 30): boolean {
  if (movementSpeed <= 3) return false;
  return calculateApproachAngle(stormBearingFromUser, movementDirection) <= thresholdDegrees;
}
