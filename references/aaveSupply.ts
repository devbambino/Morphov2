// scripts/aaveSupply.ts
/**
 * Usage:
 * npx hardhat run scripts/aaveSupply.ts --network localhost -- <amountDecimals>
 *
 * Example:
 * npx hardhat run scripts/aaveSupply.ts --network localhost -- 100
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config({ path: "./web/.env.local" });

// Addresses/constants
const POOL_ADDRESSES_PROVIDER = process.env.NEXT_PUBLIC_AAVE_POOL_ADDRS_PROVIDER || "0x2f39d218133afab8f2b819b1066c7e434ad94e9e"; // official Aave Provider (Avalanche V3)
const USDC_ADDR = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";

async function main() {
  //const args = process.argv.slice(process.argv.indexOf("--") + 1);
  const amountStr = "1000"; // default 100 USDC

  const signer = (await ethers.getSigners())[0];
  console.log("Using signer:", signer.address);

  // 1) get provider contract
  const provider = await ethers.getContractAt(
    [
      "function getPool() view returns (address)",
      "function getAddress(bytes32 id) view returns (address)",
    ],
    POOL_ADDRESSES_PROVIDER
  );

  // try getPool(); if not available fallback to getAddress(keccak256("POOL"))
  let poolAddress: string;
  try {
    poolAddress = await provider.getPool();
  } catch {
    const id = ethers.id("POOL"); // keccak256("POOL")
    poolAddress = await provider.getAddress(id);
  }
  console.log("Resolved Pool address:", poolAddress);

  // 2) build contract instances
  const usdc = await ethers.getContractAt(
    ["function approve(address spender,uint256 amount) returns (bool)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"],
    USDC_ADDR,
    signer
  );

  const pool = await ethers.getContractAt(
    // minimal Pool ABI
    [
      "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
      "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
    ],
    poolAddress,
    signer
  );

  const decimals = (await usdc.decimals()).toString();
  const amount = ethers.parseUnits(amountStr, Number(decimals));
  console.log(`Supplying ${amountStr} USDC (${amount.toString()}) to Aave Pool...`);

  // 3) approve Pool to spend USDC
  const approveTx = await usdc.approve(poolAddress, amount);
  await approveTx.wait();
  console.log("Approved pool to spend USDC (tx:", approveTx.hash, ")");

  // 4) call supply(asset, amount, onBehalfOf, referralCode)
  const tx = await pool.supply(USDC_ADDR, amount, signer.address, 0);
  console.log("Supply tx sent:", tx.hash);
  await tx.wait();
  console.log("Supply tx confirmed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});