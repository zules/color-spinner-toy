// Curated color palette (spec §4). Each entry has a stable `id` used in the
// save file, a display `hex`, and a palette-order `index`. The first three
// entries are the day-one starter colors.
export interface PaletteColor {
  /** Stable id referenced by WheelState / SaveFile (spec §8). Never reused. */
  id: string;
  /** Human-readable name, shown in chips / UI. */
  name: string;
  /** Display color as a hex string. */
  hex: string;
  /** Position in the palette; first 3 are the starter colors. */
  index: number;
}

export const PALETTE: readonly PaletteColor[] = [
  { id: "saddlebrown", name: "SaddleBrown", hex: "#8B4513", index: 0 },
  { id: "deepskyblue", name: "DeepSkyBlue", hex: "#00BFFF", index: 1 },
  { id: "springgreen", name: "SpringGreen", hex: "#00FF7F", index: 2 },
  { id: "teal", name: "Teal", hex: "#008080", index: 3 },
  { id: "turquoise", name: "Turquoise", hex: "#40E0D0", index: 4 },
  { id: "whitesmoke", name: "WhiteSmoke", hex: "#F5F5F5", index: 5 },
  { id: "lightblue", name: "LightBlue", hex: "#ADD8E6", index: 6 },
  { id: "green", name: "Green", hex: "#008000", index: 7 },
  { id: "darkolivegreen", name: "DarkOliveGreen", hex: "#556B2F", index: 8 },
  { id: "limegreen", name: "LimeGreen", hex: "#32CD32", index: 9 },
  { id: "tan", name: "Tan", hex: "#D2B48C", index: 10 },
  { id: "hotpink", name: "HotPink", hex: "#FF69B4", index: 11 },
  { id: "mediumvioletred", name: "MediumVioletRed", hex: "#C71585", index: 12 },
  { id: "pink", name: "Pink", hex: "#FFC0CB", index: 13 },
  { id: "red", name: "Red", hex: "#FF0000", index: 14 },
  { id: "darkred", name: "DarkRed", hex: "#8B0000", index: 15 },
  { id: "orange", name: "Orange", hex: "#FFA500", index: 16 },
  { id: "lightgray", name: "LightGray", hex: "#D3D3D3", index: 17 },
  { id: "khaki", name: "Khaki", hex: "#F0E68C", index: 18 },
  { id: "gold", name: "Gold", hex: "#FFD700", index: 19 },
  { id: "cornsilk", name: "Cornsilk", hex: "#FFF8DC", index: 20 },
  { id: "midnightblue", name: "MidnightBlue", hex: "#191970", index: 21 },
  { id: "indigo", name: "Indigo", hex: "#4B0082", index: 22 },
  { id: "purple", name: "Purple", hex: "#800080", index: 23 },
  { id: "slateblue", name: "SlateBlue", hex: "#6A5ACD", index: 24 },
  { id: "plum", name: "Plum", hex: "#DDA0DD", index: 25 },
  { id: "blue", name: "Blue", hex: "#0000FF", index: 26 },
  { id: "steelblue", name: "SteelBlue", hex: "#4682B4", index: 27 },
  { id: "darkslategray", name: "DarkSlateGray", hex: "#2F4F4F", index: 28 },
  { id: "lavender", name: "Lavender", hex: "#E6E6FA", index: 29 },
  { id: "palegreen", name: "PaleGreen", hex: "#98FB98", index: 30 },
  { id: "black", name: "Black", hex: "#000000", index: 31 },
  { id: "honeydew", name: "Honeydew", hex: "#F0FFF0", index: 32 },
  { id: "gray", name: "Gray", hex: "#808080", index: 33 },
  { id: "greenyellow", name: "GreenYellow", hex: "#ADFF2F", index: 34 }
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

/** Display name for an id, falling back to the id itself. */
export function nameById(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}
