# RapiLoans MXNB Vault - Web Application

A Next.js DeFi application for borrowing and lending MXNB using Morpho VaultV2, Aave V3, and Morpho Blue on Avalanche.

## Overview

This application provides a user interface for:

### Borrow Page (`/borrow`)
- **Step 1:** Supply USDC to Aave V3 → receive aUSDC
- **Step 2:** Supply aUSDC as collateral to Morpho
- **Step 3:** Borrow MXNB against your collateral (77% LTV)
- **Manage Loan:** Repay MXNB, withdraw aUSDC collateral, withdraw USDC from Aave

### Lend Page (`/lend`)
- **Deposit:** Deposit MXNB to the Vault → receive vMXNB shares
- **Withdraw:** Redeem vMXNB shares for MXNB + yield earned

## Prerequisites

- Node.js 18+
- MetaMask browser extension
- Foundry (for running the fork)

## Quick Start

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Start the Fork

In a separate terminal, run:

```bash
# From project root
cd ..
pkill -f anvil
forge test --match-path test/AaveV3Morpho.t.sol -vvv --fork-url https://api.avax.network/ext/bc/C/rpc --fork-block-number 80779000 2>&1 | tail -30
./scripts/setup-fork.sh
```

Or manually:
```bash
anvil --fork-url https://api.avax.network/ext/bc/C/rpc --host 0.0.0.0 --port 8545 --chain-id 43114 --accounts 1 > anvil.log 2>&1

# In another terminal, deploy the fork setup
forge script script/SetupFork.s.sol --rpc-url http://localhost:8545 --broadcast -vvv
```

### 3. Configure Environment

```bash
# Copy the fork environment file
cp web/.env.fork web/.env.local
cp .env.fork web/.env.local

# Edit web/.env.local with the deployed addresses from .env.fork
# Update these variables:
# - NEXT_PUBLIC_VAULT_V2
# - NEXT_PUBLIC_ADAPTER
# - NEXT_PUBLIC_MORPHO_MARKET_ID
# - NEXT_PUBLIC_ORACLE
# - NEXT_PUBLIC_FAUCET
```

### 4. Start the App

```bash
cd web
npm run dev
```

### 5. Open in Browser

Navigate to http://localhost:3000

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_RPC_URL` | RPC endpoint (default: http://localhost:8545) |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID (43114 for Avalanche) |
| `NEXT_PUBLIC_AAVE_POOL` | Aave V3 Pool address |
| `NEXT_PUBLIC_USDC` | USDC token address |
| `NEXT_PUBLIC_AUSDC` | aUSDC (Aave USDC) token address |
| `NEXT_PUBLIC_MORPHO` | Morpho Blue address |
| `NEXT_PUBLIC_MXNB` | MXNB token address |
| `NEXT_PUBLIC_MORPHO_MARKET_ID` | aUSDC/MXNB market ID |
| `NEXT_PUBLIC_VAULT_V2` | Deployed VaultV2 address |
| `NEXT_PUBLIC_ADAPTER` | MorphoMarketV1AdapterV2 address |
| `NEXT_PUBLIC_ORACLE` | Price oracle address |
| `NEXT_PUBLIC_FAUCET` | Faucet contract address |

## Using the App

### Getting Test Tokens

1. Click "Connect MetaMask" to connect your wallet
2. Click "Get USDC" or "Get MXNB" buttons to claim test tokens from the faucet
3. Wait 24 hours between faucet claims

### Borrowing Flow

1. **Supply to Aave:** Enter USDC amount and click "Supply to Aave"
2. **Supply Collateral:** Enter aUSDC amount and click "Supply Collateral"
3. **Borrow:** Enter MXNB amount (max ~77% of collateral value) and click "Borrow MXNB"
4. **Repay/Withdraw:** When done, use the repay/withdraw inputs to close your position

### Lending Flow

1. **Deposit:** Enter MXNB amount and click "Deposit to Vault"
2. **Earn Yield:** Your MXNB is automatically allocated to the Morpho market for lending
3. **Withdraw:** Click "Redeem All" to withdraw your MXNB plus earned yield

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Wallet                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Aave V3     │  │   Morpho      │  │   VaultV2     │
│   Pool        │  │   Blue        │  │              │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   USDC        │  │   aUSDC       │  │   MXNB        │
│   (deposit)   │  │  (collateral) │  │  (lending)    │
└───────────────┘  └───────────────┘  └───────────────┘
```

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Web3:** ethers.js v6
- **Styling:** Tailwind CSS v4

## Troubleshooting

### "MetaMask is not installed"
Install the MetaMask browser extension from https://metamask.io

### Transaction fails
- Make sure you're connected to the correct network (should be chain ID 43114)
- Ensure you have enough balance for the transaction
- Check the status message for error details

### Fork not working
- Ensure anvil is running: `pgrep -f anvil`
- Check anvil logs: `cat anvil.log`
- Verify RPC is accessible: `curl -X POST http://localhost:8545 -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`

## License

GPL-2.0-or-later
