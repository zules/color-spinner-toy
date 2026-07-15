// Curated color palette (spec §4). Each entry has a stable `id` used in the
// save file, a display `hex`, and a palette-order `index`. The first three
// entries are the day-one starter colors.
export interface PaletteColor {
  /** Stable id referenced by WheelState / SaveFile (spec §8). Never reused. */
  id: string;
  /** Display color as a hex string. */
  hex: string;
  /** Position in the palette; first 3 are the starter colors. */
  index: number;
}

// NOTE (M1): only the 3 starter colors are defined for now. The full 35-color
// curated palette (spec §4) is deferred to M4/M5, when the color economy lands.
export const PALETTE: readonly PaletteColor[] = [
  { id: "coral", hex: "#E8635A", index: 0 },
  { id: "teal", hex: "#3FB0A3", index: 1 },
  { id: "gold", hex: "#F2B441", index: 2 },
] as const;

/** Ids of the day-one starter colors, in unlock order (spec §4: first 3). */
export const STARTER_COLOR_IDS: readonly string[] = PALETTE.slice(0, 3).map(
  (c) => c.id,
);

const BY_ID = new Map(PALETTE.map((c) => [c.id, c]));

/** Look up a palette color by id; undefined if the id is unknown. */
export function colorById(id: string): PaletteColor | undefined {
  return BY_ID.get(id);
}

/** Hex for an id, with a loud fallback so a bad id shows up instead of crashing. */
export function hexById(id: string): string {
  return BY_ID.get(id)?.hex ?? "#FF00FF";
}
