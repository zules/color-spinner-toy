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
  | "glow";

// What a mutation actually did, so the chip can name it specifically.
export type MutationChange =
  | { kind: "sliceColor"; slice: number; colorId: string }
  | { kind: "sliceTexture"; slice: number; texture: TextureKind }
  | { kind: "background"; colorId: string }
  | { kind: "edge"; lumpy: boolean }
  | { kind: "prongs"; colorId: string }
  | { kind: "glow"; colorId: string };

const WEIGHTS: [MutationKind, number][] = [
  ["sliceColor", 35],
  ["sliceTexture", 20],
  ["background", 15],
  ["edge", 5],
  ["prongs", 10],
  ["glow", 15],
];

const TEXTURES: TextureKind[] = ["solid", "marble", "glitter"];

function pickKind(): MutationKind {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [kind, w] of WEIGHTS) {
    acc += w;
    if (r < acc) return kind;
  }
  return "glow";
}

/** A color from the collection, re-rolled to differ from `exclude` (spec §5 no-op
 *  guard). With a single unlocked color the no-op is unavoidable and allowed. */
function randColor(collection: string[], exclude: string | null): string {
  if (collection.length === 0) return exclude ?? "";
  let c = collection[Math.floor(Math.random() * collection.length)];
  let guard = 0;
  while (c === exclude && guard++ < 20) {
    c = collection[Math.floor(Math.random() * collection.length)];
  }
  return c;
}

function randTexture(exclude: TextureKind): TextureKind {
  let t = TEXTURES[Math.floor(Math.random() * TEXTURES.length)];
  let guard = 0;
  while (t === exclude && guard++ < 20) {
    t = TEXTURES[Math.floor(Math.random() * TEXTURES.length)];
  }
  return t;
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
  const kind = pickKind();
  switch (kind) {
    case "sliceColor": {
      const slice = randSlice();
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
  }
}

/** Human message for the mutation chip, e.g. "Background changed to Teal". */
export function describeChange(c: MutationChange): string {
  switch (c.kind) {
    case "sliceColor":
      return `Slice changed to ${nameById(c.colorId)}`;
    case "sliceTexture":
      return `Texture changed to ${c.texture}`;
    case "background":
      return `Background changed to ${nameById(c.colorId)}`;
    case "edge":
      return c.lumpy ? "Edge went lumpy" : "Edge went smooth";
    case "prongs":
      return `Prongs changed to ${nameById(c.colorId)}`;
    case "glow":
      return `Glow changed to ${nameById(c.colorId)}`;
  }
}
