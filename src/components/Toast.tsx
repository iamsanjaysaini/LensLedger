import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

let toastListeners: ((toast: ToastMessage) => void)[] = [];

export function showToast(message: string, type: ToastType = 'success') {
  const toast: ToastMessage = {
    id: Math.random().toString(36).substring(2, 9),
    message,
    type,
  };
  toastListeners.forEach((listener) => listener(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleNewToast = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      // Success / error messages OK dabane tak rehte hain. Sirf chhote "info" hints apne aap hat jate hain.
      if (toast.type === 'info') {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, 2500);
      }
    };

    toastListeners.push(handleNewToast);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== handleNewToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const persistent = toasts.filter((t) => t.type !== 'info');
  const hints = toasts.filter((t) => t.type === 'info');

  if (toasts.length === 0) return null;

  return (
    <>
      {/* Success / Error: mobile me bottom center, PC me screen ke center me. OK dabane par hi band hota hai. */}
      {persistent.length > 0 && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex flex-col items-center justify-end sm:justify-center gap-3 p-4 pb-6">
          {persistent.map((toast, i) => {
            const isSuccess = toast.type === 'success';
            return (
              <div
                key={toast.id}
                role="alertdialog"
                aria-live="assertive"
                className={`pointer-events-auto w-full max-w-sm rounded-xl shadow-2xl border p-4 text-white ${
                  isSuccess
                    ? 'bg-emerald-800 border-emerald-600 dark:bg-emerald-900 dark:border-emerald-700'
                    : 'bg-red-800 border-red-600 dark:bg-red-900 dark:border-red-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isSuccess
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-5 h-5 text-red-200 shrink-0 mt-0.5" />}
                  <p className="text-sm font-medium leading-snug break-words">{toast.message}</p>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    autoFocus={i === persistent.length - 1}
                    onClick={() => removeToast(toast.id)}
                    className="px-5 py-1.5 rounded-md bg-white text-gray-900 text-xs font-bold hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white/70 transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info hints: pehle jaise upar right me, kuch second baad hat jate hain */}
      {hints.length > 0 && (
        <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none sm:px-0">
          {hints.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center justify-between p-3.5 rounded-lg shadow-lg border text-xs font-medium bg-indigo-800 text-white border-indigo-700 dark:bg-indigo-900 dark:border-indigo-800"
            >
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-indigo-200 shrink-0" />
                <span>{toast.message}</span>
              </div>
              <button onClick={() => removeToast(toast.id)} className="ml-3 p-1 rounded hover:bg-white/10 transition-colors shrink-0">
                <X className="w-3.5 h-3.5 text-white/80" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
