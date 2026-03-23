// scripts/aaveWithdraw.ts
/**
 * Usage:
 * npx hardhat run scripts/aaveWithdraw.ts --network localhost -- <amountDecimals>
 *
 * Example:
 * npx hardhat run scripts/aaveWithdraw.ts --network localhost
 */

import hre from "hardhat";
import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config({ path: "./web/.env.local" });

const POOL_ADDRESSES_PROVIDER = process.env.NEXT_PUBLIC_AAVE_POOL_ADDRS_PROVIDER || "0x2f39d218133afab8f2b819b1066c7e434ad94e9e"; // official Aave Provider (Avalanche V3)
const USDC_ADDR = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
const AUSDC_ADDR = process.env.NEXT_PUBLIC_AAVE_AUSDC_ADDRESS as string

async function main() {
  // Increase time 10 days
  const secondsToIncrease = 10 * 24 * 60 * 60; // 1 year
  await network.provider.send("evm_increaseTime", [secondsToIncrease]);
  await network.provider.send("evm_mine"); // Mine a new block to apply the change

  //const args = process.argv.slice(process.argv.indexOf("--") + 1);
  let amountStr = "100"; // amount USDC to withdraw

  const signer = (await ethers.getSigners())[0];
  console.log("Using signer:", signer.address);

  const provider = await ethers.getContractAt(
    ["function getPool() view returns (address)", "function getAddress(bytes32 id) view returns (address)"],
    POOL_ADDRESSES_PROVIDER
  );

  let poolAddress: string;
  try {
    poolAddress = await provider.getPool();
  } catch {
    const id = ethers.id("POOL");
    poolAddress = await provider.getAddress(id);
  }
  console.log("Resolved Pool address:", poolAddress);

  const pool = await ethers.getContractAt(
    ["function withdraw(address asset, uint256 amount, address to) returns (uint256)"],
    poolAddress,
    signer
  );

  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDR);
  const decimals = Number(await usdc.decimals());
  let amount = ethers.parseUnits(amountStr, decimals);
  console.log(`Withdrawing ${amountStr} USDC (${amount} raw)...`);

  const ausdc = await ethers.getContractAt("MockERC20", AUSDC_ADDR);
  const ausdcBalance = await ausdc.balanceOf(signer.address);
  amount = ausdcBalance;
  amountStr = ethers.formatUnits(amount, decimals);
  console.log(`Withdrawing ${amountStr} aUSDC (${amount} raw)...`);

  const tx = await pool.withdraw(USDC_ADDR, amount, signer.address);
  await tx.wait();
  console.log("Withdraw complete. Tx:", tx.hash);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});