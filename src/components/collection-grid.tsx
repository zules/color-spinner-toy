import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { hexById, nameById, PALETTE } from "@/constants/palette";

export interface CollectionGridProps {
  /** Unlocked color ids in unlock order (spec §3.2: grid shows these first,
   *  then a `?` placeholder per still-locked color). */
  collection: readonly string[];
  /** Forget mode: unlocked swatches highlight, everything else dims. */
  forgetMode: boolean;
  /** The id just unlocked this session — its swatch gets a reveal pop. */
  justUnlockedId: string | null;
  /** Forget-mode tap. Returns false when refused (floor of 1) → gentle shake. */
  onForget: (colorId: string) => boolean;
}

const COLUMNS = 7; // 35 slots, 7×5 (wireframes 2a/3a)
const GAP = 8;

// One unlocked swatch. Display-only in normal mode; in forget mode it
// highlights and taps it — a refused forget (floor of 1) shakes it instead.
function Swatch({
  id,
  cell,
  forgetMode,
  reveal,
  onForget,
}: {
  id: string;
  cell: number;
  forgetMode: boolean;
  reveal: boolean;
  onForget: (colorId: string) => boolean;
}) {
  const shakeX = useSharedValue(0);
  // Reveal pop, hand-rolled: a freshly unlocked swatch mounts at scale 0 and
  // springs up. Deliberately NOT a Reanimated `entering` layout animation —
  // those run native view-lifecycle machinery that is crash-prone inside RN
  // Modals on the new architecture; a plain shared-value spring is safe.
  const scale = useSharedValue(reveal ? 0 : 1);
  useEffect(() => {
    if (reveal) scale.value = withSpring(1, { damping: 13, stiffness: 150 });
  }, [reveal, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: scale.value }],
  }));

  const press = () => {
    if (onForget(id)) return;
    // Floor of 1: gentle shake, no dialog (spec §9).
    shakeX.value = withSequence(
      withTiming(-4, { duration: 40 }),
      withTiming(4, { duration: 55 }),
      withTiming(-3, { duration: 45 }),
      withTiming(0, { duration: 40 }),
    );
  };

  return (
    <Animated.View style={animStyle}>
      <Pressable
        disabled={!forgetMode}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={
          forgetMode ? `Forget ${nameById(id)}` : nameById(id)
        }
        style={[
          styles.swatch,
          { width: cell, height: cell, backgroundColor: hexById(id) },
          forgetMode && styles.swatchForget,
        ]}
      />
    </Animated.View>
  );
}

// The 35-slot collection grid (spec §3.2): unlocked swatches in unlock order,
// then `?` tiles for every still-locked color.
export function CollectionGrid({
  collection,
  forgetMode,
  justUnlockedId,
  onForget,
}: CollectionGridProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(Math.floor(e.nativeEvent.layout.width));

  const cell = Math.floor((width - (COLUMNS - 1) * GAP) / COLUMNS);
  const lockedCount = PALETTE.length - collection.length;

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {cell > 0 && (
        <>
          {collection.map((id) => (
            <Swatch
              key={id}
              id={id}
              cell={cell}
              forgetMode={forgetMode}
              reveal={id === justUnlockedId}
              onForget={onForget}
            />
          ))}
          {Array.from({ length: lockedCount }, (_, i) => (
            <View
              key={`locked-${i}`}
              style={[
                styles.placeholder,
                { width: cell, height: cell },
                forgetMode && styles.placeholderDimmed,
              ]}
            >
              <Text style={styles.placeholderText}>?</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  swatch: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  swatchForget: {
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
  placeholder: {
    borderRadius: 10,
    backgroundColor: "#2a2a2c",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderDimmed: {
    opacity: 0.35,
  },
  placeholderText: {
    color: "#6a6a6a",
    fontSize: 16,
    fontWeight: "700",
  },
});
