/**
 * Runs the full DRIP loop against whichever cluster ANCHOR_PROVIDER_URL
 * points at, using the vault written by setup-vault.ts: two demo holders
 * deposit AAPLx, the pool gets funded with AAPL's real $0.27/share dividend,
 * and distribute_dividend pays both out pro-rata in one transaction.
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  AccountLayout,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { DripVault } from "../target/types/drip_vault";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../target/idl/drip_vault.json"), "utf8")
);
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../app/src/idl/deployment.json"), "utf8")
);

const DECIMALS = 6;
const UNIT = 10 ** DECIMALS;
const DIVIDEND_PER_SHARE = 0.27;

// Funds demo wallets directly from the (already-funded) authority instead of
// hitting the public devnet faucet again, which is rate-limited per IP.
async function fundFromAuthority(
  connection: anchor.web3.Connection,
  authority: anchor.web3.Keypair,
  target: PublicKey,
  lamports: number
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: target,
      lamports,
    })
  );
  const sig = await connection.sendTransaction(tx, [authority]);
  await connection.confirmTransaction(sig, "confirmed");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** All current non-zero holders of a mint — used so distribute always pays
 * the real, complete current holder set rather than an assumed pair. */
async function getReceiptHolders(connection: anchor.web3.Connection, receiptMint: PublicKey) {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: ACCOUNT_SIZE },
      { memcmp: { offset: 0, bytes: receiptMint.toBase58() } },
    ],
  });
  return accounts
    .map(({ pubkey, account }) => {
      const decoded = AccountLayout.decode(account.data);
      return { owner: new PublicKey(decoded.owner), tokenAccount: pubkey, amount: decoded.amount };
    })
    .filter((h) => h.amount > BigInt(0));
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(
    idl as anchor.Idl,
    provider
  ) as unknown as anchor.Program<DripVault>;

  const authority = (provider.wallet as anchor.Wallet).payer;
  const underlyingMint = new PublicKey(deployment.underlyingMint);
  const dividendMint = new PublicKey(deployment.dividendMint);
  const vault = new PublicKey(deployment.vault);
  const receiptMint = new PublicKey(deployment.receiptMint);
  const vaultTokenAccount = new PublicKey(deployment.vaultTokenAccount);
  const dividendPool = new PublicKey(deployment.dividendPool);

  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Vault:", vault.toBase58());

  const holderA = Keypair.generate();
  const holderB = Keypair.generate();
  console.log("Holder A:", holderA.publicKey.toBase58());
  console.log("Holder B:", holderB.publicKey.toBase58());

  for (const kp of [holderA, holderB]) {
    console.log("Funding", kp.publicKey.toBase58(), "for rent/fees...");
    await fundFromAuthority(
      provider.connection,
      authority,
      kp.publicKey,
      0.05 * anchor.web3.LAMPORTS_PER_SOL
    );
  }

  const SHARES_A = 100 * UNIT;
  const SHARES_B = 300 * UNIT;

  for (const [holder, amount, label] of [
    [holderA, SHARES_A, "A"],
    [holderB, SHARES_B, "B"],
  ] as const) {
    const holderUnderlyingAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        holder,
        underlyingMint,
        holder.publicKey
      )
    ).address;
    await mintTo(
      provider.connection,
      authority,
      underlyingMint,
      holderUnderlyingAccount,
      authority,
      amount
    );

    const holderReceiptAccount = getAssociatedTokenAddressSync(receiptMint, holder.publicKey);
    const sig = await program.methods
      .deposit(new anchor.BN(amount))
      .accounts({
        depositor: holder.publicKey,
        vault,
        vaultTokenAccount,
        receiptMint,
        depositorTokenAccount: holderUnderlyingAccount,
        depositorReceiptAccount: holderReceiptAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .signers([holder])
      .rpc();
    console.log(`Holder ${label} deposited ${amount / UNIT} shares. Tx:`, sig);
    await sleep(3000);
  }

  const vaultAccount = await program.account.vault.fetch(vault);
  const totalShares = (vaultAccount.totalDeposited as anchor.BN).toNumber() / UNIT;
  const totalDividend = Math.round(totalShares * DIVIDEND_PER_SHARE * UNIT);
  console.log(`Total shares in vault: ${totalShares}. Total dividend to fund: $${totalDividend / UNIT}`);

  const funderDividendAccount = (
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority,
      dividendMint,
      authority.publicKey
    )
  ).address;
  await mintTo(
    provider.connection,
    authority,
    dividendMint,
    funderDividendAccount,
    authority,
    totalDividend
  );

  const fundSig = await program.methods
    .fundDividendPool(new anchor.BN(totalDividend))
    .accounts({
      funder: authority.publicKey,
      vault,
      dividendPool,
      funderTokenAccount: funderDividendAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .rpc();
  console.log("Dividend pool funded. Tx:", fundSig);
  await sleep(3000);

  // Pay every current holder, not just the two this run just deposited —
  // this keeps the script correct even if it's re-run against a vault that
  // already has holders/dividends in it from an earlier pass.
  const holders = await getReceiptHolders(provider.connection, receiptMint);
  console.log(`Found ${holders.length} current receipt holder(s).`);

  // Authority pays to create every missing payout ATA — creation needs no
  // signature from the account owner, only a payer, so this works uniformly
  // for holders whose keypairs this process doesn't even hold.
  const payoutAtas: PublicKey[] = holders.map((h) =>
    getAssociatedTokenAddressSync(dividendMint, h.owner)
  );
  const createTx = new Transaction();
  for (let i = 0; i < holders.length; i++) {
    const info = await provider.connection.getAccountInfo(payoutAtas[i]);
    if (!info) {
      createTx.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          payoutAtas[i],
          holders[i].owner,
          dividendMint
        )
      );
    }
  }
  if (createTx.instructions.length > 0) {
    const createSig = await provider.connection.sendTransaction(createTx, [authority]);
    await provider.connection.confirmTransaction(createSig, "confirmed");
    console.log(`Created ${createTx.instructions.length} missing payout ATA(s). Tx:`, createSig);
  }
  await sleep(3000);

  const poolBalance = (await getAccount(provider.connection, dividendPool)).amount;
  const remainingAccounts = holders.flatMap((h, i) => [
    { pubkey: h.tokenAccount, isWritable: false, isSigner: false },
    { pubkey: payoutAtas[i], isWritable: true, isSigner: false },
  ]);

  const distSig = await program.methods
    .distributeDividend(new anchor.BN(poolBalance.toString()))
    .accounts({
      vault,
      authority: authority.publicKey,
      receiptMint,
      dividendPool,
      tokenProgram: TOKEN_PROGRAM_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .remainingAccounts(remainingAccounts)
    .rpc();
  console.log("Dividend distributed. Tx:", distSig);
  await sleep(3000);

  const payoutA = await getAccount(
    provider.connection,
    getAssociatedTokenAddressSync(dividendMint, holderA.publicKey)
  );
  const payoutB = await getAccount(
    provider.connection,
    getAssociatedTokenAddressSync(dividendMint, holderB.publicKey)
  );
  console.log(`This run's Holder A received: $${Number(payoutA.amount) / UNIT}`);
  console.log(`This run's Holder B received: $${Number(payoutB.amount) / UNIT}`);

  const demo = {
    cluster: provider.connection.rpcEndpoint,
    vault: vault.toBase58(),
    holderA: holderA.publicKey.toBase58(),
    holderB: holderB.publicKey.toBase58(),
    depositTxA: "see logs above",
    fundTx: fundSig,
    distributeTx: distSig,
    totalHoldersPaid: holders.length,
    holderAPayout: Number(payoutA.amount) / UNIT,
    holderBPayout: Number(payoutB.amount) / UNIT,
  };
  fs.writeFileSync(
    path.join(__dirname, "../app/src/idl/demo-run.json"),
    JSON.stringify(demo, null, 2)
  );
  console.log("Wrote app/src/idl/demo-run.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
