import { useCallback, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  useFrameCallback,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

// Base SPIN impulse (rad/s) and decay rate. Tunable. Pressing SPIN adds this
// much angular velocity in the wheel's current direction; ±10% jitter per press
// keeps repeated taps from feeling canned (spec §6).
const SPIN_VELOCITY = 28;
const DECELERATION = 0.99998;
// Below this |rad/s| the wheel counts as "at rest" for choosing a SPIN direction.
const REST_EPSILON = 0.5;

export interface Spinner {
  /** Unbounded rotation in radians (spec §6). Feeds the Skia wheel directly. */
  rotation: ReturnType<typeof useSharedValue<number>>;
  /** Pan gesture for flick / scrub, to attach via <GestureDetector>. */
  gesture: ReturnType<typeof Gesture.Pan>;
  /** Apply one SPIN-button impulse. */
  spin: () => void;
  /** onLayout handler for the square wheel area. */
  onWheelLayout: (e: LayoutChangeEvent) => void;
  /** Current wheel edge length in dp (0 until first layout). */
  wheelSize: number;
}

export function useSpinner(): Spinner {
  // One unbounded rotation value in radians drives everything (spec §6). Never
  // wrapped; the Skia layer applies it modulo 2π for free.
  const rotation = useSharedValue(0);
  // Measured angular velocity (rad/s) so a SPIN press can add to the current
  // motion instead of resetting it.
  const velocity = useSharedValue(0);

  const half = useSharedValue(0); // wheel centre offset = wheelSize / 2
  const prevAngle = useSharedValue(0);
  const prevRotation = useSharedValue(0);

  const [wheelSize, setWheelSize] = useState(0);

  // Track true angular velocity every frame, whatever is driving rotation
  // (finger or decay). Pure UI-thread math, no React re-render (spec §7). A big
  // dt (after a stall/background) is ignored so velocity can't spike.
  useFrameCallback((frame) => {
    "worklet";
    const dt = frame.timeSincePreviousFrame;
    if (dt !== null && dt > 0 && dt < 64) {
      velocity.value = ((rotation.value - prevRotation.value) / dt) * 1000;
    }
    prevRotation.value = rotation.value;
  });

  const onWheelLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      const next = Math.floor(Math.min(width, height));
      setWheelSize((prev) => (prev === next ? prev : next));
      half.value = next / 2;
    },
    [half],
  );

  // Pan maps finger angle around the centre to rotation while touching, then
  // hands the release's angular velocity to withDecay (spec §6). Stable — the
  // worklets read live shared values, so it never needs recreating.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          "worklet";
          cancelAnimation(rotation);
          prevAngle.value = Math.atan2(e.y - half.value, e.x - half.value);
        })
        .onUpdate((e) => {
          "worklet";
          const angle = Math.atan2(e.y - half.value, e.x - half.value);
          let delta = angle - prevAngle.value;
          // Unwrap across the ±π seam so a crossing doesn't jump a full turn.
          if (delta > Math.PI) delta -= 2 * Math.PI;
          else if (delta < -Math.PI) delta += 2 * Math.PI;
          rotation.value += delta;
          prevAngle.value = angle;
        })
        .onEnd((e) => {
          "worklet";
          const rx = e.x - half.value;
          const ry = e.y - half.value;
          const r2 = rx * rx + ry * ry;
          // Angular velocity = z of (r × v) / |r|², from the release's linear velocity.
          const omega = r2 > 1 ? (rx * e.velocityY - ry * e.velocityX) / r2 : 0;
          rotation.value = withDecay({
            velocity: omega,
            deceleration: DECELERATION,
          });
        }),
    [rotation, half, prevAngle],
  );

  // SPIN button: add a fresh, jittered impulse in the current spin direction
  // (or clockwise from rest). Read velocity fresh on the UI thread (spec §6).
  const spin = useCallback(() => {
    const jitter = 0.9 + Math.random() * 0.2;
    scheduleOnUI(() => {
      "worklet";
      const v = velocity.value;
      const dir = Math.abs(v) < REST_EPSILON ? 1 : Math.sign(v);
      rotation.value = withDecay({
        velocity: v + dir * SPIN_VELOCITY * jitter,
        deceleration: DECELERATION,
      });
    });
  }, [rotation, velocity]);

  return { rotation, gesture, spin, onWheelLayout, wheelSize };
}
