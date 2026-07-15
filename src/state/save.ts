import AsyncStorage from "@react-native-async-storage/async-storage";

// Full save-file shape (spec §8). Defined now for documentation and reuse; M3
// only reads/writes `muted`. The complete load/persist with cooldown clamping
// and corrupt-save fallback lands in M4.
export type TextureKind = "solid" | "marble" | "glitter";

export interface WheelState {
  slices: { colorId: string; texture: TextureKind }[]; // length 3
  prongColorId: string | null; // null = default metal
  backgroundColorId: string | null;
  glowColorId: string | null;
  edge: { lumpy: boolean; seed: number };
}

export interface SaveFile {
  version: 1; // migration guard
  collection: string[]; // unlocked color ids, unlock order
  wheel: WheelState;
  randomizeReadyAt: number; // epoch ms
  unlockSpinReadyAt: number; // epoch ms
  muted: boolean;
}

// One key holds the whole object (spec §8). M4 fills in the rest of the fields;
// until then these helpers touch only `muted` and preserve anything already
// stored, so they stay forward-compatible with the full save.
export const SAVE_KEY = "save.v1";

/** Read the persisted mute flag; false on missing or corrupt save. */
export async function loadMuted(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    return parsed.muted === true;
  } catch {
    return false;
  }
}

/** Persist the mute flag, preserving any other fields already in the save. */
export async function setMutedPersisted(muted: boolean): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    let obj: Record<string, unknown> = {};
    if (raw) {
      try {
        obj = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        obj = {};
      }
    }
    obj.version = 1;
    obj.muted = muted;
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(obj));
  } catch {
    // Best-effort: a failed write must never crash the toy.
  }
}
