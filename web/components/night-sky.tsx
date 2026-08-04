"use client";

import { useMemo } from "react";

/**
 * Ambient star field.
 *
 * Deliberately slow and low-contrast. The app's design rule is that motion at
 * bedtime should read as breathing rather than movement, and a landing page
 * that sparkles at you undercuts the thing it is selling.
 *
 * Positions are generated once and memoised, so stars do not jump on re-render.
 */
export function NightSky({ count = 42 }: { count?: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(Math.sin(i * 12.9898) * 43758.5453) % 1 > 0 ? ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 100 : -((Math.sin(i * 12.9898) * 43758.5453) % 1) * 100}%`,
        top: `${(Math.cos(i * 78.233) * 43758.5453) % 1 > 0 ? ((Math.cos(i * 78.233) * 43758.5453) % 1) * 100 : -((Math.cos(i * 78.233) * 43758.5453) % 1) * 100}%`,
        size: i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
        delay: `${(i % 9) * 0.7}s`,
      })),
    [count],
  );

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
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}
