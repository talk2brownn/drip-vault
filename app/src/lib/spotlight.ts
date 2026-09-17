import type { MouseEvent as ReactMouseEvent } from "react";

/** Attach to onMouseMove on any element with the `.spotlight` class — tracks
 * cursor position local to that element as CSS custom properties, which the
 * `.spotlight::before` radial-gradient rule (see index.css) reads to draw a
 * glow that follows the cursor and only lights up on hover. */
export function handleSpotlight(e: ReactMouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--sx", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--sy", `${e.clientY - rect.top}px`);
}
