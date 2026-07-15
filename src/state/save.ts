import AsyncStorage from "@react-native-async-storage/async-storage";
import { PALETTE, STARTER_COLOR_IDS } from "@/constants/palette";

// Full save-file shape (spec §8). One key holds the whole object.
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

export const SAVE_KEY = "save.v1";
export const RANDOMIZE_COOLDOWN_MS = 10_000; // spec §4
export const UNLOCK_COOLDOWN_MS = 180_000; // 3:00, used from M5

const TEXTURES: TextureKind[] = ["solid", "marble", "glitter"];

/** Fresh day-one state: the 3 starter colors, solid slices, default chrome. */
export function defaultSave(): SaveFile {
  return {
    version: 1,
    collection: [...STARTER_COLOR_IDS],
    wheel: {
      slices: [
        { colorId: PALETTE[0].id, texture: "solid" },
        { colorId: PALETTE[1].id, texture: "solid" },
        { colorId: PALETTE[2].id, texture: "solid" },
      ],
      prongColorId: null,
      backgroundColorId: null,
      glowColorId: null,
      edge: { lumpy: false, seed: 0 },
    },
    randomizeReadyAt: 0,
    unlockSpinReadyAt: 0,
    muted: false,
  };
}

function isColorIdOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

// Rebuild a valid WheelState from unknown parsed data, falling back per-field so
// a partially-corrupt save can never crash rendering (spec §9).
function normalizeWheel(input: unknown, d: WheelState): WheelState {
  if (typeof input !== "object" || input === null) return d;
  const w = input as Record<string, unknown>;

  let slices = d.slices;
  if (Array.isArray(w.slices) && w.slices.length === 3) {
    const ok = w.slices.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { colorId?: unknown }).colorId === "string" &&
        TEXTURES.includes((s as { texture?: unknown }).texture as TextureKind),
    );
    if (ok) slices = w.slices as WheelState["slices"];
  }

  const edgeInput = w.edge as { lumpy?: unknown; seed?: unknown } | undefined;
  const edge =
    edgeInput &&
    typeof edgeInput.lumpy === "boolean" &&
    typeof edgeInput.seed === "number"
      ? { lumpy: edgeInput.lumpy, seed: edgeInput.seed }
      : d.edge;

  return {
    slices,
    prongColorId: isColorIdOrNull(w.prongColorId) ? w.prongColorId : d.prongColorId,
    backgroundColorId: isColorIdOrNull(w.backgroundColorId)
      ? w.backgroundColorId
      : d.backgroundColorId,
    glowColorId: isColorIdOrNull(w.glowColorId) ? w.glowColorId : d.glowColorId,
    edge,
  };
}

function normalize(parsed: unknown): SaveFile {
  const d = defaultSave();
  if (typeof parsed !== "object" || parsed === null) return d;
  const p = parsed as Record<string, unknown>;
  const now = Date.now();

  // Clamp cooldowns to at most now + duration so a forward clock change can't
  // lock the player out for hours (spec §4). Cheating forward is fine.
  const clamp = (v: unknown, dur: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(v, now + dur) : 0;

  const collection =
    Array.isArray(p.collection) &&
    p.collection.length >= 1 &&
    p.collection.every((x) => typeof x === "string")
      ? (p.collection as string[])
      : d.collection;

  return {
    version: 1,
    collection,
    wheel: normalizeWheel(p.wheel, d.wheel),
    randomizeReadyAt: clamp(p.randomizeReadyAt, RANDOMIZE_COOLDOWN_MS),
    unlockSpinReadyAt: clamp(p.unlockSpinReadyAt, UNLOCK_COOLDOWN_MS),
    muted: p.muted === true,
  };
}

/** Load the save, falling back to a fresh day-one state on missing/corrupt data. */
export async function loadSave(): Promise<SaveFile> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return normalize(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

/** Persist the whole save. Best-effort — a failed write must never crash. */
export async function persistSave(save: SaveFile): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore
  }
}
