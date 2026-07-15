import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export interface MutationChipProps {
  /** The last mutation's message; `signal` is a nonce that re-triggers it. */
  chip: { message: string; signal: number } | null;
}

// A little pill naming exactly what a Randomize just changed (e.g. "Background
// changed to Teal"), lingering ~3s before fading (spec §5.4). Full particle
// juice is the M7 pass.
export function MutationChip({ chip }: MutationChipProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const signal = chip?.signal ?? 0;

  useEffect(() => {
    if (signal === 0) return;
    opacity.value = 0;
    translateY.value = 6;
    // ~160ms in, hold, ~400ms out ≈ 3s total.
    opacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(2440, withTiming(0, { duration: 400 })),
    );
    translateY.value = withTiming(-10, { duration: 3000 });
  }, [signal, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!chip) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Animated.View style={[styles.pill, style]}>
        <Text style={styles.text}>✦ {chip.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  pill: {
    backgroundColor: "rgba(26,26,26,0.92)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  text: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
