import { type AudioPlayer, createAudioPlayer } from "expo-audio";

// Preloaded one-shot SFX (spec §6: preload all at app start, keep tiny, respect
// the mute toggle — muting is decided by the caller). The unlock fanfare joins
// these in M5.
let tickPlayer: AudioPlayer | null = null;
let sparklePlayer: AudioPlayer | null = null;

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
