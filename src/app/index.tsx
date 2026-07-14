import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// M0 placeholder. The Skia wheel, SPIN button, and Randomize slot land in M1+.
// This screen only exists to prove the scaffold boots inside the dev client.
export default function MainScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Color Spinner</Text>
        <Text style={styles.subtitle}>M0 · scaffold ready</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 14,
    color: "#8a8a8a",
    letterSpacing: 0.5,
  },
});
