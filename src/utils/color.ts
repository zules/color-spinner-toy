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
