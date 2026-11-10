import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Har page apna "dirty" status, save aur discard yahan register karta hai.
interface Guard {
  readonly dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

interface Pending {
  proceed: () => void;
  cancel: () => void;
}

interface Ctx {
  guardRef: MutableRefObject<Guard | null>;
  confirmLeave: (go: () => void) => void;
}

const UnsavedCtx = createContext<Ctx | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<Guard | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);

  // Page badalne (link / browser back-forward) par, agar unsaved changes hain to rok do.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !!guardRef.current?.dirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setPending({ proceed: () => blocker.proceed(), cancel: () => blocker.reset() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  // Page refresh / tab band karna: browser sirf apna standard prompt dikhane deta hai.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (guardRef.current?.dirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Kisi bhi action (jaise logout, list badalna) se pehle check karo.
  const confirmLeave = useCallback((go: () => void) => {
    if (guardRef.current?.dirty) setPending({ proceed: go, cancel: () => {} });
    else go();
  }, []);

  const ctx = useMemo(() => ({ guardRef, confirmLeave }), [confirmLeave]);

  const onSave = async () => {
    if (!pending || saving) return;
    const p = pending;
    setSaving(true);
    let ok = false;
    try {
      ok = guardRef.current ? await guardRef.current.save() : true;
    } catch (e) {
      console.error(e);
      ok = false;
    }
    setSaving(false);
    setPending(null);
    if (ok) p.proceed(); else p.cancel();
  };

  const onDiscard = () => {
    if (!pending || saving) return;
    const p = pending;
    setPending(null);
    guardRef.current?.discard();
    p.proceed();
  };

  const onCancel = () => {
    if (!pending || saving) return;
    const p = pending;
    setPending(null);
    p.cancel();
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, saving]);

  return (
    <UnsavedCtx.Provider value={ctx}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title"
            className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 id="unsaved-title" className="text-sm font-bold text-gray-900 dark:text-white">Unsaved changes</h2>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Is page par aapke kuch changes abhi save nahi hue hain. Save karein ya discard?
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={onSave} disabled={saving} autoFocus
                className="flex items-center justify-center gap-2 py-2 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
              </button>
              <button onClick={onDiscard} disabled={saving}
                className="py-2 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold transition-colors">
                Discard
              </button>
            </div>
            <button onClick={onCancel} disabled={saving}
              className="mt-3 w-full text-center text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-60">
              Cancel, isi page par rehna hai
            </button>
          </div>
        </div>
      )}
    </UnsavedCtx.Provider>
  );
}

// Page ke andar: dirty = unsaved changes hain ya nahi, save = save karke true/false do, discard = changes hata do.
export function useUnsavedGuard(dirty: boolean, save: () => Promise<boolean>, discard: () => void) {
  const ctx = useContext(UnsavedCtx);
  const latest = useRef({ dirty, save, discard });
  useEffect(() => { latest.current = { dirty, save, discard }; });

  useEffect(() => {
    if (!ctx) return;
    const guard: Guard = {
      get dirty() { return latest.current.dirty; },
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    };
    ctx.guardRef.current = guard;
    return () => {
      if (ctx.guardRef.current === guard) ctx.guardRef.current = null;
    };
  }, [ctx]);
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedCtx);
  const confirmLeave = useCallback((go: () => void) => {
    if (ctx) ctx.confirmLeave(go); else go();
  }, [ctx]);
  return { confirmLeave };
}
