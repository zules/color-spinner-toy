import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Spec §7: the whole app must sit inside a GestureHandlerRootView so the
// wheel's pan/fling gesture works. Reanimated 4's babel plugin is wired up
// automatically by babel-preset-expo, so no extra provider is needed here.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
