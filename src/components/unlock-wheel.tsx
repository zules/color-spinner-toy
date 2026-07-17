import { Canvas, Circle, Group, Path, Skia, vec } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  useDerivedValue,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { PaletteColor } from "@/constants/palette";
import { formatCountdown, useCountdown } from "@/hooks/use-countdown";

export interface UnlockWheelProps {
  /** Locked colors, in palette order — one equal slice each (spec §3.2). */
  lockedColors: readonly PaletteColor[];
  /** Epoch ms when the next unlock spin becomes available. */
  readyAt: number;
  /** Wheel diameter in dp. */
  size: number;
  /** Stamp the 3:00 cooldown — called the moment a spin starts (spec §9). */
  onSpinStart: () => void;
  /** The physics landed: unlock this color (fanfare/haptics live upstream). */
  onUnlock: (colorId: string) => void;
}

// Strong impulse plus a random offset (spec §3.2): the randomized launch
// velocity is the offset — the wheel decays naturally and the resting slice is
// the outcome. ~2.5–4.5 revolutions, settling in about three seconds.
const MIN_VELOCITY = 100; // rad/s
const VELOCITY_SPREAD = 20;
const DECELERATION = 0.99994;

// How long the landed wheel holds the winner under the pointer before the
// slice leaves the wheel and the color pops into the grid. The unlock is
// already committed to the save when the pause starts, so a kill mid-pause
// keeps the color. The overlay times its grid reveal off this same constant.
export const UNLOCK_REVEAL_PAUSE_MS = 1500;

// The SPIN-TO-UNLOCK zone (wireframes 3a/3b): n-slice wheel on the left, timer
// and a pointer-shaped SPIN button on the right. The button's tip is the
// pointer/notch — whatever slice rests under it at 3 o'clock is unlocked.
export function UnlockWheel({
  lockedColors,
  readyAt,
  size,
  onSpinStart,
  onUnlock,
}: UnlockWheelProps) {
  const rotation = useSharedValue(0);
  // Slice list frozen at launch so a mid-spin collection change (e.g. a forget)
  // can't shift the layout out from under the physics result. State drives
  // rendering; the ref mirror is for event-time reads in settle(), and the
  // boolean ref is a synchronous double-tap guard.
  const [frozen, setFrozen] = useState<readonly PaletteColor[] | null>(null);
  const frozenRef = useRef<readonly PaletteColor[]>([]);
  const spinningRef = useRef(false);
  const spinning = frozen !== null;

  // Reveal-pause timer; cleared on unmount so a closed overlay can't fire it.
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    },
    [],
  );

  const remaining = useCountdown(readyAt);
  const ready = remaining <= 0;

  const slices = frozen ?? lockedColors;
  const n = slices.length;

  const spinTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  const c = size / 2;
  const R = size / 2 - 4;

  const slicePaths = useMemo(() => {
    const oval = Skia.XYWHRect(c - R, c - R, R * 2, R * 2);
    const arc = 360 / Math.max(1, n);
    return slices.map((_, i) => {
      const p = Skia.Path.Make();
      p.moveTo(c, c);
      p.arcToOval(oval, i * arc, arc, false);
      p.close();
      return p;
    });
  }, [slices, n, c, R]);

  // Decay finished: the slice resting under the 3 o'clock pointer wins. Slices
  // are laid out clockwise from 3 o'clock (Skia's 0°), and a positive rotation
  // is clockwise, so the original angle now under the pointer is -rotation.
  // The winner is unlocked immediately, but the wheel keeps holding it under
  // the pointer for the reveal pause before the slice leaves the layout.
  const settle = useCallback(
    (finished: boolean, finalRotation: number) => {
      const releaseWheel = () => {
        spinningRef.current = false;
        setFrozen(null);
        rotation.value = 0;
      };
      const list = frozenRef.current;
      if (!finished || list.length === 0) {
        releaseWheel(); // cancelled — spin is lost, cooldown stands (spec §9)
        return;
      }
      const arc = 360 / list.length;
      const deg = (((-finalRotation * 180) / Math.PI) % 360 + 360) % 360;
      const idx = Math.min(list.length - 1, Math.floor(deg / arc));
      onUnlock(list[idx].id);
      pauseTimer.current = setTimeout(releaseWheel, UNLOCK_REVEAL_PAUSE_MS);
    },
    [onUnlock, rotation],
  );

  const spin = useCallback(() => {
    if (spinningRef.current || lockedColors.length === 0) return;
    onSpinStart(); // cooldown is stamped at launch, not at settle (spec §9)
    if (lockedColors.length === 1) {
      // A one-slice spin wouldn't visually register — instant unlock (spec §9).
      onUnlock(lockedColors[0].id);
      return;
    }
    frozenRef.current = lockedColors;
    spinningRef.current = true;
    setFrozen(lockedColors);
    const velocity = MIN_VELOCITY + Math.random() * VELOCITY_SPREAD;
    rotation.value = 0;
    rotation.value = withDecay(
      { velocity, deceleration: DECELERATION },
      (finished) => {
        "worklet";
        scheduleOnRN(settle, finished === true, rotation.value);
      },
    );
  }, [lockedColors, onSpinStart, onUnlock, rotation, settle]);

  const canSpin = ready && n > 0 && !spinning;
  // The whole zone dims during cooldown (wireframe 3b) — but never mid-spin.
  const zoneDimmed = !ready && !spinning;
  const allUnlocked = n === 0 && !spinning;

  return (
    <View style={[styles.zone, zoneDimmed && styles.zoneDimmed]}>
      <Text style={styles.label}>SPIN TO UNLOCK</Text>
      {allUnlocked ? (
        <View style={[styles.row, { minHeight: size * 0.6 }]}>
          <Text style={styles.emptyText}>
            All colors unlocked — forget one to spin again
          </Text>
        </View>
      ) : (
        <View style={styles.row}>
          <Canvas style={{ width: size, height: size }}>
            {n === 1 ? (
              <Circle cx={c} cy={c} r={R} color={slices[0].hex} />
            ) : (
              <Group origin={vec(c, c)} transform={spinTransform}>
                {slicePaths.map((path, i) => (
                  <Path key={slices[i].id} path={path} color={slices[i].hex} />
                ))}
              </Group>
            )}
            <Circle
              cx={c}
              cy={c}
              r={R}
              color="rgba(0,0,0,0.35)"
              style="stroke"
              strokeWidth={Math.max(1.5, size * 0.008)}
            />
          </Canvas>

          <View style={styles.controls}>
            <Text style={[styles.timer, ready && styles.timerReady]}>
              ⏱ {formatCountdown(remaining)}
            </Text>
            {/* Pointer-shaped SPIN button — its tip is the winning notch. */}
            <Pressable
              onPress={spin}
              disabled={!canSpin}
              accessibilityRole="button"
              accessibilityLabel="Spin to unlock a color"
              style={({ pressed }) => [styles.pointer, pressed && canSpin && styles.pointerPressed]}
            >
              <View
                style={[
                  styles.pointerTip,
                  { borderRightColor: canSpin ? "#ffffff" : "#f8f669" },
                ]}
              />
              <View
                style={[
                  styles.pointerBody,
                  { backgroundColor: canSpin ? "#ffffff" : "#f8f669" },
                ]}
              >
                <Text
                  style={[
                    styles.pointerText,
                    { color: canSpin ? "#1a1a1a" : "#000000" },
                  ]}
                >
                  SPIN
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    paddingTop: 14,
  },
  zoneDimmed: {
    opacity: 0.45,
  },
  label: {
    color: "#f2f2f2",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  controls: {
    flex: 1,
    // Fill the row's height (the wheel's), then center the SPIN button — the
    // only in-flow child — so its tip stays on the wheel's 3 o'clock line.
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    // Pull the pointer tip in against the wheel's rim.
    marginLeft: -10,
  },
  timer: {
    // Out of flow so its height can't push the button off-center: bottom edge
    // at the midline, lifted by half the button (24) + a 14 gap.
    position: "absolute",
    bottom: "50%",
    marginBottom: 38,
    color: "#8a8a8a",
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerReady: {
    color: "#f2f2f2",
  },
  pointer: {
    flexDirection: "row",
    alignItems: "center",
  },
  pointerPressed: {
    opacity: 0.8,
  },
  pointerTip: {
    width: 0,
    height: 0,
    borderTopWidth: 24,
    borderBottomWidth: 24,
    borderRightWidth: 18,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  pointerBody: {
    height: 48,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  pointerText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
  },
  emptyText: {
    flex: 1,
    color: "#9a9a9a",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
