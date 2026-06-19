import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Like useState, but persists to localStorage so a selection survives tab
 * switches (each tab is a separate route that otherwise remounts fresh).
 *
 * The first render always uses `initial` (matching SSR, so no hydration
 * mismatch); the stored value is loaded right after mount. Writes are skipped
 * until that load completes, so the default never clobbers a saved value.
 */
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore malformed/unavailable storage
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota/unavailable storage
    }
  }, [key, value, ready]);

  return [value, setValue];
}
