import { PublicKey } from "@solana/web3.js";
import deploymentJson from "../idl/deployment.json";

// Written by scripts/setup-vault.ts. Re-run that script (pointed at whichever
// cluster you're demoing on) to regenerate this after a redeploy.
export const deployment = {
  cluster: deploymentJson.cluster,
  programId: new PublicKey(deploymentJson.programId),
  authority: new PublicKey(deploymentJson.authority),
  ticker: deploymentJson.ticker,
  underlyingMint: new PublicKey(deploymentJson.underlyingMint),
  dividendMint: new PublicKey(deploymentJson.dividendMint),
  vault: new PublicKey(deploymentJson.vault),
  receiptMint: new PublicKey(deploymentJson.receiptMint),
  vaultTokenAccount: new PublicKey(deploymentJson.vaultTokenAccount),
  dividendPool: new PublicKey(deploymentJson.dividendPool),
  initTx: deploymentJson.initTx,
};
