import { useEffect, useState } from "react";
import { MarketGrid } from "./MarketGrid";
import "./IntroSplash.css";

const HOLD_MS = 2300;
const LEAVE_MS = 550;

/**
 * Plays once at the very start of a session: three diagonal bars assemble
 * in Solana's own brand gradient (purple → green — an original stylized
 * three-bar motif in their colors, not a traced copy of their logo file),
 * hold, then melt downward into a single droplet that lands and reveals
 * the DRIP wordmark — a literal visual of "Solana's ecosystem → DRIP".
 * Click anywhere to skip straight to the end.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const holdTimer = setTimeout(() => setLeaving(true), HOLD_MS);
    const doneTimer = setTimeout(onDone, HOLD_MS + LEAVE_MS);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const skip = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, 320);
  };

  return (
    <div
      className={`intro-splash${leaving ? " intro-leaving" : ""}`}
      onClick={skip}
      role="button"
      aria-label="Skip intro"
    >
      <div className="intro-grid-backdrop">
        <MarketGrid />
      </div>
      <div className="intro-scrim" />
      <div className="intro-stage">
        <div className="intro-bars">
          <span className="intro-bar intro-bar-1" />
          <span className="intro-bar intro-bar-2" />
          <span className="intro-bar intro-bar-3" />
        </div>
        <div className="intro-droplet" />
        <div className="intro-ripple" />
        <div className="intro-wordmark">
          DRIP<span className="intro-cursor">.</span>
        </div>
      </div>
      <div className="intro-skip">click to skip ↦</div>
    </div>
  );
}
