import { useMemo } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { DripVault } from "../idl/drip_vault_type";
import idl from "../idl/drip_vault.json";

// A throwaway, non-funded keypair used only to satisfy AnchorProvider's
// Wallet interface when no real wallet is connected yet. It never signs
// anything real — it just lets read-only calls like `.fetch()` work so
// vault stats are visible before a visitor connects a wallet.
const READONLY_KEYPAIR = Keypair.generate();
const readonlyWallet = {
  publicKey: READONLY_KEYPAIR.publicKey,
  async signTransaction<T extends Transaction | VersionedTransaction>(_tx: T): Promise<T> {
    throw new Error("Connect a wallet to sign transactions");
  },
  async signAllTransactions<T extends Transaction | VersionedTransaction>(_txs: T[]): Promise<T[]> {
    throw new Error("Connect a wallet to sign transactions");
  },
};

/** Returns a ready-to-use Anchor Program. Bound to the connected wallet once
 * one is connected; otherwise falls back to a read-only stub wallet so
 * public vault data (`.fetch()`, `getProgramAccounts`, …) still loads for
 * anyone just browsing. Any write call made through the read-only fallback
 * fails loudly rather than silently — there's no real key behind it. */
export function useDripProgram(): anchor.Program<DripVault> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, wallet ?? readonlyWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program(
      idl as anchor.Idl,
      provider
    ) as unknown as anchor.Program<DripVault>;
  }, [connection, wallet]);
}
