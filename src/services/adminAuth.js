import { getDB } from './db';

// Known SHA-256 hash for default PIN "1234"
const DEFAULT_PIN_SHA256 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

// Lightweight, deterministic pure-JS hash for HTTP/LAN contexts where crypto.subtle is disabled by browsers
function fallbackHash(pin) {
  const salt = 'PSS_FACTORY_SALT_2026';
  const str = String(pin).trim() + salt;
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x01000193);
  }

  return 'pss_' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

// Universal PIN hasher supporting both HTTPS/localhost and non-secure HTTP LAN IP contexts
export async function hashPin(pin) {
  const trimmed = String(pin || '').trim();

  // If in Secure Context (localhost or HTTPS), use native crypto.subtle if available
  if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(trimmed);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback below if crypto fails
    }
  }

  // Pure JavaScript fallback for HTTP on local IP (e.g. http://172.20.10.3:5173)
  return fallbackHash(trimmed);
}

export async function verifyAdminPin(enteredPin) {
  if (!enteredPin) return false;
  const trimmed = String(enteredPin).trim();
  const db = await getDB();
  const stored = await db.get('settings', 'admin_pin_hash');

  const storedHash = stored?.value;

  // 1. Check if default PIN (1234) matches default seed
  if (!storedHash || storedHash === DEFAULT_PIN_SHA256 || storedHash === fallbackHash('1234')) {
    if (trimmed === '1234') {
      return true;
    }
  }

  // 2. Try matching with browser crypto.subtle (if available)
  if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
    try {
      const sha256Hash = await hashPin(trimmed);
      if (sha256Hash === storedHash) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  // 3. Try matching with universal fallback hash
  const customHash = fallbackHash(trimmed);
  if (customHash === storedHash) {
    return true;
  }

  // 4. In case the entered PIN directly matches stored value
  if (trimmed === storedHash) {
    return true;
  }

  return false;
}

export async function updateAdminPin(currentPin, newPin) {
  const isValid = await verifyAdminPin(currentPin);
  if (!isValid) {
    throw new Error('Current Admin PIN is incorrect');
  }
  if (!newPin || String(newPin).trim().length < 4) {
    throw new Error('New PIN must be at least 4 digits');
  }

  const trimmedNew = String(newPin).trim();
  const newHash = await hashPin(trimmedNew);

  const db = await getDB();
  await db.put('settings', {
    key: 'admin_pin_hash',
    value: newHash,
    fallback_hash: fallbackHash(trimmedNew),
    updatedAt: new Date().toISOString()
  });

  return true;
}
