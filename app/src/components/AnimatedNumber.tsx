import { useEffect, useRef, useState } from "react";

/** Rolls the displayed number from its old value to a new one instead of
 * snapping — small polish that makes stat refreshes feel alive. */
export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = "",
}: {
  value: number | null;
  decimals?: number;
  prefix?: string;
}) {
  const [display, setDisplay] = useState(value ?? 0);
  const fromRef = useRef(value ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const DURATION = 700;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (value === null) return <>—</>;

  return (
    <>
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}
