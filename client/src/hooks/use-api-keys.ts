import { useState, useCallback } from 'react';

export interface ApiKeyConfig {
  id: string;
  label: string;
  description: string;
  envName: string;
  storageKey: string;
  required?: boolean;
  placeholder?: string;
  group: string;
}

export const API_KEY_CONFIGS: ApiKeyConfig[] = [
  {
    id: 'ambient_api_key',
    label: 'Ambient Weather API Key',
    description: 'API key from your Ambient Weather dashboard',
    envName: 'AMBIENT_WEATHER_API_KEY',
    storageKey: 'stormtracker_key_ambient_api',
    placeholder: 'Enter your Ambient Weather API key',
    group: 'Ambient Weather',
  },
  {
    id: 'ambient_app_key',
    label: 'Ambient Weather Application Key',
    description: 'Application key from your Ambient Weather dashboard',
    envName: 'AMBIENT_WEATHER_APP_KEY',
    storageKey: 'stormtracker_key_ambient_app',
    placeholder: 'Enter your Ambient Weather Application key',
    group: 'Ambient Weather',
  },
  {
    id: 'wunderground_api_key',
    label: 'Weather Underground API Key',
    description: 'API key from Weather Underground',
    envName: 'WUNDERGROUND',
    storageKey: 'stormtracker_key_wunderground_api',
    placeholder: 'Enter your Weather Underground API key',
    group: 'Weather Underground',
  },
  {
    id: 'wunderground_station_id',
    label: 'Weather Underground Station ID',
    description: 'Your personal weather station ID (e.g., KFLMIAMI123)',
    envName: 'WUNDERGROUND_STATION_ID',
    storageKey: 'stormtracker_key_wunderground_station',
    placeholder: 'e.g., KFLMIAMI123',
    group: 'Weather Underground',
  },
  {
    id: 'openai_key',
    label: 'OpenAI API Key (Optional Override)',
    description: 'Optional client-side OpenAI key for future AI features',
    envName: 'OPENAI',
    storageKey: 'stormtracker_key_openai',
    placeholder: 'sk-...',
    group: 'OpenAI',
  },
];

export function getApiKey(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(storageKey) || '';
}

export function hasApiKey(storageKey: string): boolean {
  return getApiKey(storageKey).length > 0;
}

export function hasAmbientWeatherKeys(): boolean {
  return hasApiKey('stormtracker_key_ambient_api') && hasApiKey('stormtracker_key_ambient_app');
}

export function hasWeatherUndergroundKeys(): boolean {
  return hasApiKey('stormtracker_key_wunderground_api') && hasApiKey('stormtracker_key_wunderground_station');
}

export function hasPWSKeys(): boolean {
  return hasAmbientWeatherKeys() || hasWeatherUndergroundKeys();
}

const ENV_TO_STORAGE: Record<string, string> = {};
API_KEY_CONFIGS.forEach(c => {
  ENV_TO_STORAGE[c.envName] = c.storageKey;
});

export function useApiKeys() {
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    API_KEY_CONFIGS.forEach(config => {
      initial[config.id] = getApiKey(config.storageKey);
    });
    return initial;
  });

  const [revision, setRevision] = useState(0);

  const setKey = useCallback((configId: string, value: string) => {
    const config = API_KEY_CONFIGS.find(c => c.id === configId);
    if (!config) return;
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(config.storageKey, trimmed);
    } else {
      localStorage.removeItem(config.storageKey);
    }
    setKeys(prev => ({ ...prev, [configId]: trimmed }));
    setRevision(r => r + 1);
  }, []);

  const removeKey = useCallback((configId: string) => {
    const config = API_KEY_CONFIGS.find(c => c.id === configId);
    if (!config) return;
    localStorage.removeItem(config.storageKey);
    setKeys(prev => ({ ...prev, [configId]: '' }));
    setRevision(r => r + 1);
  }, []);

  const importFromText = useCallback((text: string): number => {
    let count = 0;
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const envName = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!value) continue;
      const storageKey = ENV_TO_STORAGE[envName];
      if (storageKey) {
        localStorage.setItem(storageKey, value);
        const config = API_KEY_CONFIGS.find(c => c.envName === envName);
        if (config) {
          setKeys(prev => ({ ...prev, [config.id]: value }));
          count++;
        }
      }
    }
    setRevision(r => r + 1);
    return count;
  }, []);

  const exportToText = useCallback((): string => {
    const lines = [
      '# StormTracker API Keys',
      '# Keep this file in a safe place!',
      '# Import this file in Settings > API Keys to restore your keys.',
      '',
    ];
    API_KEY_CONFIGS.forEach(config => {
      const val = getApiKey(config.storageKey);
      if (val) {
        lines.push(`${config.envName}=${val}`);
      }
    });
    return lines.join('\n') + '\n';
  }, []);

  const getKeyStatus = useCallback((configId: string): 'active' | 'empty' => {
    return (keys[configId] || '').length > 0 ? 'active' : 'empty';
  }, [keys]);

  const getGroupStatus = useCallback((group: string): 'active' | 'partial' | 'empty' => {
    const groupConfigs = API_KEY_CONFIGS.filter(c => c.group === group);
    const activeCount = groupConfigs.filter(c => (keys[c.id] || '').length > 0).length;
    if (activeCount === groupConfigs.length) return 'active';
    if (activeCount > 0) return 'partial';
    return 'empty';
  }, [keys]);

  return {
    keys,
    setKey,
    removeKey,
    importFromText,
    exportToText,
    getKeyStatus,
    getGroupStatus,
    revision,
  };
}
