import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import { MarketGrid } from "./MarketGrid";
import { handleSpotlight } from "../lib/spotlight";
import { deployment } from "../lib/deployment";
import {
  REAL_DIVIDEND_PER_SHARE,
  REAL_DIVIDEND_EX_DATE,
  REAL_DIVIDEND_PAY_DATE,
  UNDERLYING_TICKER,
} from "../lib/constants";
import "./Landing.css";

const EXPLORER_URL = `https://explorer.solana.com/address/${deployment.vault.toBase58()}?cluster=devnet`;
const TWEET_URL = "https://x.com/solana/status/2098403597004263760";

function short(pk: { toBase58(): string }): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function Landing({ onStart }: { onStart: () => void }) {
  const gridWrapRef = useRef<HTMLDivElement>(null);

  // Subtle mouse-parallax tilt on the hero grid — a cheap 3D feel that
  // reads as more expensive than it is.
  const handleMouseMove = (e: ReactMouseEvent<HTMLElement>) => {
    const el = gridWrapRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${py * -4}deg) rotateY(${px * 6}deg) scale(1.03)`;
  };

  const handleMouseLeave = () => {
    const el = gridWrapRef.current;
    if (!el) return;
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
  };

  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="landing-wordmark">DRIP</span>
        <span className="landing-pill">● live on Solana devnet</span>
      </nav>

      <section
        className="landing-hero"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="market-grid-wrap" ref={gridWrapRef}>
          <MarketGrid />
        </div>
        <div className="landing-hero-content">
          <a
            className="landing-badge"
            href={TWEET_URL}
            target="_blank"
            rel="noreferrer"
          >
            built for <strong>STOCKLANA</strong> — @solana, Sept 11–25 ↗
          </a>
          <h1>
            Dividends that <span className="grad">pay themselves</span>.
          </h1>
          <p className="landing-sub">
            DRIP is a vault on Solana that turns a tokenized stock into a
            claim on its real dividends — deposit {UNDERLYING_TICKER}, hold a
            DRIP receipt, and when a corporate action fires, every holder is
            paid their exact pro-rata share in a single on-chain transaction.
            No custodian decides who gets paid — the math does.
          </p>
          <button className="landing-cta" onClick={onStart}>
            Let's get started <span aria-hidden>→</span>
          </button>
        </div>
      </section>

      <section className="landing-bento">
        <h2 className="bento-heading">Under the hood</h2>
        <div className="bento-grid">
          <div className="bento-card bento-wide spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">The mechanism</span>
            <p className="bento-body">
              Deposit {UNDERLYING_TICKER}, get a DRIP receipt minted 1:1 by
              the vault PDA. When <code>distribute_dividend</code> fires, the
              program walks every holder and pays{" "}
              <code>floor(total × balance / supply)</code> — the same
              instruction, the same math, every time. No off-chain
              calculation, no discretion.
            </p>
          </div>

          <div className="bento-card spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">Zero custodian keys</span>
            <p className="bento-body">
              Vault, receipt mint, vault token account and dividend pool are
              all PDAs, seeded and signed for by the program itself. No
              wallet — not even the admin's — ever holds pooled funds.
            </p>
          </div>

          <div className="bento-card spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">Overflow-safe split</span>
            <p className="bento-body">
              Each holder's share is computed in <code>u128</code> before
              narrowing back to <code>u64</code>, so the payout math can't
              silently overflow even at large supply.
            </p>
          </div>

          <div className="bento-card spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">Fan-out via remaining_accounts</span>
            <p className="bento-body">
              Holders are passed as <code>[receipt_ata, payout_ata]</code>{" "}
              pairs through Anchor's <code>remaining_accounts</code> — one
              instruction, any number of holders, no fixed struct.
            </p>
          </div>

          <div className="bento-card bento-wide spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">What's real, not invented</span>
            <p className="bento-body">
              The demo replays Apple's actual declared dividend —{" "}
              <strong>${REAL_DIVIDEND_PER_SHARE.toFixed(2)}/share</strong>,
              ex-date {REAL_DIVIDEND_EX_DATE}, paid {REAL_DIVIDEND_PAY_DATE} —
              instead of a made-up number. The math holders get paid is the
              same floor-division split the on-chain program runs.
            </p>
          </div>

          <div className="bento-card bento-wide spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">On-chain proof</span>
            <p className="bento-body">
              Program{" "}
              <code>{short(deployment.programId)}</code> and vault{" "}
              <code>{short(deployment.vault)}</code> are live on devnet right
              now — not a mockup.
            </p>
            <a
              className="bento-link"
              href={EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Inspect the vault on Solana Explorer ↗
            </a>
          </div>

          <div className="bento-card bento-wide spotlight" onMouseMove={handleSpotlight}>
            <span className="bento-label">Composable, not a trap</span>
            <p className="bento-body">
              <code>withdraw</code> burns receipts and releases the
              underlying 1:1, so a deposit is a real, reversible position.
              Pointing the vault at the real xStocks/USDC mints on mainnet
              is a config change to <code>deployment.json</code> — not a
              program rewrite.
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        Not affiliated with or endorsed by Solana Foundation — an independent
        submission built for the STOCKLANA hackathon.
      </footer>
    </div>
  );
}
