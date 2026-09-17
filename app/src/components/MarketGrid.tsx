import { useEffect, useRef } from "react";

/**
 * Original ambient hero visual — NOT the Solana STOCKLANA post's photo/video.
 * A grid of ticker-board cells that flicker awake, echoing the "grid of a
 * trading floor" idea from that announcement without reproducing it: a
 * diagonal scan-line "opening bell" sweep periodically wakes a wave of
 * cells, each briefly showing a tiny up/down tick before fading back down.
 */

interface Cell {
  col: number;
  row: number;
  brightness: number; // 0..1
  tickSign: 1 | -1;
  tickShown: boolean;
}

const COLS = 18;
const ROWS = 9;

export function MarketGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const cellsRef = useRef<Cell[]>([]);
  const sweepRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cells: Cell[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        cells.push({
          col: c,
          row: r,
          brightness: 0,
          tickSign: Math.random() > 0.5 ? 1 : -1,
          tickShown: false,
        });
      }
    }
    cellsRef.current = cells;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cellW = w / COLS;
      const cellH = h / ROWS;
      sweepRef.current = (sweepRef.current + 0.0026) % 1.6;
      const sweepPos = sweepRef.current * (COLS + ROWS);

      for (const cell of cellsRef.current) {
        const diag = cell.col + cell.row;
        const dist = Math.abs(diag - sweepPos);
        if (dist < 2.2) {
          cell.brightness = Math.max(cell.brightness, 1 - dist / 2.2);
          if (!cell.tickShown && dist < 0.6) {
            cell.tickShown = true;
            cell.tickSign = Math.random() > 0.45 ? 1 : -1;
          }
        } else if (dist > 3) {
          cell.tickShown = false;
        }
        cell.brightness *= 0.965;

        const x = cell.col * cellW;
        const y = cell.row * cellH;
        const pad = 2;

        if (cell.brightness > 0.02) {
          const hue = cell.tickSign === 1 ? "45, 212, 191" : "56, 189, 248";
          ctx.fillStyle = `rgba(${hue}, ${0.08 + cell.brightness * 0.35})`;
          ctx.fillRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2);

          if (cell.brightness > 0.5) {
            ctx.strokeStyle = `rgba(${hue}, ${cell.brightness * 0.9})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const cx = x + cellW / 2;
            const cy = y + cellH / 2;
            if (cell.tickSign === 1) {
              ctx.moveTo(cx - 4, cy + 3);
              ctx.lineTo(cx, cy - 4);
              ctx.lineTo(cx + 4, cy + 3);
            } else {
              ctx.moveTo(cx - 4, cy - 3);
              ctx.lineTo(cx, cy + 4);
              ctx.lineTo(cx + 4, cy - 3);
            }
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = "rgba(148, 163, 184, 0.035)";
          ctx.fillRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2);
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

  return <canvas ref={canvasRef} className="market-grid-canvas" />;
}
