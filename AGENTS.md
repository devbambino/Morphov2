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

# Run single test by name
forge test --match-test test_DepositBorrowRepayWithMarket -vvv
```

### Building
```bash
# Build contracts
forge build

# Clean and rebuild
forge clean && forge build
```

### Deployment Scripts
```bash
# Simulation mode (no real transactions)
source .env && forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --fork-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  -vvv

# Broadcast to mainnet
forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

---

## Code Style Guidelines

### File Structure & License
- Every Solidity file MUST start with:
  ```solidity
  // SPDX-License-Identifier: GPL-2.0-or-later
  pragma solidity 0.8.28;
  ```
- Use appropriate license for your code (this repo uses GPL-2.0-or-later)

### Imports
Organize imports in this order (blank line between groups):
1. Foundry: `forge-std/Test.sol`, `forge-std/Script.sol`, etc.
2. Internal/Project: `script/*.sol`, `vault-v2/interfaces/*.sol`
3. External: `openzeppelin-contracts/...`, `morpho-blue/...`

Example:
```solidity
import {Test, console} from "forge-std/Test.sol";
import {DeployMocks} from "./script/DeployMocks.s.sol";
import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IMorpho, MarketParams} from "morpho-blue/src/interfaces/IMorpho.sol";
```

### Naming Conventions
- **Contracts/Libraries**: `PascalCase` (e.g., `DeployVaultV2`, `EventsLib`)
- **Interfaces**: `I` prefix + PascalCase (e.g., `IVaultV2`, `IERC20`)
- **Functions**: `camelCase` (e.g., `setUp()`, `runWithArguments()`)
- **State Variables**: `camelCase` (e.g., `owner`, `vaultV2Factory`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEAD_DEPOSIT_HIGH_DECIMALS`)
- **Events**: `UpperCamelCase` with prefix (e.g., `VaultV2__Deposit()`)
- **Custom Errors**: `ContractName__ErrorName` (e.g., `VaultV2__Unauthorized()`)

### NatSpec Documentation
- Add NatSpec comments for all public/external functions:
  ```solidity
  /**
   * @notice Deploys a new VaultV2 instance
   * @dev Calls the factory to create a new vault with given parameters
   * @param owner The address that will own the vault
   * @return The newly created vault address
   */
  function deployVault(address owner) external returns (address);
  ```
- Document structs with field descriptions
- Include `@notice`, `@dev`, `@param`, `@return` tags

### Type Usage
- Use explicit types: `uint256`, `int256`, `address`, `bytes32`, etc.
- Avoid `var` keyword
- Use appropriate integer sizes (uint8, uint256, etc.) based on data requirements
- Use `address` for addresses, not `address payable` unless sending ETH

### Functions & Visibility
- Order functions within contract: constructor → external → public → internal → private
- Within each group, order: view → pure → nonview → nonpure
- Mark functions as `view`/`pure` where applicable
- Use custom errors instead of require with strings when possible

### Error Handling
Prefer custom errors from `ErrorsLib`:
```solidity
// Instead of:
require(msg.sender == owner, "Unauthorized");

// Use:
if (msg.sender != owner) revert VaultV2__Unauthorized();
```

### Contract Structure
```solidity
// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";

contract DeployTest is Test {
    address owner;
    address asset;
    IVaultV2 vaultV2;

    function setUp() public {
        // Setup code
    }

    function test_SomeFunctionality() public {
        // Test code
    }
}
```

### Testing Conventions
- Test contracts go in `test/` directory
- Use `.t.sol` suffix (e.g., `DeployVaultV2.t.sol`)
- Helper scripts in `test/script/`
- Mocks in `test/mocks/`
- Use `vm.chainId()`, `makeAddr()`, `deal()` for test setup

### Script Conventions
- Deployment scripts in `script/` directory
- Use `.s.sol` suffix (e.g., `DeployVaultV2.s.sol`)
- Inherit from `Script`
- Use `run()` pattern for main execution

### Security Considerations
- NEVER commit secrets or private keys
- Use `.env` file for sensitive data (add to `.gitignore`)
- Always verify addresses before use
- Test on fork before mainnet
- Follow Morpho listing requirements (timelocks >= 3 days, naming restrictions, etc.)

---

## Environment Variables

Required for deployment:
```bash
RPC_URL           # RPC endpoint
PRIVATE_KEY       # Deployer private key
OWNER             # Final vault owner
ASSET             # Underlying token (e.g., USDC)
ADAPTER_REGISTRY  # Morpho adapter registry
VAULT_V2_FACTORY  # VaultV2 factory address
MORPHO_MARKET_V1_ADAPTER_V2_FACTORY  # Adapter factory
VAULT_TIMELOCK_DURATION     # Vault timelock (259200 for listing)
ADAPTER_TIMELOCK_DURATION   # Adapter timelock (259200 for listing)
```

---

## Common Issues & Troubleshooting

### Socket Error on macOS
```bash
forge clean && source .env && forge script script/DeployVaultV2WithMarketAdapter.s.sol \
  --fork-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  -vvv
```

### Phase 8 Skipped
Ensure deployer has sufficient asset tokens for dead deposit (1e9-1e12 wei depending on decimals).

---

## Additional Resources
- [Morpho VaultV2 Documentation](https://docs.morpho.org/learn/concepts/vault-v2/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Morpho Contract Addresses](https://docs.morpho.org/get-started/resources/addresses/)
