// Tiny hex-color helpers for deriving prong/glow tints from a palette color.

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** `#RRGGBB` → `rgba(r, g, b, a)`. */
export function withAlpha(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Lighten (amt > 0, toward white) or darken (amt < 0, toward black) a hex color. */
export function shade(hex: string, amt: number): string {
  const { r, g, b } = parseHex(hex);
  const target = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  const mix = (c: number) => clampByte(c + (target - c) * p);
  const to2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/** Linear blend of two hex colors; t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const to2 = (c: number) => clampByte(c).toString(16).padStart(2, "0");
  const ch = (x: number, y: number) => to2(x + (y - x) * t);
  return `#${ch(ca.r, cb.r)}${ch(ca.g, cb.g)}${ch(ca.b, cb.b)}`;
}

/** Per-channel multiply of two hex colors (photoshop "multiply"). */
export function multiplyHex(a: string, b: string): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const to2 = (x: number, y: number) =>
    clampByte((x * y) / 255).toString(16).padStart(2, "0");
  return `#${to2(ca.r, cb.r)}${to2(ca.g, cb.g)}${to2(ca.b, cb.b)}`;
}

/** Hex → [r, g, b] in 0..1, for shader uniforms. */
export function hexToRgb01(hex: string): [number, number, number] {
  const { r, g, b } = parseHex(hex);
  return [r / 255, g / 255, b / 255];
}

/**
 * True when a color is dark enough that light (white) foreground content reads
 * better on it than dark content — e.g. choosing status-bar icon colour so the
 * clock stays visible when the background is randomized to black. Uses the
 * classic YIQ perceived-brightness midpoint (128).
 */
export function isDark(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
