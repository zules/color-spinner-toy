import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { playSparkle, playTick, preloadSounds } from "@/audio/sounds";
import { ColorsOverlay } from "@/components/colors-overlay";
import { ConfettiLayer } from "@/components/confetti-layer";
import { MutationChip } from "@/components/mutation-chip";
import { RandomizeSlot } from "@/components/randomize-slot";
import { SpinnerWheel } from "@/components/spinner-wheel";
import { WheelGlow } from "@/components/wheel-glow";
import { hexById } from "@/constants/palette";
import { useSaveState } from "@/hooks/use-save-state";
import { useSpinner } from "@/hooks/use-spinner";
import { describeChange } from "@/state/mutations";

export default function MainScreen() {
  const {
    save,
    toggleMute,
    toggleParticles,
    applyRandomize,
    forgetColor,
    beginUnlockSpin,
    unlockColor,
  } = useSaveState();
  const [colorsOpen, setColorsOpen] = useState(false);

  // Mute governs audio only; keep a live ref so the stable tick handler reads
  // it. Synced in an effect (not during render) — required with the React
  // Compiler enabled, and ticks only ever fire post-commit anyway.
  const mutedRef = useRef(false);
  useEffect(() => {
    mutedRef.current = save?.muted ?? false;
  }, [save?.muted]);

  useEffect(() => {
    preloadSounds();
  }, []);

  const onTick = useCallback((isTouch: boolean) => {
    if (!mutedRef.current) playTick();
    if (isTouch) Haptics.selectionAsync();
  }, []);

  const {
    rotation,
    velocity,
    gesture,
    spin,
    onWheelLayout,
    wheelSize,
    fieldWidth,
    fieldHeight,
  } = useSpinner(onTick);

  // A quick shake on each mutation (spec §5.4). RN view transform, outside the
  // Skia canvas, so it composes with the wheel's own rotation.
  const shakeX = useSharedValue(0);
  const wheelShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const [chip, setChip] = useState<{
    message: string;
    signal: number;
  } | null>(null);

  const onRandomize = useCallback(() => {
    const change = applyRandomize();
    if (!change) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 45 }),
      withTiming(8, { duration: 60 }),
      withTiming(-5, { duration: 50 }),
      withTiming(0, { duration: 45 }),
    );
    if (!mutedRef.current) playSparkle();
    setChip((c) => ({ message: describeChange(change), signal: (c?.signal ?? 0) + 1 }));
  }, [applyRandomize, shakeX]);

  const wheel = save?.wheel;
  const backgroundColor = wheel?.backgroundColorId
    ? hexById(wheel.backgroundColorId)
    : "#ffffff";
  const slices = wheel
    ? ([
        { color: hexById(wheel.slices[0].colorId), texture: wheel.slices[0].texture },
        { color: hexById(wheel.slices[1].colorId), texture: wheel.slices[1].texture },
        { color: hexById(wheel.slices[2].colorId), texture: wheel.slices[2].texture },
      ] as const)
    : null;
  const prongColor = wheel?.prongColorId ? hexById(wheel.prongColorId) : null;
  const glowColor = wheel?.glowColorId ? hexById(wheel.glowColorId) : null;
  const spiralColor = wheel?.spiralColorId ? hexById(wheel.spiralColorId) : null;

  // Confetti is tinted from the currently unlocked colors (radial-halo snowglobe
  // around the wheel). Memoised on the collection so unrelated re-renders don't
  // hand the layer a fresh array and churn its per-instance tints.
  const collection = save?.collection;
  const confettiColors = useMemo(
    () => (collection ?? []).map(hexById),
    [collection],
  );
  // Default on until the save resolves, so it never flashes "off" on launch.
  const particlesOn = save?.particlesOn ?? true;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setColorsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open colors"
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillText}>🎨  COLORS</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable
            onPress={toggleParticles}
            accessibilityRole="button"
            accessibilityLabel={
              particlesOn ? "Turn confetti off" : "Turn confetti on"
            }
            accessibilityState={{ selected: particlesOn }}
            style={({ pressed }) => [
              styles.iconButton,
              !particlesOn && styles.iconButtonOff,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Text style={styles.iconText}>✨</Text>
          </Pressable>
          <Pressable
            onPress={toggleMute}
            accessibilityRole="button"
            accessibilityLabel={save?.muted ? "Unmute" : "Mute"}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Text style={styles.iconText}>{save?.muted ? "🔇" : "🔊"}</Text>
          </Pressable>
        </View>
      </View>

      {save && (
        <View style={styles.randomizeRow}>
          <RandomizeSlot readyAt={save.randomizeReadyAt} onPress={onRandomize} />
        </View>
      )}

      <View style={styles.wheelArea} onLayout={onWheelLayout}>
        {/* Three stacked, absolutely-filled layers, painted back-to-front:
            glow (bottom) → confetti → wheel (top). All share the wheel-area
            frame, so the wheel centre is each canvas's centre. The glow gets
            its own full-height layer so the confetti sits on top of it and the
            blur isn't clipped by the square wheel canvas. */}
        {fieldWidth > 0 && wheelSize > 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <WheelGlow
              width={fieldWidth}
              height={fieldHeight}
              wheelRadius={wheelSize * 0.4}
              glowColor={glowColor}
            />
          </View>
        )}
        {particlesOn && fieldWidth > 0 && wheelSize > 0 && confettiColors.length > 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ConfettiLayer
              width={fieldWidth}
              height={fieldHeight}
              wheelRadius={wheelSize * 0.4}
              rotation={rotation}
              velocity={velocity}
              colors={confettiColors}
            />
          </View>
        )}
        {wheelSize > 0 && slices && wheel && (
          <Animated.View style={wheelShakeStyle}>
            <GestureDetector gesture={gesture}>
              <View style={{ width: wheelSize, height: wheelSize }}>
                <SpinnerWheel
                  size={wheelSize}
                  slices={slices}
                  edge={wheel.edge}
                  prongColor={prongColor}
                  spiralColor={spiralColor}
                  rotation={rotation}
                />
              </View>
            </GestureDetector>
          </Animated.View>
        )}
        <MutationChip chip={chip} />
      </View>

      {/* SPIN — adds a fresh spin impulse every press (spec §6). */}
      <Pressable
        onPress={spin}
        style={({ pressed }) => [
          styles.spinButton,
          pressed && styles.spinButtonPressed,
        ]}
      >
        <Text style={styles.spinText}>SPIN</Text>
      </Pressable>

      {save && (
        <ColorsOverlay
          visible={colorsOpen}
          onClose={() => setColorsOpen(false)}
          save={save}
          forgetColor={forgetColor}
          beginUnlockSpin={beginUnlockSpin}
          unlockColor={unlockColor}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingVertical: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pill: {
    borderWidth: 2,
    borderColor: "#1a1a1a",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pillPressed: {
    opacity: 0.6,
  },
  pillText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  // Confetti toggle in its off state — dimmed so it reads as inactive but
  // clearly still tappable.
  iconButtonOff: {
    opacity: 0.4,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  iconText: {
    fontSize: 18,
  },
  randomizeRow: {
    marginTop: 10,
    alignItems: "center",
  },
  wheelArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spinButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    height: 68,
    borderRadius: 18,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  spinButtonPressed: {
    opacity: 0.85,
  },
  spinText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 6,
  },
});
