import {
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import { shade, withAlpha } from "@/utils/color";

export interface SpinnerWheelProps {
  /** Square canvas edge length in dp. */
  size: number;
  /** Hex fill for each of the 3 slices, in slice order. */
  sliceColors: readonly [string, string, string];
  /** Unbounded wheel rotation in radians (spec §6). Only the slices rotate. */
  rotation: SharedValue<number>;
  /** Prong tint hex, or null for the default grey metal (spec §5 mutation #5). */
  prongColor?: string | null;
  /** Glow hex, or null for the default soft shadow (spec §5 mutation #6). */
  glowColor?: string | null;
}

// Slice boundaries sit at 12 / 4 / 8 o'clock. In Skia's angle convention
// (0° = 3 o'clock, sweeping clockwise, y pointing down) that's 270 / 30 / 150.
// Each slice sweeps 120° clockwise from its start. The prongs sit on those same
// three positions, so at rest every boundary lines up under a prong (spec §6).
const SLICE_STARTS = [270, 30, 150] as const;
const PRONG_COUNT = 3;

export function SpinnerWheel({
  size,
  sliceColors,
  rotation,
  prongColor = null,
  glowColor = null,
}: SpinnerWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4; // leaves room for prongs (1.05R) and the glow blur

  // Only the pie spins; the prongs, glow and rim stay fixed to the frame so a
  // slice boundary sweeps under a stationary prong on each pass (spec §6).
  const spinTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  const slicePaths = useMemo(() => {
    const oval = Skia.XYWHRect(cx - R, cy - R, R * 2, R * 2);
    return SLICE_STARTS.map((start) => {
      const p = Skia.Path.Make();
      p.moveTo(cx, cy);
      p.arcToOval(oval, start, 120, false);
      p.close();
      return p;
    });
  }, [cx, cy, R]);

  // The three slice-boundary radii as one path, stroked twice below to etch a
  // groove between slices. Without it, a wheel whose slices all share one
  // color (a legitimate Randomize outcome) spins invisibly.
  const boundaryPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (const start of SLICE_STARTS) {
      const rad = (start * Math.PI) / 180;
      p.moveTo(cx, cy);
      p.lineTo(cx + R * Math.cos(rad), cy + R * Math.sin(rad));
    }
    return p;
  }, [cx, cy, R]);

  // One prong, drawn at 12 o'clock pointing inward. The three rendered copies
  // are just this shape rotated 0 / 120 / 240° about the wheel centre.
  const prong = useMemo(() => {
    const outerR = R * 1.05; // flat base, just past the rim
    const shoulderR = R * 0.9;
    const tipR = R * 0.78; // point, resting over the slice fill
    const halfW = R * 0.06;
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
  const prongEdgeWidth = Math.max(1, size * 0.003);

  // Default prongs are a plain grey metal gradient; a prong mutation tints it
  // (the adjacent-slice tint refinement is M6). Glow defaults to a soft dark
  // shadow, or takes the mutated color at reduced alpha.
  const prongGradient = prongColor
    ? [shade(prongColor, 0.4), prongColor, shade(prongColor, -0.35)]
    : ["#efefef", "#a8a8a8", "#6f6f6f"];
  const glowFill = glowColor ? withAlpha(glowColor, 1) : "rgba(38,38,54,0.40)";

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* Soft glow / drop shadow behind the wheel (spec §3.1). */}
      <Circle cx={cx} cy={cy} r={R * 1.15} color={glowFill}>
        <Blur blur={size * 0.03} />
      </Circle>

      {/* Three solid pie slices — the only part that rotates. */}
      <Group origin={vec(cx, cy)} transform={spinTransform}>
        {slicePaths.map((path, i) => (
          <Path key={i} path={path} color={sliceColors[i]} />
        ))}

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

      {/* Crisp rim outline. */}
      <Circle
        cx={cx}
        cy={cy}
        r={R}
        color="#2b2b2b"
        style="stroke"
        strokeWidth={outlineWidth}
      />

      {/* Three grey metallic prongs at 12 / 4 / 8 o'clock. The metal is a plain
          grey gradient for now; the adjacent-slice tint arrives in M6. */}
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
              colors={prongGradient}
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
