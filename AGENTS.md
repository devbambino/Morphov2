# AGENTS.md - Developer Guidelines for Morphov2

## Overview
This repository contains Solidity smart contracts for deploying Morpho VaultV2 with MorphoMarketV1AdapterV2. It uses Foundry as the development framework.

---

## Build, Test & Deployment Commands

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Run `forge install` to install dependencies

### Running Tests
```bash
# Run all tests with Avax mainnet fork
forge test --fork-url https://api.avax.network/ext/bc/C/rpc

# Run all tests (requires RPC_URL in .env)
source .env && forge test --fork-url "$RPC_URL" -vvv

# Run specific test file
forge test --match-path test/DeployVaultAvax.t.sol -vvv

# Run single test by name (most common)
forge test --match-test test_DepositBorrowRepayWithMarket -vvv

# Run tests matching a pattern
forge test --match-test "test_Deploy*" -vvv
```

### Building
```bash
forge build
forge clean && forge build
```

### Deployment Scripts
```bash
# Simulation mode (no real transactions)
source .env && forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --fork-url "$RPC_URL" --private-key "$PRIVATE_KEY" -vvv

# Broadcast to mainnet
forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

---

## Code Style Guidelines

### File Structure & License
- Every Solidity file MUST start with:
  ```solidity
  // SPDX-License-Identifier: GPL-2.0-or-later
  pragma solidity 0.8.28;
  ```

### Imports (Order: blank line between groups)
1. Foundry: `forge-std/Test.sol`, `forge-std/Script.sol`
2. Internal/Project: `vault-v2/...`, `script/*.sol`
3. External: `openzeppelin-contracts/...`, `morpho-blue/...`

```solidity
import {Test, console} from "forge-std/Test.sol";
import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IMorpho, MarketParams} from "morpho-blue/src/interfaces/IMorpho.sol";
```

### Naming Conventions
- **Contracts/Libraries**: `PascalCase` (e.g., `DeployVaultV2`, `EventsLib`)
- **Interfaces**: `I` prefix + PascalCase (e.g., `IVaultV2`, `IERC20`)
- **Functions/State Variables**: `camelCase` (e.g., `setUp()`, `owner`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEAD_DEPOSIT_HIGH_DECIMALS`)
- **Events**: `UpperCamelCase` with prefix (e.g., `VaultV2__Deposit()`)
- **Custom Errors**: `ContractName__ErrorName` (e.g., `VaultV2__Unauthorized()`)

### Functions & Visibility
Order: constructor → external → public → internal → private. Within groups: view → pure → nonview.
Mark functions as `view`/`pure` where applicable.

### Error Handling
Use custom errors instead of `require` with strings:
```solidity
if (msg.sender != owner) revert VaultV2__Unauthorized();
```

### NatSpec Documentation
Required for all public/external functions:
```solidity
/**
 * @notice Deploys a new VaultV2 instance
 * @dev Calls the factory to create a new vault
 * @param owner The address that will own the vault
 * @return The newly created vault address
 */
```

### Testing Conventions
- Test files in `test/` with `.t.sol` suffix
- Helper scripts in `test/script/`, mocks in `test/mocks/`
- Use `vm.chainId()`, `makeAddr()`, `deal()`, `vm.prank()`

---

## Project Structure
```
/workspaces/Morphov2
├── script/           # Deployment scripts (.s.sol)
├── test/             # Test files (.t.sol)
│   ├── mocks/         # Mock contracts for testing
│   └── script/        # Test deployment helpers
├── archives/          # Archived/full contracts
├── foundry.toml       # Foundry configuration
└── AGENTS.md          # This file
```

---

## Environment Variables
Required for deployment (store in `.env`, add to `.gitignore`):
```bash
RPC_URL           # RPC endpoint
PRIVATE_KEY       # Deployer private key
OWNER             # Final vault owner
ASSET             # Underlying token (e.g., USDC)
ADAPTER_REGISTRY  # Morpho adapter registry
VAULT_V2_FACTORY  # VaultV2 factory address
MORPHO_MARKET_V1_ADAPTER_V2_FACTORY  # Adapter factory
VAULT_TIMELOCK_DURATION     # Vault timelock (259200 = 3 days)
ADAPTER_TIMELOCK_DURATION   # Adapter timelock (259200 = 3 days)
```

---

## Common Issues

### Phase 8 Skipped (dead deposit)
Ensure deployer has sufficient asset tokens: 1e9 for >=10 decimals, 1e12 for <=9 decimals.

### Socket Error on macOS
```bash
forge clean && source .env && forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --fork-url "$RPC_URL" --private-key "$PRIVATE_KEY" -vvv
```

---

## Morpho Listing Requirements
- **Timelocks**: Minimum 3 days (259200 seconds) for listing eligibility
- **Naming**: Vault name/symbol CANNOT contain "morpho" (case insensitive)
- **No Idle Liquidity**: All deposited funds must be allocated to markets
- **Dead Deposits**: Markets must have >=1e9 shares at address(0xdead)

---

## Additional Resources
- [Morpho VaultV2 Documentation](https://docs.morpho.org/learn/concepts/vault-v2/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Morpho Contract Addresses](https://docs.morpho.org/get-started/resources/addresses/)
