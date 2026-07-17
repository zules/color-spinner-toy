import { Blur, Canvas, Circle } from "@shopify/react-native-skia";
import { withAlpha } from "@/utils/color";

export interface WheelGlowProps {
  /** Field canvas size in dp — matches the confetti field. The wheel, and so
   *  the glow, is centred in it: (width/2, height/2). */
  width: number;
  height: number;
  /** Disc radius in dp (R = wheelSize * 0.4), same value the wheel uses. */
  wheelRadius: number;
  /** Glow hex, or null for the default soft shadow (spec §5 mutation #6). */
  glowColor?: string | null;
}

// The soft glow / drop shadow behind the wheel (spec §3.1). It lives in its own
// full-field canvas, below the confetti, for two reasons: the confetti then
// renders on top of the glow, and the blur gets the whole field to spread into
// instead of being clipped by the tight square wheel canvas. Geometry matches
// the values SpinnerWheel used to draw with: r = R·1.10, blur = size·0.04,
// and size = R / 0.4, so blur = R·0.10.
export function WheelGlow({
  width,
  height,
  wheelRadius,
  glowColor = null,
}: WheelGlowProps) {
  const fill = glowColor ? withAlpha(glowColor, 1) : "rgba(38,38,54,0.40)";
  return (
    <Canvas style={{ width, height, pointerEvents: "none" }}>
      <Circle
        cx={width / 2}
        cy={height / 2}
        r={wheelRadius * 1.1}
        color={fill}
      >
        <Blur blur={wheelRadius * 0.1} />
      </Circle>
    </Canvas>
  );
}
