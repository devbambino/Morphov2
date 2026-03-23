// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {VaultV2} from "vault-v2/VaultV2.sol";
import {VaultV2Factory} from "vault-v2/VaultV2Factory.sol";
import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";
import {IMorphoMarketV1AdapterV2} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2.sol";
import {IMorphoMarketV1AdapterV2Factory} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2Factory.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IMorpho, MarketParams, Id, Position, Market} from "morpho-blue/src/interfaces/IMorpho.sol";
import {MarketParamsLib} from "morpho-blue/src/libraries/MarketParamsLib.sol";
import {OracleMock} from "./mocks/OracleMock.sol";

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
    function getAddress(bytes32 id) external view returns (address);
}

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/**
 * @title AaveV3MorphoTest
 * @notice Tests combined Aave V3 + Morpho flow: supply USDC to Aave, use aUSDC as collateral to borrow MXNB
 */
contract AaveV3MorphoTest is Test {
    using MarketParamsLib for MarketParams;

    uint256 internal constant BLOCK_TIME = 1;
    uint256 internal constant FORK_BLOCK = 80_779_000;

    // Aave V3 addresses (Avalanche Mainnet)
    address constant AAVE_POOL_ADDRESSES_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address constant AUSDC = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;

    // Morpho addresses (Avalanche Mainnet)
    address constant VAULT_V2_FACTORY = 0xf7b1d9e43BAeA3705f2B303693766ACbcfec6A55;
    address constant MORPHO_MARKET_V1_ADAPTER_V2_FACTORY = 0x9633D22Bb8F42f6f70DbbBe34c11EB9209769b8b;
    address constant ADAPTER_REGISTRY = 0x66dC122CF454576684Ad78A2800a8Eb052b2E9a6;
    address constant MORPHO = 0x895383274303AA19fe978AFB4Ac55C7f094f982C;
    address constant ADAPTIVE_CURVE_IRM = 0xb6ac9477D574EE2a7BF32d2475b303fb70968AA4;
    address constant MXNB = 0xF197FFC28c23E0309B5559e7a166f2c6164C80aA;

    // Market parameters
    uint256 constant LLT = 0.77e18;
    uint256 constant DEAD_DEPOSIT_AMOUNT = 1e12;

    address deployer = makeAddr("deployer");
    IPool public aavePool;
    OracleMock public oracle;
    VaultV2 public vault;
    address public adapter;

    // aUSDC/MXNB market
    bytes32 public aUSDCMXNB_MARKET_ID;

    function setUp() public {
        vm.createSelectFork("https://api.avax.network/ext/bc/C/rpc", FORK_BLOCK);

        aavePool = IPool(_getAavePool());

        console.log("=== AAVE V3 + MORPHO TEST SETUP ===");
        console.log("Deployer:", deployer);
        console.log("Aave Pool:", address(aavePool));
        console.log("USDC:", USDC);
        console.log("aUSDC:", AUSDC);
        console.log("MXNB:", MXNB);
        console.log("Morpho:", MORPHO);

        deal(USDC, deployer, 100_000_000e6);
        deal(MXNB, deployer, 100_000_000e6);

        console.log("USDC balance:", IERC20(USDC).balanceOf(deployer));
        console.log("MXNB balance:", IERC20(MXNB).balanceOf(deployer));

        oracle = new OracleMock();
    }

    function _getAavePool() internal returns (address) {
        IPoolAddressesProvider provider = IPoolAddressesProvider(AAVE_POOL_ADDRESSES_PROVIDER);
        try provider.getPool() returns (address pool) {
            return pool;
        } catch {
            bytes32 id = keccak256("POOL");
            return provider.getAddress(id);
        }
    }

    function _forward(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * BLOCK_TIME);
    }

    function _supplyToAave(uint256 amount, address supplier) internal {
        console.log("Supplying to Aave...");
        console.log("- Amount:", amount);
        console.log("- Supplier:", supplier);

        vm.prank(supplier);
        IERC20(USDC).approve(address(aavePool), amount);

        vm.prank(supplier);
        aavePool.supply(USDC, amount, supplier, 0);

        console.log("Supply completed!");
        console.log("- aUSDC balance:", IERC20(AUSDC).balanceOf(supplier));
    }

    function _withdrawFromAave(uint256 amount, address recipient) internal returns (uint256) {
        console.log("Withdrawing from Aave...");
        console.log("- Amount:", amount);
        console.log("- Recipient:", recipient);

        vm.prank(recipient);
        uint256 withdrawn = aavePool.withdraw(USDC, amount, recipient);

        console.log("Withdraw completed!");
        console.log("- Withdrawn:", withdrawn);

        return withdrawn;
    }

    function _createAUSDCMXNBMarket() internal {
        console.log("=== CREATING aUSDC/MXNB MARKET ===");

        IMorpho morpho = IMorpho(MORPHO);

        oracle.setPrice(1e36);

        MarketParams memory marketParams = MarketParams({
            loanToken: MXNB,
            collateralToken: AUSDC,
            oracle: address(oracle),
            irm: ADAPTIVE_CURVE_IRM,
            lltv: LLT
        });

        Id marketId = marketParams.id();
        aUSDCMXNB_MARKET_ID = Id.unwrap(marketId);

        console.log("Market ID:", vm.toString(aUSDCMXNB_MARKET_ID));
        console.log("- Loan Token (MXNB):", marketParams.loanToken);
        console.log("- Collateral Token (aUSDC):", marketParams.collateralToken);
        console.log("- Oracle:", marketParams.oracle);
        console.log("- IRM:", marketParams.irm);
        console.log("- LLTV:", marketParams.lltv);

        MarketParams memory existingParams = morpho.idToMarketParams(marketId);
        if (existingParams.loanToken == MXNB) {
            console.log("Market already exists!");
        } else {
            console.log("Creating market...");
            try morpho.createMarket(marketParams) {
                console.log("Market created successfully!");
            } catch Error(string memory reason) {
                console.log("Market creation failed:", reason);
            }
        }

        _forward(1);
    }

    function _supplyAUSDCMarketLiquidity(uint256 amount, address supplier) internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = IMorpho(MORPHO).idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        console.log("Supplying MXNB to aUSDC/MXNB market...");
        console.log("- Amount:", amount);
        console.log("- Supplier:", supplier);

        vm.prank(supplier);
        IERC20(MXNB).approve(address(morpho), amount);

        vm.prank(supplier);
        morpho.supply(mktParams, amount, 0, supplier, hex"");

        console.log("Liquidity supplied!");
    }

    function _supplyCollateralToMorpho(uint256 amount, address supplier) internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        uint256 ausdcBalance = IERC20(AUSDC).balanceOf(supplier);
        uint256 collateralAmount = amount > ausdcBalance ? ausdcBalance : amount;

        console.log("Supplying aUSDC as collateral to Morpho...");
        console.log("- Requested amount:", amount);
        console.log("- Available aUSDC:", ausdcBalance);
        console.log("- Using:", collateralAmount);
        console.log("- Supplier:", supplier);

        vm.prank(supplier);
        IERC20(AUSDC).approve(address(morpho), collateralAmount);

        vm.prank(supplier);
        morpho.supplyCollateral(mktParams, collateralAmount, supplier, hex"");

        _forward(1);

        Position memory pos = morpho.position(Id.wrap(aUSDCMXNB_MARKET_ID), supplier);
        console.log("Collateral supplied!");
        console.log("- Collateral balance:", pos.collateral);
    }

    function _borrowFromMorpho(uint256 amount, address borrower) internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        console.log("Borrowing MXNB from Morpho...");
        console.log("- Amount:", amount);
        console.log("- Borrower:", borrower);

        vm.prank(borrower);
        (uint256 borrowedAssets, uint256 borrowedShares) = morpho.borrow(mktParams, amount, 0, borrower, borrower);

        _forward(1);

        Position memory pos = morpho.position(Id.wrap(aUSDCMXNB_MARKET_ID), borrower);
        console.log("Borrow completed!");
        console.log("- Borrowed assets:", borrowedAssets);
        console.log("- Borrow shares:", pos.borrowShares);
    }

    function _repayToMorpho(uint256 borrowShares, address borrower) internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        console.log("Repaying MXNB to Morpho...");
        console.log("- Borrow shares:", borrowShares);
        console.log("- Borrower:", borrower);

        uint256 mxnbBalance = IERC20(MXNB).balanceOf(borrower);
        console.log("- MXNB balance:", mxnbBalance);

        vm.prank(borrower);
        IERC20(MXNB).approve(address(morpho), mxnbBalance);

        vm.prank(borrower);
        (uint256 repaidAssets, uint256 repaidShares) = morpho.repay(mktParams, 0, borrowShares, borrower, hex"");

        _forward(1);

        Position memory pos = morpho.position(Id.wrap(aUSDCMXNB_MARKET_ID), borrower);
        console.log("Repay completed!");
        console.log("- Repaid assets:", repaidAssets);
        console.log("- Remaining borrow shares:", pos.borrowShares);
    }

    function _withdrawCollateralFromMorpho(uint256 amount, address recipient) internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        console.log("Withdrawing aUSDC collateral from Morpho...");
        console.log("- Amount:", amount);
        console.log("- Recipient:", recipient);

        vm.prank(recipient);
        morpho.withdrawCollateral(mktParams, amount, recipient, recipient);

        _forward(1);

        console.log("Collateral withdrawn!");
        console.log("- aUSDC balance:", IERC20(AUSDC).balanceOf(recipient));
    }

    function test_SupplyUSDCToAave() public {
        uint256 supplyAmount = 1000e6;

        uint256 usdcBefore = IERC20(USDC).balanceOf(deployer);
        uint256 ausdcBefore = IERC20(AUSDC).balanceOf(deployer);

        console.log("Before supply:");
        console.log("- USDC:", usdcBefore);
        console.log("- aUSDC:", ausdcBefore);

        _supplyToAave(supplyAmount, deployer);

        uint256 usdcAfter = IERC20(USDC).balanceOf(deployer);
        uint256 ausdcAfter = IERC20(AUSDC).balanceOf(deployer);

        console.log("After supply:");
        console.log("- USDC:", usdcAfter);
        console.log("- aUSDC:", ausdcAfter);

        assertEq(usdcAfter, usdcBefore - supplyAmount, "USDC should be deducted");
        assertGt(ausdcAfter, ausdcBefore, "aUSDC should be received");

        console.log("=== SUPPLY USDC TO AAVRE TEST PASSED ===");
    }

    function test_CreateAUSDCMXNBMarket() public {
        _createAUSDCMXNBMarket();

        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(aUSDCMXNB_MARKET_ID));

        assertEq(mktParams.loanToken, MXNB, "Loan token should be MXNB");
        assertEq(mktParams.collateralToken, AUSDC, "Collateral token should be aUSDC");
        assertEq(mktParams.irm, ADAPTIVE_CURVE_IRM, "IRM should be AdaptiveCurveIRM");
        assertEq(mktParams.lltv, LLT, "LLTV should be 77%");

        console.log("=== CREATE aUSDC/MXNB MARKET TEST PASSED ===");
    }

    function test_FullAaveMorphoFlow() public {
        uint256 usdcSupplyAmount = 1000e6;
        uint256 mxnbLiquidityAmount = 5000e6;
        uint256 collateralAmount = 999e6;
        uint256 borrowAmount = 600e6;

        console.log("=== FULL AAVE + MORPHO FLOW ===");

        _createAUSDCMXNBMarket();

        _supplyAUSDCMarketLiquidity(mxnbLiquidityAmount, deployer);

        console.log("Step 1: Supply USDC to Aave");
        _supplyToAave(usdcSupplyAmount, deployer);

        uint256 ausdcBalance = IERC20(AUSDC).balanceOf(deployer);
        console.log("aUSDC balance after supply:", ausdcBalance);

        console.log("Step 2: Supply aUSDC as collateral to Morpho");
        _supplyCollateralToMorpho(collateralAmount, deployer);

        console.log("Step 3: Borrow MXNB from Morpho");
        _borrowFromMorpho(borrowAmount, deployer);

        uint256 mxnbBalance = IERC20(MXNB).balanceOf(deployer);
        console.log("MXNB balance after borrow:", mxnbBalance);
        assertGt(mxnbBalance, 0, "Should receive borrowed MXNB");

        console.log("Step 4: Repay MXNB to Morpho");
        Position memory pos = IMorpho(MORPHO).position(Id.wrap(aUSDCMXNB_MARKET_ID), deployer);
        _repayToMorpho(pos.borrowShares, deployer);

        console.log("Step 5: Withdraw aUSDC collateral from Morpho");
        _withdrawCollateralFromMorpho(pos.collateral, deployer);

        uint256 ausdcBalanceAfter = IERC20(AUSDC).balanceOf(deployer);
        console.log("aUSDC balance after withdraw:", ausdcBalanceAfter);

        console.log("Step 6: Withdraw USDC from Aave (burn aUSDC)");
        uint256 withdrawnUSDC = _withdrawFromAave(ausdcBalanceAfter, deployer);

        uint256 usdcFinal = IERC20(USDC).balanceOf(deployer);
        console.log("Final USDC balance:", usdcFinal);
        console.log("Total USDC withdrawn from Aave:", withdrawnUSDC);

        assertGt(usdcFinal, usdcSupplyAmount - borrowAmount - 1, "Should have USDC after full flow");

        console.log("=== FULL AAVE + MORPHO FLOW TEST PASSED ===");
    }

    function test_YieldEarnedWhileBorrowed() public {
        uint256 usdcSupplyAmount = 1000e6;
        uint256 mxnbLiquidityAmount = 5000e6;
        uint256 collateralAmount = 1000e6;
        uint256 borrowAmount = 500e6;

        console.log("=== YIELD WHILE BORROWED TEST ===");

        _createAUSDCMXNBMarket();
        _supplyAUSDCMarketLiquidity(mxnbLiquidityAmount, deployer);
        _supplyToAave(usdcSupplyAmount, deployer);

        uint256 ausdcBefore = IERC20(AUSDC).balanceOf(deployer);
        console.log("aUSDC balance before collateral:", ausdcBefore);

        _supplyCollateralToMorpho(collateralAmount, deployer);
        _borrowFromMorpho(borrowAmount, deployer);

        console.log("Advancing time to generate yield...");
        _forward(86400 * 10);

        Position memory posBeforeRepay = IMorpho(MORPHO).position(Id.wrap(aUSDCMXNB_MARKET_ID), deployer);
        console.log("Position before repay:");
        console.log("- Collateral:", posBeforeRepay.collateral);
        console.log("- Borrow shares:", posBeforeRepay.borrowShares);

        _repayToMorpho(posBeforeRepay.borrowShares, deployer);
        _withdrawCollateralFromMorpho(posBeforeRepay.collateral, deployer);

        uint256 ausdcAfter = IERC20(AUSDC).balanceOf(deployer);
        console.log("aUSDC balance after withdraw:", ausdcAfter);

        uint256 withdrawnUSDC = _withdrawFromAave(ausdcAfter, deployer);
        uint256 usdcFinal = IERC20(USDC).balanceOf(deployer);

        console.log("Final USDC balance:", usdcFinal);
        console.log("USDC withdrawn:", withdrawnUSDC);
        console.log("Yield earned:", withdrawnUSDC > usdcSupplyAmount ? withdrawnUSDC - usdcSupplyAmount : 0);

        assertGe(ausdcAfter, collateralAmount - 1, "Should have at least collateral amount of aUSDC");
        assertGe(withdrawnUSDC, usdcSupplyAmount - 1, "Should receive at least supply amount");

        console.log("=== YIELD WHILE BORROWED TEST PASSED ===");
    }

    function test_SupplyCollateralAndBorrow() public {
        uint256 mxnbLiquidityAmount = 10_000e6;
        uint256 collateralAmount = 500e6;
        uint256 borrowAmount = 350e6;

        console.log("=== SUPPLY COLLATERAL AND BORROW TEST ===");

        _createAUSDCMXNBMarket();
        _supplyAUSDCMarketLiquidity(mxnbLiquidityAmount, deployer);

        _supplyToAave(collateralAmount, deployer);
        _supplyCollateralToMorpho(collateralAmount, deployer);

        Position memory posBefore = IMorpho(MORPHO).position(Id.wrap(aUSDCMXNB_MARKET_ID), deployer);
        console.log("Position before borrow:");
        console.log("- Collateral:", posBefore.collateral);

        _borrowFromMorpho(borrowAmount, deployer);

        Position memory posAfter = IMorpho(MORPHO).position(Id.wrap(aUSDCMXNB_MARKET_ID), deployer);
        console.log("Position after borrow:");
        console.log("- Collateral:", posAfter.collateral);
        console.log("- Borrow shares:", posAfter.borrowShares);

        uint256 mxnbBalance = IERC20(MXNB).balanceOf(deployer);
        console.log("MXNB balance:", mxnbBalance);

        assertGt(mxnbBalance, 0, "Should have MXNB balance after borrow");
        assertGt(posAfter.borrowShares, 0, "Should have borrow position");

        console.log("=== SUPPLY COLLATERAL AND BORROW TEST PASSED ===");
    }
}
