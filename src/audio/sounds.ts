import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";

// Preloaded one-shot SFX (spec §6: preload all at app start, keep tiny, respect
// the mute toggle — muting is decided by the caller).
let tickPlayer: AudioPlayer | null = null;
let sparklePlayer: AudioPlayer | null = null;
let fanfarePlayer: AudioPlayer | null = null;

/**
 * Configure the audio session for a foreground-only fidget toy (spec §2: no
 * background priority). `shouldPlayInBackground: false` keeps the session from
 * staying alive when the app is switched away, and `mixWithOthers` means we
 * never grab audio focus from whatever else is playing. Call once at startup.
 */
export function configureAudioMode(): void {
  // Pass every field explicitly: on Android the JS shim forwards each key even
  // when omitted, so a missing `playsInSilentMode` arrives as `undefined` and
  // the native gate (playsInSilentMode || ringerMode == NORMAL) suppresses all
  // SFX whenever the ringer is on vibrate/silent. `true` keeps the toy audible
  // regardless of ringer state — the in-app mute toggle is the real control.
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: "mixWithOthers",
  }).catch(() => {
    // Audio-mode config is best-effort; the toy still works without it.
  });
}

/**
 * Pause every SFX player immediately. Used when the app backgrounds so any
 * in-flight sound (e.g. a fanfare tail) is cut on the same frame rather than
 * bleeding out over other apps.
 */
export function stopAllSounds(): void {
  for (const player of [tickPlayer, sparklePlayer, fanfarePlayer]) {
    if (!player) continue;
    try {
      player.pause();
    } catch {
      // A player mid-transition may reject pause(); harmless to ignore.
    }
  }
}

/** Create the players once, up front, so the first play has no load delay. */
export function preloadSounds(): void {
  if (!tickPlayer) {
    tickPlayer = createAudioPlayer(require("../../assets/sounds/tick.wav"));
    tickPlayer.volume = 0.9;
  }
  if (!sparklePlayer) {
    sparklePlayer = createAudioPlayer(require("../../assets/sounds/sparkle.wav"));
    sparklePlayer.volume = 0.6; // gentle — it plays often
  }
  if (!fanfarePlayer) {
    fanfarePlayer = createAudioPlayer(require("../../assets/sounds/fanfare.wav"));
    fanfarePlayer.volume = 0.8; // the rarest treat gets the most presence
  }
}

function replay(player: AudioPlayer | null): void {
  if (!player) return;
  // Seek to 0 then play so a finished clip replays from the top.
  player
    .seekTo(0)
    .then(() => player.play())
    .catch(() => {
      // A dropped SFX must never interrupt the toy.
    });
}

/** Play the prong-tick click. */
export function playTick(): void {
  if (!tickPlayer) preloadSounds();
  replay(tickPlayer);
}

/** Play the Randomize sparkle. */
export function playSparkle(): void {
  if (!sparklePlayer) preloadSounds();
  replay(sparklePlayer);
}

/** Play the unlock fanfare. */
export function playFanfare(): void {
  if (!fanfarePlayer) preloadSounds();
  replay(fanfarePlayer);
}
