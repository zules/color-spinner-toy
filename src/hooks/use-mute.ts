import { useCallback, useEffect, useRef, useState } from "react";
import { loadMuted, setMutedPersisted } from "@/state/save";

export interface Mute {
  /** Current mute state, for rendering the toggle. */
  muted: boolean;
  /** Live ref to `muted` so stable callbacks (e.g. the tick handler) read fresh. */
  mutedRef: React.RefObject<boolean>;
  /** Flip mute and persist it. */
  toggle: () => void;
}

// Mute governs audio only; haptics stay on when muted (spec §3.1). State is
// restored on launch and persisted on change.
export function useMute(): Mute {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadMuted().then((m) => {
      if (!active) return;
      mutedRef.current = m;
      setMuted(m);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      void setMutedPersisted(next);
      return next;
    });
  }, []);

  return { muted, mutedRef, toggle };
}
