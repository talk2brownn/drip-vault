/**
 * One-time setup for a given cluster: creates the devnet stand-in mints for
 * AAPLx (underlying) and USDC (dividend payout), then calls initialize_vault
 * on-chain. Writes the resulting addresses to app/src/idl/deployment.json so
 * the frontend knows exactly which vault to talk to.
 *
 * Run with the cluster already selected via ANCHOR_PROVIDER_URL / ANCHOR_WALLET,
 * e.g.:
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=/root/.config/solana/id.json \
 *     yarn ts-node scripts/setup-vault.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { DripVault } from "../target/types/drip_vault";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/drip_vault.json"), "utf8")
);

const UNDERLYING_DECIMALS = 6;
const DIVIDEND_DECIMALS = 6;
const TICKER = "AAPLx";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(
    idl as anchor.Idl,
    provider
  ) as unknown as anchor.Program<DripVault>;

  const authority = (provider.wallet as anchor.Wallet).payer;

  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Authority:", authority.publicKey.toBase58());

  const underlyingMint = await createMint(
    provider.connection,
    authority,
    authority.publicKey,
    null,
    UNDERLYING_DECIMALS
  );
  console.log("Underlying mint (AAPLx stand-in):", underlyingMint.toBase58());

  const dividendMint = await createMint(
    provider.connection,
    authority,
    authority.publicKey,
    null,
    DIVIDEND_DECIMALS
  );
  console.log("Dividend mint (USDC stand-in):", dividendMint.toBase58());

  const [vault] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("drip-vault"),
      authority.publicKey.toBuffer(),
      underlyingMint.toBuffer(),
    ],
    program.programId
  );
  const [receiptMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("drip-receipt-mint"), vault.toBuffer()],
    program.programId
  );
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("drip-vault-token"), vault.toBuffer()],
    program.programId
  );
  const [dividendPool] = PublicKey.findProgramAddressSync(
    [Buffer.from("drip-dividend-pool"), vault.toBuffer()],
    program.programId
  );

  const sig = await program.methods
    .initializeVault(TICKER)
    .accounts({
      authority: authority.publicKey,
      vault,
      underlyingMint,
      receiptMint,
      vaultTokenAccount,
      dividendMint,
      dividendPool,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .rpc();

  console.log("Vault initialized. Tx:", sig);
  console.log("Vault PDA:", vault.toBase58());

  const deployment = {
    cluster: provider.connection.rpcEndpoint,
    programId: program.programId.toBase58(),
    authority: authority.publicKey.toBase58(),
    ticker: TICKER,
    underlyingMint: underlyingMint.toBase58(),
    dividendMint: dividendMint.toBase58(),
    vault: vault.toBase58(),
    receiptMint: receiptMint.toBase58(),
    vaultTokenAccount: vaultTokenAccount.toBase58(),
    dividendPool: dividendPool.toBase58(),
    initTx: sig,
  };

  const outPath = path.join(__dirname, "../app/src/idl/deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
