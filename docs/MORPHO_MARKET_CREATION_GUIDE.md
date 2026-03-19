# Morpho Market Creation Guide for DeployVaultAvax Tests

## Overview

Your `DeployVaultAvax.t.sol` test file now includes comprehensive helpers for creating and managing Morpho markets. These helpers are based on patterns from the official Morpho Blue test suite and provide multiple approaches for different testing scenarios.

## Helper Functions

### 1. `_createMarketFromScratch(params)` - Inspect Market Creation Process

**Purpose**: Shows the complete market creation workflow without requiring owner privileges. Safe to call on forks.

**Signature**:
```solidity
function _createMarketFromScratch(MarketCreationParams memory params)
    internal
    returns (MarketParams memory marketParams, Id marketId)
```

**Usage Example**:
```solidity
function test_ExampleMarketCreation() public {
    MarketCreationParams memory params = MarketCreationParams({
        loanToken: USDC,
        collateralToken: CBBTC,
        oracle: 0x..., // Your oracle address
        irm: ADAPTIVE_CURVE_IRM,
        lltv: 0.8e18  // 80% LLTV
    });
    
    (MarketParams memory mktParams, Id marketId) = _createMarketFromScratch(params);
    
    console.log("Market created with ID:", vm.toString(Id.unwrap(marketId)));
}
```

**What it does**:
- Creates a `MarketParams` struct from your parameters
- Checks if IRM is enabled
- Checks if LLTV is enabled
- Attempts to create the market (with inline comments showing what requires owner privileges)
- Logs all steps

**When to use**:
- When testing on mainnet forks where markets already exist
- To understand the market creation flow
- For debugging market creation issues

---

### 2. `_createMarketWithOwner(params, morphoOwner)` - Full Market Creation with Owner

**Purpose**: Creates a complete market with full IRM/LLTV enablement and market creation. Requires owner impersonation.

**Signature**:
```solidity
function _createMarketWithOwner(MarketCreationParams memory params, address morphoOwner)
    internal
    returns (MarketParams memory marketParams, Id marketId)
```

**Usage Example (Local Anvil Testing)**:
```solidity
function test_CreateNewMarketLocally() public {
    // Get the Morpho owner (you'd need this for your local Morpho instance)
    address morphoOwner = 0x...; // Your Morpho owner address
    
    MarketCreationParams memory params = MarketCreationParams({
        loanToken: USDC,
        collateralToken: customCollateral,
        oracle: customOracle,
        irm: customIRM,
        lltv: 0.75e18  // 75% LLTV
    });
    
    (MarketParams memory mktParams, Id marketId) = 
        _createMarketWithOwner(params, morphoOwner);
    
    // Now use mktParams in your vault/adapter configuration
    _configureMarketWithParams(mktParams);
}
```

**What it does**:
- Impersonates the Morpho owner using `vm.prank()`
- Enables the IRM (if not already enabled)
- Enables the LLTV (if not already enabled)
- Creates the market (if not already created)

**When to use**:
- On local Anvil instances where you control the Morpho deployment
- When you have the Morpho owner address
- When you want to create entirely new custom markets

---

### 3. `_getOrVerifyMarket(marketId)` - Lookup Existing Market

**Purpose**: Safely retrieves and verifies an existing market from Morpho.

**Signature**:
```solidity
function _getOrVerifyMarket(Id marketId) 
    internal view 
    returns (MarketParams memory marketParams)
```

**Usage Example**:
```solidity
function test_VerifyMarketExists() public {
    // Verify the standard test market exists
    MarketParams memory marketParams = _getOrVerifyMarket(Id.wrap(MARKET_ID));
    
    assertEq(marketParams.loanToken, USDC);
    assertEq(marketParams.collateralToken, CBBTC);
    assertEq(marketParams.irm, ADAPTIVE_CURVE_IRM);
}
```

**What it does**:
- Calls `IMorpho.idToMarketParams()` to get the market
- Verifies the market exists (lastUpdate != 0)
- Returns the MarketParams struct

**When to use**:
- To verify existing markets are properly configured
- When you need market parameters for operations
- As a safety check before using a market

---

### 4. `_supplyMarketLiquidity(marketParams, loanAmount, supplier)` - Add Liquidity

**Purpose**: Supplies initial liquidity to a market (needed for borrowing operations).

**Signature**:
```solidity
function _supplyMarketLiquidity(
    MarketParams memory marketParams,
    uint256 loanAmount,
    address supplier
) internal
```

**Usage Example**:
```solidity
function test_SupplyLiquidity() public {
    MarketParams memory mktParams = _getOrVerifyMarket(Id.wrap(MARKET_ID));
    
    uint256 initialSupply = 100_000e6; // 100k USDC
    
    // Ensure supplier has funds
    deal(USDC, deployer, initialSupply);
    
    _supplyMarketLiquidity(mktParams, initialSupply, deployer);
    
    // Now borrowers can borrow from this market
}
```

**What it does**:
- Verifies supplier has sufficient balance
- Approves Morpho to spend loan tokens
- Calls `IMorpho.supply()` with the amount
- Logs supply confirmation
- Optionally verifies dead deposit

**When to use**:
- Before testing borrowing operations
- To demonstrate market operations
- When setting up complete market scenarios

---

## Step-by-Step Guide: Creating a Complete Test Market

### Scenario: Creating a new test market on local Anvil

```solidity
function test_CompleteMarketSetup() public {
    // Step 1: Define market parameters
    MarketCreationParams memory params = MarketCreationParams({
        loanToken: USDC,
        collateralToken: CBBTC,
        oracle: address(oracle),  // Your mock oracle
        irm: ADAPTIVE_CURVE_IRM,
        lltv: 0.8e18  // 80% LTV
    });
    
    // Step 2: Create the market (requires owner)
    address morphoOwner = 0x...; // Get your Morpho owner
    (MarketParams memory marketParams, Id marketId) = 
        _createMarketWithOwner(params, morphoOwner);
    
    // Step 3: Supply initial liquidity
    uint256 liquidityAmount = 1_000_000e6; // 1M USDC
    deal(USDC, deployer, liquidityAmount);
    _supplyMarketLiquidity(marketParams, liquidityAmount, deployer);
    
    // Step 4: Configure your vault/adapter to use this market
    _configureVaultForMarket(marketParams);
    
    // Step 5: Test vault operations
    testDepositAndBorrow();
}
```

### Scenario: Testing with existing market on Avalanche fork

```solidity
function test_ExistingMarketIntegration() public {
    // Step 1: Verify market exists
    MarketParams memory marketParams = _getOrVerifyMarket(Id.wrap(MARKET_ID));
    
    // Step 2: Configure vault with existing market
    bytes memory liquidityData = abi.encode(marketParams);
    vault.submit(abi.encodeCall(vault.setLiquidityAdapterAndData, 
        (adapter, liquidityData)));
    vault.setLiquidityAdapterAndData(adapter, liquidityData);
    
    // Step 3: Ensure sufficient dead deposit exists
    _supplyMarketLiquidity(marketParams, DEAD_DEPOSIT_AMOUNT, deployer);
    
    // Step 4: Test vault operations
    _deployWithMarket();
}
```

---

## Common Issues & Solutions

### Issue: "Market does not exist"
**Solution**: 
- Use `_getOrVerifyMarket()` to check if market exists
- If testing on fork, market should already exist
- If on local Anvil, use `_createMarketWithOwner()` with proper owner address

### Issue: "IRM_NOT_ENABLED"
**Solution**:
- Call `morpho.enableIrm(irm)` with owner privileges
- Or use `_createMarketWithOwner()` which handles this

### Issue: "LLTV_NOT_ENABLED"  
**Solution**:
- Call `morpho.enableLltv(lltv)` with owner privileges
- Or use `_createMarketWithOwner()` which handles this

### Issue: "MARKET_ALREADY_CREATED"
**Solution**:
- Market already exists, safe to use
- Use `_getOrVerifyMarket()` to retrieve it
- Don't call create again

---

## Key Patterns from Morpho Blue

These helpers follow patterns from the official Morpho BLUE test suite:

1. **IRM Enablement**: IRMs must be enabled before market creation
   ```solidity
   if (!morpho.isIrmEnabled(params.irm)) {
       morpho.enableIrm(params.irm);
   }
   ```

2. **LLTV Enablement**: LLTV values must be enabled before market creation
   ```solidity
   if (!morpho.isLltvEnabled(params.lltv)) {
       morpho.enableLltv(params.lltv);
   }
   ```

3. **Market Creation**: Only creates if market doesn't exist
   ```solidity
   if (morpho.lastUpdate(marketId) == 0) {
       morpho.createMarket(marketParams);
   }
   ```

4. **Dead Deposit**: Initialization deposit at `address(0xdead)` to prevent donation attacks
   ```solidity
   Position memory deadPosition = morpho.position(marketId, address(0xdead));
   if (deadPosition.supplyShares < requiredAmount) {
       morpho.supply(marketParams, amount, 0, address(0xdead), hex"");
   }
   ```

---

## Resources

- **Morpho Blue Repo**: https://github.com/morpho-org/morpho-blue
- **CreateMarketIntegrationTest**: Reference implementation
- **BaseTest**: Helper utilities and patterns
- **Your test file**: `DeployVaultAvax.t.sol` now contains inline documentation

---

## Next Steps

1. Review `_configureMarketAndLiquidityAdapter()` to see how markets are used in vault setup
2. Check if your tests need market creation or just market lookup
3. Choose the appropriate helper based on your testing environment
4. Add custom market parameters as needed for your test scenarios

