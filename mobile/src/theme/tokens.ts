/**
 * Design tokens — ART-01 / ART-02.
 *
 * **Measured, not chosen.** design.md §12 says the palette falls out of
 * SPIKE-01 output, so these hex values were sampled from the four generated
 * illustrations in `spike-results/spike-01/` (48×48 downsample, quantised,
 * ranked by share of pixels). The shell therefore matches the artwork by
 * construction rather than by eye.
 *
 * The earlier provisional guess (#151B3B) was both too dark and too blue —
 * the illustrations actually sit on #2C2C4D, which is 34% of all pixels.
 *
 * WCAG AA verified against the grounds below (see §Contrast). Recheck if the
 * palette changes: this is a bedtime app read in a dark room by a tired adult,
 * so contrast failures are not cosmetic.
 */

/* --------------------------------- palette --------------------------------- */
/** Sampled from SPIKE-01 output. Comment shows share of sampled pixels. */
export const palette = {
  ground: '#2C2C4D', // 34.4% — the dominant night ground
  groundDeep: '#212C42', //  1.2% — darker pocket, used for the progressive dim
  groundBlue: '#2C3758', //  6.6% — cooler variant
  raised: '#42426E', //  1.8% — cards, raised surfaces
  cloud: '#9AA5D1', //  3.0% — cloud / periwinkle, the primary accent
  cloudDim: '#8F9AC6', //  1.6% — receded cloud
  moon: '#F2D18F', //  0.9% — moon gold, the warm accent
  textPrimary: '#FFFFFF',
  textMuted: '#B8C0E0',
  slipper: '#D4574A', // the red slipper — sparingly, for a single hot accent
  /**
   * Screen-off ground. Darker than any register background: §8's mode exists
   * to remove light from a dark room, so it should not glow the same as the
   * player. Not pure black — an OLED cutting to #000 reads as a fault rather
   * than as settling.
   */
  screenOff: '#0B0E1A',
} as const;

/* -------------------------------- registers -------------------------------- */
/**
 * design.md §5 — two registers. Keep them separate from day one; the
 * progressive dim (CLI-22) is the *transition between them*, not an effect
 * bolted on afterwards.
 */

/**
 * Both registers implement the same shape so they are genuinely
 * interchangeable — a screen swaps register without changing a line of style
 * code, which is what makes the progressive dim a transition rather than a
 * rewrite.
 */
export type RegisterTokens = {
  background: string;
  surface: string;
  accent: string;
  accentWarm: string;
  text: string;
  textMuted: string;
};

/** Parent choosing. Bright, friendly, higher contrast. S-01/02/09/16. */
export const shell: RegisterTokens = {
  background: palette.ground,
  surface: palette.raised,
  accent: palette.cloud,
  accentWarm: palette.moon,
  text: palette.textPrimary,
  textMuted: palette.textMuted,
};

/**
 * Child falling asleep. Dim, warm, low contrast. S-03.
 *
 * Deliberately less colourful than the shell — §5 wants the player quieter,
 * so `accent` and `accentWarm` collapse onto the same gold rather than
 * introducing a second hue the child's eye can catch.
 */
export const player: RegisterTokens = {
  background: palette.groundDeep,
  surface: palette.ground,
  accent: palette.moon,
  accentWarm: palette.moon,
  text: palette.textMuted,
  textMuted: palette.cloudDim,
};

/* --------------------------------- contrast -------------------------------- */
/**
 * Measured WCAG ratios on `palette.ground` (#2C2C4D):
 *   white       13.34  AA body
 *   textMuted    7.40  AA body
 *   cloud        5.51  AA body
 *   moon         9.08  AA body
 *   cloudDim     4.83  AA body
 *
 * On `palette.raised` (#42426E), `cloud` (3.88) and `cloudDim` (3.40) drop to
 * **large-text only**. Do not put body copy in those two on a raised surface —
 * use `textMuted` or `moon` instead.
 */
export const CONTRAST_NOTE = 'cloud/cloudDim are large-text-only on `raised`';

/* ------------------------------- type scale -------------------------------- */
/**
 * 1.22 from an **18pt** base, not the usual 16.
 *
 * Raised after reading it on device: this app is used by a tired adult, in a
 * dark room, often with the phone propped at arm's length rather than held.
 * Every one of those pushes toward larger text, and none pushes back — there is
 * no dense information to fit, because the surface is deliberately thin
 * (design.md §5: no catalogue, no five-tab nav).
 *
 * `story` is the largest body size: it is the actual content, read in the
 * lowest light of any screen in the app.
 *
 * `display` is for the child's name and the reveal line — the two moments the
 * product is really selling.
 */
export const type = {
  display: 44,
  title: 34,
  heading: 28,
  subheading: 22,
  story: 21,
  body: 18,
  caption: 14,
} as const;

export const lineHeight = {
  tight: 1.2, // display / title
  normal: 1.45, // body
  relaxed: 1.7, // story text — read aloud, needs air
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

/* ------------------------------ shape + space ------------------------------ */
/** Generous radii, per design.md §5 ("soft rounded geometry throughout"). */
export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const;

/** 4pt grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

/* ---------------------------------- motion --------------------------------- */
/**
 * design.md §6 — motion IS the deliverable, and the Design Award has gone twice
 * to motion quality rather than visual novelty. All of it is a Reanimated
 * transform at zero marginal cost.
 */
export const motion = {
  /** Very slow Ken Burns per page. Reads as breathing, not movement. */
  pageDriftMs: 25_000,
  /** Page transition. Long cross-fade — never a cut. */
  pageCrossfadeMs: 1_200,
  /** Shell interactions stay responsive; only the player is slow. */
  tapMs: 180,
  /**
   * Progressive dim across the story arc (CLI-22). Whether this is time-based
   * or page-based is still open (design.md §12) — test both on device.
   * With 12 pages at ~40s, a full story is ~8 minutes.
   */
  dimFrom: 1.0,
  dimTo: 0.55,
} as const;
