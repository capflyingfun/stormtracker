import { useSyncExternalStore, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from './use-language';

const localCache = new Map<string, string>();
const pendingByLang = new Map<string, Set<string>>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let cacheVersion = 0;
const subscribers = new Set<() => void>();

function notifyAll() {
  cacheVersion++;
  subscribers.forEach(cb => cb());
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

function getSnapshot() {
  return cacheVersion;
}

function getCacheKey(text: string, lang: string) {
  return `${lang}:${text}`;
}

function loadLocalStorageCache(lang: string) {
  try {
    const stored = localStorage.getItem(`st-translations-${lang}`);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>;
      for (const [text, translation] of Object.entries(parsed)) {
        localCache.set(getCacheKey(text, lang), translation);
      }
    }
  } catch {}
}

function saveToLocalStorage(lang: string) {
  try {
    const entries: Record<string, string> = {};
    const prefix = `${lang}:`;
    let count = 0;
    for (const [key, val] of localCache.entries()) {
      if (key.startsWith(prefix) && count < 2000) {
        entries[key.slice(prefix.length)] = val;
        count++;
      }
    }
    localStorage.setItem(`st-translations-${lang}`, JSON.stringify(entries));
  } catch {}
}

async function flushBatch() {
  const batches = new Map(pendingByLang);
  pendingByLang.clear();

  for (const [lang, textSet] of batches) {
    const texts = Array.from(textSet);
    if (texts.length === 0) continue;

    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += 80) {
      chunks.push(texts.slice(i, i + 80));
    }

    for (const chunk of chunks) {
      try {
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: chunk, lang }),
        });
        const data = await resp.json();
        if (data.translations) {
          for (let i = 0; i < chunk.length; i++) {
            if (data.translations[i]) {
              localCache.set(getCacheKey(chunk[i], lang), data.translations[i]);
            }
          }
        }
      } catch {}
    }

    saveToLocalStorage(lang);
  }

  notifyAll();
}

function scheduleBatch() {
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatch();
  }, 200);
}

export function useAutoTranslate() {
  const { language } = useLanguage();
  const langRef = useRef(language);
  langRef.current = language;

  useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadLocalStorageCache(language);
  }, [language]);

  const at = useCallback((text: string): string => {
    if (!text || langRef.current === 'en') return text;
    if (/^[\d.,°%:+\-\/\s]+$/.test(text)) return text;

    const lang = langRef.current;
    const key = getCacheKey(text, lang);
    const cached = localCache.get(key);
    if (cached) return cached;

    let langPending = pendingByLang.get(lang);
    if (!langPending) {
      langPending = new Set();
      pendingByLang.set(lang, langPending);
    }
    if (!langPending.has(text)) {
      langPending.add(text);
      scheduleBatch();
    }

    return text;
  }, []);

  return { at };
}

export function T({ children }: { children: string }) {
  const { at } = useAutoTranslate();
  return <>{at(children)}</>;
}
