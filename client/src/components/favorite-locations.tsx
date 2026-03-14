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
    addFavorite({
      emoji: newEmoji,
      label: newLabel.trim() || currentName,
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
    <div className="w-full mb-4">

      {/* Section header */}
      {favorites.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">⭐ Saved Locations</span>
          <span className="text-xs text-slate-500">{favorites.length}/5</span>
        </div>
      )}

      {/* Favorite cards */}
      {favorites.length > 0 && (
        <div className="flex flex-col gap-2 mb-3 w-full">
          {favorites.map(fav => (
            <div key={fav.id} className="w-full">
              {editingId === fav.id ? (
                /* Edit mode — full width row */
                <div className="w-full flex flex-col gap-2 bg-slate-700/60 rounded-lg p-2 border border-blue-500/50">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEmojiPicker(showEmojiPicker === 'edit' ? null : 'edit')}
                      className="text-xl w-9 h-9 flex items-center justify-center rounded bg-slate-600 hover:bg-slate-500 shrink-0"
                    >
                      {editEmoji}
                    </button>
                    <Input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      className="flex-1 min-w-0 h-9 text-sm bg-slate-600 border-slate-500"
                      placeholder="Label..."
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditingId(null); setShowEmojiPicker(null); } }}
                    />
                    <button onClick={saveEdit} className="text-green-400 hover:text-green-300 shrink-0 p-1">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditingId(null); setShowEmojiPicker(null); }} className="text-slate-400 hover:text-white shrink-0 p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Emoji picker inline */}
                  {showEmojiPicker === 'edit' && (
                    <div className="p-1 bg-slate-600 rounded-lg">
                      <div className="flex flex-wrap gap-1">
                        {EMOJI_OPTIONS.map(e => (
                          <button key={e} onClick={() => { setEditEmoji(e); setShowEmojiPicker(null); }}
                            className={`text-xl w-10 h-10 flex items-center justify-center rounded touch-manipulation hover:bg-slate-500 ${editEmoji === e ? 'bg-blue-600' : ''}`}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Display mode — card + action buttons all inside one contained row */
                <div className="w-full flex items-stretch gap-1.5">
                  {/* Main tappable card */}
                  <button
                    onClick={() => onSelect(fav)}
                    className="flex-1 min-w-0 flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700 active:bg-slate-700 border border-slate-600/50 hover:border-blue-500/50 rounded-lg px-3 py-2.5 text-left transition-all touch-manipulation"
                  >
                    <span className="text-2xl shrink-0">{fav.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm leading-tight truncate">{fav.label}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{fav.name}</div>
                    </div>
                  </button>
                  {/* Edit / delete — fixed width column, never overflows */}
                  <div className="flex flex-col gap-1 shrink-0 justify-center">
                    <button
                      onClick={() => startEdit(fav)}
                      className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors touch-manipulation"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeFavorite(fav.id)}
                      className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors touch-manipulation"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Save current location as favorite (shown in main tracker) */}
      {showAddButton && currentLat != null && currentLon != null && (
        <div className="w-full">
          {currentIsFav ? (
            <button
              onClick={() => currentFav && removeFavorite(currentFav.id)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-yellow-600/40 text-yellow-400 hover:text-red-400 hover:border-red-600/40 text-xs transition-colors touch-manipulation"
            >
              ⭐ Saved — tap to remove
            </button>
          ) : canAdd ? (
            !showAddForm ? (
              <button
                onClick={() => { setShowAddForm(true); setNewLabel(''); setNewEmoji('🏠'); setShowEmojiPicker(null); }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-600 text-slate-400 hover:text-yellow-400 hover:border-yellow-600/40 text-xs transition-colors touch-manipulation"
              >
                <Plus className="h-3.5 w-3.5" /> Save as Favorite
              </button>
            ) : (
              <div className="w-full bg-slate-700/60 rounded-lg p-3 border border-yellow-500/30">
                <div className="text-xs text-slate-300 mb-2 font-medium">Save "{currentName}" as:</div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setShowEmojiPicker(showEmojiPicker === 'add' ? null : 'add')}
                    className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-slate-600 hover:bg-slate-500 shrink-0 touch-manipulation"
                  >
                    {newEmoji}
                  </button>
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Label (e.g. Home, Work...)"
                    className="flex-1 min-w-0 h-10 text-sm bg-slate-600 border-slate-500"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAddForm(false); setShowEmojiPicker(null); } }}
                  />
                </div>
                {showEmojiPicker === 'add' && (
                  <div className="mb-2 p-2 bg-slate-600 rounded-lg">
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_OPTIONS.map(e => (
                        <button key={e} onClick={() => { setNewEmoji(e); setShowEmojiPicker(null); }}
                          className={`text-xl w-10 h-10 flex items-center justify-center rounded touch-manipulation hover:bg-slate-500 ${newEmoji === e ? 'bg-blue-600' : ''}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white h-9 text-xs">
                    ⭐ Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setShowEmojiPicker(null); }} className="border-slate-600 text-slate-400 h-9 text-xs px-3">
                    Cancel
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="text-xs text-slate-500 text-center py-1">5/5 favorites saved</div>
          )}
        </div>
      )}
    </div>
  );
}
