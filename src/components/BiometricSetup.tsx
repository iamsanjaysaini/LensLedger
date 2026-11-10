import { useEffect, useState } from 'react';
import { Fingerprint, X } from 'lucide-react';
import {
  BIO_EVENT,
  disableBiometric,
  enableBiometric,
  isBiometricEnabled,
  isBiometricSupported,
} from '../utils/biometric';
import { showToast } from './Toast';

const DISMISS_KEY = 'll_bio_banner_dismissed';

function useBiometricState() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(isBiometricEnabled());

  useEffect(() => {
    let alive = true;
    isBiometricSupported().then((ok) => { if (alive) setSupported(ok); });
    const sync = () => setEnabled(isBiometricEnabled());
    window.addEventListener(BIO_EVENT, sync);
    return () => { alive = false; window.removeEventListener(BIO_EVENT, sync); };
  }, []);

  return { supported, enabled };
}

async function runEnable() {
  const res = await enableBiometric();
  if (res.ok) showToast('Fingerprint login enable ho gaya. Ab app khulte hi fingerprint se login hoga.', 'success');
  else showToast(res.error || 'Fingerprint enable nahi hua.', 'error');
}

// Navbar ka chhota fingerprint button (enable / disable)
export function BiometricButton() {
  const { supported, enabled } = useBiometricState();
  const [busy, setBusy] = useState(false);

  if (!supported) return null;

  const onClick = async () => {
    if (busy) return;
    if (enabled) {
      if (window.confirm('Fingerprint login band karein?')) {
        disableBiometric();
        showToast('Fingerprint login band kar diya.', 'info');
      }
      return;
    }
    setBusy(true);
    await runEnable();
    setBusy(false);
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={enabled ? 'Fingerprint login ON (band karne ke liye dabayein)' : 'Fingerprint login enable karein'}
      className={`inline-flex items-center p-1.5 rounded-md border transition-all disabled:opacity-50 ${
        enabled
          ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <Fingerprint className="w-4 h-4 sm:w-5 sm:h-5" />
    </button>
  );
}

// Login ke baad ek baar dikhne wala "enable karein?" banner
export function BiometricBanner() {
  const { supported, enabled } = useBiometricState();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (!supported || enabled || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const enable = async () => {
    setBusy(true);
    await runEnable();
    setBusy(false);
  };

  return (
    <div className="bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <Fingerprint className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
        <p className="text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 flex-1">
          Agli baar password ki jagah fingerprint se login karna hai?
        </p>
        <button
          onClick={enable}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Please wait...' : 'Enable'}
        </button>
        <button onClick={dismiss} aria-label="Baad me" className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-300">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
