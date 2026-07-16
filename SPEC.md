# Color Spinner Fidget Toy — Build Spec v1.0

*A color-wheel fidget: tap or flick to spin and watch colors blur; one button applies a random visual mutation; new colors unlock via a secondary wheel spin. A few minutes of entertainment, zero stakes, maximum juice.*

This document is the single source of truth for v1. It is written to be dropped into the repo root (as `SPEC.md`) and used as context for AI coding tools. Decisions marked **[ASSUMED]** were defaulted by the spec author and are cheap to change; everything else was explicitly decided.

Lo-fi wireframes are at `docs/wireframes/` and are in 3 webp files.

---

## 1. Why this project exists

The real deliverable is the **shipping pipeline**: Expo → EAS Build → Android signing → AAB → Play Console internal testing. The app is deliberately small so the pipeline lesson doesn't get buried. Scope discipline matters more than features: if a feature threatens to eject the managed workflow or balloon a milestone, cut the feature.

Design pillars, in priority order:

1. **Feel first.** The spin must feel physical and continuous. Any jank in rotation is a bug, not a polish item.
2. **Zero stakes.** No scores, no streaks, no fail states. Timers gate treats, never punish.
3. **Everything is a treat.** Unlocks, mutations, and ticks all get sound/haptic/particle juice.

## 2. Platform & constraints

- **Android only** for v1. No iOS build target, no tablet layouts.
- **Portrait only**, phone-first. Lock orientation in `app.json`.
- **Fully offline.** No accounts, no network calls, no analytics, no ads, no permissions beyond vibration.
- **Expo managed workflow** with TypeScript. Ejection is a scope failure, not an option. All chosen libraries (Reanimated, Gesture Handler, Skia, expo-haptics, expo-audio, AsyncStorage) work in the managed workflow and are available in Expo Go for development; create an EAS development build only if Expo Go becomes limiting.

## 3. Screens & states

The app is one screen plus one overlay. Wireframe references in parentheses.

### 3.1 Main screen (wireframes 1c, 1d)

- **Wheel**: a 3-slice pie, each slice an unlocked color with a texture (solid / marble / glitter). Three metallic prongs sit at the rim at 12, 4, and 8 o'clock, pointing inward. A soft glow/shadow sits behind the wheel.
- **SPIN button** (bottom, full width): applies a consistent, satisfying spin velocity every press. Always enabled; pressing mid-spin adds a fresh impulse.
- **Flick gesture** on the wheel: pan/fling drives rotation directly, including slow back-and-forth scrubbing. Release hands off the gesture's angular velocity to a decay animation. Both directions supported.
- **Randomize slot** (top center): shows a locked pill with a countdown (1c, e.g. `🔒 0:09`) during cooldown, and a bouncy `✦ Randomize!` button (1d) when ready. Pressing it applies one mutation (section 5) and restarts the 10-second cooldown.
- **COLORS button** (top left): opens the COLORS overlay.
- **Mute toggle** (top right): mutes all audio. Haptics stay on when muted **[ASSUMED]**. State persists.

### 3.2 COLORS overlay (wireframes 2a, 2b, 3a, 3b)

Dark-themed overlay (bottom sheet or full-screen modal — builder's choice) with three zones:

- **Collection grid**: 35 slots, 5×7. Unlocked colors render as tappable-looking swatches in unlock order, followed by `?` placeholders for each still-locked color (3a shows the day-one state: 3 unlocked, 32 `?`). Swatches in the grid are display-only in normal mode — equipping is not a thing; colors only reach the wheel via Randomize.
- **FORGET COLOR** (top left): toggles forget mode (2b). In forget mode a contextual instruction appears ("↑ choose a color to forget…"), unlocked swatches highlight, and everything else dims and disables. Tapping a swatch forgets it immediately (no confirm dialog — forgetting is low-stakes by design since the color returns to the unlock wheel). Forget mode exits after one forget, or via tapping FORGET COLOR again or the ✕.
- **SPIN TO UNLOCK**: a wheel whose slices are exactly the locked colors, in palette order, equal arc sizes (3a: 32 slices). A pointer/notch marks the winning position. The SPIN button next to it is enabled when the unlock cooldown has elapsed and at least one color is locked; during cooldown the whole zone dims and the timer counts down (3b, `2:59`). The wheel spins with a strong impulse plus a random offset, decays naturally, and **whatever slice the pointer rests on is the color you unlock** — the physics result is the outcome, no rigging, no rarity weighting. On settle: fanfare sound, reveal animation in the grid, slice removed from the unlock wheel, cooldown restarts at 3:00.

## 4. The color economy

- **Palette**: 35 curated colors defined in a constants file (`palette.ts`), each with a stable `id`, display color, and palette-order index. **[ASSUMED]** The first 3 palette entries are the starter colors; pick a pleasing trio.
- **Collection**: the set of unlocked color ids, stored in unlock order. Starts at 3.
- **Unlock**: one color per unlock-wheel spin, gated by a 3:00 cooldown.
- **Forget**: removes a color from the collection and returns it to the locked pool, so it reappears as a slice on the unlock wheel. This is the replayability loop — the unlock wheel never permanently runs dry unless the player chooses to unlock everything.
- **Floor of 1**: forgetting is disabled (swatches un-highlighted, or a gentle shake + message) when the collection is at 1. The randomize option must always have one color to work with.
- **Wheel invariant**: the main wheel, prongs, background, and glow may persist their colors even if the color is forgotten. If a forgotten color is currently displayed anywhere on the main screen, do not immediately re-roll those elements. Simply do not allow the colors to be rolled again.
- **All 35 unlocked**: the unlock wheel is empty; show a friendly state ("All colors unlocked — forget one to spin again") **[ASSUMED wording]**.

### Cooldowns

| Timer | Duration | Gates |
|---|---|---|
| Randomize | 10 seconds | Randomize button on main screen |
| Unlock spin | 3 minutes | SPIN in the COLORS overlay |

Both are **timestamp-based real elapsed time**: store `readyAt` (epoch ms) in AsyncStorage at the moment the action fires, and compare against `Date.now()` whenever the UI needs to render. No background timers, no libraries — a 1-second interval while the app is foregrounded drives the countdown display only. Time passing while the app is closed counts. Guardrail: on load, clamp `readyAt` to at most `now + duration` so a device-clock change can never lock the player out for hours; clock-cheating *forward* to skip cooldowns is fine — zero stakes **[ASSUMED]**.

## 5. Randomize

One press = exactly one mutation:

| # | Chance | Mutation | Effect |
|---|---|---|---|
| 1 | 35% | Slice color | One random slice → random unlocked color |
| 2 | 20% | Slice texture | One random slice → random texture from {solid, marble, glitter} |
| 3 | 15% | Background color | Screen background → random unlocked color |
| 4 | 5% | Circumference | Toggle wheel edge smooth ↔ lumpy; entering lumpy generates a fresh lump seed **[ASSUMED: toggle]** |
| 5 | 10% | Prong color | All 3 prongs' tint → random unlocked color **[ASSUMED: prongs change together]** |
| 6 | 15% | Glow color | Glow/shadow behind wheel → random unlocked color |

Algorithm:

1. Pick a mutation type according to chance in table above.
2. Pick the target value (slice index where applicable; color uniformly from the collection; texture uniformly from the three).
3. **No-op guard**: if the result equals the current value, re-roll the value. (Type 4 can never no-op.) Duplicate colors across different elements are fine — three identical slices is a legitimate, funny outcome. **[ASSUMED]** A mutation type that cannot change anything at all (e.g. one unlocked color that every candidate element already shows) is excluded from step 1's roll entirely and the remaining weights renormalize; viability is per element, so a slice still displaying a forgotten color remains a valid target (decided July 2026).
4. Animate the change with a minor visual shake, a disappearing chip sharing which element was changed, a distinct "randomize sparkle" sound.
5. Set `randomizeReadyAt = now + 10_000` and persist the new wheel state.

## 6. Spin feel, haptics, sound

- **Rotation model**: the wheel's rotation is ONE Reanimated `sharedValue` (radians or degrees, unbounded — don't wrap it; derive display angle with modulo). Flick: a pan gesture maps finger movement around the wheel center to rotation delta while active; on release, hand off to `withDecay` seeded with the gesture's angular velocity. SPIN button: `withDecay` seeded with a fixed velocity (add ±10% jitter so repeated presses don't feel canned) **[ASSUMED: jitter]**.
- **Prongs are cosmetic triggers, not physics flappers.** They do not slow the wheel. When any slice boundary crosses a prong position, fire a tick: `expo-haptics` selection/light impact + a short click sound. Detect crossings on the UI thread with `useAnimatedReaction` watching `floor(rotation / 120°)` (3 slice boundaries × 3 prongs = 9 tick positions per revolution but hit simultaneously in groups of 3 — compute with according parsimony), then `runOnJS` to fire haptic + sound. **Throttle**: enforce a minimum ~50ms between ticks so a fast spin doesn't spam the bridge; at blur speeds, dropped ticks are imperceptible.
- **Sounds (v1)**: prong tick (short click), randomize sparkle, unlock fanfare. No spin whoosh. Use **expo-audio** (expo-av is deprecated); preload all three at app start; respect the mute toggle. Keep files tiny (<100KB total).
- **Haptics**: tick on prong crossing, ONLY when wheel is touched directly, never with SPIN button.

## 7. Rendering & tech notes

- **@shopify/react-native-skia** draws the whole wheel inside one `Canvas`: slices as arc paths, textures as shaders, prongs as small paths on top, glow as a blurred/shadowed circle behind.
  - *Marble*: Skia turbulence/fractal noise shader blended into the slice color.
  - *Glitter*: high-frequency noise thresholded into sparkle dots over the slice color; no animation or shimmer.
  - *Metal prongs*: don't attempt real reflection. A grey linear gradient (the "metal") multiplied by a subtle tint derived from the average of the two adjacent slice colors reads as "adapts to nearby colors" at a fraction of the cost. When mutation #5 fires, that tint is replaced by the chosen unlocked color.
  - *Lumpy edge*: modulate the outer radius with low-frequency noise from the stored seed: `r(θ) = R + a · noise(θ, seed)`. Clip slices to the lumpy outline so the whole pie deforms together.
- **Jank rule #1**: never `setState` per animation frame. Rotation and everything derived from it (slice positions, tick detection) lives in Reanimated shared values / derived values feeding Skia directly. React re-renders only on discrete events (mutation applied, color unlocked, cooldown expired).
- **Reanimated / Gesture Handler**: use the versions bundled with your Expo SDK (`npx expo install`). Wrap the app in `GestureHandlerRootView`.
- **Unlock wheel** reuses the same rendering approach with n equal slices (n = locked count) and simpler fills (solid only).

## 8. Data model & persistence

All persistence via AsyncStorage, JSON-serialized. Persist on change (debounced), restore on launch. The full visual state survives restarts — the toy is exactly as you left it.

```ts
type TextureKind = 'solid' | 'marble' | 'glitter';

interface WheelState {
  slices: { colorId: string; texture: TextureKind }[]; // length 3
  prongColorId: string | null;   // null = default metal
  backgroundColorId: string | null;
  glowColorId: string | null;
  edge: { lumpy: boolean; seed: number };
}

interface SaveFile {
  version: 1;                      // migration guard
  collection: string[];            // unlocked color ids, unlock order
  wheel: WheelState;
  randomizeReadyAt: number;        // epoch ms
  unlockSpinReadyAt: number;       // epoch ms
  muted: boolean;
}
```

One storage key (`save.v1`) holding the whole object is simpler than per-field keys and is plenty fast at this size. Mid-flight rotation is *not* persisted; on settle nothing about rotation needs saving at all — only mutations and unlocks change the save file.

## 9. Edge cases & guardrails

- **Collection at floor (1)**: forget mode still opens but swatch taps are rejected with gentle feedback.
- **Forgetting a displayed color**: affected main-screen elements do not immediately re-roll.
- **Unlock wheel with 1 slice**: a spin animation would not be visually registered, so skip the spin and grant an instant unlock — guaranteed outcome is fine.
- **App killed mid-unlock-spin**: the cooldown timestamp is written when the spin *starts*, the collection update when it *settles*. If killed between, the player loses that spin's result but the cooldown stands.
- **Device clock moved backward**: `readyAt` clamped to `now + duration` on load.
- **Corrupt/missing save**: fall back to a fresh day-one state; never crash on parse.
- **Randomize spam at 0:00**: button disables the instant it fires; cooldown pill replaces it on the same frame.

## 10. Milestones

Each milestone ends in something runnable on a physical Android device.

- **M0 — Scaffold**: `create-expo-app` with TS, install deps via `npx expo install`, orientation locked, runs in expo dev client.
- **M1 — Static wheel**: Skia canvas draws 3 solid slices, 3 grey prongs, glow. Correct on multiple screen densities.
- **M2 — Motion**: rotation sharedValue, flick gesture with decay, SPIN button impulse. Verify 60fps with slow-frame overlay.
- **M3 — Ticks**: prong-crossing detection, haptics, tick sound, mute toggle.
- **M4 — Randomize**: all 6 mutations, no-op guard, 10s cooldown UI, save/restore wheel state.
- **M5 — Color economy**: COLORS overlay, grid, unlock wheel + landing logic, forget mode, 3:00 cooldown, floor of 1.
- **M6 — Shaders**: marble, glitter, metal-tint prongs, lumpy edge.
- **M7 — Juice pass**: particles, reveal/fanfare animations, sound polish, icon + splash.
- **M8 — Ship (the actual lesson)**: EAS Build config, Android keystore/signing via EAS, produce an AAB, Play Console internal testing track, invite testers.

Recommended order is as listed; M6 and M7 can swap. Nothing in M6–M7 blocks M8 — if shaders drag, ship solid-color v1 and patch.

## 11. Decision log

Explicitly decided (interview, July 2026): colors reach the main wheel **only via Randomize**; forgotten colors **return to the unlock wheel**; the unlock spin outcome is **whatever slice it physically lands on**; cooldowns are **real elapsed time** (timestamp-based); durations are **10s / 3:00** as wireframed; **full wheel state persists** across restarts; **Android only**; forget floor of **1**; v1 sounds are **prong ticks, randomize sparkle, unlock fanfare** (no whoosh). Decided during M5 (July 2026): **guaranteed-no-op mutation types are excluded from the Randomize roll** (weights renormalize over the viable set); after an unlock the winning color **holds under the pointer for 1.5s** before joining the grid, with the collection saved at landing.
