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
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 2500);
    };

    toastListeners.push(handleNewToast);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== handleNewToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none sm:px-0">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-lg shadow-lg border text-xs font-medium transition-all duration-300 animate-slide-in ${
              isSuccess
                ? 'bg-emerald-800 text-white border-emerald-700 dark:bg-emerald-900 dark:border-emerald-800'
                : isError
                ? 'bg-red-800 text-white border-red-700 dark:bg-red-900 dark:border-red-800'
                : 'bg-indigo-800 text-white border-indigo-700 dark:bg-indigo-900 dark:border-indigo-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />}
              {isError && <AlertCircle className="w-4 h-4 text-red-200 shrink-0" />}
              {!isSuccess && !isError && <Info className="w-4 h-4 text-indigo-200 shrink-0" />}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5 text-white/80" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
