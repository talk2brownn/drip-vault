import { useEffect, useRef } from "react";

/** A soft glow that follows the cursor everywhere in the app — ambient
 * atmosphere, separate from the per-card spotlight effect (see
 * lib/spotlight.ts) which lights up individual info cards on hover. This
 * one just makes the whole page feel like it's lit by something trailing
 * the mouse, like a lantern. Mounted once at the app root so it persists
 * across the landing/vault view switch. */
export function CursorLantern() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };
    window.addEventListener("mousemove", onMove);

    // A little lag behind the real cursor position — reads as a lantern
    // trailing you rather than a rigid dot glued to the pointer.
    const tick = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cursor-lantern" aria-hidden />;
}
