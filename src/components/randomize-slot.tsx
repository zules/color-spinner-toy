import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatCountdown, useCountdown } from "@/hooks/use-countdown";

export interface RandomizeSlotProps {
  /** Epoch ms when Randomize becomes available again. */
  readyAt: number;
  /** Apply one mutation (only called when ready). */
  onPress: () => void;
}

// Top-center slot (spec §3.1, wireframes 1c/1d): a locked countdown pill during
// cooldown, a Randomize button once ready. The full bouncy animation is M7.
export function RandomizeSlot({ readyAt, onPress }: RandomizeSlotProps) {
  const remaining = useCountdown(readyAt);
  const ready = remaining <= 0;

  if (ready) {
    return (
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
