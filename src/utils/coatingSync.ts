// src/utils/coatingSync.ts
// Coatings ki list ab Supabase ki `coatings` table me rahti hai (mobile + PC same list).
// Delete = "soft delete" (is_active = false). Koi row ya stock data kabhi delete nahi hota.
// Agar `coatings` table abhi nahi bani (SQL nahi chali) ya demo mode hai, to purane tareeke se
// browser ki localStorage use hoti hai, isliye app kabhi toot-ta nahi.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_COATINGS, PROTECTED_COATINGS } from './lensUtils';

const ACTIVE_KEY = 'availableCoatings'; // backup.ts bhi yahi key padhta hai
const DELETED_KEY = 'deletedCoatings';  // sirf demo / fallback mode me
const CHANGE_EVENT = 'coatings-changed';

export interface CoatingResult {
  ok: boolean;
  name?: string;
  message?: string;
}

interface CoatingRow {
  name: string;
  is_active: boolean;
  sort_order: number;
}

interface CoatingState {
  active: string[];
  deleted: string[];
  rows: CoatingRow[];
  mode: 'db' | 'local';
}

// ---------- localStorage helpers ----------
function readList(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    return parsed
      .filter((c): c is string => typeof c === 'string')
      .map(c => (c === 'Bluecut green' ? 'Bluecut' : c));
  } catch {
    return [...fallback];
  }
}

function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

function notifyChange() {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* ignore */ }
}

function withProtected(list: string[]): string[] {
  const missing = PROTECTED_COATINGS.filter(p => !list.includes(p));
  return [...missing, ...list];
}

function localState(): CoatingState {
  const active = withProtected(readList(ACTIVE_KEY, DEFAULT_COATINGS));
  const deleted = readList(DELETED_KEY, []).filter(n => !active.includes(n));
  return { active, deleted, rows: [], mode: 'local' };
}

// ---------- load ----------
async function loadState(isDemo: boolean): Promise<CoatingState> {
  if (isDemo) return localState();
  try {
    const { data, error } = await supabase
      .from('coatings')
      .select('name, is_active, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error || !data) return localState(); // table nahi bani -> purana tareeka

    const rows: CoatingRow[] = data.map((r: any) => ({
      name: r.name, is_active: !!r.is_active, sort_order: Number(r.sort_order) || 0,
    }));

    // Is device ki list me jo naam DB me bilkul nahi hain (purani custom coatings / backup restore),
    // unhe DB me add kar do. DB me jo "deleted" hain wo deleted hi rahengi.
    const known = new Set(rows.map(r => r.name));
    const local = readList(ACTIVE_KEY, DEFAULT_COATINGS);
    const missing = local.filter(n => n.trim() && !known.has(n));
    if (missing.length) {
      let next = rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
      const toInsert = missing.map(name => ({ name, is_active: true, sort_order: next++ }));
      const { error: insErr } = await supabase
        .from('coatings')
        .upsert(toInsert, { onConflict: 'name', ignoreDuplicates: true });
      if (!insErr) toInsert.forEach(r => rows.push(r));
    }

    const active = withProtected(rows.filter(r => r.is_active).map(r => r.name));
    const deleted = rows.filter(r => !r.is_active && !active.includes(r.name)).map(r => r.name);

    writeList(ACTIVE_KEY, active); // cache (backup.ts isi ko padhta hai)
    return { active, deleted, rows, mode: 'db' };
  } catch {
    return localState();
  }
}

export async function loadCoatings(isDemo: boolean) {
  const s = await loadState(isDemo);
  return { active: s.active, deleted: s.deleted };
}

// ---------- add / restore ----------
export async function addCoating(isDemo: boolean, rawName: string): Promise<CoatingResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, message: 'Coating ka naam likhiye.' };

  const state = await loadState(isDemo);
  if (state.active.includes(name)) return { ok: false, message: `"${name}" pehle se list me hai.` };

  if (state.mode === 'db') {
    if (state.deleted.includes(name)) {
      const { error } = await supabase
        .from('coatings')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('name', name);
      if (error) return { ok: false, message: 'Coating wapas add nahi ho payi. Dobara try karein.' };
    } else {
      const next = state.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
      const { error } = await supabase
        .from('coatings')
        .insert({ name, is_active: true, sort_order: next });
      if (error) return { ok: false, message: 'Coating save nahi ho payi. Dobara try karein.' };
    }
    writeList(ACTIVE_KEY, [...state.active, name]);
  } else {
    writeList(ACTIVE_KEY, [...state.active, name]);
    writeList(DELETED_KEY, state.deleted.filter(n => n !== name));
  }
  notifyChange();
  return { ok: true, name };
}

// ---------- delete ----------
export async function deleteCoating(isDemo: boolean, name: string): Promise<CoatingResult> {
  if (PROTECTED_COATINGS.includes(name)) {
    return { ok: false, message: `"${name}" delete nahi ho sakti.` };
  }

  // Stock check: kisi bhi shop ki lens_stock me is coating ka quantity > 0 ho to delete nahi hogi.
  if (!isDemo) {
    const { count, error } = await supabase
      .from('lens_stock')
      .select('id', { count: 'exact', head: true })
      .contains('coatings', [name])
      .gt('quantity', 0);
    if (error) return { ok: false, message: 'Stock check nahi ho paya, isliye coating delete nahi hui.' };
    if ((count ?? 0) > 0) {
      return { ok: false, message: `"${name}" delete nahi ho sakti: ${count} lens row me stock bacha hai.` };
    }
  }

  const state = await loadState(isDemo);
  if (state.mode === 'db') {
    const { data, error } = await supabase
      .from('coatings')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('name', name)
      .select('id');
    if (error) return { ok: false, message: 'Coating delete nahi ho payi. Dobara try karein.' };
    if (!data || data.length === 0) {
      const next = state.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
      const { error: insErr } = await supabase
        .from('coatings')
        .insert({ name, is_active: false, sort_order: next });
      if (insErr) return { ok: false, message: 'Coating delete nahi ho payi. Dobara try karein.' };
    }
    writeList(ACTIVE_KEY, state.active.filter(n => n !== name));
  } else {
    writeList(ACTIVE_KEY, state.active.filter(n => n !== name));
    writeList(DELETED_KEY, [...state.deleted.filter(n => n !== name), name]);
  }
  notifyChange();
  return { ok: true, name };
}

// ---------- React hooks ----------
export function useCoatings(isDemo: boolean) {
  const [availableCoatings, setAvailableCoatings] = useState<string[]>(() => localState().active);

  const refresh = useCallback(async () => {
    const s = await loadCoatings(isDemo);
    setAvailableCoatings(s.active);
  }, [isDemo]);

  useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  const add = useCallback((name: string) => addCoating(isDemo, name), [isDemo]);
  const remove = useCallback((name: string) => deleteCoating(isDemo, name), [isDemo]);

  return { availableCoatings, addCoating: add, deleteCoating: remove };
}

export function useDeletedCoatings(isDemo: boolean, enabled: boolean) {
  const [deleted, setDeleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await loadCoatings(isDemo);
    setDeleted(s.deleted);
    setLoading(false);
  }, [isDemo]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [enabled, refresh]);

  return { deleted, loading };
}
