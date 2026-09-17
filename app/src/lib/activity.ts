import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { DripVault } from "../idl/drip_vault_type";

export interface ActivityItem {
  key: string; // `${signature}-${eventIndex}`
  signature: string;
  blockTime: number | null;
  label: string;
  live?: boolean; // decoded from a real-time event vs. a generic backfill entry
}

function fmtUnits(raw: anchor.BN | number | bigint): string {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "bigint"
        ? Number(raw)
        : raw.toNumber();
  return (n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Rust field names survive verbatim into this IDL format (snake_case), so
// these handlers read e.g. `data.total_amount`, not `data.totalAmount`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EVENT_LABELS: Record<string, (data: any) => string> = {
  VaultInitialized: (d) => `VAULT INITIALIZED · ${d.ticker}`,
  Deposited: (d) => `DEPOSIT · ${fmtUnits(d.amount)} shares`,
  Withdrawn: (d) => `WITHDRAW · ${fmtUnits(d.amount)} shares`,
  DividendPoolFunded: (d) => `POOL FUNDED · $${fmtUnits(d.amount)}`,
  DividendDistributed: (d) =>
    `DIVIDEND DISTRIBUTED · $${fmtUnits(d.distributed)} to ${d.holders_paid} holder${
      d.holders_paid === 1 ? "" : "s"
    }`,
};

const EVENT_NAMES = Object.keys(EVENT_LABELS);

/** Historical backfill — real signatures for this vault, generic labels.
 *
 * Deliberately does NOT call getTransaction(s): public devnet RPC applies a
 * separate, much stricter rate limit to that specific method (independent
 * of overall request volume — confirmed by hitting "Too many requests for
 * a specific RPC call" even with everything batched into one call), so
 * decoding historical events isn't reliable from the browser. Rich decoded
 * labels come from the live event subscription below instead — this just
 * proves the transactions are real and lets a visitor jump to Explorer. */
export async function fetchRecentActivity(
  program: anchor.Program<DripVault>,
  vault: PublicKey,
  limit = 10
): Promise<ActivityItem[]> {
  const sigInfos = await program.provider.connection.getSignaturesForAddress(vault, {
    limit,
  });
  return sigInfos
    .filter((s) => !s.err)
    .map((s) => ({
      key: s.signature,
      signature: s.signature,
      blockTime: s.blockTime ?? null,
      label: "ON-CHAIN TRANSACTION",
    }));
}

/** Live, semantic activity — subscribes to the program's own Anchor events
 * over the RPC websocket (push-based, so it doesn't touch the rate-limited
 * getTransaction endpoint at all) and reports fully decoded labels the
 * instant something happens on this vault. */
export function subscribeToVaultEvents(
  program: anchor.Program<DripVault>,
  vault: PublicKey,
  onItem: (item: ActivityItem) => void
): () => void {
  const listenerIds: number[] = [];
  for (const name of EVENT_NAMES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = program.addEventListener(name as any, (event: any, _slot, signature) => {
      if (!event.vault || !(event.vault as PublicKey).equals(vault)) return;
      const labelFn = EVENT_LABELS[name];
      onItem({
        key: `${signature}-${name}`,
        signature,
        blockTime: Math.floor(Date.now() / 1000),
        label: labelFn(event),
        live: true,
      });
    });
    listenerIds.push(id);
  }
  return () => {
    for (const id of listenerIds) {
      program.removeEventListener(id).catch(() => {});
    }
  };
}
