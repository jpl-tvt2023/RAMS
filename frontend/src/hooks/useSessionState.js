import { useState, useEffect } from 'react';

// useState persisted to sessionStorage under `key` (per browser tab). `initial`
// may be a value or a factory. Bump the key when a stored shape changes.
// (Copied from ROMS, with the 'rams:' prefix.)
const VERSION = 'v1';
const storageKeyOf = (key) => `rams:${key}:${VERSION}`;

// Sets what a page's useSessionState(key) starts from the next time it opens
// in this tab -- for a link that opens another page on a given choice.
export function writeSessionState(key, value) {
  try { sessionStorage.setItem(storageKeyOf(key), JSON.stringify(value)); } catch { /* ignore */ }
}

export function useSessionState(key, initial) {
  const storageKey = storageKeyOf(key);
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) return JSON.parse(raw);
    } catch { /* ignore */ }
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* ignore */ }
  }, [storageKey, value]);
  return [value, setValue];
}
