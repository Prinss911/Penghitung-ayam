"use client";

/**
 * AnimatedNumber — angka dengan animasi count-up halus (requestAnimationFrame).
 * Digunakan untuk counter total ayam agar perubahan terasa hidup.
 */

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number; // ms
  className?: string;
  format?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  duration = 500,
  className,
  format = (n) => n.toLocaleString(),
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span className={className} aria-live="polite">
      {format(display)}
    </span>
  );
}
