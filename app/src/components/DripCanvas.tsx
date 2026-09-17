import { useEffect, useRef } from "react";

export interface DripEvent {
  id: number;
  label: string; // shortened wallet address
  amount: string; // formatted payout, e.g. "27.00"
}

interface Droplet {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number; // 0..1
  speed: number;
  wobble: number;
  landed: boolean;
  label: string;
  amount: string;
  labelOpacity: number;
  squash: number; // impact squash, decays after landing
  pulsePhase: number; // random offset so paid nodes don't breathe in lockstep
}

// Once a droplet lands it never goes fully dark again — it settles to this
// baseline glow instead of fading to zero, so a paid wallet stays visibly
// "lit" for as long as the vault view is open, not just for a few seconds.
const RESTING_GLOW = 0.42;

const SOURCE_Y = 40;

/**
 * The signature visual: real liquid droplets falling from the dividend
 * source down to each holder's wallet the instant distribute_dividend
 * confirms on-chain.
 *
 * Two stacked canvases: `blob` renders ONLY the falling droplets and gets a
 * CSS blur+contrast "goo" filter so overlapping circles merge into an
 * actual fluid shape instead of looking like separate dots. `overlay`
 * renders the crisp stuff (grid, wallet nodes, text labels, ripples) on
 * top, unfiltered, so text never gets blurry.
 */
export function DripCanvas({ event }: { event: DripEvent[] | null }) {
  const blobRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dropletsRef = useRef<Droplet[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const blobCanvas = blobRef.current;
    const overlayCanvas = overlayRef.current;
    if (!blobCanvas || !overlayCanvas) return;
    const bctx = blobCanvas.getContext("2d");
    const octx = overlayCanvas.getContext("2d");
    if (!bctx || !octx) return;

    const resize = () => {
      const rect = blobCanvas.getBoundingClientRect();
      for (const [canvas, ctx] of [
        [blobCanvas, bctx],
        [overlayCanvas, octx],
      ] as const) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const rect = blobCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const now = performance.now();
      bctx.clearRect(0, 0, w, h);
      octx.clearRect(0, 0, w, h);

      // Crisp source reservoir + label (overlay layer)
      octx.fillStyle = "#0f766e";
      octx.beginPath();
      octx.roundRect(w / 2 - 60, SOURCE_Y - 14, 120, 24, 12);
      octx.fill();
      octx.fillStyle = "#5eead4";
      octx.font = "11px ui-monospace, monospace";
      octx.textAlign = "center";
      octx.fillText("DIVIDEND POOL", w / 2, SOURCE_Y + 3);

      const droplets = dropletsRef.current;
      for (const d of droplets) {
        if (!d.landed) {
          d.progress = Math.min(1, d.progress + d.speed);
          const ease = 1 - Math.pow(1 - d.progress, 3);
          const straightX = w / 2 + (d.targetX - w / 2) * ease;
          d.y = SOURCE_Y + (d.targetY - SOURCE_Y) * ease;

          const wob = Math.sin(d.progress * Math.PI * 4) * (1 - d.progress) * 10;
          const drawX = straightX + wob;
          d.x = drawX;

          // Stretch the blob along its direction of travel — reads as a
          // real falling drop of liquid instead of a rigid dot.
          const stretch = 1 + d.progress * 0.6;
          bctx.save();
          bctx.translate(drawX, d.y);
          bctx.scale(1, stretch);
          bctx.beginPath();
          bctx.fillStyle = "#2dd4bf";
          bctx.arc(0, 0, 7, 0, Math.PI * 2);
          bctx.fill();
          bctx.restore();

          // A trailing blob behind it — this is what the goo filter
          // fuses into a continuous liquid tail.
          bctx.beginPath();
          bctx.fillStyle = "#0f766e";
          bctx.arc(drawX - wob * 0.3, d.y - 10 - d.progress * 6, 4.5, 0, Math.PI * 2);
          bctx.fill();

          if (d.progress >= 1) {
            d.landed = true;
            d.labelOpacity = 1;
            d.squash = 1;
          }
        } else {
          // Impact splash: a squashed puddle blob that settles fast. The
          // ring + label used to fade all the way to nothing afterward —
          // now they settle to RESTING_GLOW instead, and a slow breathing
          // pulse (unique phase per wallet, so nine holders don't glow in
          // unison) keeps the whole thing feeling alive rather than static.
          d.squash *= 0.88;
          if (d.squash > 0.02) {
            bctx.save();
            bctx.translate(d.targetX, d.targetY);
            bctx.scale(1 + d.squash * 1.8, 1 - d.squash * 0.7);
            bctx.beginPath();
            bctx.fillStyle = "#2dd4bf";
            bctx.arc(0, 0, 7, 0, Math.PI * 2);
            bctx.fill();
            bctx.restore();
          }

          d.labelOpacity = Math.max(RESTING_GLOW, d.labelOpacity - 0.004);
          const pulse = (Math.sin(now * 0.0016 + d.pulsePhase) + 1) / 2; // 0..1, ~4s period

          // A perpetual sonar ping expanding out from the wallet — driven
          // by wall-clock time (not labelOpacity), so unlike the old ring
          // it never stops once things settle.
          const rippleCycle = 2600;
          const rippleT = ((now + d.pulsePhase * 900) % rippleCycle) / rippleCycle;
          octx.beginPath();
          octx.strokeStyle = `rgba(45, 212, 191, ${(1 - rippleT) * 0.5})`;
          octx.lineWidth = 1.5;
          octx.arc(d.targetX, d.targetY, 10 + rippleT * 24, 0, Math.PI * 2);
          octx.stroke();

          // A tighter, steadier ring right on the node that breathes with
          // the pulse instead of only ever shrinking.
          octx.beginPath();
          octx.strokeStyle = `rgba(45, 212, 191, ${d.labelOpacity * (0.7 + pulse * 0.3)})`;
          octx.lineWidth = 2;
          octx.arc(d.targetX, d.targetY, 16 + pulse * 2, 0, Math.PI * 2);
          octx.stroke();

          const textOpacity = d.labelOpacity * (0.75 + pulse * 0.25);
          octx.fillStyle = `rgba(94, 234, 212, ${textOpacity})`;
          octx.font = "bold 13px ui-monospace, monospace";
          octx.fillText(`+$${d.amount}`, d.targetX, d.targetY - 22);
          octx.font = "10px ui-monospace, monospace";
          octx.fillStyle = `rgba(148, 163, 184, ${textOpacity})`;
          octx.fillText(d.label, d.targetX, d.targetY + 30);
        }

        // Wallet node (crisp, overlay layer, always drawn). A landed
        // (paid) wallet gets a permanent teal-glow treatment instead of
        // the plain slate circle, so at a glance every node on screen
        // reads as "this one got paid" — a lit ledger, not a blank dot.
        if (d.landed) {
          const pulse = (Math.sin(now * 0.0016 + d.pulsePhase) + 1) / 2;
          octx.save();
          octx.shadowColor = "rgba(45, 212, 191, 0.65)";
          octx.shadowBlur = 8 + pulse * 8;
          octx.beginPath();
          octx.fillStyle = "#0c2b28";
          octx.strokeStyle = `rgba(45, 212, 191, ${0.55 + pulse * 0.35})`;
          octx.lineWidth = 1.5;
          octx.arc(d.targetX, d.targetY, 14, 0, Math.PI * 2);
          octx.fill();
          octx.stroke();
          octx.restore();
        } else {
          octx.beginPath();
          octx.fillStyle = "#1e293b";
          octx.strokeStyle = "#334155";
          octx.lineWidth = 1.5;
          octx.arc(d.targetX, d.targetY, 14, 0, Math.PI * 2);
          octx.fill();
          octx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !event || event.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const count = event.length;
    const spacing = Math.min(140, (w - 80) / Math.max(count - 1, 1));
    const startX = w / 2 - (spacing * (count - 1)) / 2;

    const newDroplets: Droplet[] = event.map((e, i) => ({
      x: w / 2,
      y: SOURCE_Y,
      targetX: count === 1 ? w / 2 : startX + i * spacing,
      targetY: h - 60,
      progress: 0,
      speed: 0.02 + Math.random() * 0.01,
      wobble: Math.random() * Math.PI * 2,
      landed: false,
      label: e.label,
      amount: e.amount,
      labelOpacity: 0,
      squash: 0,
      pulsePhase: Math.random() * Math.PI * 2,
    }));
    dropletsRef.current = newDroplets;
  }, [event]);

  return (
    <div className="drip-canvas-stack">
      <canvas ref={blobRef} className="drip-canvas-blob" />
      <canvas ref={overlayRef} className="drip-canvas-overlay" />
    </div>
  );
}
