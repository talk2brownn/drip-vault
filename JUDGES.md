# DRIP — for the judges

**Live app:** https://drip-vault-nine.vercel.app
**Demo video:** [add link once recorded]
**Cluster:** Solana devnet
**Track:** Credit & Yield — STOCKLANA

## The problem

When a company pays a dividend, paying out every holder of a tokenized version of that stock is currently a manual, custodian-run process — someone calculates each holder's share off-chain and pushes payments out by hand. There's no on-chain guarantee that the split was calculated correctly or that everyone actually got paid.

## What DRIP does

DRIP is a vault program: deposit a tokenized stock, get a DRIP receipt token back 1:1. Holding the receipt is your claim on the next dividend. When a corporate action fires, one instruction — `distribute_dividend` — pays every current receipt holder their exact pro-rata share, floor-divided, in a single transaction. No custodian, no manual calculation, no discretion. The math is the only thing deciding who gets paid, and it's auditable on-chain.

The vault also supports `withdraw` — burn your receipts, get your underlying stock back — so a deposit is a real, composable position, not a one-way trap.

## Why this belongs on Solana

Paying out potentially many small holders atomically, in one transaction, only works if that transaction is cheap and fast enough to be practical. That's the whole premise: instant, trustless, fan-out settlement instead of a custodian batch-processing payouts over days.

## What's real, and what's a devnet stand-in

The dividend amount DRIP replays is Apple's actual declared dividend — **$0.27/share**, ex-date 2026-08-10, paid 2026-08-13 — not an invented number. The floor-division split the demo shows is the exact math the on-chain program runs.

What's simulated for the hackathon: the underlying "AAPLx" and dividend-stablecoin tokens are devnet stand-in SPL mints (not the live mainnet xStocks/USDC), since the program logic — not sourcing real mainnet liquidity — is what's being judged this week. The vault code itself doesn't care which mint it's pointed at; swapping in the real xStocks/USDC mints on mainnet is a config change, not a rewrite.

## Live on devnet right now

- Program: [`H6nQUX5QaS9BwGo9aUhip1Vtrpzx9wx2d7Wwhjqw3nK2`](https://explorer.solana.com/address/H6nQUX5QaS9BwGo9aUhip1Vtrpzx9wx2d7Wwhjqw3nK2?cluster=devnet)
- Vault: [`BTHfgtjZfKJ1uX1pTEkDrKzv8dkDZ75wFpHFHAzoe8vF`](https://explorer.solana.com/address/BTHfgtjZfKJ1uX1pTEkDrKzv8dkDZ75wFpHFHAzoe8vF?cluster=devnet)
- Receipt mint: [`4Xra7w8spVjUVihS4YK2jUBRdzNsPgNuzbhCUAk5koY8`](https://explorer.solana.com/address/4Xra7w8spVjUVihS4YK2jUBRdzNsPgNuzbhCUAk5koY8?cluster=devnet)

Both the vault's live stats (total shares deposited, total dividends distributed, dividend events) and the activity ticker on the site read this state directly — nothing on that page is a mockup.

## Try it in under a minute

You don't need a wallet to see it working:
1. Open the [live app](https://drip-vault-nine.vercel.app) — the vault stats and activity ticker at the top are pulling real devnet state on load.
2. Click through to Solana Explorer from the "On-chain proof" card on the landing page to independently verify the program and vault exist and are live.

The full deposit → corporate-action → payout flow requires a wallet holding devnet stand-in AAPLx and (for the corporate-action step specifically) the demo authority key, so the fastest way to see the whole loop end-to-end is the demo video linked at the top — it walks through a real deposit, a real dividend distribution, and the resulting Explorer-verifiable payout transaction.

## Program instructions (Anchor)

- `initialize_vault` — one-time setup, creates the vault PDA + receipt mint
- `deposit` — lock underlying stock, mint DRIP receipts 1:1
- `withdraw` — burn receipts, release underlying stock
- `fund_dividend_pool` — admin funds the pool with the declared dividend amount
- `distribute_dividend` — pays every current receipt holder their exact floor-divided pro-rata share, in one transaction

Source: [`programs/drip_vault/src/lib.rs`](./programs/drip_vault/src/lib.rs)

## Built by

Emediong "Brown" Ubong Ekwere ([@talk2brownn](https://github.com/talk2brownn))
