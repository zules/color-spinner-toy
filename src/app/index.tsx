import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpinnerWheel } from "@/components/spinner-wheel";
import { PALETTE } from "@/constants/palette";
import { useSpinner } from "@/hooks/use-spinner";

// M1 renders the day-one starter trio straight from the palette. Once the save
// file lands (M4+), slice colors come from persisted WheelState instead.
const STARTER_SLICE_COLORS: readonly [string, string, string] = [
  PALETTE[0].hex,
  PALETTE[1].hex,
  PALETTE[2].hex,
];

export default function MainScreen() {
  const { rotation, gesture, spin, onWheelLayout, wheelSize } = useSpinner();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header — static placeholders for M1/M2. COLORS overlay + mute toggle
          get their behavior in later milestones (M3 mute, M5 colors). */}
      <View style={styles.header}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>🎨  COLORS</Text>
        </View>
        <View style={styles.iconButton}>
          <Text style={styles.iconText}>🔊</Text>
        </View>
      </View>

      <View style={styles.wheelArea} onLayout={onWheelLayout}>
        {wheelSize > 0 && (
          <GestureDetector gesture={gesture}>
            <View style={{ width: wheelSize, height: wheelSize }}>
              <SpinnerWheel
                size={wheelSize}
                sliceColors={STARTER_SLICE_COLORS}
                rotation={rotation}
              />
            </View>
          </GestureDetector>
        )}
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
  iconText: {
    fontSize: 18,
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
