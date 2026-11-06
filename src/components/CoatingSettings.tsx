// src/components/CoatingSettings.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, RotateCcw } from 'lucide-react';
import { addCoating, useDeletedCoatings } from '../utils/coatingSync';
import { showToast } from './Toast';

export default function CoatingSettings({ isDemo = false }: { isDemo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { deleted, loading } = useDeletedCoatings(isDemo, open);

  const restore = async (name: string) => {
    setBusy(name);
    const res = await addCoating(isDemo, name);
    setBusy(null);
    if (res.ok) showToast(`"${name}" wapas add ho gayi.`, 'success');
    else showToast(res.message || 'Coating wapas add nahi ho payi.', 'error');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Settings"
        className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-md text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        <Settings className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold">Deleted coatings</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800 dark:hover:text-white" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {loading && <p className="text-xs text-gray-500">Loading...</p>}
              {!loading && deleted.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Koi deleted coating nahi hai.</p>
              )}
              {deleted.map(name => (
                <div key={name} className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <span className="text-sm font-medium">{name}</span>
                  <button
                    onClick={() => restore(name)}
                    disabled={busy === name}
                    className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {busy === name ? 'Adding...' : 'Add again'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
