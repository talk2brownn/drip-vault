import { PublicKey } from "@solana/web3.js";

// Swap this for "https://api.devnet.solana.com" once the deploy wallet is
// funded there — the program ID and every seed below are identical on both
// clusters since we deploy with the same keypair.
export const RPC_ENDPOINT =
  import.meta.env.VITE_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(
  "H6nQUX5QaS9BwGo9aUhip1Vtrpzx9wx2d7Wwhjqw3nK2"
);

// Must byte-for-byte match the seeds declared in programs/drip_vault/src/lib.rs
export const VAULT_SEED = Buffer.from("drip-vault");
export const RECEIPT_MINT_SEED = Buffer.from("drip-receipt-mint");
export const VAULT_TOKEN_SEED = Buffer.from("drip-vault-token");
export const DIVIDEND_POOL_SEED = Buffer.from("drip-dividend-pool");

// Devnet stand-ins for the real assets — set these after minting on devnet
// (or after resolving the real AAPLx / USDC mints once we point at mainnet).
export const UNDERLYING_TICKER = "AAPLx";
export const UNDERLYING_DECIMALS = 6;
export const DIVIDEND_DECIMALS = 6;

// AAPL's most recently declared, already-paid dividend — replayed here so the
// demo runs on honest numbers instead of an invented figure.
export const REAL_DIVIDEND_PER_SHARE = 0.27;
export const REAL_DIVIDEND_EX_DATE = "2026-08-10";
export const REAL_DIVIDEND_PAY_DATE = "2026-08-13";
