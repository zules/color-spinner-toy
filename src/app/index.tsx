import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { MutationChip } from "@/components/mutation-chip";
import { RandomizeSlot } from "@/components/randomize-slot";
import { SpinnerWheel } from "@/components/spinner-wheel";
import { hexById } from "@/constants/palette";
import { useSaveState } from "@/hooks/use-save-state";
import { useSpinner } from "@/hooks/use-spinner";
import { describeChange } from "@/state/mutations";

export default function MainScreen() {
  const {
    save,
    toggleMute,
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

  const { rotation, gesture, spin, onWheelLayout, wheelSize } =
    useSpinner(onTick);

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

      {save && (
        <View style={styles.randomizeRow}>
          <RandomizeSlot readyAt={save.randomizeReadyAt} onPress={onRandomize} />
        </View>
      )}

      <View style={styles.wheelArea} onLayout={onWheelLayout}>
        {wheelSize > 0 && slices && wheel && (
          <Animated.View style={wheelShakeStyle}>
            <GestureDetector gesture={gesture}>
              <View style={{ width: wheelSize, height: wheelSize }}>
                <SpinnerWheel
                  size={wheelSize}
                  slices={slices}
                  edge={wheel.edge}
                  prongColor={prongColor}
                  glowColor={glowColor}
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
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
