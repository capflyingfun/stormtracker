import { useState, useCallback } from "react";

export interface FavoriteLocation {
  id: string;
  emoji: string;
  label: string;
  lat: number;
  lon: number;
  name: string;
  country?: string;
  isUS?: boolean;
  recommendedRadarSource?: 'rainviewer' | 'nexrad';
}

const STORAGE_KEY = 'stormtracker-favorites';
const MAX_FAVORITES = 5;

function loadFavorites(): FavoriteLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: FavoriteLocation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteLocation[]>(() => loadFavorites());

  const addFavorite = useCallback((fav: Omit<FavoriteLocation, 'id'>) => {
    setFavorites(prev => {
      if (prev.length >= MAX_FAVORITES) return prev;
      const newFav: FavoriteLocation = { ...fav, id: Date.now().toString() };
      const updated = [...prev, newFav];
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const updateFavorite = useCallback((id: string, updates: Partial<Omit<FavoriteLocation, 'id'>>) => {
    setFavorites(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, ...updates } : f);
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const updated = prev.filter(f => f.id !== id);
      saveFavorites(updated);
      return updated;
    });
  }, []);

  const isFavorite = useCallback((lat: number, lon: number) => {
    return favorites.some(f => Math.abs(f.lat - lat) < 0.001 && Math.abs(f.lon - lon) < 0.001);
  }, [favorites]);

  const getFavorite = useCallback((lat: number, lon: number) => {
    return favorites.find(f => Math.abs(f.lat - lat) < 0.001 && Math.abs(f.lon - lon) < 0.001);
  }, [favorites]);

  return {
    favorites,
    addFavorite,
    updateFavorite,
    removeFavorite,
    isFavorite,
    getFavorite,
    canAdd: favorites.length < MAX_FAVORITES,
    maxFavorites: MAX_FAVORITES,
  };
}
