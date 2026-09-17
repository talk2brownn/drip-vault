/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/drip_vault.json`.
 */
export type DripVault = {
  "address": "H6nQUX5QaS9BwGo9aUhip1Vtrpzx9wx2d7Wwhjqw3nK2",
  "metadata": {
    "name": "dripVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "deposit",
      "docs": [
        "Depositor locks the real tokenized stock into the vault and receives",
        "DRIP receipt tokens 1:1. The receipt itself is the claim — holding it",
        "is what makes you eligible for a pro-rata slice of the next dividend."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.underlying_mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "receiptMint",
          "writable": true
        },
        {
          "name": "depositorTokenAccount",
          "writable": true
        },
        {
          "name": "depositorReceiptAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "receiptMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "distributeDividend",
      "docs": [
        "The core mechanism: pays every current receipt holder their exact",
        "pro-rata share of whatever sits in the dividend pool, in a single",
        "transaction. Holder accounts are passed in pairs via",
        "remaining_accounts: [holder_receipt_ata, holder_payout_ata, ...].",
        "This is the one thing in the whole build that has to work perfectly."
      ],
      "discriminator": [
        209,
        66,
        136,
        45,
        233,
        252,
        123,
        134
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.underlying_mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "receiptMint"
        },
        {
          "name": "dividendPool",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "totalAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundDividendPool",
      "docs": [
        "Admin/keeper funds the dividend pool with the real amount the company",
        "just declared (e.g. AAPL's $0.27/share paid into however many shares",
        "this vault holds). Kept separate from distribute so the \"money",
        "arrived\" step and the \"money got split fairly\" step are each their",
        "own auditable on-chain transaction."
      ],
      "discriminator": [
        242,
        97,
        121,
        15,
        31,
        37,
        133,
        242
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.underlying_mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "dividendPool",
          "writable": true
        },
        {
          "name": "funderTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "docs": [
        "One-time setup for a tokenized stock. Creates the vault (a PDA that will",
        "custody deposits and act as mint/transfer authority) plus the DRIP",
        "receipt mint that represents a depositor's proportional claim."
      ],
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ]
          }
        },
        {
          "name": "underlyingMint"
        },
        {
          "name": "receiptMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116,
                  45,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "dividendMint",
          "docs": [
            "The stablecoin dividends are paid in (devnet USDC stand-in)."
          ]
        },
        {
          "name": "dividendPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  100,
                  105,
                  118,
                  105,
                  100,
                  101,
                  110,
                  100,
                  45,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ticker",
          "type": "string"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Reverses a deposit: burns DRIP receipts and releases the real",
        "underlying stock back to the holder. Kept simple on purpose — this is",
        "what proves the vault is a real, composable position and not a",
        "one-way trap."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  105,
                  112,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.underlying_mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "receiptMint",
          "writable": true
        },
        {
          "name": "depositorReceiptAccount",
          "writable": true
        },
        {
          "name": "depositorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "dividendDistributed",
      "discriminator": [
        188,
        247,
        85,
        115,
        23,
        100,
        212,
        49
      ]
    },
    {
      "name": "dividendPoolFunded",
      "discriminator": [
        248,
        130,
        110,
        164,
        255,
        174,
        61,
        218
      ]
    },
    {
      "name": "vaultInitialized",
      "discriminator": [
        180,
        43,
        207,
        2,
        18,
        71,
        3,
        75
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "tickerTooLong",
      "msg": "Ticker must be 12 characters or fewer."
    },
    {
      "code": 6001,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero."
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow."
    },
    {
      "code": 6003,
      "name": "wrongMint",
      "msg": "Token account has the wrong mint."
    },
    {
      "code": 6004,
      "name": "wrongReceiptMint",
      "msg": "Token account has the wrong receipt mint."
    },
    {
      "code": 6005,
      "name": "wrongOwner",
      "msg": "Token account owner does not match signer."
    },
    {
      "code": 6006,
      "name": "noDepositors",
      "msg": "No depositors — receipt supply is zero."
    },
    {
      "code": 6007,
      "name": "noHolders",
      "msg": "No holder accounts were provided to distribute to."
    },
    {
      "code": 6008,
      "name": "malformedHolderList",
      "msg": "Holder accounts must be provided in (receipt, payout) pairs."
    }
  ],
  "types": [
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "dividendDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "distributed",
            "type": "u64"
          },
          {
            "name": "holdersPaid",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "dividendPoolFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "underlyingMint",
            "type": "pubkey"
          },
          {
            "name": "receiptMint",
            "type": "pubkey"
          },
          {
            "name": "vaultTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "dividendMint",
            "type": "pubkey"
          },
          {
            "name": "dividendPool",
            "type": "pubkey"
          },
          {
            "name": "ticker",
            "type": "string"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalDividendsDistributed",
            "type": "u64"
          },
          {
            "name": "dividendEvents",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "underlyingMint",
            "type": "pubkey"
          },
          {
            "name": "ticker",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
