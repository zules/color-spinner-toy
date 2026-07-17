import {
  Atlas,
  Canvas,
  Group,
  RoundedRect,
  Skia,
  type SkColor,
  type SkRect,
  useRSXformBuffer,
  useTexture,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import {
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

// A 2D "snowglobe" of confetti around the spinner wheel. At rest the pieces
// drift inward and pile into a shimmering halo hugging the rim; a spin couples
// them to the disc surface and flings them outward, and when the spin decays
// the attraction reels them back in. Everything per-frame — integration and
// sprite transforms — runs on the UI thread (jank rule #1, spec §7): particle
// state lives in a Float32Array shared value mutated in place, and rendering
// is one Skia <Atlas> whose RSXforms are rebuilt by a Reanimated mapper. React
// re-renders only when props change.

// ---------------------------------------------------------------------------
// Tunables. Units: dp, seconds, radians. dp/s² for accelerations.
// ---------------------------------------------------------------------------

/** Confetti pieces in the globe. O(N) per frame, no pair collisions. */
const PARTICLE_COUNT = 200;
/** Fixed PRNG seed so the halo layout is stable across mounts. */
const SEED = 0x51ab5eed;

// Halo settle
/** Spring stiffness (1/s²) pulling each piece toward its own rest radius. */
const SPRING = 12;
/** Cap on the spring (dp/s²) → far-flung pieces feel a constant pull home. */
const PULL_MAX = 420;
/** Rest-band thickness (dp): pieces settle 0..REST_BAND outside the rim. */
const REST_BAND = 20;
/** Exponential velocity damping (1/s) — settles the halo, ends orbits. */
const DRAG = 0.02;
/** Shimmer acceleration (dp/s²) so the resting ring never looks frozen. */
const JITTER = 3;
/** How much the shimmer field turns with the wheel (per rad of rotation). */
const SHIMMER_FOLLOW = 0.35;

// Spin coupling
/** Wheel |rad/s| above which the rim also *flings* (below: drag-along only). */
const FLING_MIN = 2.5;
/** Distance (dp) beyond rim contact over which coupling fades to zero. */
const COUPLE_RANGE = 36;
/** Rate (1/s) at which rim-adjacent confetti chases the disc surface speed. */
const FRICTION = 1.5;
/** Cap (dp/s) on the surface speed confetti chases — keeps fast spins sane. */
const SURF_CAP = 480;
/** Outward push (dp/s² per rad/s above FLING_MIN) — the fling itself. */
const OUT_GAIN = 400;
/** Hard speed cap (dp/s); also guarantees no tunneling through the disc. */
const MAX_SPEED = 1500;

// Bounces
/** Restitution against the disc rim — mostly absorb, small bounce. */
const BOUNCE = 0.05;
/** Restitution against the canvas edges (soft field walls). */
const WALL_BOUNCE = 0.45;

// Flutter (each piece spinning on its own axis)
/** Baseline self-spin (rad/s) while resting in the halo. */
const FLUTTER_IDLE = 0.1;
/** Extra self-spin (rad/s) per dp/s of linear speed — tumbles when flung. */
const FLUTTER_GAIN = 0.0;

// Piece size (long edge, dp)
const SIZE_MIN = 7;
const SIZE_MAX = 9;

// ---------------------------------------------------------------------------
// Sprite sheet. One offscreen texture holds three white confetti strips of
// different aspect; each particle picks one and the Atlas tints it via
// per-instance colors with `modulate` (white ⊗ tint = tint, and modulate is
// commutative so it works whichever way drawAtlas orients src/dst). Art is
// drawn at 3× the on-screen size so downsampling keeps edges crisp.
// ---------------------------------------------------------------------------

const SPRITE_W = 63; // strip width in texture px; RSXform scales it to dp
const SPRITE_CORNER = 9;
const SPRITE_VARIANTS = [
  { y: 0, h: 39 }, // classic strip
  { y: 42, h: 27 }, // slim sliver
  { y: 72, h: 48 }, // chunky square-ish
] as const;
const TEX_W = SPRITE_W;
const TEX_H = 120; // variants stacked with 3px gaps against sampling bleed

// Per-particle static parameters, flat array with this stride. Read inside
// worklets, so plain numbers only.
const P_STRIDE = 9;
const PA_ANGLE = 0; // rest-band polar angle at first placement
const PA_BAND = 1; // 0..1 depth within the rest band
const PA_HALF = 2; // half of the piece's long edge (dp) — physics radius
const PA_COUPLE = 3; // rim-coupling variation, so the ring peels raggedly
const PA_FLUT = 4; // signed flutter rate multiplier
const PA_PHASE = 5; // shimmer phase offset
const PA_FREQ = 6; // shimmer angular frequency (rad/s)
const PA_SPIN0 = 7; // initial flutter angle
const PA_SPRH = 8; // sprite source height (texture px), for the RSXform pivot

// Dynamic state, Float32Array with this stride, mutated in place on the UI
// thread every frame.
const S_STRIDE = 5;
const SX = 0;
const SY = 1;
const SVX = 2;
const SVY = 3;
const SANG = 4; // flutter angle

// Same tiny seeded PRNG as spinner-wheel.tsx — all randomness is rolled once
// on the JS side; worklets only ever read the precomputed values (spec §7:
// no Math.random on the UI thread).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ConfettiLayerProps {
  /** Confetti canvas size in dp — it fills the wheel area. The wheel's center
   *  is the canvas center: (width/2, height/2). */
  width: number;
  height: number;
  /** Disc radius in dp (R = wheelSize * 0.4). Particles rest just OUTSIDE this
   *  and can never enter the disc. */
  wheelRadius: number;
  /** Unbounded wheel rotation in radians (UI-thread shared value). */
  rotation: SharedValue<number>;
  /** Wheel angular velocity in rad/s (UI-thread shared value). Sign = spin
   *  direction, magnitude = speed. This drives the outward fling. */
  velocity: SharedValue<number>;
  /** Hexes of the currently unlocked colors (non-empty). Confetti particles are
   *  tinted from these; may change at runtime as colors are unlocked/forgotten. */
  colors: string[];
}

export function ConfettiLayer({
  width,
  height,
  wheelRadius,
  rotation,
  velocity,
  colors,
}: ConfettiLayerProps) {
  // The white sprite sheet, rendered once offscreen and kept as a GPU texture.
  const texture = useTexture(
    <Group>
      {SPRITE_VARIANTS.map((v, i) => (
        <RoundedRect
          key={i}
          x={0}
          y={v.y}
          width={SPRITE_W}
          height={v.h}
          r={SPRITE_CORNER}
          color="white"
        />
      ))}
    </Group>,
    { width: TEX_W, height: TEX_H },
  );

  // Roll every per-particle constant once. `phys` feeds the worklets; the
  // sprite rects and tint rolls stay on the JS side.
  const statics = useMemo(() => {
    const rand = mulberry32(SEED);
    const phys: number[] = [];
    const spriteRects: SkRect[] = [];
    const tintU: number[] = []; // which unlocked color this piece takes
    const shadeU: number[] = []; // slight per-piece darkening for depth
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const variant =
        SPRITE_VARIANTS[Math.floor(rand() * SPRITE_VARIANTS.length)];
      phys.push(
        rand() * Math.PI * 2, // PA_ANGLE
        rand(), // PA_BAND
        (SIZE_MIN + rand() * (SIZE_MAX - SIZE_MIN)) / 2, // PA_HALF
        0.65 + rand() * 0.6, // PA_COUPLE
        (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.8), // PA_FLUT
        rand() * Math.PI * 2, // PA_PHASE
        3.5 + rand() * 6, // PA_FREQ (~0.6–1.5 Hz)
        rand() * Math.PI * 2, // PA_SPIN0
        variant.h, // PA_SPRH
      );
      spriteRects.push(Skia.XYWHRect(0, variant.y, SPRITE_W, variant.h));
      tintU.push(rand());
      shadeU.push(rand());
    }
    return { phys, spriteRects, tintU, shadeU };
    // PARTICLE_COUNT is a module constant, so this only rebuilds when the count
    // is edited — but listing it means a Fast Refresh after bumping the count
    // rebuilds these arrays instead of keeping the old (shorter) ones, which is
    // what otherwise caps the live-tunable count at its first-run value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PARTICLE_COUNT]);
  const phys = statics.phys;

  // Per-instance tints, re-derived whenever the unlocked set changes. Each
  // piece keeps its color *roll*, so unlocking a 4th color reshuffles tints
  // deterministically rather than randomly on every render.
  const atlasColors = useMemo<SkColor[]>(() => {
    const { tintU, shadeU } = statics;
    const out: SkColor[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const hex =
        colors.length > 0
          ? colors[Math.floor(tintU[i] * colors.length) % colors.length]
          : "#ffffff";
      const c = Skia.Color(hex);
      const k = 0.8 + 0.2 * shadeU[i];
      out.push(Float32Array.of(c[0] * k, c[1] * k, c[2] * k, 1));
    }
    return out;
  }, [colors, statics]);

  // Particle state buffer. Created lazily *inside* the frame worklet so the
  // Float32Array is a UI-runtime object we can mutate in place forever — no
  // per-frame serialization, no React involvement.
  const state = useSharedValue<Float32Array | null>(null);
  // Last seen width/height, packed — resizes re-clamp instead of resetting.
  const dims = useSharedValue(0);
  // Bumped once per physics step; the RSXform mapper below depends on it.
  const frameTick = useSharedValue(0);

  // The integrator. One pass over all particles per frame, pure UI-thread
  // math (spec §7). Reads rotation/velocity live from the spinner's shared
  // values — flick, scrub, and SPIN all arrive through that one channel.
  useFrameCallback((frame) => {
    "worklet";
    if (width <= 0 || height <= 0 || wheelRadius <= 0) return;
    const cx = width / 2;
    const cy = height / 2;
    const capR = Math.min(cx, cy); // inscribed radius — rest band must fit

    const key = Math.round(width) * 8192 + Math.round(height);
    let st = state.value;
    if (st === null || st.length !== PARTICLE_COUNT * S_STRIDE) {
      // First frame — or PARTICLE_COUNT changed under a Fast Refresh, which
      // leaves this shared value holding a buffer sized to the old count.
      // Rebuilding on a length mismatch is what lets the count grow past its
      // first-run value; place the halo already formed, like a toy at rest.
      st = new Float32Array(PARTICLE_COUNT * S_STRIDE);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = i * P_STRIDE;
        const s = i * S_STRIDE;
        const rad = phys[p + PA_HALF];
        const r0 = Math.max(
          Math.min(wheelRadius + rad + phys[p + PA_BAND] * REST_BAND, capR - rad),
          wheelRadius + rad,
        );
        const th = phys[p + PA_ANGLE];
        st[s + SX] = cx + r0 * Math.cos(th);
        st[s + SY] = cy + r0 * Math.sin(th);
        st[s + SANG] = phys[p + PA_SPIN0];
      }
      state.value = st;
      dims.value = key;
    } else if (dims.value !== key) {
      // Layout changed: pull everything inside the new walls, keep motion.
      dims.value = key;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const s = i * S_STRIDE;
        const rad = phys[i * P_STRIDE + PA_HALF];
        st[s + SX] = Math.min(Math.max(st[s + SX], rad), width - rad);
        st[s + SY] = Math.min(Math.max(st[s + SY], rad), height - rad);
      }
    }

    const dtMs = frame.timeSincePreviousFrame;
    // Ignore big dt (stall / background return) so forces can't explode —
    // same guard as use-spinner's velocity tracker.
    if (dtMs !== null && dtMs > 0 && dtMs < 64) {
      const dt = dtMs / 1000;
      const t = frame.timestamp / 1000;
      const drag = Math.exp(-DRAG * dt);
      const w = velocity.value;
      const aw = Math.abs(w);
      // The resting shimmer's phase field turns with the wheel, so a slow
      // scrub visibly stirs the halo even below the fling threshold.
      const spinPhase = rotation.value * SHIMMER_FOLLOW;
      // Disc surface speed at the rim, capped — what coupled confetti chases.
      const surf = Math.min(Math.max(w * wheelRadius, -SURF_CAP), SURF_CAP);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = i * P_STRIDE;
        const s = i * S_STRIDE;
        const rad = phys[p + PA_HALF];
        let px = st[s + SX];
        let py = st[s + SY];
        let vx = st[s + SVX];
        let vy = st[s + SVY];

        const dx = px - cx;
        const dy = py - cy;
        const r = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
        const nx = dx / r; // outward radial unit vector
        const ny = dy / r;
        const contactR = wheelRadius + rad;
        const restR = Math.max(
          Math.min(contactR + phys[p + PA_BAND] * REST_BAND, capR - rad),
          contactR + 1,
        );

        // 1. Radial settle: spring toward this piece's own rest radius,
        // clamped so a far fling feels a constant pull home, not a slingshot.
        // Per-particle rest radii are what make a *band*, not a 1px ring.
        const aRad = Math.min(
          Math.max(SPRING * (restR - r), -PULL_MAX),
          PULL_MAX,
        );
        let ax = nx * aRad;
        let ay = ny * aRad;

        // 2. Shimmer: a small rotating push per piece so the halo glimmers.
        const ja = phys[p + PA_PHASE] + t * phys[p + PA_FREQ] + spinPhase;
        ax += JITTER * Math.cos(ja);
        ay += JITTER * Math.sin(ja);

        // 3. Rim coupling, fading with distance from contact. Friction drags
        // rim-adjacent pieces toward the disc's surface velocity (this alone
        // makes slow scrubs shuffle the halo around, and doubles as grip that
        // stops residual sliding at ω≈0). Above FLING_MIN the rim also pushes
        // outward — the snowglobe burst. Direction comes from sign(w) via
        // `surf`; strength from |w| — faster spins throw farther.
        const prox = 1 - Math.min(Math.max((r - contactR) / COUPLE_RANGE, 0), 1);
        if (prox > 0) {
          const couple = phys[p + PA_COUPLE];
          const tv = surf * couple; // tangential target, unit tangent (-ny,nx)
          ax += FRICTION * prox * (-ny * tv - vx);
          ay += FRICTION * prox * (nx * tv - vy);
          if (aw > FLING_MIN) {
            const push = OUT_GAIN * (aw - FLING_MIN) * prox * couple;
            ax += nx * push;
            ay += ny * push;
          }
        }

        // Integrate (semi-implicit Euler), damp, cap.
        vx = (vx + ax * dt) * drag;
        vy = (vy + ay * dt) * drag;
        const sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > MAX_SPEED) {
          vx *= MAX_SPEED / sp;
          vy *= MAX_SPEED / sp;
        }
        px += vx * dt;
        py += vy * dt;

        // 4. Disc collision: clamp out of the disc and mostly absorb the
        // inward velocity so pieces pile against the rim instead of passing
        // through or bouncing off hard.
        const dx2 = px - cx;
        const dy2 = py - cy;
        const r2 = Math.max(Math.sqrt(dx2 * dx2 + dy2 * dy2), 0.001);
        if (r2 < contactR) {
          const n2x = dx2 / r2;
          const n2y = dy2 / r2;
          px = cx + n2x * contactR;
          py = cy + n2y * contactR;
          const vr = vx * n2x + vy * n2y;
          if (vr < 0) {
            vx -= (1 + BOUNCE) * vr * n2x;
            vy -= (1 + BOUNCE) * vr * n2y;
          }
        }

        // 5. Soft walls: clamp + damped reflect (only velocity aimed *into*
        // the wall), so nothing ever escapes and nothing sticks.
        if (px < rad) {
          px = rad;
          if (vx < 0) vx = -vx * WALL_BOUNCE;
        } else if (px > width - rad) {
          px = width - rad;
          if (vx > 0) vx = -vx * WALL_BOUNCE;
        }
        if (py < rad) {
          py = rad;
          if (vy < 0) vy = -vy * WALL_BOUNCE;
        } else if (py > height - rad) {
          py = height - rad;
          if (vy > 0) vy = -vy * WALL_BOUNCE;
        }

        // 6. Flutter: self-spin scaled by how fast the piece is moving —
        // tumbling mid-fling, lazily turning at rest.
        const speed = Math.sqrt(vx * vx + vy * vy);
        st[s + SANG] +=
          phys[p + PA_FLUT] * (FLUTTER_IDLE + FLUTTER_GAIN * speed) * dt;

        st[s + SX] = px;
        st[s + SY] = py;
        st[s + SVX] = vx;
        st[s + SVY] = vy;
      }
    }

    // Bump last so the RSXform mapper repaints this frame's positions.
    frameTick.value = frameTick.value + 1;
  });

  // Presentation: one RSXform per particle, rebuilt on the UI thread each
  // physics step and fed straight to the Atlas — React never sees a frame.
  const transforms = useRSXformBuffer(PARTICLE_COUNT, (xf, i) => {
    "worklet";
    // Reading the tick registers it as this mapper's input, re-running the
    // modifier once per physics step — the Float32Array itself is mutated in
    // place, which mappers can't observe. The guard never fires; the read is
    // the point.
    if (frameTick.value < 0) return;
    const st = state.value;
    if (st === null) {
      xf.set(0, 0, 0, 0); // zero scale → invisible until the first step
      return;
    }
    const p = i * P_STRIDE;
    const s = i * S_STRIDE;
    const scale = (phys[p + PA_HALF] * 2) / SPRITE_W; // texture px → dp
    const ang = st[s + SANG];
    const scos = scale * Math.cos(ang);
    const ssin = scale * Math.sin(ang);
    // RSXform rotates about the sprite's top-left corner; shift the
    // translation so the piece stays centred on its physics position.
    const ax = SPRITE_W / 2;
    const ay = phys[p + PA_SPRH] / 2;
    xf.set(
      scos,
      ssin,
      st[s + SX] - (scos * ax - ssin * ay),
      st[s + SY] - (ssin * ax + scos * ay),
    );
  });

  // `texture` is a SharedValue that starts null and populates after the
  // offscreen draw; Skia's drawAtlas already skips a null image, so no extra
  // gate is needed here beyond having a laid-out field and at least one color.
  const ready = width > 0 && height > 0 && wheelRadius > 0 && colors.length > 0;

  // pointerEvents: "none" so the canvas never steals the wheel's pan gesture —
  // it's a purely decorative layer behind the wheel.
  return (
    <Canvas style={{ width, height, pointerEvents: "none" }}>
      {ready && (
        <Atlas
          image={texture}
          sprites={statics.spriteRects}
          transforms={transforms}
          colors={atlasColors}
          colorBlendMode="modulate"
        />
      )}
    </Canvas>
  );
}
