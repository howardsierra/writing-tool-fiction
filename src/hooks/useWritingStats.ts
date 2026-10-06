import { useSyncExternalStore } from 'react';
import { todayKey } from '../utils/text';

/**
 * Tracks net words written per day (per project) in localStorage.
 * Only words typed by the author count — AI insertions are excluded by the caller.
 */
type Stats = Record<string, Record<string, number>>; // projectId -> day -> words

const KEY = 'writingStats';
const listeners = new Set<() => void>();
let cache: Stats = load();

function load(): Stats {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* storage full or unavailable */ }
  listeners.forEach(l => l());
}

export function recordWords(projectId: string, delta: number) {
  if (!projectId || !delta) return;
  const day = todayKey();
  const project = { ...(cache[projectId] || {}) };
  project[day] = (project[day] || 0) + delta;
  cache = { ...cache, [projectId]: project };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = load();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useWritingStats(projectId: string | null) {
  const stats = useSyncExternalStore(subscribe, () => cache);
  const byDay = (projectId && stats[projectId]) || {};
  const today = Math.max(0, byDay[todayKey()] || 0);

  // Consecutive days (ending today or yesterday) with at least one word written.
  let streak = 0;
  const cursor = new Date();
  if (!(byDay[todayKey(cursor)] > 0)) cursor.setDate(cursor.getDate() - 1);
  while (byDay[todayKey(cursor)] > 0) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Last 14 days for a sparkline.
  const recent: { day: string; words: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    recent.push({ day: key, words: Math.max(0, byDay[key] || 0) });
  }

  return { today, streak, recent };
}
