import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Spec §7: the whole app must sit inside a GestureHandlerRootView so the
// wheel's pan/fling gesture works. Reanimated 4's babel plugin is wired up
// automatically by babel-preset-expo, so no extra provider is needed here.
// The StatusBar lives on the main screen, where it can adapt its icon colour
// to the (randomizable) background — see MainScreen.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
