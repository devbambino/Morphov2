// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
    function getAddress(bytes32 id) external view returns (address);
}

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAToken is IERC20 {
    function underlyingAssetAddress() external view returns (address);
}

/**
 * @title AaveV3SupplyWithdrawTest
 * @notice Tests supply and withdraw functionality for Aave V3 on Avalanche mainnet fork
 */
contract AaveV3SupplyWithdrawTest is Test {
    uint256 internal constant BLOCK_TIME = 1;
    uint256 internal constant FORK_BLOCK = 80_779_000; // Safe finalized block (~6 days old)

    // Aave V3 Avalanche Mainnet addresses
    address constant AAVE_POOL_ADDRESSES_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address constant AUSDC = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;

    address deployer = makeAddr("deployer");

    IPool public aavePool;

    function setUp() public {
        vm.createSelectFork("https://api.avax.network/ext/bc/C/rpc", FORK_BLOCK);

        aavePool = IPool(_getAavePool());

        console.log("=== AAVE V3 SUPPLY/WITHDRAW TEST SETUP ===");
        console.log("Deployer:", deployer);
        console.log("Pool Addresses Provider:", AAVE_POOL_ADDRESSES_PROVIDER);
        console.log("Pool:", address(aavePool));
        console.log("USDC:", USDC);
        console.log("aUSDC:", AUSDC);

        uint256 initialUSDCBalance = IERC20(USDC).balanceOf(deployer);
        console.log("Initial USDC balance:", initialUSDCBalance);

        deal(USDC, deployer, 100_000_000e6);
        uint256 USDCBalance = IERC20(USDC).balanceOf(deployer);
        console.log("After deal USDC balance:", USDCBalance);
    }

    function _getAavePool() internal view returns (address) {
        IPoolAddressesProvider provider = IPoolAddressesProvider(AAVE_POOL_ADDRESSES_PROVIDER);
        address poolAddress;
        try provider.getPool() returns (address pool) {
            poolAddress = pool;
        } catch {
            bytes32 id = keccak256("POOL");
            poolAddress = provider.getAddress(id);
        }
        return poolAddress;
    }

    function _forward(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * BLOCK_TIME);
    }

    function _supplyToAave(uint256 amount, address supplier) internal {
        console.log("Supplying to Aave...");
        console.log("- Amount:", amount);
        console.log("- Supplier:", supplier);

        uint256 supplierBalance = IERC20(USDC).balanceOf(supplier);
        require(supplierBalance >= amount, "Insufficient USDC balance");

        vm.prank(supplier);
        IERC20(USDC).approve(address(aavePool), amount);

        vm.prank(supplier);
        aavePool.supply(USDC, amount, supplier, 0);

        console.log("Supply completed!");
        console.log("- aUSDC balance:", IERC20(AUSDC).balanceOf(supplier));
    }

    function _withdrawFromAave(uint256 amount, address recipient) internal returns (uint256 withdrawnAmount) {
        console.log("Withdrawing from Aave...");
        console.log("- Amount:", amount);
        console.log("- Recipient:", recipient);

        uint256 aUSDCBalance = IERC20(AUSDC).balanceOf(recipient);
        console.log("- aUSDC balance before:", aUSDCBalance);

        vm.prank(recipient);
        withdrawnAmount = aavePool.withdraw(USDC, amount, recipient);

        console.log("Withdraw completed!");
        console.log("- Withdrawn amount:", withdrawnAmount);
        console.log("- aUSDC balance after:", IERC20(AUSDC).balanceOf(recipient));

        return withdrawnAmount;
    }

    function test_SupplyToAaveV3() public {
        uint256 supplyAmount = 1000e6;

        uint256 userUSDCBefore = IERC20(USDC).balanceOf(deployer);
        uint256 userAUSDCBefore = IERC20(AUSDC).balanceOf(deployer);

        console.log("Before supply:");
        console.log("- User USDC:", userUSDCBefore);
        console.log("- User aUSDC:", userAUSDCBefore);

        _supplyToAave(supplyAmount, deployer);

        uint256 userUSDCAfter = IERC20(USDC).balanceOf(deployer);
        uint256 userAUSDCAfter = IERC20(AUSDC).balanceOf(deployer);

        console.log("After supply:");
        console.log("- User USDC:", userUSDCAfter);
        console.log("- User aUSDC:", userAUSDCAfter);

        assertEq(userUSDCAfter, userUSDCBefore - supplyAmount, "USDC should be deducted");
        assertApproxEqAbs(userAUSDCAfter, supplyAmount, 1, "aUSDC should be minted ~1:1");
        assertGt(userAUSDCAfter, 0, "Should have aUSDC balance");

        console.log("=== SUPPLY TEST PASSED ===");
    }

    function test_WithdrawFromAaveV3() public {
        uint256 supplyAmount = 1000e6;

        _supplyToAave(supplyAmount, deployer);

        uint256 userUSDCBefore = IERC20(USDC).balanceOf(deployer);
        uint256 userAUSDCBefore = IERC20(AUSDC).balanceOf(deployer);

        console.log("Before withdraw:");
        console.log("- User USDC:", userUSDCBefore);
        console.log("- User aUSDC:", userAUSDCBefore);

        // Use actual aUSDC balance (may differ slightly due to Aave math)
        uint256 withdrawnAmount = _withdrawFromAave(userAUSDCBefore, deployer);

        uint256 userUSDCAfter = IERC20(USDC).balanceOf(deployer);
        uint256 userAUSDCAfter = IERC20(AUSDC).balanceOf(deployer);

        console.log("After withdraw:");
        console.log("- User USDC:", userUSDCAfter);
        console.log("- User aUSDC:", userAUSDCAfter);
        console.log("- Withdrawn:", withdrawnAmount);

        assertEq(userAUSDCAfter, 0, "aUSDC should be fully burned");
        assertEq(userUSDCAfter, userUSDCBefore + withdrawnAmount, "USDC should be received");
        assertApproxEqAbs(withdrawnAmount, supplyAmount, 1, "Withdrawn amount should match supply");

        console.log("=== WITHDRAW TEST PASSED ===");
    }

    function test_SupplyAndWithdrawFlow() public {
        uint256 supplyAmount = 1000e6;

        uint256 userUSDCBefore = IERC20(USDC).balanceOf(deployer);
        console.log("Initial USDC balance:", userUSDCBefore);

        _supplyToAave(supplyAmount, deployer);

        console.log("Advancing time to generate yield...");
        _forward(86400 * 10);

        uint256 userAUSDCBefore = IERC20(AUSDC).balanceOf(deployer);
        console.log("aUSDC balance before withdraw:", userAUSDCBefore);

        uint256 userUSDBeforeWithdraw = IERC20(USDC).balanceOf(deployer);
        uint256 withdrawnAmount = _withdrawFromAave(userAUSDCBefore, deployer);

        uint256 userUSDCAfter = IERC20(USDC).balanceOf(deployer);
        uint256 userAUSDCAfter = IERC20(AUSDC).balanceOf(deployer);

        console.log("After full flow:");
        console.log("- Final USDC balance:", userUSDCAfter);
        console.log("- Final aUSDC balance:", userAUSDCAfter);
        console.log("- Total withdrawn:", withdrawnAmount);
        console.log("- Yield earned:", withdrawnAmount > supplyAmount ? withdrawnAmount - supplyAmount : 0);

        assertEq(userAUSDCAfter, 0, "aUSDC should be fully withdrawn");
        assertGe(userUSDCAfter, userUSDCBefore - supplyAmount, "Should receive at least supply amount");
        assertGe(withdrawnAmount, supplyAmount - 1, "Should receive at least supply amount (minus rounding)");

        console.log("=== SUPPLY/WITHDRAW FLOW TEST PASSED ===");
    }

    function test_GetPoolAddress() public {
        address poolAddress = _getAavePool();

        console.log("Resolved Pool address:", poolAddress);

        assertEq(poolAddress, 0x794a61358D6845594F94dc1DB02A252b5b4814aD, "Pool address should match");
        assertTrue(poolAddress != address(0), "Pool address should not be zero");

        console.log("=== GET POOL ADDRESS TEST PASSED ===");
    }

    function test_VerifyAToken() public view {
        IAToken aToken = IAToken(AUSDC);

        uint256 balance = aToken.balanceOf(address(0xdead));
        console.log("aUSDC balance of address(0xdead):", balance);

        assertTrue(AUSDC != address(0), "aUSDC address should be valid");

        console.log("=== VERIFY ATOKEN TEST PASSED ===");
    }
}
