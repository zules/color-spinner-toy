import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Shader,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import type { TextureKind } from "@/state/save";
import { hexToRgb01, mixHex, multiplyHex, shade } from "@/utils/color";

export interface WheelSlice {
  /** Hex fill for the slice. */
  color: string;
  /** Slice texture (spec §5 mutation #2): solid, marble, or glitter. */
  texture: TextureKind;
}

export interface SpinnerWheelProps {
  /** Square canvas edge length in dp. */
  size: number;
  /** The 3 slices, in slice order. */
  slices: readonly [WheelSlice, WheelSlice, WheelSlice];
  /** Unbounded wheel rotation in radians (spec §6). Only the slices rotate. */
  rotation: SharedValue<number>;
  /** Wheel edge (spec §5 mutation #4): smooth circle or seeded lumpy outline. */
  edge: { lumpy: boolean; seed: number };
  /** Prong tint hex, or null for adjacent-slice-tinted metal (spec §7). */
  prongColor?: string | null;
  /** Spiral overlay hex, or null for no spiral (spec §5 mutation #7). */
  spiralColor?: string | null;
}

// Slice boundaries sit at 12 / 4 / 8 o'clock. In Skia's angle convention
// (0° = 3 o'clock, sweeping clockwise, y pointing down) that's 270 / 30 / 150.
// Each slice sweeps 120° clockwise from its start. The prongs sit on those same
// three positions, so at rest every boundary lines up under a prong (spec §6).
const SLICE_STARTS = [270, 30, 150] as const;
const PRONG_COUNT = 3;

// ---------------------------------------------------------------------------
// Texture shaders (spec §7). Static SkSL runtime effects, compiled once. Both
// are deliberately animation-free: patterns are fixed per (color, seed).
// ---------------------------------------------------------------------------

function makeEffect(sksl: string) {
  try {
    return Skia.RuntimeEffect.Make(sksl);
  } catch {
    return null; // compile failure → slices fall back to solid fills
  }
}

// Marble: fractal value-noise warps a sine into soft veins that lighten and
// darken the base color.
const MARBLE_FX = makeEffect(`
uniform float3 baseColor;
uniform float seed;
uniform float scale;

float mhash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7)) + seed) * 43758.5453);
}
float mnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = mhash(i);
  float b = mhash(i + float2(1.0, 0.0));
  float c = mhash(i + float2(0.0, 1.0));
  float d = mhash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * mnoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}
half4 main(float2 xy) {
  float2 p = xy * scale;
  float veins = 0.5 + 0.5 * sin(p.x * 2.0 + p.y * 1.3 + fbm(p * 2.2) * 6.2832);
  float m = smoothstep(0.25, 0.85, veins);
  float3 dark = baseColor * 0.72;
  float3 light = min(baseColor * 1.18 + 0.10, float3(1.0));
  // Splotches sit at 50% over the base, letting the original color through.
  float3 col = mix(baseColor, mix(dark, light, m), 0.4);
  // Thin snakey streaks of harsh light: a second, more turbulent warp, with
  // only the narrow crest band kept and pushed hard toward white.
  float v2 = 0.5 + 0.5 * sin(p.y * 1.9 + p.x * 1.1 + fbm(p * 2.5 + 30.0) * 7.0);
  float streak = smoothstep(0.97, 0.99, v2);
  float3 hot = min(baseColor + float3(0.65), float3(1.0));
  col = mix(col, hot, streak * 0.9);
  return half4(half3(col), 1.0);
}
`);

// Glitter: high-frequency hash noise thresholded into sparkle dots over the
// base color, plus sparse darker flecks for depth. No shimmer (spec §7).
const GLITTER_FX = makeEffect(`
uniform float3 baseColor;
uniform float seed;
uniform float cell;

float ghash(float2 p) {
  return fract(sin(dot(p, float2(419.2, 371.9)) + seed) * 43758.5453);
}
half4 main(float2 xy) {
  float2 c = floor(xy / cell);
  float sparkle = step(0.90, ghash(c));
  float bright = 0.55 + 0.45 * ghash(c + 17.0);
  float3 col = mix(baseColor, float3(1.0), sparkle * bright);
  float pepper = step(0.96, ghash(c + 31.0));
  col = mix(col, baseColor * 0.65, pepper * 0.99);
  return half4(half3(col), 1.0);
}
`);

// ---------------------------------------------------------------------------
// Lumpy edge (spec §7): r(θ) = R + a·noise(θ, seed). A few seeded sine
// harmonics keep the outline smooth, periodic, and cheap; the whole pie is
// clipped to it so it deforms together. Max deviation ≈ ±5% of R, which stays
// inside the prong bases at 1.05R.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLumpyPath(cx: number, cy: number, R: number, seed: number) {
  const rand = mulberry32(seed);
  const harmonics = [
    { k: 4 + Math.floor(rand() * 3), a: 0.020 + rand() * 0.010 },
    { k: 7 + Math.floor(rand() * 4), a: 0.010 + rand() * 0.007 },
    { k: 11 + Math.floor(rand() * 6), a: 0.005 + rand() * 0.004 },
  ].map((h) => ({ ...h, ph: rand() * Math.PI * 2 }));

  const p = Skia.Path.Make();
  const N = 128;
  for (let s = 0; s <= N; s++) {
    const th = (s / N) * Math.PI * 2;
    let dr = 0;
    for (const { k, a, ph } of harmonics) dr += a * Math.sin(k * th + ph);
    const r = R * (1 + dr);
    const x = cx + r * Math.cos(th);
    const y = cy + r * Math.sin(th);
    if (s === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

export function SpinnerWheel({
  size,
  slices,
  rotation,
  edge,
  prongColor = null,
  spiralColor = null,
}: SpinnerWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4; // leaves room for the prongs (1.08R). Glow is a layer.

  // Only the pie spins; the prongs and rim frame stay fixed so a slice
  // boundary sweeps under a stationary prong on each pass (spec §6).
  const spinTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  const slicePaths = useMemo(() => {
    // Slices overshoot the rim slightly; the outline clip trims them, which is
    // what lets the lumpy edge deform the whole pie at once.
    const RR = R * 1.06;
    const oval = Skia.XYWHRect(cx - RR, cy - RR, RR * 2, RR * 2);
    return SLICE_STARTS.map((start) => {
      const p = Skia.Path.Make();
      p.moveTo(cx, cy);
      p.arcToOval(oval, start, 120, false);
      p.close();
      return p;
    });
  }, [cx, cy, R]);

  // The wheel outline: a plain circle, or the seeded lumpy version. Used both
  // as the rotating clip for the pie and (stroked) as the rim.
  const outlinePath = useMemo(() => {
    if (!edge.lumpy) {
      const p = Skia.Path.Make();
      p.addCircle(cx, cy, R);
      return p;
    }
    return makeLumpyPath(cx, cy, R, edge.seed);
  }, [edge.lumpy, edge.seed, cx, cy, R]);

  // The three slice-boundary radii as one path, stroked twice below to etch a
  // groove between slices. Without it, a wheel whose slices all share one
  // color (a legitimate Randomize outcome) spins invisibly. Lines overshoot
  // the rim; the clip trims them to the (possibly lumpy) edge.
  const boundaryPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (const start of SLICE_STARTS) {
      const rad = (start * Math.PI) / 180;
      p.moveTo(cx, cy);
      p.lineTo(cx + R * 1.06 * Math.cos(rad), cy + R * 1.06 * Math.sin(rad));
    }
    return p;
  }, [cx, cy, R]);

  // Spiral overlay (spec §5 mutation #7): an Archimedean spiral from hub to
  // rim, stroked in its own color over all three slices. Part of the pie —
  // it rotates and is clipped with everything else, so it follows a lumpy
  // edge too. Slightly overshoots R; the clip trims it.
  const spiralPath = useMemo(() => {
    const TURNS = 1.9;
    const N = 220;
    const p = Skia.Path.Make();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const th = TURNS * 2 * Math.PI * t - Math.PI / 2;
      const r = R * 1.06 * t;
      const x = cx + r * Math.cos(th);
      const y = cy + r * Math.sin(th);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  }, [cx, cy, R]);

  // One prong, drawn at 12 o'clock pointing inward. The three rendered copies
  // are just this shape rotated 0 / 120 / 240° about the wheel centre.
  const prong = useMemo(() => {
    const outerR = R * 1.08; // flat base, just past the rim
    const shoulderR = R * 0.92;
    const tipR = R * 0.8; // point, resting over the slice fill
    const halfW = R * 0.08;
    const p = Skia.Path.Make();
    p.moveTo(cx - halfW, cy - outerR);
    p.lineTo(cx + halfW, cy - outerR);
    p.lineTo(cx + halfW, cy - shoulderR);
    p.lineTo(cx, cy - tipR);
    p.lineTo(cx - halfW, cy - shoulderR);
    p.close();
    return p;
  }, [cx, cy, R]);

  const outlineWidth = Math.max(1.5, size * 0.006);
  const prongEdgeWidth = Math.max(1, size * 0.006);

  // Prong metal (spec §7): a chrome-style gradient multiplied by a subtle
  // tint from the average of the two slices meeting at that prong's rest
  // position — prong i sits on the boundary between slice (i+2)%3 and slice i.
  // The metallic read comes from the tight specular flash (mid ramp) and the
  // small rebound at the tip; a smooth ramp looks like matte plastic. A prong
  // mutation (spec §5 #5) replaces the tint with the chosen color outright.
  const prongGradients = useMemo(() => {
    if (prongColor) {
      const g = [
        shade(prongColor, 0.55),
        shade(prongColor, -0.05),
        mixHex(prongColor, "#ffffff", 0.75), // specular flash
        shade(prongColor, -0.5),
        shade(prongColor, -0.1), // tip rebound
      ];
      return [g, g, g];
    }
    const greys = ["#fdfdfd", "#9a9a9a", "#ffffff", "#3f3f3f", "#8f8f8f"];
    return SLICE_STARTS.map((_, i) => {
      const tint = mixHex(slices[(i + 2) % 3].color, slices[i].color, 0.5);
      const soft = mixHex(tint, "#ffffff", 0.55); // keep the multiply subtle
      return greys.map((g) => multiplyHex(g, soft));
    });
  }, [prongColor, slices]);

  // Stop positions for the metal ramp: bright cap, dip, hard flash at 45%,
  // deep shadow, rebound. The tight 0.32→0.45→0.7 spacing is the "reflection".
  const prongStops = [0, 0.42, 0.55, 0.98, 1];

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* The soft glow behind the wheel is its own layer (WheelGlow), below the
          confetti, so the confetti renders on top of it and the blur isn't
          clipped by this square canvas (spec §3.1). */}

      {/* The pie: slices, grooves — clipped to the (possibly lumpy) outline.
          Everything in this group rotates, lumps included. */}
      <Group origin={vec(cx, cy)} transform={spinTransform} clip={outlinePath}>
        {slicePaths.map((path, i) => {
          const s = slices[i];
          const fx =
            s.texture === "marble"
              ? MARBLE_FX
              : s.texture === "glitter"
                ? GLITTER_FX
                : null;
          return fx ? (
            <Path key={i} path={path}>
              <Shader
                source={fx}
                uniforms={{
                  baseColor: hexToRgb01(s.color),
                  seed: i * 7.31 + 1.7,
                  ...(s.texture === "marble"
                    ? { scale: 7 / size }
                    : { cell: Math.max(1, size * 0.0045) }),
                }}
              />
            </Path>
          ) : (
            <Path key={i} path={path} color={s.color} />
          );
        })}

        {/* Spiral overlay in its own color, across all three slices. Drawn
            under the grooves so the boundary etching cuts through it. */}
        {spiralColor && (
          <Path
            path={spiralPath}
            style="stroke"
            strokeWidth={Math.max(3, size * 0.058)}
            strokeCap="round"
            strokeJoin="round"
            color={spiralColor}
          />
        )}

        {/* Slice-boundary grooves, so identical slices still read as spinning.
            Two passes: a wide light stroke (screen — only ever lightens) under
            a thin dark core (multiply — only ever darkens). Whatever the slice
            color — white, black, or the mid-grey that defeats difference-style
            blends — at least one pass contrasts. The radial fade keeps the hub
            clean where the three lines converge and puts the emphasis at the
            rim, where motion reads. */}
        <Path
          path={boundaryPath}
          style="stroke"
          strokeWidth={Math.max(2, size * 0.009)}
          blendMode="screen"
        >
          <RadialGradient
            c={vec(cx, cy)}
            r={R}
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)"]}
            positions={[0.2, 0.85]}
          />
        </Path>
        <Path
          path={boundaryPath}
          style="stroke"
          strokeWidth={Math.max(1, size * 0.005)}
          blendMode="multiply"
        >
          <RadialGradient
            c={vec(cx, cy)}
            r={R}
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.4)"]}
            positions={[0.2, 0.85]}
          />
        </Path>
      </Group>

      {/* Crisp rim outline. Drawn in its own rotating (unclipped) group so a
          lumpy rim turns with the pie and keeps its full stroke width. */}
      <Group origin={vec(cx, cy)} transform={spinTransform}>
        <Path
          path={outlinePath}
          color="#2b2b2b"
          style="stroke"
          strokeWidth={outlineWidth}
        />
      </Group>

      {/* Three metallic prongs at 12 / 4 / 8 o'clock, tinted toward the slices
          they rest between (or the mutated prong color). */}
      {Array.from({ length: PRONG_COUNT }, (_, i) => (
        <Group
          key={i}
          origin={vec(cx, cy)}
          transform={[{ rotate: (i * 120 * Math.PI) / 180 }]}
        >
          <Path path={prong}>
            <LinearGradient
              start={vec(cx, cy - R * 1.05)}
              end={vec(cx, cy - R * 0.78)}
              colors={prongGradients[i]}
              positions={prongStops}
            />
          </Path>
          <Path
            path={prong}
            color="#5a5a5a"
            style="stroke"
            strokeWidth={prongEdgeWidth}
          />
        </Group>
      ))}
    </Canvas>
  );
}
