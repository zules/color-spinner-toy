import { nameById } from "@/constants/palette";
import type { TextureKind, WheelState } from "@/state/save";

// The six Randomize mutations and their chances (spec §5). One press = exactly
// one mutation. Weights sum to 100.
export type MutationKind =
  | "sliceColor"
  | "sliceTexture"
  | "background"
  | "edge"
  | "prongs"
  | "glow"
  | "spiral";

// What a mutation actually did, so the chip can name it specifically.
export type MutationChange =
  | { kind: "sliceColor"; slice: number; colorId: string }
  | { kind: "sliceTexture"; slice: number; texture: TextureKind }
  | { kind: "background"; colorId: string }
  | { kind: "edge"; lumpy: boolean }
  | { kind: "prongs"; colorId: string }
  | { kind: "glow"; colorId: string }
  | { kind: "spiral"; colorId: string | null }; // null = spiral removed

// Weights are relative — pickKind normalizes over the viable set, so they
// don't need to sum to 100 (they sum to 110 with the spiral row).
const WEIGHTS: [MutationKind, number][] = [
  ["sliceColor", 35],
  ["sliceTexture", 20],
  ["background", 15],
  ["edge", 5],
  ["prongs", 10],
  ["glow", 15],
  ["spiral", 10],
];

const TEXTURES: TextureKind[] = ["solid", "marble", "glitter"];

/** Can `current` be changed to something else from the collection? */
function hasAlternative(collection: string[], current: string | null): boolean {
  return collection.some((id) => id !== current);
}

// A kind may only roll if it can actually change something right now — a
// guaranteed no-op (e.g. one unlocked color and the element already shows it)
// is not a valid randomization. Checked per element, not per collection size:
// a slice still displaying a forgotten color is a real target even when only
// one color is unlocked. sliceTexture and edge always have an alternative, so
// the viable set is never empty.
function viableKinds(
  wheel: WheelState,
  collection: string[],
): [MutationKind, number][] {
  return WEIGHTS.filter(([kind]) => {
    switch (kind) {
      case "sliceColor":
        return wheel.slices.some((s) => hasAlternative(collection, s.colorId));
      case "background":
        return hasAlternative(collection, wheel.backgroundColorId);
      case "prongs":
        return hasAlternative(collection, wheel.prongColorId);
      case "glow":
        return hasAlternative(collection, wheel.glowColorId);
      case "spiral":
        // Extant spirals can always be removed; absent ones can always
        // appear (the collection is never empty) — so always viable.
        return (
          wheel.spiralColorId !== null ||
          hasAlternative(collection, wheel.spiralColorId)
        );
      default: // sliceTexture, edge
        return true;
    }
  });
}

// Weighted pick among the viable kinds — dropping a non-viable kind implicitly
// renormalizes the remaining weights (spec §5 chances apply when all six are
// in play, which is the normal case with two or more colors unlocked).
function pickKind(wheel: WheelState, collection: string[]): MutationKind {
  const kinds = viableKinds(wheel, collection);
  const total = kinds.reduce((sum, [, w]) => sum + w, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const [kind, w] of kinds) {
    acc += w;
    if (r < acc) return kind;
  }
  return kinds[kinds.length - 1][0];
}

/** A color from the collection, drawn from a pool that excludes the current
 *  value — the spec §5 no-op guard, exact by construction rather than
 *  re-rolled. Only a single-color collection can still no-op (unavoidable
 *  and allowed: the target has no alternative). */
function randColor(collection: string[], exclude: string | null): string {
  const pool =
    exclude === null ? collection : collection.filter((id) => id !== exclude);
  if (pool.length === 0) return exclude ?? "";
  return pool[Math.floor(Math.random() * pool.length)];
}

function randTexture(exclude: TextureKind): TextureKind {
  const pool = TEXTURES.filter((t) => t !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function randSlice(): number {
  return Math.floor(Math.random() * 3);
}

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export interface MutationOutcome {
  wheel: WheelState;
  change: MutationChange;
}

// Apply exactly one mutation to a WheelState, returning a fresh state plus a
// description of what changed. Colors come uniformly from the collection;
// duplicate colors across elements are fine (spec §5).
export function applyMutation(
  wheel: WheelState,
  collection: string[],
): MutationOutcome {
  const kind = pickKind(wheel, collection);
  switch (kind) {
    case "sliceColor": {
      // Target only slices that can change — with two or more colors unlocked
      // that's all three; with one it's just slices showing something else.
      const targets = wheel.slices
        .map((_, idx) => idx)
        .filter((idx) => hasAlternative(collection, wheel.slices[idx].colorId));
      const slice = targets[Math.floor(Math.random() * targets.length)];
      const colorId = randColor(collection, wheel.slices[slice].colorId);
      const slices = wheel.slices.map((s, idx) =>
        idx === slice ? { ...s, colorId } : s,
      );
      return { wheel: { ...wheel, slices }, change: { kind, slice, colorId } };
    }
    case "sliceTexture": {
      const slice = randSlice();
      const texture = randTexture(wheel.slices[slice].texture);
      const slices = wheel.slices.map((s, idx) =>
        idx === slice ? { ...s, texture } : s,
      );
      return { wheel: { ...wheel, slices }, change: { kind, slice, texture } };
    }
    case "background": {
      const colorId = randColor(collection, wheel.backgroundColorId);
      return {
        wheel: { ...wheel, backgroundColorId: colorId },
        change: { kind, colorId },
      };
    }
    case "edge": {
      // Toggle smooth ↔ lumpy; entering lumpy makes a fresh seed. Never a no-op.
      const lumpy = !wheel.edge.lumpy;
      return {
        wheel: {
          ...wheel,
          edge: { lumpy, seed: lumpy ? newSeed() : wheel.edge.seed },
        },
        change: { kind, lumpy },
      };
    }
    case "prongs": {
      const colorId = randColor(collection, wheel.prongColorId);
      return {
        wheel: { ...wheel, prongColorId: colorId },
        change: { kind, colorId },
      };
    }
    case "glow": {
      const colorId = randColor(collection, wheel.glowColorId);
      return {
        wheel: { ...wheel, glowColorId: colorId },
        change: { kind, colorId },
      };
    }
    case "spiral": {
      // Absent → appears. Extant → 50/50 recolor vs remove, except removal
      // is forced when the collection offers no alternative color (a recolor
      // would be a guaranteed no-op).
      const extant = wheel.spiralColorId !== null;
      const canRecolor = hasAlternative(collection, wheel.spiralColorId);
      if (extant && (!canRecolor || Math.random() < 0.5)) {
        return {
          wheel: { ...wheel, spiralColorId: null },
          change: { kind, colorId: null },
        };
      }
      const colorId = randColor(collection, wheel.spiralColorId);
      return {
        wheel: { ...wheel, spiralColorId: colorId },
        change: { kind, colorId },
      };
    }
  }
}

/** Human message for the mutation chip, e.g. "Background changed to Teal".
 *  Slice messages name the target (1–3) — with duplicate slice colors on the
 *  wheel, an unnumbered "Slice changed to Pink" is indistinguishable from a
 *  no-op even when a different slice genuinely changed. */
export function describeChange(c: MutationChange): string {
  switch (c.kind) {
    case "sliceColor":
      return `Slice ${c.slice + 1} changed to ${nameById(c.colorId)}`;
    case "sliceTexture":
      return `Slice ${c.slice + 1} texture changed to ${c.texture}`;
    case "background":
      return `Background changed to ${nameById(c.colorId)}`;
    case "edge":
      return c.lumpy ? "Edge went lumpy" : "Edge went smooth";
    case "prongs":
      return `Prongs changed to ${nameById(c.colorId)}`;
    case "glow":
      return `Glow changed to ${nameById(c.colorId)}`;
    case "spiral":
      return c.colorId
        ? `Spiral changed to ${nameById(c.colorId)}`
        : "Spiral vanished!";
  }
}
