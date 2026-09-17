import { useEffect, useRef, useState } from "react";
import type * as anchor from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { DripVault } from "../idl/drip_vault_type";
import {
  fetchRecentActivity,
  subscribeToVaultEvents,
  type ActivityItem,
} from "../lib/activity";

const BACKFILL_POLL_MS = 45_000;
const PX_PER_SEC = 55;
const MAX_ITEMS = 12;

function timeAgo(blockTime: number | null): string {
  if (blockTime === null) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - blockTime);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function ActivityTicker({
  program,
  vault,
}: {
  program: anchor.Program<DripVault> | null;
  vault: PublicKey;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(30);

  // Historical backfill — cheap signature list, generic labels, light poll.
  useEffect(() => {
    if (!program) return;
    let cancelled = false;

    const load = async () => {
      try {
        const fresh = await fetchRecentActivity(program, vault);
        if (cancelled || fresh.length === 0) return;
        setItems((prev) => {
          const liveKeys = new Set(prev.filter((p) => p.live).map((p) => p.key));
          const liveOnes = prev.filter((p) => p.live);
          const merged = [...liveOnes, ...fresh.filter((f) => !liveKeys.has(f.key))];
          return merged.slice(0, MAX_ITEMS);
        });
      } catch (e) {
        console.error("activity ticker backfill failed", e);
      }
    };
    load();
    const interval = setInterval(load, BACKFILL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [program, vault]);

  // Live decoded events — pushed over the RPC websocket the instant they
  // happen, no polling involved.
  useEffect(() => {
    if (!program) return;
    const unsubscribe = subscribeToVaultEvents(program, vault, (item) => {
      setItems((prev) => [item, ...prev.filter((p) => p.key !== item.key)].slice(0, MAX_ITEMS));
    });
    return unsubscribe;
  }, [program, vault]);

  useEffect(() => {
    if (!trackRef.current) return;
    const width = trackRef.current.scrollWidth / 2; // duplicated content
    if (width > 0) setDuration(Math.max(12, width / PX_PER_SEC));
  }, [items]);

  if (items.length === 0) return null;

  const explorerUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

  const renderItems = (keyPrefix: string) =>
    items.map((item) => (
      <a
        key={`${keyPrefix}-${item.key}`}
        className={`ticker-item${item.live ? " ticker-item-live" : ""}`}
        href={explorerUrl(item.signature)}
        target="_blank"
        rel="noreferrer"
      >
        <span className="ticker-dot" />
        {item.label}
        <span className="ticker-time">{timeAgo(item.blockTime)}</span>
      </a>
    ));

  return (
    <div className="activity-ticker">
      <span className="activity-ticker-label">LIVE ON-CHAIN</span>
      <div className="activity-ticker-window">
        <div
          className="activity-ticker-track"
          ref={trackRef}
          style={{ animationDuration: `${duration}s` }}
        >
          {renderItems("a")}
          {renderItems("b")}
        </div>
      </div>
    </div>
  );
}
