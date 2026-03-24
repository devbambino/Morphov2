#!/usr/bin/env node
/**
 * Fund Anvil fork accounts with test tokens
 * Usage: node scripts/fund-accounts.js
 */

const ethers = require("ethers");
require("dotenv").config({ path: ".env.fork" });

const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_RPC = "http://localhost:8545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Token addresses from mainnet (forked on Anvil)
const USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
const MXNB = "0xF197FFC28c23E0309B5559e7a166f2c6164C80aA";

// Standard ERC20 ABI for transfer and balanceOf
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

async function fundAccounts() {
  console.log("[INFO] Connecting to Anvil at", ANVIL_RPC);
  const provider = new ethers.JsonRpcProvider(ANVIL_RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("[INFO] Deployer address:", signer.address);

  // Check if deployer has AVAX (native token on Avalanche fork)
  const avaxBalance = await provider.getBalance(signer.address);
  console.log("[INFO] Deployer AVAX balance:", ethers.formatEther(avaxBalance));

  if (avaxBalance === 0n) {
    console.log("[WARN] Deployer has no AVAX. This might be a problem.");
    console.log("[INFO] Anvil RPC should have funded the deployer. Check anvil.log");
    return;
  }

  try {
    // Try to get current token balances
    const usdcContract = new ethers.Contract(USDC, ERC20_ABI, signer);
    const mxnbContract = new ethers.Contract(MXNB, ERC20_ABI, signer);

    const usdcBalance = await usdcContract.balanceOf(signer.address);
    const mxnbBalance = await mxnbContract.balanceOf(signer.address);

    console.log("[INFO] Deployer USDC balance:", ethers.formatUnits(usdcBalance, 6));
    console.log("[INFO] Deployer MXNB balance:", ethers.formatUnits(mxnbBalance, 6));

    if (usdcBalance > 0n || mxnbBalance > 0n) {
      console.log("[SUCCESS] Deployer already has tokens! Setup complete.");
      return;
    }

    console.log("[WARN] Deployer has 0 tokens. Direct funding not possible via this script.");
    console.log("[INFO] To fund the deployer:");
    console.log("  1. Use Anvil's unlocked accounts feature");
    console.log("  2. Or use: anvil_setStorageAt RPC calls (see fund-anvil.sh)");
    console.log("  3. Or manually transfer from another account that has tokens");
    console.log("");
    console.log("[INFO] For now, you can use the faucet in the app to claim test tokens.");
  } catch (error) {
    console.error("[ERROR] Failed to check balances:", error.message);
  }
}

fundAccounts().catch((error) => {
  console.error("[ERROR]", error);
  process.exit(1);
});
