import { useEffect, useState } from 'react';

/**
 * Shows an increasing value only after `delayMs` (so a number grows when the chips have arrived);
 * decreases show immediately (chips leave at once). A delay of 0 disables the lag.
 */
export function useLagged(value: number, delayMs: number): number {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value <= shown || delayMs <= 0) { setShown(value); return; }
    const id = window.setTimeout(() => setShown(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs, shown]);
  return shown;
}
