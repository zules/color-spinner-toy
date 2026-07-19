import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { playFanfare } from "@/audio/sounds";
import { CollectionGrid } from "@/components/collection-grid";
import { UNLOCK_REVEAL_PAUSE_MS, UnlockWheel } from "@/components/unlock-wheel";
import { PALETTE } from "@/constants/palette";
import type { SaveFile } from "@/state/save";

export interface ColorsOverlayProps {
  visible: boolean;
  onClose: () => void;
  save: SaveFile;
  /** Remove a color from the collection; false = refused (floor of 1). */
  forgetColor: (colorId: string) => boolean;
  /** Stamp the unlock cooldown (called at spin start — spec §9). */
  beginUnlockSpin: () => void;
  /** Append a freshly unlocked color to the collection. */
  unlockColor: (colorId: string) => void;
}

const NOTICE_MS = 1800;

// The COLORS overlay (spec §3.2, wireframes 2a/2b/3a/3b): dark full-screen
// modal with the collection grid, forget mode, and the spin-to-unlock zone.
export function ColorsOverlay({
  visible,
  onClose,
  save,
  forgetColor,
  beginUnlockSpin,
  unlockColor,
}: ColorsOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [forgetMode, setForgetMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [justUnlockedId, setJustUnlockedId] = useState<string | null>(null);
  // A just-landed unlock: already in the collection (saved), but held out of
  // the grid until the wheel's reveal pause elapses.
  const [pendingUnlockId, setPendingUnlockId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Locked colors in palette order — the unlock wheel's slices (spec §3.2).
  const lockedColors = useMemo(
    () => PALETTE.filter((c) => !save.collection.includes(c.id)),
    [save.collection],
  );

  // What the grid shows: a pending unlock stays a `?` until the pause ends.
  const gridCollection = useMemo(
    () =>
      pendingUnlockId
        ? save.collection.filter((id) => id !== pendingUnlockId)
        : save.collection,
    [save.collection, pendingUnlockId],
  );

  const flashNotice = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const handleClose = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setForgetMode(false);
    setNotice(null);
    setJustUnlockedId(null);
    setPendingUnlockId(null); // already saved — reopening shows it, sans pop
    onClose();
  }, [onClose]);

  // Forget-mode tap: one forget then exit (spec §3.2); refusal shakes upstream.
  const handleForget = useCallback(
    (colorId: string): boolean => {
      if (!forgetColor(colorId)) {
        flashNotice("that's your last color — it stays!");
        return false;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setForgetMode(false);
      return true;
    },
    [forgetColor, flashNotice],
  );

  // Physics said this color — commit + fanfare at the landing, then let the
  // reveal pause play out before the swatch pops into the grid.
  const handleUnlock = useCallback(
    (colorId: string) => {
      unlockColor(colorId); // saved before the pause — a kill mid-pause keeps it
      setPendingUnlockId(colorId);
      if (!save.muted) playFanfare();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => {
        setPendingUnlockId(null);
        setJustUnlockedId(colorId);
      }, UNLOCK_REVEAL_PAUSE_MS);
    },
    [unlockColor, save.muted],
  );

  const wheelSize = Math.min(Math.round(width * 0.55), 240);
  const instruction = notice ?? (forgetMode ? "↑ choose a color to forget…" : "");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 6 },
        ]}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setForgetMode((m) => !m)}
              accessibilityRole="button"
              accessibilityLabel="Forget color"
              accessibilityState={{ selected: forgetMode }}
              style={({ pressed }) => [
                styles.forgetButton,
                forgetMode && styles.forgetButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.forgetText,
                  forgetMode && styles.forgetTextActive,
                ]}
              >
                FORGET COLOR
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close colors"
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Contextual line: forget-mode instruction (wireframe 2b) or a
              transient notice. Height is reserved so the grid never jumps. */}
          <Text style={styles.instruction}>{instruction}</Text>

          <CollectionGrid
            collection={gridCollection}
            forgetMode={forgetMode}
            justUnlockedId={justUnlockedId}
            onForget={handleForget}
          />

          <View style={styles.divider} />

          {/* Forget mode dims and disables everything but the grid (2b). */}
          <View
            pointerEvents={forgetMode ? "none" : "auto"}
            style={forgetMode && styles.zoneDisabled}
          >
            <UnlockWheel
              lockedColors={lockedColors}
              readyAt={save.unlockSpinReadyAt}
              size={wheelSize}
              onSpinStart={beginUnlockSpin}
              onUnlock={handleUnlock}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
  },
  sheet: {
    flex: 1,
    backgroundColor: "#1d1d20",
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  forgetButton: {
    borderWidth: 2,
    borderColor: "#f2f2f2",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  forgetButtonActive: {
    backgroundColor: "#f2f2f2",
  },
  forgetText: {
    color: "#f2f2f2",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
  forgetTextActive: {
    color: "#1d1d20",
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#f2f2f2",
    fontSize: 18,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.6,
  },
  instruction: {
    color: "#c9c9c9",
    fontSize: 14,
    marginTop: 10,
    marginBottom: 8,
    minHeight: 18,
  },
  divider: {
    borderWidth: 1,
    borderColor: "#4a4a4e",
    borderStyle: "dashed",
    borderRadius: 1,
    height: 1,
    marginTop: 16,
    marginBottom: 2,
  },
  zoneDisabled: {
    opacity: 0.35,
  },
});
