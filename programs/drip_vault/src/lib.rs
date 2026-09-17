use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("H6nQUX5QaS9BwGo9aUhip1Vtrpzx9wx2d7Wwhjqw3nK2");

pub const VAULT_SEED: &[u8] = b"drip-vault";
pub const RECEIPT_MINT_SEED: &[u8] = b"drip-receipt-mint";
pub const VAULT_TOKEN_SEED: &[u8] = b"drip-vault-token";
pub const DIVIDEND_POOL_SEED: &[u8] = b"drip-dividend-pool";
pub const MAX_TICKER_LEN: usize = 12;

#[program]
pub mod drip_vault {
    use super::*;

    /// One-time setup for a tokenized stock. Creates the vault (a PDA that will
    /// custody deposits and act as mint/transfer authority) plus the DRIP
    /// receipt mint that represents a depositor's proportional claim.
    pub fn initialize_vault(ctx: Context<InitializeVault>, ticker: String) -> Result<()> {
        require!(ticker.len() <= MAX_TICKER_LEN, DripError::TickerTooLong);

        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.underlying_mint = ctx.accounts.underlying_mint.key();
        vault.receipt_mint = ctx.accounts.receipt_mint.key();
        vault.vault_token_account = ctx.accounts.vault_token_account.key();
        vault.dividend_mint = ctx.accounts.dividend_mint.key();
        vault.dividend_pool = ctx.accounts.dividend_pool.key();
        vault.ticker = ticker;
        vault.total_deposited = 0;
        vault.total_dividends_distributed = 0;
        vault.dividend_events = 0;
        vault.bump = ctx.bumps.vault;

        emit!(VaultInitialized {
            vault: vault.key(),
            underlying_mint: vault.underlying_mint,
            ticker: vault.ticker.clone(),
        });
        Ok(())
    }

    /// Depositor locks the real tokenized stock into the vault and receives
    /// DRIP receipt tokens 1:1. The receipt itself is the claim — holding it
    /// is what makes you eligible for a pro-rata slice of the next dividend.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, DripError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault_authority = ctx.accounts.vault.authority;
        let underlying_mint = ctx.accounts.vault.underlying_mint;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[
            VAULT_SEED,
            vault_authority.as_ref(),
            underlying_mint.as_ref(),
            &[bump],
        ];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.receipt_mint.to_account_info(),
                    to: ctx.accounts.depositor_receipt_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(DripError::MathOverflow)?;

        emit!(Deposited {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
        });
        Ok(())
    }

    /// Reverses a deposit: burns DRIP receipts and releases the real
    /// underlying stock back to the holder. Kept simple on purpose — this is
    /// what proves the vault is a real, composable position and not a
    /// one-way trap.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, DripError::ZeroAmount);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.receipt_mint.to_account_info(),
                    from: ctx.accounts.depositor_receipt_account.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault_authority = ctx.accounts.vault.authority;
        let underlying_mint = ctx.accounts.vault.underlying_mint;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[
            VAULT_SEED,
            vault_authority.as_ref(),
            underlying_mint.as_ref(),
            &[bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.depositor_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault
            .total_deposited
            .checked_sub(amount)
            .ok_or(DripError::MathOverflow)?;

        emit!(Withdrawn {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
        });
        Ok(())
    }

    /// Admin/keeper funds the dividend pool with the real amount the company
    /// just declared (e.g. AAPL's $0.27/share paid into however many shares
    /// this vault holds). Kept separate from distribute so the "money
    /// arrived" step and the "money got split fairly" step are each their
    /// own auditable on-chain transaction.
    pub fn fund_dividend_pool(ctx: Context<FundDividendPool>, amount: u64) -> Result<()> {
        require!(amount > 0, DripError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder_token_account.to_account_info(),
                    to: ctx.accounts.dividend_pool.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(DividendPoolFunded {
            vault: ctx.accounts.vault.key(),
            amount,
        });
        Ok(())
    }

    /// The core mechanism: pays every current receipt holder their exact
    /// pro-rata share of whatever sits in the dividend pool, in a single
    /// transaction. Holder accounts are passed in pairs via
    /// remaining_accounts: [holder_receipt_ata, holder_payout_ata, ...].
    /// This is the one thing in the whole build that has to work perfectly.
    pub fn distribute_dividend<'info>(
        ctx: Context<'_, '_, 'info, 'info, DistributeDividend<'info>>,
        total_amount: u64,
    ) -> Result<()> {
        require!(total_amount > 0, DripError::ZeroAmount);

        let total_supply = ctx.accounts.receipt_mint.supply;
        require!(total_supply > 0, DripError::NoDepositors);

        let remaining: &[AccountInfo<'info>] = ctx.remaining_accounts;
        require!(!remaining.is_empty(), DripError::NoHolders);
        require!(remaining.len() % 2 == 0, DripError::MalformedHolderList);

        let vault_key = ctx.accounts.vault.key();
        let vault_authority = ctx.accounts.vault.authority;
        let underlying_mint = ctx.accounts.vault.underlying_mint;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[
            VAULT_SEED,
            vault_authority.as_ref(),
            underlying_mint.as_ref(),
            &[bump],
        ];

        let mut distributed: u64 = 0;
        let mut holders_paid: u32 = 0;
        let mut i = 0;
        while i < remaining.len() {
            let holder_receipt_ai: &AccountInfo<'info> = &remaining[i];
            let holder_payout_ai: &AccountInfo<'info> = &remaining[i + 1];

            let holder_receipt = Account::<TokenAccount>::try_from(holder_receipt_ai)?;
            require!(
                holder_receipt.mint == ctx.accounts.receipt_mint.key(),
                DripError::WrongReceiptMint
            );

            // Floor division on purpose: any dust that doesn't divide evenly
            // stays in the pool rather than being invented from nowhere.
            let share: u64 = (total_amount as u128)
                .checked_mul(holder_receipt.amount as u128)
                .ok_or(DripError::MathOverflow)?
                .checked_div(total_supply as u128)
                .ok_or(DripError::MathOverflow)?
                .try_into()
                .map_err(|_| DripError::MathOverflow)?;

            if share > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.dividend_pool.to_account_info(),
                            to: holder_payout_ai.clone(),
                            authority: ctx.accounts.vault.to_account_info(),
                        },
                        &[seeds],
                    ),
                    share,
                )?;
                distributed = distributed.checked_add(share).ok_or(DripError::MathOverflow)?;
                holders_paid += 1;
            }
            i += 2;
        }

        let vault = &mut ctx.accounts.vault;
        vault.total_dividends_distributed = vault
            .total_dividends_distributed
            .checked_add(distributed)
            .ok_or(DripError::MathOverflow)?;
        vault.dividend_events = vault.dividend_events.checked_add(1).ok_or(DripError::MathOverflow)?;

        emit!(DividendDistributed {
            vault: vault_key,
            total_amount,
            distributed,
            holders_paid,
        });
        Ok(())
    }
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub underlying_mint: Pubkey,
    pub receipt_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub dividend_mint: Pubkey,
    pub dividend_pool: Pubkey,
    pub ticker: String,
    pub total_deposited: u64,
    pub total_dividends_distributed: u64,
    pub dividend_events: u32,
    pub bump: u8,
}

impl Vault {
    pub const MAX_SIZE: usize = 32 * 6 + (4 + MAX_TICKER_LEN) + 8 + 8 + 4 + 1;
}

#[derive(Accounts)]
#[instruction(ticker: String)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Vault::MAX_SIZE,
        seeds = [VAULT_SEED, authority.key().as_ref(), underlying_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub underlying_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = underlying_mint.decimals,
        mint::authority = vault,
        seeds = [RECEIPT_MINT_SEED, vault.key().as_ref()],
        bump
    )]
    pub receipt_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = underlying_mint,
        token::authority = vault,
        seeds = [VAULT_TOKEN_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// The stablecoin dividends are paid in (devnet USDC stand-in).
    pub dividend_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = dividend_mint,
        token::authority = vault,
        seeds = [DIVIDEND_POOL_SEED, vault.key().as_ref()],
        bump
    )]
    pub dividend_pool: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), vault.underlying_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, address = vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = vault.receipt_mint)]
    pub receipt_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = depositor_token_account.mint == vault.underlying_mint @ DripError::WrongMint,
        constraint = depositor_token_account.owner == depositor.key() @ DripError::WrongOwner,
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = receipt_mint,
        associated_token::authority = depositor,
    )]
    pub depositor_receipt_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), vault.underlying_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, address = vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = vault.receipt_mint)]
    pub receipt_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = depositor_receipt_account.mint == vault.receipt_mint @ DripError::WrongReceiptMint,
        constraint = depositor_receipt_account.owner == depositor.key() @ DripError::WrongOwner,
    )]
    pub depositor_receipt_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = depositor_token_account.mint == vault.underlying_mint @ DripError::WrongMint,
        constraint = depositor_token_account.owner == depositor.key() @ DripError::WrongOwner,
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundDividendPool<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.as_ref(), vault.underlying_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, address = vault.dividend_pool)]
    pub dividend_pool: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = funder_token_account.mint == vault.dividend_mint @ DripError::WrongMint,
        constraint = funder_token_account.owner == funder.key() @ DripError::WrongOwner,
    )]
    pub funder_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeDividend<'info> {
    #[account(
        mut,
        has_one = authority @ DripError::WrongOwner,
        seeds = [VAULT_SEED, vault.authority.as_ref(), vault.underlying_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub authority: Signer<'info>,

    #[account(address = vault.receipt_mint)]
    pub receipt_mint: Account<'info, Mint>,

    #[account(mut, address = vault.dividend_pool)]
    pub dividend_pool: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    // remaining_accounts: [holder_receipt_ata_0, holder_payout_ata_0, holder_receipt_ata_1, holder_payout_ata_1, ...]
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub underlying_mint: Pubkey,
    pub ticker: String,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DividendPoolFunded {
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DividendDistributed {
    pub vault: Pubkey,
    pub total_amount: u64,
    pub distributed: u64,
    pub holders_paid: u32,
}

#[error_code]
pub enum DripError {
    #[msg("Ticker must be 12 characters or fewer.")]
    TickerTooLong,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
    #[msg("Token account has the wrong mint.")]
    WrongMint,
    #[msg("Token account has the wrong receipt mint.")]
    WrongReceiptMint,
    #[msg("Token account owner does not match signer.")]
    WrongOwner,
    #[msg("No depositors — receipt supply is zero.")]
    NoDepositors,
    #[msg("No holder accounts were provided to distribute to.")]
    NoHolders,
    #[msg("Holder accounts must be provided in (receipt, payout) pairs.")]
    MalformedHolderList,
}
