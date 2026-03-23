// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {IVaultV2} from "vault-v2/interfaces/IVaultV2.sol";
import {VaultV2} from "vault-v2/VaultV2.sol";
import {VaultV2Factory} from "vault-v2/VaultV2Factory.sol";
import {IMorphoMarketV1AdapterV2} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2.sol";
import {IMorphoMarketV1AdapterV2Factory} from "vault-v2/adapters/interfaces/IMorphoMarketV1AdapterV2Factory.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IMorpho, MarketParams, Id, Position} from "morpho-blue/src/interfaces/IMorpho.sol";
import {MarketParamsLib} from "morpho-blue/src/libraries/MarketParamsLib.sol";

import {OracleMock} from "../test/mocks/OracleMock.sol";
import {Faucet} from "../test/mocks/Faucet.sol";

contract SetupFork is Script {
    using MarketParamsLib for MarketParams;

    uint256 constant BLOCK_TIME = 1;
    uint256 constant FORK_BLOCK = 80_779_000;

    address constant AAVE_POOL_ADDRESSES_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address constant AUSDC = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;

    address constant VAULT_V2_FACTORY = 0xf7b1d9e43BAeA3705f2B303693766ACbcfec6A55;
    address constant MORPHO_MARKET_V1_ADAPTER_V2_FACTORY = 0x9633D22Bb8F42f6f70DbbBe34c11EB9209769b8b;
    address constant ADAPTER_REGISTRY = 0x66dC122CF454576684Ad78A2800a8Eb052b2E9a6;
    address constant MORPHO = 0x895383274303AA19fe978AFB4Ac55C7f094f982C;
    address constant ADAPTIVE_CURVE_IRM = 0xb6ac9477D574EE2a7BF32d2475b303fb70968AA4;
    address constant MXNB = 0xF197FFC28c23E0309B5559e7a166f2c6164C80aA;

    uint256 constant LLT = 0.77e18;
    uint256 constant DEAD_DEPOSIT_AMOUNT = 1e12;
    uint256 constant FAUCET_AMOUNT = 1000e6;
    uint256 constant INITIAL_MXNB_LIQUIDITY = 5000e6;

    address deployer;
    OracleMock public oracle;
    VaultV2 public vault;
    address public adapter;
    Faucet public faucet;
    bytes32 public marketId;

    function _forward(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * BLOCK_TIME);
    }

    function _getAavePool() internal returns (address) {
        (bool success, bytes memory data) = AAVE_POOL_ADDRESSES_PROVIDER.call(abi.encodeWithSignature("getPool()"));
        if (success && data.length > 0) {
            return abi.decode(data, (address));
        }
        bytes32 id = keccak256("POOL");
        (success, data) = AAVE_POOL_ADDRESSES_PROVIDER.call(abi.encodeWithSignature("getAddress(bytes32)", id));
        require(success && data.length > 0, "Failed to get Aave pool");
        return abi.decode(data, (address));
    }

    function run() external returns (address, address, bytes32, address) {
        deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer:", deployer);

        vm.createSelectFork("https://api.avax.network/ext/bc/C/rpc", FORK_BLOCK);
        console.log("Fork created at block:", FORK_BLOCK);

        address aavePool = _getAavePool();
        console.log("Aave Pool:", aavePool);

        console.log("=== SETTING UP FORK ===");

        oracle = new OracleMock();
        oracle.setPrice(179 * 1e35);
        console.log("Oracle deployed:", address(oracle));

        _createMarket();
        _supplyLiquidity();
        _deployVaultAndAdapter();
        _deployFaucetAndFund();

        console.log("=== FORK SETUP COMPLETE ===");
        console.log("VAULT_V2:", address(vault));
        console.log("ADAPTER:", adapter);
        console.log("MARKET_ID:", vm.toString(marketId));
        console.log("ORACLE:", address(oracle));
        console.log("FAUCET:", address(faucet));

        _writeEnvFile();

        return (address(vault), adapter, marketId, address(faucet));
    }

    function _createMarket() internal {
        IMorpho morpho = IMorpho(MORPHO);

        MarketParams memory marketParams = MarketParams({
            loanToken: MXNB,
            collateralToken: AUSDC,
            oracle: address(oracle),
            irm: ADAPTIVE_CURVE_IRM,
            lltv: LLT
        });

        marketId = Id.unwrap(marketParams.id());

        MarketParams memory existingParams = morpho.idToMarketParams(Id.wrap(marketId));
        if (existingParams.loanToken == MXNB) {
            console.log("Market already exists!");
        } else {
            console.log("Creating aUSDC/MXNB market...");
            try morpho.createMarket(marketParams) {
                console.log("Market created successfully!");
            } catch Error(string memory reason) {
                console.log("Market creation failed:", reason);
            }
        }

        _forward(1);
        console.log("Market ID:", vm.toString(marketId));
    }

    function _supplyLiquidity() internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory mktParams = morpho.idToMarketParams(Id.wrap(marketId));

        console.log("Supplying initial MXNB liquidity to market...");
        console.log("- Amount:", INITIAL_MXNB_LIQUIDITY);

        vm.prank(deployer);
        IERC20(MXNB).approve(address(morpho), INITIAL_MXNB_LIQUIDITY);

        vm.prank(deployer);
        morpho.supply(mktParams, INITIAL_MXNB_LIQUIDITY, 0, deployer, hex"");

        console.log("Liquidity supplied!");
    }

    function _deployVaultAndAdapter() internal {
        vm.startPrank(deployer);

        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, gasleft()));
        vault = VaultV2(VaultV2Factory(VAULT_V2_FACTORY).createVaultV2(deployer, MXNB, salt));

        console.log("VaultV2 deployed:", address(vault));

        vault.setCurator(deployer);

        adapter = IMorphoMarketV1AdapterV2Factory(MORPHO_MARKET_V1_ADAPTER_V2_FACTORY)
            .createMorphoMarketV1AdapterV2(address(vault));

        console.log("Adapter deployed:", adapter);

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

        _configureMarketAndLiquidityAdapter();

        vm.stopPrank();
    }

    function _configureMarketAndLiquidityAdapter() internal {
        IMorpho morpho = IMorpho(MORPHO);
        MarketParams memory marketParams = morpho.idToMarketParams(Id.wrap(marketId));

        bytes memory liquidityData = abi.encode(marketParams);
        vault.submit(abi.encodeCall(vault.setLiquidityAdapterAndData, (adapter, liquidityData)));
        vault.setLiquidityAdapterAndData(adapter, liquidityData);

        console.log("Liquidity adapter configured with market params");

        Position memory deadPosition = morpho.position(Id.wrap(marketId), address(0xdead));
        if (deadPosition.supplyShares < DEAD_DEPOSIT_AMOUNT) {
            vm.prank(deployer);
            IERC20(MXNB).approve(MORPHO, DEAD_DEPOSIT_AMOUNT);
            vm.prank(deployer);
            morpho.supply(marketParams, DEAD_DEPOSIT_AMOUNT, 0, address(0xdead), hex"");
            console.log("Market dead deposit created:", DEAD_DEPOSIT_AMOUNT);
        } else {
            console.log("Market already has sufficient dead deposit:", deadPosition.supplyShares);
        }

        bytes memory collateralTokenIdData = abi.encode("collateralToken", AUSDC);
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (collateralTokenIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (collateralTokenIdData, 1e18)));
        vault.increaseAbsoluteCap(collateralTokenIdData, type(uint128).max);
        vault.increaseRelativeCap(collateralTokenIdData, 1e18);

        bytes memory marketIdData = abi.encode("this/marketParams", adapter, marketParams);
        vault.submit(abi.encodeCall(vault.increaseAbsoluteCap, (marketIdData, type(uint128).max)));
        vault.submit(abi.encodeCall(vault.increaseRelativeCap, (marketIdData, 1e18)));
        vault.increaseAbsoluteCap(marketIdData, type(uint128).max);
        vault.increaseRelativeCap(marketIdData, 1e18);

        console.log("Collateral token and market caps configured");
    }

    function _deployFaucetAndFund() internal {
        faucet = new Faucet();
        console.log("Faucet deployed:", address(faucet));

        faucet.setFaucetAmount(USDC, FAUCET_AMOUNT);
        faucet.setFaucetAmount(MXNB, FAUCET_AMOUNT);
        console.log("Faucet amounts set:", FAUCET_AMOUNT);

        vm.prank(deployer);
        IERC20(USDC).transfer(address(faucet), FAUCET_AMOUNT * 10);
        vm.prank(deployer);
        IERC20(MXNB).transfer(address(faucet), FAUCET_AMOUNT * 10);
        console.log("Faucet funded with USDC and MXNB");
    }

    function _writeEnvFile() internal {
        string memory envContent = string.concat(
            "# Fork Environment Variables for Next.js App\n",
            "# Generated by setup-fork.sh\n\n",
            "# Network\n",
            "NEXT_PUBLIC_RPC_URL=http://localhost:8545\n",
            "NEXT_PUBLIC_CHAIN_ID=43114\n\n",
            "# Aave\n",
            "NEXT_PUBLIC_AAVE_POOL=", vm.toString(_getAavePool()), "\n",
            "NEXT_PUBLIC_USDC=", vm.toString(USDC), "\n",
            "NEXT_PUBLIC_AUSDC=", vm.toString(AUSDC), "\n\n",
            "# Morpho\n",
            "NEXT_PUBLIC_MORPHO=", vm.toString(MORPHO), "\n",
            "NEXT_PUBLIC_MXNB=", vm.toString(MXNB), "\n",
            "NEXT_PUBLIC_MORPHO_MARKET_ID=", vm.toString(marketId), "\n\n",
            "# Vault\n",
            "NEXT_PUBLIC_VAULT_V2=", vm.toString(address(vault)), "\n",
            "NEXT_PUBLIC_ADAPTER=", vm.toString(adapter), "\n",
            "NEXT_PUBLIC_ORACLE=", vm.toString(address(oracle)), "\n\n",
            "# Faucet\n",
            "NEXT_PUBLIC_FAUCET=", vm.toString(address(faucet)), "\n"
        );

        vm.writeFile(".env.fork", envContent);
        console.log(".env.fork written");
    }
}
