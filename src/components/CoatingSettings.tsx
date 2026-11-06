// src/components/CoatingSettings.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Lock } from 'lucide-react';
import { setCoatingActive, countCoatingStock, useAllCoatings } from '../utils/coatingSync';
import { showToast } from './Toast';

interface PendingOff {
  name: string;
  count: number;
  step: 1 | 2;
}

export default function CoatingSettings({ isDemo = false }: { isDemo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOff | null>(null);
  const { items, loading } = useAllCoatings(isDemo, open);

  const close = () => { setOpen(false); setPending(null); };

  const applyOff = async (name: string) => {
    setBusy(name);
    const res = await setCoatingActive(isDemo, name, false);
    setBusy(null);
    setPending(null);
    if (res.ok) showToast(`"${name}" off ho gayi.`, 'success');
    else showToast(res.message || 'Coating off nahi ho payi.', 'error');
  };

  const handleToggle = async (name: string, isOn: boolean, locked: boolean) => {
    if (locked || busy) return;

    // OFF -> ON : seedha
    if (!isOn) {
      setBusy(name);
      const res = await setCoatingActive(isDemo, name, true);
      setBusy(null);
      if (res.ok) showToast(`"${name}" on ho gayi.`, 'success');
      else showToast(res.message || 'Coating on nahi ho payi.', 'error');
      return;
    }

    // ON -> OFF : pehle stock check
    setBusy(name);
    const count = await countCoatingStock(isDemo, name);
    setBusy(null);
    if (count === null) {
      showToast('Stock check nahi ho paya, isliye coating off nahi hui.', 'error');
      return;
    }
    if (count === 0) {
      await applyOff(name); // khali coating: bina warning ke
      return;
    }
    setPending({ name, count, step: 1 }); // stock wali coating: 2 warning
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
          onClick={close}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold">Coatings On / Off</h2>
              <button onClick={close} className="text-gray-500 hover:text-gray-800 dark:hover:text-white" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Off karne par coating Stock, Sell aur Order page se chhup jati hai. Stock aur purana data safe rehta hai.
              </p>
              {loading && items.length === 0 && <p className="text-xs text-gray-500">Loading...</p>}
              {items.map(({ name, is_active, locked }) => (
                <div key={name} className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <span className={`text-sm font-medium ${is_active ? '' : 'text-gray-400 dark:text-gray-500'}`}>{name}</span>
                  {locked ? (
                    <span className="inline-flex items-center text-[10px] text-gray-400">
                      <Lock className="w-3 h-3 mr-1" />Always on
                    </span>
                  ) : (
                    <button
                      role="switch"
                      aria-checked={is_active}
                      aria-label={`${name} on/off`}
                      disabled={busy !== null}
                      onClick={() => handleToggle(name, is_active, locked)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${is_active ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pending && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/95 dark:bg-gray-800/95 p-4">
                <div className="w-full text-center space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                    Warning {pending.step} / 2
                  </p>
                  {pending.step === 1 ? (
                    <p className="text-sm">
                      <b>{pending.name}</b> me <b>{pending.count}</b> lens row me stock bacha hai.
                      Off karne par ye coating Stock, Sell aur Order page par dikhni band ho jayegi.
                    </p>
                  ) : (
                    <p className="text-sm">
                      Pakka? <b>{pending.name}</b> ka stock database me safe rahega, par jab tak aap ise
                      wapas ON nahi karte, ye coating pages par select nahi ho paegi.
                    </p>
                  )}
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setPending(null)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    {pending.step === 1 ? (
                      <button
                        onClick={() => setPending({ ...pending, step: 2 })}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600"
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        onClick={() => applyOff(pending.name)}
                        disabled={busy !== null}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Haan, Off karo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
