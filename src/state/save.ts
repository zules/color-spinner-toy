import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorById, PALETTE, STARTER_COLOR_IDS } from "@/constants/palette";

// Full save-file shape (spec §8). One key holds the whole object.
export type TextureKind = "solid" | "marble" | "glitter";

export interface WheelState {
  slices: { colorId: string; texture: TextureKind }[]; // length 3
  prongColorId: string | null; // null = default metal
  backgroundColorId: string | null;
  glowColorId: string | null;
  spiralColorId: string | null; // null = no spiral overlay yet
  edge: { lumpy: boolean; seed: number };
}

export interface SaveFile {
  version: 1; // migration guard
  collection: string[]; // unlocked color ids, unlock order
  wheel: WheelState;
  randomizeReadyAt: number; // epoch ms
  unlockSpinReadyAt: number; // epoch ms
  muted: boolean;
  particlesOn: boolean; // confetti snowglobe toggle; default on
}

export const SAVE_KEY = "save.v1";
export const RANDOMIZE_COOLDOWN_MS = 3_000; // spec §4
export const UNLOCK_COOLDOWN_MS = 5_000;

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
      spiralColorId: null,
      edge: { lumpy: false, seed: 0 },
    },
    randomizeReadyAt: 0,
    unlockSpinReadyAt: 0,
    muted: false,
    particlesOn: true,
  };
}

// An id that exists in the CURRENT palette. Checking `typeof string` is not
// enough: a save written against an older palette (e.g. the pre-M5 starter
// trio's "coral") would smuggle dead ids into the collection, and Randomize
// would happily roll colors that no longer exist.
function isPaletteId(v: unknown): v is string {
  return typeof v === "string" && colorById(v) !== undefined;
}

function isPaletteIdOrNull(v: unknown): v is string | null {
  return v === null || isPaletteId(v);
}

// Rebuild a valid WheelState from unknown parsed data, falling back per-field so
// a partially-corrupt save can never crash rendering (spec §9).
function normalizeWheel(input: unknown, d: WheelState): WheelState {
  if (typeof input !== "object" || input === null) return d;
  const w = input as Record<string, unknown>;

  let slices = d.slices;
  if (Array.isArray(w.slices) && w.slices.length === 3) {
    // Per-slice fallback: one stale colorId costs that slice, not the wheel.
    slices = w.slices.map((s, i) => {
      const sl = (typeof s === "object" && s !== null ? s : {}) as {
        colorId?: unknown;
        texture?: unknown;
      };
      return {
        colorId: isPaletteId(sl.colorId) ? sl.colorId : d.slices[i].colorId,
        texture: TEXTURES.includes(sl.texture as TextureKind)
          ? (sl.texture as TextureKind)
          : d.slices[i].texture,
      };
    });
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
    prongColorId: isPaletteIdOrNull(w.prongColorId)
      ? w.prongColorId
      : d.prongColorId,
    backgroundColorId: isPaletteIdOrNull(w.backgroundColorId)
      ? w.backgroundColorId
      : d.backgroundColorId,
    glowColorId: isPaletteIdOrNull(w.glowColorId) ? w.glowColorId : d.glowColorId,
    spiralColorId: isPaletteIdOrNull(w.spiralColorId)
      ? w.spiralColorId
      : d.spiralColorId,
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

  // Keep only ids the current palette knows, deduped, in saved unlock order —
  // a save written against an older palette self-heals here. If nothing valid
  // survives, fall back to the day-one starter trio (floor of 1, spec §4).
  const seenIds = new Set<string>();
  const collection: string[] = [];
  if (Array.isArray(p.collection)) {
    for (const x of p.collection) {
      if (isPaletteId(x) && !seenIds.has(x)) {
        seenIds.add(x);
        collection.push(x);
      }
    }
  }

  return {
    version: 1,
    collection: collection.length >= 1 ? collection : d.collection,
    wheel: normalizeWheel(p.wheel, d.wheel),
    randomizeReadyAt: clamp(p.randomizeReadyAt, RANDOMIZE_COOLDOWN_MS),
    unlockSpinReadyAt: clamp(p.unlockSpinReadyAt, UNLOCK_COOLDOWN_MS),
    muted: p.muted === true,
    // Absent (a pre-toggle save) → on; only an explicit false turns it off.
    particlesOn: p.particlesOn !== false,
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
