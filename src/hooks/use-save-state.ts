import { useCallback, useEffect, useRef, useState } from "react";
import { applyMutation, type MutationChange } from "@/state/mutations";
import {
  loadSave,
  persistSave,
  RANDOMIZE_COOLDOWN_MS,
  type SaveFile,
} from "@/state/save";

export interface SaveState {
  /** The whole save, or null until the first load resolves. */
  save: SaveFile | null;
  /** Flip mute (audio only; haptics stay on — spec §3.1). */
  toggleMute: () => void;
  /** Apply one Randomize mutation if the cooldown has elapsed; returns what
   *  changed (for the chip/sound), or null if not ready / not loaded. */
  applyRandomize: () => MutationChange | null;
}

// Single owner of the save file (spec §8): loads on mount, persists debounced on
// every change, one AsyncStorage key. Mute and cooldowns live here too.
export function useSaveState(): SaveState {
  const [save, setSave] = useState<SaveFile | null>(null);
  const saveRef = useRef<SaveFile | null>(null);
  saveRef.current = save;

  useEffect(() => {
    let active = true;
    loadSave().then((s) => {
      if (active) setSave(s);
    });
    return () => {
      active = false;
    };
  }, []);

  // Debounced persist on change. Rotation is never persisted — only discrete
  // save changes (mutations, mute, cooldowns) land here.
  useEffect(() => {
    if (!save) return;
    const id = setTimeout(() => void persistSave(save), 400);
    return () => clearTimeout(id);
  }, [save]);

  const toggleMute = useCallback(() => {
    setSave((s) => (s ? { ...s, muted: !s.muted } : s));
  }, []);

  const applyRandomize = useCallback((): MutationChange | null => {
    const s = saveRef.current;
    if (!s) return null;
    const now = Date.now();
    if (s.randomizeReadyAt > now) return null; // still cooling down
    const { wheel, change } = applyMutation(s.wheel, s.collection);
    setSave({ ...s, wheel, randomizeReadyAt: now + RANDOMIZE_COOLDOWN_MS });
    return change;
  }, []);

  return { save, toggleMute, applyRandomize };
}
