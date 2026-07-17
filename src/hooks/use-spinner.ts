import { useCallback, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

// Base SPIN impulse (rad/s) and decay rate. Tunable. Pressing SPIN adds this
// much angular velocity in the wheel's current direction; ±10% jitter per press
// keeps repeated taps from feeling canned (spec §6).
const SPIN_VELOCITY = 28;
// Hard cap on |wheel angular velocity| (rad/s) seeded into the decay from a SPIN
// press or a flick release. Without it, mashing SPIN stacks velocity unbounded
// and a hard flick can seed an arbitrarily fast spin. Adjustable: one SPIN press
// adds SPIN_VELOCITY (28) rad/s, so 60 ≈ a couple of presses before it caps.
// (An active finger-scrub is not capped — it tracks the finger directly.)
const MAX_SPIN_VELOCITY = 60;
const DECELERATION = 0.99998;
// Below this |rad/s| the wheel counts as "at rest" for choosing a SPIN direction.
const REST_EPSILON = 0.5;

// Prong ticks: boundaries and prongs both sit at 120° spacing, so all three
// boundaries sweep under all three prongs together every 120° of rotation —
// one tick "moment" per step (spec §6). Throttle so a fast spin can't spam the
// bridge; dropped ticks at blur speed are imperceptible.
const TICK_STEP = (2 * Math.PI) / 3; // 120° in radians
const TICK_MIN_MS = 50;

export interface Spinner {
  /** Unbounded rotation in radians (spec §6). Feeds the Skia wheel directly. */
  rotation: ReturnType<typeof useSharedValue<number>>;
  /** Wheel angular velocity in rad/s. Sign = spin direction, magnitude = speed;
   *  drives the confetti fling. Same UI-thread value SPIN reads to add impulse. */
  velocity: ReturnType<typeof useSharedValue<number>>;
  /** Pan gesture for flick / scrub, to attach via <GestureDetector>. */
  gesture: ReturnType<typeof Gesture.Pan>;
  /** Apply one SPIN-button impulse. */
  spin: () => void;
  /** onLayout handler for the square wheel area. */
  onWheelLayout: (e: LayoutChangeEvent) => void;
  /** Current wheel edge length in dp (0 until first layout). */
  wheelSize: number;
  /** Full measured wheel-area size in dp (0 until first layout) — the confetti
   *  field. The wheel is centred in it, so its centre is the wheel centre. */
  fieldWidth: number;
  fieldHeight: number;
}

// `onTick(isTouch)` fires once per prong-crossing moment; isTouch is true when
// the spin is finger-driven (flick or scrub, and its decay), false for SPIN.
export function useSpinner(onTick: (isTouch: boolean) => void): Spinner {
  // One unbounded rotation value in radians drives everything (spec §6). Never
  // wrapped; the Skia layer applies it modulo 2π for free.
  const rotation = useSharedValue(0);
  // Measured angular velocity (rad/s) so a SPIN press can add to the current
  // motion instead of resetting it.
  const velocity = useSharedValue(0);

  const half = useSharedValue(0); // wheel centre offset = wheelSize / 2
  const prevAngle = useSharedValue(0);
  const prevRotation = useSharedValue(0);

  const nowMs = useSharedValue(0); // latest frame timestamp, for tick throttle
  const lastTickMs = useSharedValue(0);
  // 1 while the current motion is finger-driven (flick/scrub + its decay), 0
  // once SPIN takes over — gates haptics (spec §6: never with SPIN).
  const spinIsTouch = useSharedValue(0);

  const [wheelSize, setWheelSize] = useState(0);
  // Full wheel-area size, for the confetti field that fills it (spec: snowglobe).
  const [field, setField] = useState({ width: 0, height: 0 });

  // Track true angular velocity every frame, whatever is driving rotation
  // (finger or decay). Pure UI-thread math, no React re-render (spec §7). A big
  // dt (after a stall/background) is ignored so velocity can't spike.
  useFrameCallback((frame) => {
    "worklet";
    nowMs.value = frame.timestamp;
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
      const w = Math.floor(width);
      const h = Math.floor(height);
      setField((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
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
          spinIsTouch.value = 1;
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
            velocity: Math.max(-MAX_SPIN_VELOCITY, Math.min(MAX_SPIN_VELOCITY, omega)),
            deceleration: DECELERATION,
          });
        }),
    [rotation, half, prevAngle, spinIsTouch],
  );

  // SPIN button: add a fresh, jittered impulse in the current spin direction
  // (or clockwise from rest). Read velocity fresh on the UI thread (spec §6).
  const spin = useCallback(() => {
    const jitter = 0.9 + Math.random() * 0.2;
    scheduleOnUI(() => {
      "worklet";
      spinIsTouch.value = 0;
      const v = velocity.value;
      const dir = Math.abs(v) < REST_EPSILON ? 1 : Math.sign(v);
      const seed = v + dir * SPIN_VELOCITY * jitter;
      rotation.value = withDecay({
        velocity: Math.max(-MAX_SPIN_VELOCITY, Math.min(MAX_SPIN_VELOCITY, seed)),
        deceleration: DECELERATION,
      });
    });
  }, [rotation, velocity, spinIsTouch]);

  // Fire a tick each time the wheel advances past another 120° step (spec §6).
  // All detection + throttle stays on the UI thread; only real ticks cross to JS.
  useAnimatedReaction(
    () => Math.floor(rotation.value / TICK_STEP),
    (curr, prev) => {
      if (prev === null || curr === prev) return;
      if (nowMs.value - lastTickMs.value < TICK_MIN_MS) return;
      lastTickMs.value = nowMs.value;
      scheduleOnRN(onTick, spinIsTouch.value === 1);
    },
    [onTick],
  );

  return {
    rotation,
    velocity,
    gesture,
    spin,
    onWheelLayout,
    wheelSize,
    fieldWidth: field.width,
    fieldHeight: field.height,
  };
}
