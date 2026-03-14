import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { useFavorites, type FavoriteLocation } from "@/hooks/use-favorites";

const EMOJI_OPTIONS = [
  '🏠','🏢','✈️','⛵','🚗','🏖️','🏔️','⭐','🎯','🏫',
  '🏥','🌊','🏕️','🎪','🏟️','🌆','🌴','🚁','🏡','🛸',
];

interface FavoriteLocationsProps {
  onSelect: (fav: FavoriteLocation) => void;
  currentLat?: number;
  currentLon?: number;
  currentName?: string;
  currentCountry?: string;
  currentIsUS?: boolean;
  currentRadarSource?: 'rainviewer' | 'nexrad';
  showAddButton?: boolean;
}

export default function FavoriteLocations({
  onSelect,
  currentLat,
  currentLon,
  currentName,
  currentCountry,
  currentIsUS,
  currentRadarSource,
  showAddButton = false,
}: FavoriteLocationsProps) {
  const { favorites, addFavorite, updateFavorite, removeFavorite, isFavorite, getFavorite, canAdd } = useFavorites();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏠');
  const [showEmojiPicker, setShowEmojiPicker] = useState<'add' | 'edit' | null>(null);

  const currentIsFav = currentLat != null && currentLon != null && isFavorite(currentLat, currentLon);
  const currentFav = currentLat != null && currentLon != null ? getFavorite(currentLat, currentLon) : undefined;

  const handleAdd = () => {
    if (!currentLat || !currentLon || !currentName) return;
    const label = newLabel.trim() || currentName;
    addFavorite({
      emoji: newEmoji,
      label,
      lat: currentLat,
      lon: currentLon,
      name: currentName,
      country: currentCountry,
      isUS: currentIsUS,
      recommendedRadarSource: currentRadarSource,
    });
    setShowAddForm(false);
    setNewLabel('');
    setNewEmoji('🏠');
    setShowEmojiPicker(null);
  };

  const handleRemoveCurrent = () => {
    if (currentFav) removeFavorite(currentFav.id);
  };

  const startEdit = (fav: FavoriteLocation) => {
    setEditingId(fav.id);
    setEditLabel(fav.label);
    setEditEmoji(fav.emoji);
    setShowEmojiPicker(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateFavorite(editingId, { label: editLabel.trim() || editLabel, emoji: editEmoji });
    setEditingId(null);
    setShowEmojiPicker(null);
  };

  if (favorites.length === 0 && !showAddButton) return null;

  return (
    <div className="mb-4">
      {/* Section header */}
      {favorites.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">⭐ Saved Locations</span>
          <span className="text-xs text-slate-500">{favorites.length}/{5}</span>
        </div>
      )}

      {/* Favorite cards */}
      {favorites.length > 0 && (
        <div className="grid grid-cols-1 gap-2 mb-3">
          {favorites.map(fav => (
            <div key={fav.id} className="flex items-center gap-2">
              {editingId === fav.id ? (
                /* Edit mode */
                <div className="flex-1 flex items-center gap-2 bg-slate-700/60 rounded-lg p-2 border border-blue-500/50">
                  {/* Emoji button */}
                  <button
                    onClick={() => setShowEmojiPicker(showEmojiPicker === 'edit' ? null : 'edit')}
                    className="text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-slate-600 shrink-0"
                  >
                    {editEmoji}
                  </button>
                  <Input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="flex-1 h-8 text-sm bg-slate-600 border-slate-500 py-1"
                    placeholder="Label..."
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  />
                  <button onClick={saveEdit} className="text-green-400 hover:text-green-300 shrink-0"><Check className="h-4 w-4" /></button>
                  <button onClick={() => { setEditingId(null); setShowEmojiPicker(null); }} className="text-slate-400 hover:text-white shrink-0"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                /* Display mode */
                <button
                  onClick={() => onSelect(fav)}
                  className="flex-1 flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 hover:border-blue-500/50 rounded-lg px-3 py-2.5 text-left transition-all touch-manipulation"
                >
                  <span className="text-2xl">{fav.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm">{fav.label}</div>
                    <div className="text-xs text-slate-400 truncate">{fav.name}</div>
                  </div>
                </button>
              )}

              {editingId !== fav.id && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(fav)}
                    className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeFavorite(fav.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Emoji picker (edit mode) */}
      {showEmojiPicker === 'edit' && editingId && (
        <div className="mb-2 p-2 bg-slate-700 rounded-lg border border-slate-600">
          <div className="grid grid-cols-10 gap-1">
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => { setEditEmoji(e); setShowEmojiPicker(null); }}
                className={`text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-slate-600 ${editEmoji === e ? 'bg-blue-600' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save current location as favorite (from main tracker) */}
      {showAddButton && currentLat != null && currentLon != null && (
        <>
          {currentIsFav ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveCurrent}
              className="w-full border-yellow-600/50 text-yellow-400 hover:text-red-400 hover:border-red-600/50 text-xs h-9"
            >
              ⭐ Saved — tap to remove
            </Button>
          ) : canAdd ? (
            !showAddForm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddForm(true); setNewLabel(''); setNewEmoji('🏠'); }}
                className="w-full border-slate-600 text-slate-300 hover:text-yellow-400 hover:border-yellow-600/50 text-xs h-9"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Save as Favorite
              </Button>
            ) : (
              <div className="bg-slate-700/60 rounded-lg p-3 border border-yellow-500/30">
                <div className="text-xs text-slate-300 mb-2 font-medium">Save "{currentName}" as:</div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setShowEmojiPicker(showEmojiPicker === 'add' ? null : 'add')}
                    className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-slate-600 hover:bg-slate-500 shrink-0"
                  >
                    {newEmoji}
                  </button>
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Label (e.g. Home, Work...)"
                    className="flex-1 h-10 text-sm bg-slate-600 border-slate-500"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAddForm(false); }}
                  />
                </div>
                {showEmojiPicker === 'add' && (
                  <div className="mb-2 p-2 bg-slate-600 rounded-lg">
                    <div className="grid grid-cols-10 gap-1">
                      {EMOJI_OPTIONS.map(e => (
                        <button
                          key={e}
                          onClick={() => { setNewEmoji(e); setShowEmojiPicker(null); }}
                          className={`text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-slate-500 ${newEmoji === e ? 'bg-blue-600' : ''}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white h-8 text-xs">
                    ⭐ Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setShowEmojiPicker(null); }} className="border-slate-600 text-slate-400 h-8 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="text-xs text-slate-500 text-center py-1">5 favorites saved (max reached)</div>
          )}
        </>
      )}
    </div>
  );
}
