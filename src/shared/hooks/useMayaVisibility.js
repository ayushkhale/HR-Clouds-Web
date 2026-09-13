import { useCallback, useEffect, useState } from 'react';

// Show/hide preference for the floating "Ask Maya" assistant, saved per browser.
// A window event keeps every mounted consumer (the widget and the profile
// toggle) in sync within the tab; the `storage` event covers other tabs.
const KEY = 'hrclouds_maya_hidden';
const EVENT = 'hrclouds:maya-visibility';

let memoryHidden = false; // fallback when localStorage is unavailable

const readHidden = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return memoryHidden;
  }
};

export function useMayaVisibility() {
  const [hidden, setHiddenState] = useState(readHidden);

  useEffect(() => {
    const sync = () => setHiddenState(readHidden());
    const onStorage = (e) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setHidden = useCallback((next) => {
    memoryHidden = next;
    try {
      if (next) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable — keep in memory only */
    }
    setHiddenState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { hidden, setHidden };
}
