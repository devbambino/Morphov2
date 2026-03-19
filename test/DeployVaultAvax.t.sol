// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {VaultV2} from "vault-v2/VaultV2.sol";
import {VaultV2Factory} from "vault-v2/VaultV2Factory.sol";
import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";
import {IMorphoMarketV1AdapterV2} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2.sol";
import {IMorphoMarketV1AdapterV2Factory} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2Factory.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IMorpho, MarketParams, Id, Position} from "morpho-blue/src/interfaces/IMorpho.sol";
import {DeployVaultV2WithMarketAdapter} from "../script/DeployVaultV2WithMarketAdapter.s.sol";
import {MarketParamsLib} from "morpho-blue/src/libraries/MarketParamsLib.sol";
import {OracleMock} from "./mocks/OracleMock.sol";

/**
 * @title DeployVaultAvaxTest
 * @notice Tests deployment logic for VaultV2 with MorphoMarketV1AdapterV2 on Base mainnet fork
 */
contract DeployVaultAvaxTest is Test {
    using MarketParamsLib for MarketParams;

    uint256 internal constant BLOCK_TIME = 1;
    uint256 internal constant FORK_BLOCK = 80_779_000; // Safe finalized block (~6 days old)
    
    // Base mainnet addresses
    address constant VAULT_V2_FACTORY = 0xf7b1d9e43BAeA3705f2B303693766ACbcfec6A55;
    address constant MORPHO_MARKET_V1_ADAPTER_V2_FACTORY = 0x9633D22Bb8F42f6f70DbbBe34c11EB9209769b8b;
    address constant ADAPTER_REGISTRY = 0x66dC122CF454576684Ad78A2800a8Eb052b2E9a6;
    address constant MORPHO = 0x895383274303AA19fe978AFB4Ac55C7f094f982C;
    address constant ADAPTIVE_CURVE_IRM = 0xb6ac9477D574EE2a7BF32d2475b303fb70968AA4;

    // Tokens
    address constant MXNB = 0xF197FFC28c23E0309B5559e7a166f2c6164C80aA; // Vault asset and market loan token (6 decimals)
    address constant USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E; // Market collateral token (6 decimals)

    // Test market: MXNB/USDC with Adaptive Curve IRM
    // Note: Update MARKET_ID to the actual MXNB/USDC market on Avalanche
    bytes32 MARKET_ID = 0x0; // Placeholder - update for MXNB/USDC
    address constant COLLATERAL_TOKEN = USDC;

    uint256 constant DEAD_DEPOSIT_AMOUNT = 1e12; // For 6 decimal asset
    uint128 constant COLLATERAL_TOKEN_CAP = type(uint128).max; // Unlimited for testing
    uint128 constant MARKET_CAP = type(uint128).max; // Unlimited for testing

    address deployer = makeAddr("deployer");

    // Deployed contracts - set by _deploy()
    VaultV2 vault;
    address adapter;
    OracleMock oracle;

    /**
     * @notice Structure for market creation parameters
     */
    struct MarketCreationParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    function setUp() public {
        vm.createSelectFork("https://api.avax.network/ext/bc/C/rpc", FORK_BLOCK);
        console.log("deployer:",deployer);
        uint256 initialMXNBBalance = IERC20(MXNB).balanceOf(deployer);
        uint256 initialUSDCBalance = IERC20(USDC).balanceOf(deployer);
        console.log("initialMXNBBalance:",initialMXNBBalance);
        console.log("initialUSDCBalance:",initialUSDCBalance);
        deal(MXNB, deployer, 100_000_000e6); // 100M MXNB for vault operations
        deal(USDC, deployer, 100_000_000e6); // 100M USDC for market operations and collateral
        uint256 MXNBBalance = IERC20(MXNB).balanceOf(deployer);
        uint256 USDCBalance = IERC20(USDC).balanceOf(deployer);
        console.log("MXNBBalance:",MXNBBalance);
        console.log("USDCBalance:",USDCBalance);

        // Deploy oracle for MXNB/USDC market
        // Price formula: price_in_usd * 10^(loan_decimals - collateral_decimals + 36)
        // 1 USDC = 17.9 MXNB, so: 17.9 * 10^(6 - 6 + 36) = 179 * 1e35
        oracle = new OracleMock();
        oracle.setPrice(179 * 1e35);
    }

    /// @dev Rolls & warps the given number of blocks forward the blockchain.
    function _forward(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * BLOCK_TIME); // Block speed should depend on test network.
    }

    /**
     * @notice Helper to create a new Morpho market from scratch
     * @dev This handles IRM/LLTV enablement and market creation in one call
     * @param params The market creation parameters (loanToken, collateralToken, oracle, irm, lltv)
     * @return marketParams The created MarketParams struct
     * @return marketId The ID of the created market
     *
     * USAGE EXAMPLE:
     *     MarketCreationParams memory params = MarketCreationParams({
     *         loanToken: USDC,
     *         collateralToken: CBBTC,
     *         oracle: address(oracle), // You'd need to deploy an oracle
     *         irm: ADAPTIVE_CURVE_IRM,
     *         lltv: 0.8e18  // 80%
     *     });
     *     (MarketParams memory mktParams, Id marketId) = _createMarketFromScratch(params);
     */
    function _createMarketFromScratch(MarketCreationParams memory params)
        internal
        returns (MarketParams memory marketParams, Id marketId)
    {
        IMorpho morpho = IMorpho(MORPHO);

        // Construct the MarketParams struct
        marketParams = MarketParams({
            loanToken: params.loanToken,
            collateralToken: params.collateralToken,
            oracle: params.oracle,
            irm: params.irm,
            lltv: params.lltv
        });

        marketId = marketParams.id();

        // Note: In production, you'd need Morpho owner to perform these steps
        // For testing on mainnet forks, you can use vm.prank with the actual owner address
        // or deploy your own Morpho instance with a known owner

        console.log("Creating market with parameters:");
        console.log("- Loan Token:", params.loanToken);
        console.log("- Collateral Token:", params.collateralToken);
        console.log("- Oracle:", params.oracle);
        console.log("- IRM:", params.irm);
        console.log("- LLTV:", params.lltv);
        console.log("- Market ID:", vm.toString(Id.unwrap(marketId)));

        /**
         * STEP 1: Enable IRM (if not address(0))
         * This allows the market to use this Interest Rate Model
         */
        if (params.irm != address(0)) {
            bool irmEnabled = morpho.isIrmEnabled(params.irm);
            if (!irmEnabled) {
                console.log("IRM not enabled, attempting to enable...");
                // try morpho.enableIrm(params.irm) {
                //     console.log("IRM enabled successfully");
                // } catch Error(string memory reason) {
                //     console.log("Failed to enable IRM:", reason);
                //     console.log("Note: Requires Morpho owner privileges");
                // }
            } else {
                console.log("IRM already enabled");
            }
        }

        /**
         * STEP 2: Enable LLTV (Liquidation LTV)
         * This percentage determines the maximum LTV ratio for the market
         */
        bool lltvEnabled = morpho.isLltvEnabled(params.lltv);
        if (!lltvEnabled) {
            console.log("LLTV not enabled, attempting to enable...");
            // try morpho.enableLltv(params.lltv) {
            //     console.log("LLTV enabled successfully");
            // } catch Error(string memory reason) {
            //     console.log("Failed to enable LLTV:", reason);
            //     console.log("Note: Requires Morpho owner privileges");
            // }
        } else {
            console.log("LLTV already enabled");
        }

        /**
         * STEP 3: Check if market already exists
         * A market is considered to exist if loanToken is set to MXNB
         */
        MarketParams memory marketParamsTemp = morpho.idToMarketParams(marketId);
        console.log("Market already exists at loanToken:", marketParamsTemp.loanToken);
        if (marketParamsTemp.loanToken == MXNB) {
            console.log("Market already exists at loanToken:", marketParamsTemp.loanToken);
        } else {
            console.log("Market does not exist, attempting to create...");
            try morpho.createMarket(marketParams) {
                console.log("Market created successfully!");
                console.log("Market ID:", vm.toString(Id.unwrap(marketId)));
            } catch Error(string memory reason) {
                console.log("Failed to create market:", reason);
                console.log("Common reasons:");
                console.log("- IRM_NOT_ENABLED: IRM address not enabled");
                console.log("- LLTV_NOT_ENABLED: LLTV value not enabled");
                console.log("- MARKET_ALREADY_CREATED: Market already exists");
                console.log("Note: Market creation requires Morpho owner privileges");
            }
        }

        // Set state variable so other methods can use this market
        MARKET_ID = Id.unwrap(marketId);

        return (marketParams, marketId);
    }

    /**
     * @notice Advanced: Create market with owner impersonation (for local testing)
     * @dev Use this when you have/can impersonate the Morpho owner (local Anvil tests)
     * @param params Market creation parameters
     * @param morphoOwner The address of the Morpho contract owner
     * @return marketParams The created MarketParams
     * @return marketId The market ID
     */
    function _createMarketWithOwner(MarketCreationParams memory params, address morphoOwner)
        internal
        returns (MarketParams memory marketParams, Id marketId)
    {

        IMorpho morpho = IMorpho(MORPHO);

        marketParams = MarketParams({
            loanToken: params.loanToken,
            collateralToken: params.collateralToken,
            oracle: params.oracle,
            irm: params.irm,
            lltv: params.lltv
        });

        marketId = marketParams.id();

        console.log("Creating market with owner impersonation...");

        // Create market if it doesn't exist
        MarketParams memory marketParamsTemp = morpho.idToMarketParams(marketId);
        //console.log("_createMarketWithOwner market exist:",marketParamsTemp);
        if (marketParamsTemp.loanToken != MXNB) {
            vm.prank(morphoOwner);
            morpho.createMarket(marketParams);
            console.log("Market created successfully!");
            console.log("Market ID:", vm.toString(Id.unwrap(marketId)));
        } else {
            console.log("Market already exists");
        }

        // Set state variable so other methods can use this market
        MARKET_ID = Id.unwrap(marketId);

        return (marketParams, marketId);
    }

    /**
     * @notice Ensure market exists by lookg it up from Morpho
     * @dev Safe to call for existing markets on forks
     * @param marketId The market ID to lookup
     * @return marketParams The market parameters
     */
    function _getOrVerifyMarket(Id marketId) internal view returns (MarketParams memory marketParams) {
        IMorpho morpho = IMorpho(MORPHO);
        
        MarketParams memory verifiedParams = morpho.idToMarketParams(marketId);
        
        require(verifiedParams.loanToken == MXNB, "Market does not exist or invalid loanToken");
        
        return verifiedParams;
    }

    /**
     * @notice Supply initial liquidity to a market
     * @dev Provides both loan token liquidity and validates dead deposit
     * @param marketParams The market parameters
     * @param loanAmount Amount of loan token to supply
     * @param supplier The address supplying the liquidity (must have funds)
     */
    function _supplyMarketLiquidity(
        MarketParams memory marketParams,
        uint256 loanAmount,
        address supplier
    ) internal {
        IMorpho morpho = IMorpho(MORPHO);

        console.log("Supplying market liquidity...");
        console.log("- Loan Amount:", loanAmount);
        console.log("- Supplier:", supplier);

        // Ensure supplier has sufficient balance
        uint256 supplierBalance = IERC20(marketParams.loanToken).balanceOf(supplier);
        require(supplierBalance >= loanAmount, "Supplier insufficient balance");

        // Approve Morpho to spend loan tokens
        vm.prank(supplier);
        IERC20(marketParams.loanToken).approve(address(morpho), loanAmount);

        // Supply the loan tokens
        vm.prank(supplier);
        (uint256 suppliedAssets, uint256 suppliedShares) = morpho.supply(
            marketParams,
            loanAmount,
            0, // shares = 0, we're specifying assets
            supplier, // on behalf of
            hex"" // callback data
        );

        console.log("Liquidity supplied!");
        console.log("- Supplied Assets:", suppliedAssets);
        console.log("- Supplied Shares:", suppliedShares);

        // Verify dead deposit if using address(0xdead)
        Position memory deadPosition = morpho.position(marketParams.id(), address(0xdead));
        if (deadPosition.supplyShares > 0) {
            console.log("Dead deposit verified:", deadPosition.supplyShares);
        }
    }

    /**
     * @notice Deploy without a market (liquidityAdapter not set)
     * @dev Dead deposit stays idle in vault
     */
    function _deployWithoutMarket() internal {
        vm.startPrank(deployer);

        // Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));

        // Set temporary curator
        vault.setCurator(deployer);

        // Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        // Submit all timelocked changes (NO liquidityAdapterAndData - requires market params)
        bytes memory adapterIdData = abi.encode("this", adapter);
        vault.submit(abi.encodeCall(vault.setIsAllocator, (deployer, true)));
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (ADAPTER_REGISTRY)));
        vault.submit(abi.encodeCall(vault.addAdapter, (adapter)));
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (adapterIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (adapterIdData, 1e18)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setAdapterRegistry.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setSendSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveAssetsGate.selector)));

        // Execute all changes (NO liquidityAdapterAndData)
        vault.setAdapterRegistry(ADAPTER_REGISTRY);
        vault.setIsAllocator(deployer, true);
        vault.addAdapter(adapter);
        vault.increaseAbsoluteCap(adapterIdData, type(uint128).max);
        vault.increaseRelativeCap(adapterIdData, 1e18);
        vault.abdicate(IVaultV2.setAdapterRegistry.selector);
        vault.abdicate(IVaultV2.setReceiveSharesGate.selector);
        vault.abdicate(IVaultV2.setSendSharesGate.selector);
        vault.abdicate(IVaultV2.setReceiveAssetsGate.selector);

        // Dead deposit (stays idle in vault since no liquidityAdapter)
        IERC20(MXNB).approve(address(vault), DEAD_DEPOSIT_AMOUNT);
        vault.deposit(DEAD_DEPOSIT_AMOUNT, address(0xdead));

        vm.stopPrank();
    }

    /**
     * @notice Deploy with a market (liquidityAdapter set with encoded MarketParams)
     * @dev Dead deposit allocates to the configured market
     */
    function _deployWithMarket() internal {
        vm.startPrank(deployer);

        // Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));

        // Set temporary curator
        vault.setCurator(deployer);

        // Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        // Submit all timelocked changes (NO liquidityAdapterAndData yet)
        bytes memory adapterIdData = abi.encode("this", adapter);
        vault.submit(abi.encodeCall(vault.setIsAllocator, (deployer, true)));
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (ADAPTER_REGISTRY)));
        vault.submit(abi.encodeCall(vault.addAdapter, (adapter)));
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (adapterIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (adapterIdData, 1e18)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setAdapterRegistry.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setSendSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveAssetsGate.selector)));

        // Execute all changes (NO liquidityAdapterAndData yet)
        vault.setAdapterRegistry(ADAPTER_REGISTRY);
        vault.setIsAllocator(deployer, true);
        vault.addAdapter(adapter);
        vault.increaseAbsoluteCap(adapterIdData, type(uint128).max);
        vault.increaseRelativeCap(adapterIdData, 1e18);
        vault.abdicate(IVaultV2.setAdapterRegistry.selector);
        vault.abdicate(IVaultV2.setReceiveSharesGate.selector);
        vault.abdicate(IVaultV2.setSendSharesGate.selector);
        vault.abdicate(IVaultV2.setReceiveAssetsGate.selector);

        // Configure market and liquidity adapter BEFORE dead deposit
        _configureMarketAndLiquidityAdapter();

        // Dead deposit (allocates to market via liquidityAdapter)
        IERC20(MXNB).approve(address(vault), DEAD_DEPOSIT_AMOUNT);
        vault.deposit(DEAD_DEPOSIT_AMOUNT, address(0xdead));

        vm.stopPrank();
    }

    /**
     * @notice Create or verify Morpho market exists
     * @dev Handles IRM and LLTV enablement, then creates market if it doesn't exist
     */
    function _createOrVerifyMarket(MarketParams memory marketParams) internal {
        
        Id marketId = marketParams.id();
        console.log("Market ID:", vm.toString(Id.unwrap(marketId)));
        IMorpho morpho = IMorpho(MORPHO);

        // Step 1: Enable IRM if not already enabled
        // Note: This step requires Morpho owner privileges
        // For testing on fork, we try to enable it; if we don't have privileges, the market may already exist
        try morpho.isIrmEnabled(marketParams.irm) returns (bool isEnabled) {
            if (!isEnabled) {
                morpho.enableIrm(marketParams.irm);
                console.log("IRM enabled");
            }
        } catch {}

        // Step 2: Enable LLTV if not already enabled
        // Note: This step also requires Morpho owner privileges
        try morpho.isLltvEnabled(marketParams.lltv) returns (bool isEnabled) {
            if (!isEnabled) {
                morpho.enableLltv(marketParams.lltv);
                console.log("LLTV enabled");
            }
        } catch {}

        // Step 3: Create market if it doesn't exist
        // Market exists if loanToken matches MXNB
        MarketParams memory marketParamsCheck = morpho.idToMarketParams(marketId);
        if (marketParamsCheck.loanToken != MXNB) {
            // Market doesn't exist - try to create it
            // Note: This requires Morpho owner privileges
            try morpho.createMarket(marketParams) {
                console.log("Market created successfully");
            } catch Error(string memory reason) {
                console.log("Market creation failed, assuming it exists:", reason);
            }
            console.log("Market ID:", vm.toString(Id.unwrap(marketId)));
        } else {
            console.log("Market already exists");
        }

        // Set state variable so other methods can use this market
        MARKET_ID = Id.unwrap(marketId);
    }

    /**
     * @notice Configure market with encoded MarketParams for liquidityAdapterAndData
     * @dev Enhanced to create market if running on local/test networks
     * @notice Market is MXNB/USDC with MXNB as loan token and USDC as collateral
     */
    function _configureMarketAndLiquidityAdapter() internal {
        // Look up MarketParams from Morpho
        MarketParams memory marketParams = IMorpho(MORPHO).idToMarketParams(Id.wrap(MARKET_ID));

        // Validate market params (MXNB/USDC market)
        require(marketParams.loanToken == MXNB, "Market loanToken should be MXNB");
        require(marketParams.irm == ADAPTIVE_CURVE_IRM, "Market IRM mismatch");
        require(marketParams.collateralToken == USDC, "Market collateralToken should be USDC");

        // Attempt to create market if it doesn't exist
        // This is safe to call for forks where the market already exists
        _createOrVerifyMarket(marketParams);
        _forward(1);

        // KEY FIX: Set liquidityAdapterAndData with encoded MarketParams
        bytes memory liquidityData = abi.encode(marketParams);
        vault.submit(abi.encodeCall(vault.setLiquidityAdapterAndData, (adapter, liquidityData)));
        vault.setLiquidityAdapterAndData(adapter, liquidityData);

        // Check if market has sufficient dead deposit, if not create one
        uint256 requiredDeadDeposit = DEAD_DEPOSIT_AMOUNT;
        Position memory deadPosition = IMorpho(MORPHO).position(Id.wrap(MARKET_ID), address(0xdead));
        if (deadPosition.supplyShares < requiredDeadDeposit) {
            IERC20(MXNB).approve(MORPHO, requiredDeadDeposit);
            IMorpho(MORPHO).supply(marketParams, requiredDeadDeposit, 0, address(0xdead), hex"");
        }

        // Configure collateral token caps (USDC collateral)
        bytes memory collateralTokenIdData = abi.encode("collateralToken", USDC);
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (collateralTokenIdData, COLLATERAL_TOKEN_CAP)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (collateralTokenIdData, 1e18)));
        vault.increaseAbsoluteCap(collateralTokenIdData, COLLATERAL_TOKEN_CAP);
        vault.increaseRelativeCap(collateralTokenIdData, 1e18);

        // Configure market caps
        bytes memory marketIdData = abi.encode("this/marketParams", adapter, marketParams);
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (marketIdData, MARKET_CAP)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (marketIdData, 1e18)));
        vault.increaseAbsoluteCap(marketIdData, MARKET_CAP);
        vault.increaseRelativeCap(marketIdData, 1e18);
    }

    function test_CompleteMarketSetup() public {
        // Step 1: Define market parameters
        MarketCreationParams memory params = MarketCreationParams({
            loanToken: MXNB,
            collateralToken: USDC,
            oracle: address(oracle),  // Your mock oracle
            irm: ADAPTIVE_CURVE_IRM,
            lltv: 0.77e18  // 77% LTV
        });
        
        // Step 2: Create the market (requires owner)
        address morphoOwner = deployer; // Get your Morpho owner
        (MarketParams memory marketParams, Id marketId) = 
            _createMarketWithOwner(params, morphoOwner);

        //console.log("test_CompleteMarketSetup created marketParams:",marketParams);
        //console.log("test_CompleteMarketSetup created marketId:",marketId);

        //MarketParams memory marketParamsTest = IMorpho(MORPHO).idToMarketParams(marketId);
        //console.log("test_CompleteMarketSetup idToMarketParams:",marketParamsTest);

        // Step 3: Supply initial liquidity
        uint256 liquidityAmount = 1_000_000e6; // 1M MXNB
        deal(MXNB, deployer, liquidityAmount);
        _supplyMarketLiquidity(marketParams, liquidityAmount, deployer);
        
        // Step 4: Configure your vault/adapter to use this market
        //_configureVaultForMarket(marketParams);
        
        // Step 5: Test vault operations
        //testDepositAndBorrow();
    }

    /**
    function test_ExampleMarketCreation() public {
        MarketCreationParams memory params = MarketCreationParams({
            loanToken: MXNB,
            collateralToken: USDC,
            oracle: address(oracle),
            irm: ADAPTIVE_CURVE_IRM,
            lltv: 0.8e18  // 80% LLTV
        });
        
        (MarketParams memory mktParams, Id marketId) = _createMarketFromScratch(params);
        
        console.log("Market created with ID:", vm.toString(Id.unwrap(marketId)));
    }

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



    function test_CreateNewMarketLocally() public {
        // Get the Morpho owner (you'd need this for your local Morpho instance)
        address morphoOwner = deployer; // Your Morpho owner address
        
        MarketCreationParams memory params = MarketCreationParams({
            loanToken: MXNB,
            collateralToken: USDC,
            oracle: address(oracle),
            irm: ADAPTIVE_CURVE_IRM,
            lltv: 0.8e18  // 80% LLTV
        });
        
        (MarketParams memory mktParams, Id marketId) = 
            _createMarketWithOwner(params, morphoOwner);
        
        // Now use mktParams in your vault/adapter configuration
        //_configureMarketWithParams(mktParams);
    }

    function test_VerifyMarketExists() public {
        // Verify the standard test market exists
        MarketParams memory marketParams = _getOrVerifyMarket(Id.wrap(MARKET_ID));
        
        assertEq(marketParams.loanToken, MXNB);
        assertEq(marketParams.collateralToken, USDC);
        assertEq(marketParams.irm, ADAPTIVE_CURVE_IRM);
    }

    function test_SupplyLiquidity() public {
        MarketParams memory mktParams = _getOrVerifyMarket(Id.wrap(MARKET_ID));
        
        uint256 initialSupply = 100_000e6; // 100k MXNB
        
        // Ensure supplier has funds
        deal(MXNB, deployer, initialSupply);
        
        _supplyMarketLiquidity(mktParams, initialSupply, deployer);
        
        // Now borrowers can borrow from this market
    }

    function test_DeployWithoutMarket() public {
        _deployWithoutMarket();

        assertEq(vault.asset(), MXNB, "Asset should be MXNB");
        assertEq(vault.owner(), deployer, "Owner should be deployer");
        assertEq(vault.curator(), deployer, "Curator should be deployer");

        assertEq(vault.adaptersLength(), 1, "Should have 1 adapter");
        assertEq(vault.adapters(0), adapter, "Adapter should match");

        IMorphoMarketV1AdapterV2 adapterContract = IMorphoMarketV1AdapterV2(adapter);
        assertEq(adapterContract.morpho(), MORPHO, "Should point to Morpho");
        assertEq(adapterContract.adaptiveCurveIrm(), ADAPTIVE_CURVE_IRM, "Should use correct IRM");
        assertEq(adapterContract.parentVault(), address(vault), "Parent vault should match");

        // Without market, liquidityAdapter should NOT be set
        assertEq(vault.liquidityAdapter(), address(0), "Liquidity adapter should NOT be set");

        assertTrue(vault.abdicated(IVaultV2.setAdapterRegistry.selector), "setAdapterRegistry abdicated");
        assertTrue(vault.abdicated(IVaultV2.setReceiveSharesGate.selector), "setReceiveSharesGate abdicated");
        assertTrue(vault.abdicated(IVaultV2.setSendSharesGate.selector), "setSendSharesGate abdicated");
        assertTrue(vault.abdicated(IVaultV2.setReceiveAssetsGate.selector), "setReceiveAssetsGate abdicated");

        assertGt(vault.balanceOf(address(0xdead)), 0, "Dead deposit made");

        // Verify funds stayed in vault (idle) since no liquidityAdapter
        assertGe(IERC20(MXNB).balanceOf(address(vault)), DEAD_DEPOSIT_AMOUNT, "Funds should stay idle in vault");

        console.log("=== DEPLOYMENT WITHOUT MARKET VERIFIED ===");
        console.log("VaultV2 (MXNB asset):", address(vault));
        console.log("Adapter:", adapter);
        console.log("liquidityAdapter: NOT SET (deposits stay idle)");
    }

    function test_DeployWithMarket() public {
        _deployWithMarket();

        assertEq(vault.asset(), MXNB, "Asset should be MXNB");
        assertEq(vault.owner(), deployer, "Owner should be deployer");

        assertEq(vault.adaptersLength(), 1, "Should have 1 adapter");
        assertEq(vault.adapters(0), adapter, "Adapter should match");

        // With market, liquidityAdapter SHOULD be set
        assertEq(vault.liquidityAdapter(), adapter, "Liquidity adapter should be set");

        // Verify liquidityData contains encoded MarketParams
        bytes memory liquidityData = vault.liquidityData();
        assertGt(liquidityData.length, 0, "liquidityData should not be empty");

        // Decode and verify MarketParams (MXNB/USDC market)
        MarketParams memory decodedParams = abi.decode(liquidityData, (MarketParams));
        assertEq(decodedParams.loanToken, MXNB, "Decoded loanToken should be MXNB");
        assertEq(decodedParams.collateralToken, USDC, "Decoded collateralToken should be USDC");
        assertEq(decodedParams.irm, ADAPTIVE_CURVE_IRM, "Decoded IRM should match");

        assertTrue(vault.abdicated(IVaultV2.setAdapterRegistry.selector), "setAdapterRegistry abdicated");

        assertGt(vault.balanceOf(address(0xdead)), 0, "Dead deposit made");

        // Verify funds were allocated to market (not idle in vault)
        assertLt(IERC20(MXNB).balanceOf(address(vault)), DEAD_DEPOSIT_AMOUNT, "Funds should be allocated to market");

        console.log("=== DEPLOYMENT WITH MARKET VERIFIED ===");
        console.log("VaultV2 (MXNB asset):", address(vault));
        console.log("Adapter:", adapter);
        console.log("liquidityAdapter: SET with MXNB/USDC market params");
    }

    function test_AdapterRegistryAbdicated() public {
        _deployWithoutMarket();

        assertEq(vault.adapterRegistry(), ADAPTER_REGISTRY, "Registry should be set");

        vm.prank(deployer);
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (address(0x123))));

        vm.expectRevert();
        vm.prank(deployer);
        vault.setAdapterRegistry(address(0x123));
    }

    function test_GatesAbdicated() public {
        _deployWithoutMarket();

        assertEq(vault.receiveSharesGate(), address(0), "receiveSharesGate should be zero");
        assertEq(vault.sendSharesGate(), address(0), "sendSharesGate should be zero");
        assertEq(vault.receiveAssetsGate(), address(0), "receiveAssetsGate should be zero");

        vm.startPrank(deployer);

        vault.submit(abi.encodeCall(vault.setReceiveSharesGate, (address(0x1))));
        vm.expectRevert();
        vault.setReceiveSharesGate(address(0x1));

        vm.stopPrank();
    }

    function test_DepositWithdrawWithoutMarket() public {
        _deployWithoutMarket();

        address user = makeAddr("user");
        uint256 depositAmount = 1000e6;
        deal(MXNB, user, depositAmount);

        vm.startPrank(user);
        IERC20(MXNB).approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");

        // Funds stay idle in vault
        assertGe(IERC20(MXNB).balanceOf(address(vault)), depositAmount, "Funds should stay in vault");

        vm.startPrank(user);
        uint256 withdrawn = vault.redeem(shares, user, user);
        vm.stopPrank();

        assertApproxEqAbs(withdrawn, depositAmount, 1, "Should withdraw same amount");

        console.log("Deposited:", depositAmount);
        console.log("Withdrawn:", withdrawn);
    }

    function test_DepositWithdrawWithMarket() public {
        _deployWithMarket();

        address user = makeAddr("user");
        uint256 depositAmount = 1000e6;
        deal(MXNB, user, depositAmount);

        vm.startPrank(user);
        IERC20(MXNB).approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");

        // Funds allocated to market (minimal in vault)
        assertLt(IERC20(MXNB).balanceOf(address(vault)), depositAmount, "Funds should be allocated to market");

        vm.startPrank(user);
        uint256 withdrawn = vault.redeem(shares, user, user);
        vm.stopPrank();

        assertApproxEqAbs(withdrawn, depositAmount, 1, "Should withdraw same amount");

        console.log("Deposited:", depositAmount);
        console.log("Withdrawn:", withdrawn);
    }

    function test_AdapterCaps() public {
        _deployWithoutMarket();

        bytes32 adapterId = keccak256(abi.encode("this", adapter));

        assertEq(vault.absoluteCap(adapterId), type(uint128).max, "Absolute cap should be max");
        assertEq(vault.relativeCap(adapterId), 1e18, "Relative cap should be 100%");
    }

    function test_MarketCapsWithMarket() public {
        _deployWithMarket();

        // Check collateral token cap (USDC collateral)
        bytes32 collateralTokenId = keccak256(abi.encode("collateralToken", USDC));
        assertEq(vault.absoluteCap(collateralTokenId), COLLATERAL_TOKEN_CAP, "Collateral token cap should be set");
        assertEq(vault.relativeCap(collateralTokenId), 1e18, "Collateral token relative cap should be 100%");

        // Check market cap
        MarketParams memory marketParams = IMorpho(MORPHO).idToMarketParams(Id.wrap(MARKET_ID));
        bytes32 marketParamsId = keccak256(abi.encode("this/marketParams", adapter, marketParams));
        assertEq(vault.absoluteCap(marketParamsId), MARKET_CAP, "Market cap should be set");
        assertEq(vault.relativeCap(marketParamsId), 1e18, "Market relative cap should be 100%");
    }

    function test_EmptyLiquidityDataCausesRevert() public {
        vm.startPrank(deployer);

        // Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));
        vault.setCurator(deployer);

        // Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        // Setup minimal config
        bytes memory adapterIdData = abi.encode("this", adapter);
        vault.submit(abi.encodeCall(vault.setIsAllocator, (deployer, true)));
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (ADAPTER_REGISTRY)));
        vault.submit(abi.encodeCall(vault.addAdapter, (adapter)));
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (adapterIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (adapterIdData, 1e18)));
        // BUG: Setting liquidityAdapterAndData with empty bytes
        vault.submit(abi.encodeCall(vault.setLiquidityAdapterAndData, (adapter, bytes(""))));

        vault.setAdapterRegistry(ADAPTER_REGISTRY);
        vault.setIsAllocator(deployer, true);
        vault.addAdapter(adapter);
        vault.increaseAbsoluteCap(adapterIdData, type(uint128).max);
        vault.increaseRelativeCap(adapterIdData, 1e18);
        // BUG: Setting liquidityAdapterAndData with empty bytes
        vault.setLiquidityAdapterAndData(adapter, bytes(""));

        // Try to deposit - should revert because allocate tries to decode empty bytes as MarketParams
        IERC20(MXNB).approve(address(vault), DEAD_DEPOSIT_AMOUNT);
        vm.expectRevert(); // abi.decode of empty bytes will fail
        vault.deposit(DEAD_DEPOSIT_AMOUNT, address(0xdead));

        vm.stopPrank();

        console.log("=== CONFIRMED: Empty liquidityData causes revert on deposit ===");
    }

    //Test deployment with vault timelocks configured
    // Verifies that vault timelocks are properly set for listing requirements
    function test_DeployWithVaultTimelocks() public {
        uint256 timelockDuration = 3 days; // 259200 seconds - minimum for listing

        vm.startPrank(deployer);

        // Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));
        vault.setCurator(deployer);

        // Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        // Setup minimal config
        bytes memory adapterIdData = abi.encode("this", adapter);
        vault.submit(abi.encodeCall(vault.setIsAllocator, (deployer, true)));
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (ADAPTER_REGISTRY)));
        vault.submit(abi.encodeCall(vault.addAdapter, (adapter)));
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (adapterIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (adapterIdData, 1e18)));

        vault.setAdapterRegistry(ADAPTER_REGISTRY);
        vault.setIsAllocator(deployer, true);
        vault.addAdapter(adapter);
        vault.increaseAbsoluteCap(adapterIdData, type(uint128).max);
        vault.increaseRelativeCap(adapterIdData, 1e18);

        // Configure vault timelocks (order matters: increaseTimelock.selector MUST be last!)
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = IVaultV2.addAdapter.selector;
        selectors[1] = IVaultV2.increaseAbsoluteCap.selector;
        selectors[2] = IVaultV2.increaseRelativeCap.selector;
        selectors[3] = IVaultV2.setForceDeallocatePenalty.selector;
        selectors[4] = IVaultV2.abdicate.selector;
        selectors[5] = IVaultV2.removeAdapter.selector;
        selectors[6] = IVaultV2.increaseTimelock.selector; // MUST BE LAST!

        for (uint256 i = 0; i < selectors.length; i++) {
            vault.submit(abi.encodeCall(vault.increaseTimelock, (selectors[i], timelockDuration)));
            vault.increaseTimelock(selectors[i], timelockDuration);
        }

        vm.stopPrank();

        // Verify all vault timelocks are set
        assertEq(vault.timelock(IVaultV2.addAdapter.selector), timelockDuration, "addAdapter timelock");
        assertEq(
            vault.timelock(IVaultV2.increaseAbsoluteCap.selector), timelockDuration, "increaseAbsoluteCap timelock"
        );
        assertEq(
            vault.timelock(IVaultV2.increaseRelativeCap.selector), timelockDuration, "increaseRelativeCap timelock"
        );
        assertEq(
            vault.timelock(IVaultV2.setForceDeallocatePenalty.selector),
            timelockDuration,
            "setForceDeallocatePenalty timelock"
        );
        assertEq(vault.timelock(IVaultV2.abdicate.selector), timelockDuration, "abdicate timelock");
        assertEq(vault.timelock(IVaultV2.removeAdapter.selector), timelockDuration, "removeAdapter timelock");
        assertEq(vault.timelock(IVaultV2.increaseTimelock.selector), timelockDuration, "increaseTimelock timelock");

        console.log("=== VAULT TIMELOCKS CONFIGURED ===");
        console.log("Timelock duration:", timelockDuration, "seconds");
    }

    //Test deployment with adapter timelocks configured
    //Verifies that adapter timelocks are properly set for listing requirements
    function test_DeployWithAdapterTimelocks() public {
        uint256 timelockDuration = 3 days; // 259200 seconds - minimum for listing

        vm.startPrank(deployer);

        // Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));
        vault.setCurator(deployer);

        // Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        IMorphoMarketV1AdapterV2 adapterContract = IMorphoMarketV1AdapterV2(adapter);

        // Configure adapter timelocks (order matters: increaseTimelock.selector MUST be last!)
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = IMorphoMarketV1AdapterV2.abdicate.selector;
        selectors[1] = IMorphoMarketV1AdapterV2.setSkimRecipient.selector;
        selectors[2] = IMorphoMarketV1AdapterV2.burnShares.selector;
        selectors[3] = IMorphoMarketV1AdapterV2.increaseTimelock.selector; // MUST BE LAST!

        for (uint256 i = 0; i < selectors.length; i++) {
            adapterContract.submit(abi.encodeCall(adapterContract.increaseTimelock, (selectors[i], timelockDuration)));
            adapterContract.increaseTimelock(selectors[i], timelockDuration);
        }

        vm.stopPrank();

        // Verify all adapter timelocks are set
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.abdicate.selector), timelockDuration, "abdicate timelock"
        );
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.setSkimRecipient.selector),
            timelockDuration,
            "setSkimRecipient timelock"
        );
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.burnShares.selector),
            timelockDuration,
            "burnShares timelock"
        );
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.increaseTimelock.selector),
            timelockDuration,
            "increaseTimelock timelock"
        );

        console.log("=== ADAPTER TIMELOCKS CONFIGURED ===");
        console.log("Timelock duration:", timelockDuration, "seconds");
    }

    //Test full deployment with timelocks (manual recreation of script logic)
    // Manually recreates the deployment flow since vm.startBroadcast is incompatible with vm.prank
    function test_FullDeploymentWithTimelocks() public {
        uint256 timelockDuration = 3 days; // 259200 seconds

        vm.startPrank(deployer);

        // Phase 1: Deploy VaultV2 with MXNB as asset
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));

        // Phase 2: Set temporary curator
        vault.setCurator(deployer);

        // Phase 3: Deploy adapter
        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        // Phase 4 & 5: Configure vault
        bytes memory adapterIdData = abi.encode("this", adapter);
        vault.submit(abi.encodeCall(vault.setIsAllocator, (deployer, true)));
        vault.submit(abi.encodeCall(vault.setAdapterRegistry, (ADAPTER_REGISTRY)));
        vault.submit(abi.encodeCall(vault.addAdapter, (adapter)));
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (adapterIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (adapterIdData, 1e18)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setAdapterRegistry.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setSendSharesGate.selector)));
        vault.submit(abi.encodeCall(vault.abdicate, (IVaultV2.setReceiveAssetsGate.selector)));

        vault.setAdapterRegistry(ADAPTER_REGISTRY);
        vault.setIsAllocator(deployer, true);
        vault.addAdapter(adapter);
        vault.increaseAbsoluteCap(adapterIdData, type(uint128).max);
        vault.increaseRelativeCap(adapterIdData, 1e18);
        vault.abdicate(IVaultV2.setAdapterRegistry.selector);
        vault.abdicate(IVaultV2.setReceiveSharesGate.selector);
        vault.abdicate(IVaultV2.setSendSharesGate.selector);
        vault.abdicate(IVaultV2.setReceiveAssetsGate.selector);

        // Phase 8: Dead deposit (no market so deposits stay idle)
        IERC20(MXNB).approve(address(vault), DEAD_DEPOSIT_AMOUNT);
        vault.deposit(DEAD_DEPOSIT_AMOUNT, address(0xdead));

        // Phase 9: Configure vault timelocks
        bytes4[] memory vaultSelectors = new bytes4[](7);
        vaultSelectors[0] = IVaultV2.addAdapter.selector;
        vaultSelectors[1] = IVaultV2.increaseAbsoluteCap.selector;
        vaultSelectors[2] = IVaultV2.increaseRelativeCap.selector;
        vaultSelectors[3] = IVaultV2.setForceDeallocatePenalty.selector;
        vaultSelectors[4] = IVaultV2.abdicate.selector;
        vaultSelectors[5] = IVaultV2.removeAdapter.selector;
        vaultSelectors[6] = IVaultV2.increaseTimelock.selector; // MUST BE LAST!

        for (uint256 i = 0; i < vaultSelectors.length; i++) {
            vault.submit(abi.encodeCall(vault.increaseTimelock, (vaultSelectors[i], timelockDuration)));
            vault.increaseTimelock(vaultSelectors[i], timelockDuration);
        }

        // Phase 10: Configure adapter timelocks
        IMorphoMarketV1AdapterV2 adapterContract = IMorphoMarketV1AdapterV2(adapter);
        bytes4[] memory adapterSelectors = new bytes4[](4);
        adapterSelectors[0] = IMorphoMarketV1AdapterV2.abdicate.selector;
        adapterSelectors[1] = IMorphoMarketV1AdapterV2.setSkimRecipient.selector;
        adapterSelectors[2] = IMorphoMarketV1AdapterV2.burnShares.selector;
        adapterSelectors[3] = IMorphoMarketV1AdapterV2.increaseTimelock.selector; // MUST BE LAST!

        for (uint256 i = 0; i < adapterSelectors.length; i++) {
            adapterContract.submit(
                abi.encodeCall(adapterContract.increaseTimelock, (adapterSelectors[i], timelockDuration))
            );
            adapterContract.increaseTimelock(adapterSelectors[i], timelockDuration);
        }

        vm.stopPrank();

        // Verify vault timelocks are set
        assertEq(vault.timelock(IVaultV2.addAdapter.selector), timelockDuration, "addAdapter timelock");
        assertEq(vault.timelock(IVaultV2.abdicate.selector), timelockDuration, "abdicate timelock");
        assertEq(vault.timelock(IVaultV2.increaseTimelock.selector), timelockDuration, "increaseTimelock timelock");

        // Verify adapter timelocks are set
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.burnShares.selector),
            timelockDuration,
            "burnShares timelock"
        );
        assertEq(
            adapterContract.timelock(IMorphoMarketV1AdapterV2.abdicate.selector), timelockDuration, "abdicate timelock"
        );

        console.log("=== FULL DEPLOYMENT WITH TIMELOCKS VERIFIED ===");
        console.log("VaultV2:", address(vault));
        console.log("Adapter:", adapter);
        console.log("Timelock duration:", timelockDuration, "seconds");
    }
     */
}
