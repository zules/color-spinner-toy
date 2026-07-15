import {
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { useMemo } from "react";

export interface SpinnerWheelProps {
  /** Square canvas edge length in dp. */
  size: number;
  /** Hex fill for each of the 3 slices, in slice order. */
  sliceColors: readonly [string, string, string];
}

// Slice boundaries sit at 12 / 4 / 8 o'clock. In Skia's angle convention
// (0° = 3 o'clock, sweeping clockwise, y pointing down) that's 270 / 30 / 150.
// Each slice sweeps 120° clockwise from its start. The prongs sit on those same
// three positions, so at rest every boundary lines up under a prong (spec §6).
const SLICE_STARTS = [270, 30, 150] as const;
const PRONG_COUNT = 3;

export function SpinnerWheel({ size, sliceColors }: SpinnerWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4; // leaves room for prongs (1.05R) and the glow blur

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

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* Soft glow / drop shadow behind the wheel (spec §3.1). */}
      <Circle cx={cx} cy={cy + size * 0.012} r={R} color="rgba(38,38,54,0.40)">
        <Blur blur={size * 0.05} />
      </Circle>

      {/* Three solid pie slices. */}
      {slicePaths.map((path, i) => (
        <Path key={i} path={path} color={sliceColors[i]} />
      ))}

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
              colors={["#efefef", "#a8a8a8", "#6f6f6f"]}
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
