import { type AudioPlayer, createAudioPlayer } from "expo-audio";

// Preloaded one-shot SFX. Tick is the only sound in M3; the randomize sparkle
// and unlock fanfare join here in M4/M5 (spec §6: preload all at app start, keep
// tiny, respect the mute toggle). Muting is decided by the caller, not here.
let tickPlayer: AudioPlayer | null = null;

/** Create the players once, up front, so the first tick has no load delay. */
export function preloadSounds(): void {
  if (tickPlayer) return;
  tickPlayer = createAudioPlayer(require("../../assets/sounds/tick.wav"));
  tickPlayer.volume = 0.9;
}

/** Play the prong-tick click from the top. */
export function playTick(): void {
  if (!tickPlayer) preloadSounds();
  const p = tickPlayer;
  if (!p) return;
  // Restart from 0 each time; ticks are throttled well apart so the single
  // player never overlaps itself. Seek then play so a finished clip replays.
  p.seekTo(0)
    .then(() => p.play())
    .catch(() => {
      // A dropped tick must never interrupt the spin.
    });
}
