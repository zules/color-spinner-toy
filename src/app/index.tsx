import { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpinnerWheel } from "@/components/spinner-wheel";
import { PALETTE } from "@/constants/palette";

// M1 renders the day-one starter trio straight from the palette. Once the save
// file lands (M4+), slice colors come from persisted WheelState instead.
const STARTER_SLICE_COLORS: readonly [string, string, string] = [
  PALETTE[0].hex,
  PALETTE[1].hex,
  PALETTE[2].hex,
];

export default function MainScreen() {
  // The wheel is sized to the largest square that fits the middle area, so it
  // stays crisp and centered on any screen size / density.
  const [wheelSize, setWheelSize] = useState(0);

  const onWheelAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const next = Math.floor(Math.min(width, height));
    setWheelSize((prev) => (prev === next ? prev : next));
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header — static placeholders for M1. COLORS overlay + mute toggle
          get their behavior in later milestones (M3 mute, M5 colors). */}
      <View style={styles.header}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>🎨  COLORS</Text>
        </View>
        <View style={styles.iconButton}>
          <Text style={styles.iconText}>🔊</Text>
        </View>
      </View>

      <View style={styles.wheelArea} onLayout={onWheelAreaLayout}>
        {wheelSize > 0 && (
          <SpinnerWheel size={wheelSize} sliceColors={STARTER_SLICE_COLORS} />
        )}
      </View>

      {/* SPIN — static placeholder for M1; the impulse + flick gesture land in M2. */}
      <View style={styles.spinButton}>
        <Text style={styles.spinText}>SPIN</Text>
      </View>
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
  spinText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 6,
  },
});
