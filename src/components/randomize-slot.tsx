import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { formatCountdown, useCountdown } from "@/hooks/use-countdown";

export interface RandomizeSlotProps {
  /** Epoch ms when Randomize becomes available again. */
  readyAt: number;
  /** Apply one mutation (only called when ready). */
  onPress: () => void;
}

// Top-center slot (spec §3.1, wireframes 1c/1d): a locked countdown pill during
// cooldown, a bouncy Randomize button once ready. The idle bounce is a gentle
// periodic pop — enough to say "I'm a treat", quiet enough to ignore.
export function RandomizeSlot({ readyAt, onPress }: RandomizeSlotProps) {
  const remaining = useCountdown(readyAt);
  const ready = remaining <= 0;

  const scale = useSharedValue(1);
  useEffect(() => {
    if (!ready) return;
    scale.value = withRepeat(
      withSequence(
        withDelay(
          1200,
          withTiming(1.08, { duration: 120, easing: Easing.out(Easing.quad) }),
        ),
        withSpring(1, { damping: 7, stiffness: 260 }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(scale);
      scale.value = 1;
    };
  }, [ready, scale]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (ready) {
    return (
      <Animated.View style={bounceStyle}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Randomize"
          style={({ pressed }) => [
            styles.readyButton,
            pressed && styles.readyButtonPressed,
          ]}
        >
          <Text style={styles.readyText}>✦ Randomize!</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={styles.lockedPill} accessibilityLabel="Randomize locked">
      <Text style={styles.lockedText}>🔒 {formatCountdown(remaining)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readyButton: {
    alignSelf: "center",
    borderWidth: 2,
    borderColor: "#1a1a1a",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 9,
    backgroundColor: "#ffffff",
  },
  readyButtonPressed: {
    opacity: 0.7,
  },
  readyText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1a1a1a",
  },
  lockedPill: {
    alignSelf: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#9a9a9a",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  lockedText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#7a7a7a",
    letterSpacing: 1,
  },
});
