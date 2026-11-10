// utils/biometric.ts
// Fingerprint / Face / Screen-lock login (WebAuthn platform authenticator).
// Ek baar email+password se login ke baad "Enable" karne par, agli baar app khulte hi
// device ka fingerprint maanga jata hai aur sahi hone par login ho jata hai.
import { supabase } from '../lib/supabase';

const CRED_KEY = 'll_bio_cred';   // { credentialId, email }
const TOKEN_KEY = 'll_bio_rt';    // supabase refresh token
export const BIO_EVENT = 'll-bio-change';

interface BioRecord {
  credentialId: string;
  email: string;
}

// ---------- helpers ----------
function toB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readRecord(): BioRecord | null {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? (JSON.parse(raw) as BioRecord) : null;
  } catch {
    return null;
  }
}

function notifyChange() {
  window.dispatchEvent(new Event(BIO_EVENT));
}

// ---------- public API ----------
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (!window.isSecureContext || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricEnabled(): boolean {
  return !!readRecord();
}

// Enabled bhi hai aur saved login token bhi hai -> fingerprint se login ho sakta hai
export function hasStoredBiometricLogin(): boolean {
  try {
    return !!readRecord() && !!localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

// Naya refresh token sirf tab save hota hai jab fingerprint enabled ho
export function saveRefreshToken(token: string | undefined | null) {
  if (!token || !readRecord()) return;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

// Logout par: token hatao, lekin fingerprint enabled rahe (agle password login par token phir save ho jayega)
export function clearRefreshToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function disableBiometric() {
  try {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
  notifyChange();
}

// Logged-in user ke liye fingerprint enable karo (device fingerprint register hota hai)
export async function enableBiometric(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.refresh_token) return { ok: false, error: 'Pehle email/password se login karein.' };
    const email = session.user?.email || 'user';

    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Narbada Eye Care LensLedger', id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: email,
          displayName: email,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },    // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // phone/laptop ka apna fingerprint
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!cred) return { ok: false, error: 'Fingerprint setup cancel ho gaya.' };

    const record: BioRecord = { credentialId: toB64Url(cred.rawId), email };
    localStorage.setItem(CRED_KEY, JSON.stringify(record));
    localStorage.setItem(TOKEN_KEY, session.refresh_token);
    notifyChange();
    return { ok: true };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') return { ok: false, error: 'Fingerprint setup cancel ho gaya.' };
    return { ok: false, error: err?.message || 'Fingerprint setup nahi ho paya.' };
  }
}

// Fingerprint maango, sahi ho to saved token se Supabase session chalu karo
export async function loginWithBiometric(): Promise<{ ok: boolean; error?: string; needPassword?: boolean }> {
  const record = readRecord();
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
  if (!record || !token) return { ok: false, needPassword: true, error: 'Pehle password se login karein.' };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64Url(record.credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (!assertion) return { ok: false, error: 'Fingerprint verify nahi hua.' };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') return { ok: false, error: 'Fingerprint cancel ho gaya. Dobara try karein ya password use karein.' };
    return { ok: false, error: err?.message || 'Fingerprint verify nahi hua.' };
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
  if (error || !data.session) {
    // Token expire / revoke ho chuka hai -> password se hi login hoga
    clearRefreshToken();
    return { ok: false, needPassword: true, error: 'Session expire ho gaya. Email/password se login karein.' };
  }
  saveRefreshToken(data.session.refresh_token);
  return { ok: true };
}
