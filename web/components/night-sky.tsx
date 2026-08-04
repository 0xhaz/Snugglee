import { memo } from "react";

/**
 * Ambient star field.
 *
 * Deliberately slow and low-contrast. The app's rule is that motion at bedtime
 * should read as breathing rather than movement, and a landing page that
 * sparkles at you undercuts the thing it is selling.
 *
 * **Positions are rounded to 2dp on purpose.** They are derived from a seeded
 * hash so they are stable, but an unrounded float serialises differently on the
 * server than it computes on the client (`5.72182%` vs `5.721816935692914%`),
 * which React reports as a hydration mismatch. Rounding makes both sides
 * produce byte-identical strings.
 *
 * No `"use client"` — this renders once and never reacts to anything, so it can
 * stay a server component and ship no JavaScript at all.
 */

/** Deterministic 0–1 from an integer seed. Stable across server and client. */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function buildStars(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: (seeded(i) * 100).toFixed(2),
    top: (seeded(i + 1000) * 100).toFixed(2),
    size: i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
    delay: ((i % 9) * 0.7).toFixed(1),
  }));
}

export const NightSky = memo(function NightSky({
  count = 42,
}: {
  count?: number;
}) {
  const stars = buildStars(count);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {stars.map((s) => (
        <span
          key={s.id}
          className="animate-twinkle absolute rounded-full bg-[#F2D18F]"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
});
