import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ACCOUNT_SIZE, AccountLayout } from "@solana/spl-token";

export interface ReceiptHolder {
  owner: PublicKey;
  tokenAccount: PublicKey;
  amount: bigint;
}

/** Finds every non-zero holder of the DRIP receipt mint — this is what
 * distribute_dividend needs to know who to pay. In a bigger production
 * version this would page through results; for a hackathon-scale holder
 * count a single getProgramAccounts call is plenty. */
export async function getReceiptHolders(
  connection: Connection,
  receiptMint: PublicKey
): Promise<ReceiptHolder[]> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: ACCOUNT_SIZE },
      { memcmp: { offset: 0, bytes: receiptMint.toBase58() } },
    ],
  });

  return accounts
    .map(({ pubkey, account }) => {
      const decoded = AccountLayout.decode(account.data);
      return {
        owner: new PublicKey(decoded.owner),
        tokenAccount: pubkey,
        amount: decoded.amount,
      };
    })
    .filter((h) => h.amount > 0n);
}
