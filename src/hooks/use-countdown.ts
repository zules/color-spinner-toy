import { useEffect, useState } from "react";

// Milliseconds left until `readyAt`, ticking while the app is foregrounded.
// Timestamp-based real elapsed time (spec §4): time passing while closed counts,
// because we always compare against Date.now(). Drives the countdown display
// only; a small interval keeps the second flips prompt.
export function useCountdown(readyAt: number): number {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, readyAt - Date.now()),
  );

  useEffect(() => {
    setRemaining(Math.max(0, readyAt - Date.now()));
    if (readyAt <= Date.now()) return;
    const id = setInterval(() => {
      const r = Math.max(0, readyAt - Date.now());
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [readyAt]);

  return remaining;
}

/** Format remaining ms as `M:SS`, rounding up so a locked timer never shows 0:00. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
