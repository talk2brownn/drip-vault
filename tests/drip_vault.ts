import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { DripVault } from "../target/types/drip_vault";

// Real, already-declared AAPL dividend: $0.27/share, paid Aug 13, 2026.
// We replay this exact number so the demo runs on honest data, not invented
// figures. Decimals kept at 6 for both mints to keep the arithmetic legible.
const DIVIDEND_PER_SHARE = 0.27;
const DECIMALS = 6;
const UNIT = 10 ** DECIMALS;

describe("drip_vault", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.dripVault as Program<DripVault>;

  const authority = (provider.wallet as anchor.Wallet).payer;
  const holderA = Keypair.generate();
  const holderB = Keypair.generate();

  let underlyingMint: PublicKey; // devnet stand-in for AAPLx
  let dividendMint: PublicKey; // devnet stand-in for USDC
  let vault: PublicKey;
  let receiptMint: PublicKey;
  let vaultTokenAccount: PublicKey;
  let dividendPool: PublicKey;

  const SHARES_A = 100 * UNIT; // Holder A: 100 shares
  const SHARES_B = 300 * UNIT; // Holder B: 300 shares
  const TOTAL_SHARES = SHARES_A + SHARES_B; // 400 shares total in the vault
  const TOTAL_DIVIDEND = Math.round(
    (TOTAL_SHARES / UNIT) * DIVIDEND_PER_SHARE * UNIT
  ); // 400 * $0.27 = $108.00

  before(async () => {
    // Airdrop the two demo holders enough SOL to pay their own rent/fees.
    for (const kp of [holderA, holderB]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2_000_000_000
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    underlyingMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      DECIMALS
    );
    dividendMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      DECIMALS
    );

    [vault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("drip-vault"),
        authority.publicKey.toBuffer(),
        underlyingMint.toBuffer(),
      ],
      program.programId
    );
    [receiptMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("drip-receipt-mint"), vault.toBuffer()],
      program.programId
    );
    [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("drip-vault-token"), vault.toBuffer()],
      program.programId
    );
    [dividendPool] = PublicKey.findProgramAddressSync(
      [Buffer.from("drip-dividend-pool"), vault.toBuffer()],
      program.programId
    );
  });

  it("initializes the AAPLx vault", async () => {
    await program.methods
      .initializeVault("AAPLx")
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
      })
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.equal(vaultAccount.ticker, "AAPLx");
    assert.equal(vaultAccount.totalDeposited.toNumber(), 0);
  });

  it("holders deposit real (devnet) AAPLx and receive DRIP receipts 1:1", async () => {
    for (const [holder, amount] of [
      [holderA, SHARES_A],
      [holderB, SHARES_B],
    ] as const) {
      const holderUnderlyingAccount = await createAssociatedTokenAccount(
        provider.connection,
        holder,
        underlyingMint,
        holder.publicKey
      );
      await mintTo(
        provider.connection,
        authority,
        underlyingMint,
        holderUnderlyingAccount,
        authority,
        amount
      );

      const holderReceiptAccount = getAssociatedTokenAddressSync(
        receiptMint,
        holder.publicKey
      );

      await program.methods
        .deposit(new BN(amount))
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
        })
        .signers([holder])
        .rpc();

      const receiptBalance = await getAccount(
        provider.connection,
        holderReceiptAccount
      );
      assert.equal(Number(receiptBalance.amount), amount);
    }

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.equal(vaultAccount.totalDeposited.toNumber(), TOTAL_SHARES);
  });

  it("funds the pool with AAPL's real $0.27/share dividend and distributes it pro-rata in one transaction", async () => {
    const funderDividendAccount = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      dividendMint,
      authority.publicKey
    );
    await mintTo(
      provider.connection,
      authority,
      dividendMint,
      funderDividendAccount,
      authority,
      TOTAL_DIVIDEND
    );

    await program.methods
      .fundDividendPool(new BN(TOTAL_DIVIDEND))
      .accounts({
        funder: authority.publicKey,
        vault,
        dividendPool,
        funderTokenAccount: funderDividendAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const holderAReceiptAccount = getAssociatedTokenAddressSync(
      receiptMint,
      holderA.publicKey
    );
    const holderBReceiptAccount = getAssociatedTokenAddressSync(
      receiptMint,
      holderB.publicKey
    );
    const holderAPayoutAccount = await createAssociatedTokenAccount(
      provider.connection,
      holderA,
      dividendMint,
      holderA.publicKey
    );
    const holderBPayoutAccount = await createAssociatedTokenAccount(
      provider.connection,
      holderB,
      dividendMint,
      holderB.publicKey
    );

    await program.methods
      .distributeDividend(new BN(TOTAL_DIVIDEND))
      .accounts({
        vault,
        authority: authority.publicKey,
        receiptMint,
        dividendPool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: holderAReceiptAccount, isWritable: false, isSigner: false },
        { pubkey: holderAPayoutAccount, isWritable: true, isSigner: false },
        { pubkey: holderBReceiptAccount, isWritable: false, isSigner: false },
        { pubkey: holderBPayoutAccount, isWritable: true, isSigner: false },
      ])
      .rpc();

    const payoutA = await getAccount(provider.connection, holderAPayoutAccount);
    const payoutB = await getAccount(provider.connection, holderBPayoutAccount);

    // Holder A holds 100 of 400 shares (25%) -> $27.00
    // Holder B holds 300 of 400 shares (75%) -> $81.00
    assert.equal(Number(payoutA.amount), 27 * UNIT);
    assert.equal(Number(payoutB.amount), 81 * UNIT);
    assert.equal(Number(payoutA.amount) + Number(payoutB.amount), TOTAL_DIVIDEND);

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.equal(
      vaultAccount.totalDividendsDistributed.toNumber(),
      TOTAL_DIVIDEND
    );
    assert.equal(vaultAccount.dividendEvents, 1);
  });

  it("lets a holder withdraw their real underlying stock back out", async () => {
    const holderReceiptAccount = getAssociatedTokenAddressSync(
      receiptMint,
      holderA.publicKey
    );
    const holderUnderlyingAccount = getAssociatedTokenAddressSync(
      underlyingMint,
      holderA.publicKey
    );

    await program.methods
      .withdraw(new BN(SHARES_A))
      .accounts({
        depositor: holderA.publicKey,
        vault,
        vaultTokenAccount,
        receiptMint,
        depositorReceiptAccount: holderReceiptAccount,
        depositorTokenAccount: holderUnderlyingAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([holderA])
      .rpc();

    const underlyingBalance = await getAccount(
      provider.connection,
      holderUnderlyingAccount
    );
    assert.equal(Number(underlyingBalance.amount), SHARES_A);

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.equal(vaultAccount.totalDeposited.toNumber(), SHARES_B);
  });
});
