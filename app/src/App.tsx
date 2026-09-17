import { useCallback, useEffect, useState } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { useDripProgram } from "./lib/program";
import { deployment } from "./lib/deployment";
import { UNDERLYING_DECIMALS, DIVIDEND_DECIMALS, REAL_DIVIDEND_PER_SHARE, REAL_DIVIDEND_PAY_DATE } from "./lib/constants";
import { getReceiptHolders } from "./lib/holders";
import { DripCanvas, type DripEvent } from "./components/DripCanvas";
import { Landing } from "./components/Landing";
import { ActivityTicker } from "./components/ActivityTicker";
import { AnimatedNumber } from "./components/AnimatedNumber";
import { CursorLantern } from "./components/CursorLantern";
import { IntroSplash } from "./components/IntroSplash";
import { handleSpotlight } from "./lib/spotlight";
import "./App.css";

function fmt(raw: anchor.BN | bigint | number, decimals: number): string {
  const n = typeof raw === "object" && "toNumber" in raw ? raw.toNumber() : Number(raw);
  return (n / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function short(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

interface VaultStats {
  totalDeposited: anchor.BN;
  totalDividendsDistributed: anchor.BN;
  dividendEvents: number;
}

interface Receipt {
  id: string;
  message: string;
  sig?: string;
  ok: boolean;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const { publicKey, sendTransaction } = useWallet();
  const program = useDripProgram();

  const [stats, setStats] = useState<VaultStats | null>(null);
  const [depositAmount, setDepositAmount] = useState("10");
  const [mintTarget, setMintTarget] = useState("");
  const [mintAmount, setMintAmount] = useState("100");
  const [dividendPerShare, setDividendPerShare] = useState(String(REAL_DIVIDEND_PER_SHARE));
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Receipt[]>([]);
  const [dripEvent, setDripEvent] = useState<DripEvent[] | null>(null);

  const isAdmin = publicKey?.equals(deployment.authority) ?? false;

  const pushLog = (message: string, opts?: { sig?: string; ok?: boolean }) =>
    setLog((l) =>
      [
        { id: `${Date.now()}-${Math.random()}`, message, sig: opts?.sig, ok: opts?.ok ?? true },
        ...l,
      ].slice(0, 8)
    );

  const refreshStats = useCallback(async () => {
    if (!program) return;
    try {
      const vault = await program.account.vault.fetch(deployment.vault);
      setStats({
        totalDeposited: vault.totalDeposited as anchor.BN,
        totalDividendsDistributed: vault.totalDividendsDistributed as anchor.BN,
        dividendEvents: vault.dividendEvents as number,
      });
    } catch (e) {
      console.error(e);
    }
  }, [program]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleDeposit = async () => {
    if (!program || !publicKey) return;
    setBusy("Depositing…");
    try {
      const amount = new anchor.BN(Number(depositAmount) * 10 ** UNDERLYING_DECIMALS);
      const depositorTokenAccount = getAssociatedTokenAddressSync(
        deployment.underlyingMint,
        publicKey
      );
      const depositorReceiptAccount = getAssociatedTokenAddressSync(
        deployment.receiptMint,
        publicKey
      );

      const sig = await program.methods
        .deposit(amount)
        .accounts({
          depositor: publicKey,
          vault: deployment.vault,
          vaultTokenAccount: deployment.vaultTokenAccount,
          receiptMint: deployment.receiptMint,
          depositorTokenAccount,
          depositorReceiptAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .rpc();

      pushLog(`Deposited ${depositAmount} ${deployment.ticker}`, { sig });
      await refreshStats();
    } catch (e) {
      console.error(e);
      pushLog(`Deposit failed: ${(e as Error).message}`, { ok: false });
    } finally {
      setBusy(null);
    }
  };

  const handleMintDemoTokens = async () => {
    if (!program || !publicKey) return;
    setBusy("Minting demo AAPLx…");
    try {
      const target = mintTarget ? new PublicKey(mintTarget) : publicKey;
      const targetAta = getAssociatedTokenAddressSync(deployment.underlyingMint, target);
      const amount = BigInt(Math.round(Number(mintAmount) * 10 ** UNDERLYING_DECIMALS));

      const tx = new anchor.web3.Transaction();
      const ataInfo = await program.provider.connection.getAccountInfo(targetAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            targetAta,
            target,
            deployment.underlyingMint
          )
        );
      }
      tx.add(
        createMintToInstruction(
          deployment.underlyingMint,
          targetAta,
          publicKey,
          amount
        )
      );
      const sig = await sendTransaction(tx, program.provider.connection);
      await program.provider.connection.confirmTransaction(sig, "confirmed");
      pushLog(`Minted ${mintAmount} demo AAPLx to ${short(target)}`, { sig });
    } catch (e) {
      console.error(e);
      pushLog(`Mint failed: ${(e as Error).message}`, { ok: false });
    } finally {
      setBusy(null);
    }
  };

  const handleFundAndDistribute = async () => {
    if (!program || !publicKey || !stats) return;
    setBusy("Funding pool and distributing…");
    try {
      const totalShares = stats.totalDeposited.toNumber() / 10 ** UNDERLYING_DECIMALS;
      const totalDividend = Math.round(
        totalShares * Number(dividendPerShare) * 10 ** DIVIDEND_DECIMALS
      );
      if (totalDividend <= 0) throw new Error("No shares deposited yet");

      // 1. Fund the pool with the real declared dividend amount.
      const funderDividendAccount = getAssociatedTokenAddressSync(
        deployment.dividendMint,
        publicKey
      );
      const fundTx = new anchor.web3.Transaction();
      const funderAtaInfo = await program.provider.connection.getAccountInfo(
        funderDividendAccount
      );
      if (!funderAtaInfo) {
        fundTx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            funderDividendAccount,
            publicKey,
            deployment.dividendMint
          )
        );
      }
      fundTx.add(
        createMintToInstruction(
          deployment.dividendMint,
          funderDividendAccount,
          publicKey,
          BigInt(totalDividend)
        )
      );
      const mintSig = await sendTransaction(fundTx, program.provider.connection);
      await program.provider.connection.confirmTransaction(mintSig, "confirmed");

      await program.methods
        .fundDividendPool(new anchor.BN(totalDividend))
        .accounts({
          funder: publicKey,
          vault: deployment.vault,
          dividendPool: deployment.dividendPool,
          funderTokenAccount: funderDividendAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .rpc();

      // 2. Find every current holder and make sure their payout ATA exists.
      const holders = await getReceiptHolders(
        program.provider.connection,
        deployment.receiptMint
      );
      if (holders.length === 0) throw new Error("No receipt holders found");

      const setupTx = new anchor.web3.Transaction();
      const payoutAtas: PublicKey[] = [];
      for (const h of holders) {
        const payoutAta = getAssociatedTokenAddressSync(deployment.dividendMint, h.owner);
        payoutAtas.push(payoutAta);
        const info = await program.provider.connection.getAccountInfo(payoutAta);
        if (!info) {
          setupTx.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              payoutAta,
              h.owner,
              deployment.dividendMint
            )
          );
        }
      }
      if (setupTx.instructions.length > 0) {
        const setupSig = await sendTransaction(setupTx, program.provider.connection);
        await program.provider.connection.confirmTransaction(setupSig, "confirmed");
      }

      // 3. Distribute — pass holders as (receipt_ata, payout_ata) pairs.
      const remainingAccounts = holders.flatMap((h, i) => [
        { pubkey: h.tokenAccount, isWritable: false, isSigner: false },
        { pubkey: payoutAtas[i], isWritable: true, isSigner: false },
      ]);

      const totalReceiptSupply = holders.reduce((sum, h) => sum + h.amount, 0n);
      const sig = await program.methods
        .distributeDividend(new anchor.BN(totalDividend))
        .accounts({
          vault: deployment.vault,
          authority: publicKey,
          receiptMint: deployment.receiptMint,
          dividendPool: deployment.dividendPool,
          tokenProgram: TOKEN_PROGRAM_ID,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .remainingAccounts(remainingAccounts)
        .rpc();

      pushLog(
        `Distributed $${fmt(totalDividend, DIVIDEND_DECIMALS)} across ${holders.length} holder(s)`,
        { sig }
      );

      // Drive the drip visual with the exact same floor-division math the
      // on-chain program used, so the animation matches reality precisely.
      const event: DripEvent[] = holders.map((h) => {
        const share = (BigInt(totalDividend) * h.amount) / totalReceiptSupply;
        return {
          id: Date.now() + Math.random(),
          label: short(h.owner),
          amount: fmt(share, DIVIDEND_DECIMALS),
        };
      });
      setDripEvent(event);

      await refreshStats();
    } catch (e) {
      console.error(e);
      pushLog(`Distribute failed: ${(e as Error).message}`, { ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <CursorLantern />
      {!introDone && <IntroSplash onDone={() => setIntroDone(true)} />}
      {!started ? <Landing onStart={() => setStarted(true)} /> : (
    <div className="drip-app">
      <header className="drip-header">
        <div>
          <button className="back-link" onClick={() => setStarted(false)}>
            ← intro
          </button>
          <h1>DRIP</h1>
          <p className="tagline">
            Trustless dividend reinvestment for tokenized stocks on Solana
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {program && (
        <ActivityTicker program={program} vault={deployment.vault} />
      )}

      <section className="vault-card spotlight" onMouseMove={handleSpotlight}>
        <div className="vault-row">
          <span className="label">Vault</span>
          <span className="value">{deployment.ticker} — {short(deployment.vault)}</span>
        </div>
        <div className="vault-row">
          <span className="label">Total shares deposited</span>
          <span className="value">
            <AnimatedNumber
              value={stats ? stats.totalDeposited.toNumber() / 10 ** UNDERLYING_DECIMALS : null}
            />
          </span>
        </div>
        <div className="vault-row">
          <span className="label">Total dividends distributed</span>
          <span className="value">
            <AnimatedNumber
              value={
                stats
                  ? stats.totalDividendsDistributed.toNumber() / 10 ** DIVIDEND_DECIMALS
                  : null
              }
              prefix="$"
            />
          </span>
        </div>
        <div className="vault-row">
          <span className="label">Dividend events</span>
          <span className="value">
            <AnimatedNumber value={stats ? stats.dividendEvents : null} decimals={0} />
          </span>
        </div>
      </section>

      <section className="drip-visual-card spotlight" onMouseMove={handleSpotlight}>
        {/* Hidden SVG filter that turns the falling droplets into real
            fluid blobs — a Gaussian blur softens the circles, then a
            steep alpha ramp (feColorMatrix) snaps the edges back sharp,
            so two overlapping blurred circles fuse into one gooey shape
            instead of just looking like a soft dot. Classic "goo" trick. */}
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter id="goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>
        <DripCanvas event={dripEvent} />
      </section>

      <section className="panels">
        <div className="panel spotlight" onMouseMove={handleSpotlight}>
          <h2>Deposit</h2>
          <p className="hint">
            Lock real {deployment.ticker} into the vault, get DRIP receipts 1:1 —
            your receipt balance is your claim on the next dividend.
          </p>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            disabled={!publicKey || !!busy}
          />
          <button onClick={handleDeposit} disabled={!publicKey || !!busy}>
            Deposit
          </button>
        </div>

        {isAdmin && (
          <div className="panel admin-panel spotlight" onMouseMove={handleSpotlight}>
            <h2>Admin — demo faucet</h2>
            <p className="hint">
              Mint devnet stand-in {deployment.ticker} to any wallet so it can
              deposit (only works because this wallet is the demo mint authority).
            </p>
            <input
              type="text"
              placeholder="Target wallet (blank = yourself)"
              value={mintTarget}
              onChange={(e) => setMintTarget(e.target.value)}
              disabled={!!busy}
            />
            <input
              type="number"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              disabled={!!busy}
            />
            <button onClick={handleMintDemoTokens} disabled={!publicKey || !!busy}>
              Mint demo shares
            </button>
          </div>
        )}

        {isAdmin && (
          <div className="panel admin-panel spotlight" onMouseMove={handleSpotlight}>
            <h2>Admin — corporate action</h2>
            <p className="hint">
              Replays AAPL's real, already-declared dividend (paid {REAL_DIVIDEND_PAY_DATE}).
              Funds the pool, then pays every current holder their exact
              pro-rata share in one transaction.
            </p>
            <label className="hint">$ per share</label>
            <input
              type="number"
              step="0.01"
              value={dividendPerShare}
              onChange={(e) => setDividendPerShare(e.target.value)}
              disabled={!!busy}
            />
            <button onClick={handleFundAndDistribute} disabled={!publicKey || !!busy}>
              Fund + Distribute Dividend
            </button>
          </div>
        )}
      </section>

      {busy && <div className="busy-banner">{busy}</div>}

      <section className="receipts">
        {log.map((r) => (
          <div key={r.id} className={`receipt ${r.ok ? "receipt-ok" : "receipt-error"}`}>
            <span className="receipt-icon">{r.ok ? "✓" : "✕"}</span>
            <span className="receipt-message">{r.message}</span>
            {r.sig && (
              <a
                className="receipt-link"
                href={`https://explorer.solana.com/tx/${r.sig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {r.sig.slice(0, 8)}… ↗
              </a>
            )}
          </div>
        ))}
      </section>
    </div>
      )}
    </>
  );
}
