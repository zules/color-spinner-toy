import { Ionicons } from "@expo/vector-icons";
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface ContentWarningProps {
  /** Shown on every cold boot until the player acknowledges (spec: not
   *  persisted — the gate reappears each launch by design). */
  visible: boolean;
  /** Player tapped "I Understand, Continue". */
  onContinue: () => void;
}

// A blocking photosensitivity / motion warning gate shown at app start. Dark,
// full-screen, and dismissable only by continuing or exiting — the toy behind
// stays untouchable until then.
export function ContentWarning({ visible, onContinue }: ContentWarningProps) {
  // Android: leave without consenting closes the app. Both the hardware back
  // button and the Exit button route here.
  const exit = () => {
    BackHandler.exitApp();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={exit}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Ionicons
            name="warning"
            size={56}
            color="#f5c518"
            style={styles.icon}
          />
          <Text style={styles.title}>Content Warning</Text>
          <Text style={styles.body}>
            This app contains rapidly flashing colors and spinning, mesmerizing
            visual patterns.
          </Text>
          <Text style={styles.body}>
            If you are sensitive to strobing lights, flashing colors, or
            repetitive motion — including anyone with photosensitive epilepsy,
            migraines, or vestibular disorders — please use caution or avoid
            this app.
          </Text>
          <Text style={styles.body}>
            If you experience dizziness, nausea, disorientation, or discomfort
            at any point, stop using the app immediately.
          </Text>
        </ScrollView>

        <View style={styles.buttons}>
          <Pressable
            onPress={exit}
            accessibilityRole="button"
            accessibilityLabel="Exit app"
            style={({ pressed }) => [
              styles.button,
              styles.exitButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.exitText}>Exit App</Text>
          </Pressable>
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="I understand, continue"
            style={({ pressed }) => [
              styles.button,
              styles.continueButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.continueText}>I Understand, Continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1d1d20",
    paddingHorizontal: 24,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 28,
    gap: 14,
  },
  icon: {
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 4,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#d4d4d6",
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 58,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  exitButton: {
    borderWidth: 2,
    borderColor: "#6a6a6e",
  },
  exitText: {
    color: "#e6e6e6",
    fontSize: 15,
    fontWeight: "700",
  },
  continueButton: {
    flex: 1,
    backgroundColor: "#f2f2f2",
  },
  continueText: {
    color: "#1d1d20",
    fontSize: 15,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.65,
  },
});
