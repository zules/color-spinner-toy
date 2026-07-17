import { useCallback, useEffect, useRef, useState } from "react";
import { applyMutation, type MutationChange } from "@/state/mutations";
import {
  loadSave,
  persistSave,
  RANDOMIZE_COOLDOWN_MS,
  type SaveFile,
  UNLOCK_COOLDOWN_MS,
} from "@/state/save";

export interface SaveState {
  /** The whole save, or null until the first load resolves. */
  save: SaveFile | null;
  /** Flip mute (audio only; haptics stay on — spec §3.1). */
  toggleMute: () => void;
  /** Flip the confetti snowglobe on/off. Persisted like mute. */
  toggleParticles: () => void;
  /** Apply one Randomize mutation if the cooldown has elapsed; returns what
   *  changed (for the chip/sound), or null if not ready / not loaded. */
  applyRandomize: () => MutationChange | null;
  /** Remove a color from the collection, returning it to the locked pool.
   *  Refused (false) at the floor of 1 or for ids not in the collection
   *  (spec §4). Main-screen elements showing it are left alone. */
  forgetColor: (colorId: string) => boolean;
  /** Stamp the 3:00 unlock cooldown. Called when an unlock spin *starts* —
   *  if the app dies mid-spin the cooldown stands (spec §9). */
  beginUnlockSpin: () => void;
  /** Append a freshly unlocked color to the collection (on spin settle). */
  unlockColor: (colorId: string) => void;
}

// Single owner of the save file (spec §8): loads on mount, persists debounced on
// every change, one AsyncStorage key. Mute and cooldowns live here too.
export function useSaveState(): SaveState {
  const [save, setSave] = useState<SaveFile | null>(null);
  // Live mirror for event-time reads from stable callbacks. Synced in an
  // effect (not during render) to stay React Compiler-safe.
  const saveRef = useRef<SaveFile | null>(null);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

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

  const toggleParticles = useCallback(() => {
    setSave((s) => (s ? { ...s, particlesOn: !s.particlesOn } : s));
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

  const forgetColor = useCallback((colorId: string): boolean => {
    const s = saveRef.current;
    if (!s) return false;
    if (s.collection.length <= 1) return false; // floor of 1 (spec §4)
    if (!s.collection.includes(colorId)) return false;
    setSave({ ...s, collection: s.collection.filter((id) => id !== colorId) });
    return true;
  }, []);

  const beginUnlockSpin = useCallback(() => {
    setSave((s) =>
      s ? { ...s, unlockSpinReadyAt: Date.now() + UNLOCK_COOLDOWN_MS } : s,
    );
  }, []);

  const unlockColor = useCallback((colorId: string) => {
    setSave((s) =>
      s && !s.collection.includes(colorId)
        ? { ...s, collection: [...s.collection, colorId] }
        : s,
    );
  }, []);

  return {
    save,
    toggleMute,
    toggleParticles,
    applyRandomize,
    forgetColor,
    beginUnlockSpin,
    unlockColor,
  };
}
