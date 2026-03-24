"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { balanceRefreshEmitter } from "@/components/TokenBalances";
import { ethers } from "ethers";

export function FaucetButton() {
  const { wallet, contracts, isContractsReady } = useWallet();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const claimFromFaucet = async (token: "USDC" | "MXNB") => {
    console.log(`[FaucetButton] Claim button clicked for ${token}`);
    console.log("[FaucetButton] Contracts available:", !!contracts);
    console.log("[FaucetButton] Wallet connected:", wallet.isConnected);
    console.log("[FaucetButton] Wallet address:", wallet.address);
    
    if (!contracts || !wallet.isConnected) {
      console.error("[FaucetButton] Cannot claim: contracts or wallet not ready");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const contract = token === "USDC" ? contracts.usdc : contracts.mxnb;
      const contractAddress = contract.target;
      console.log(`[FaucetButton] Attempting to claim for token contract: ${contractAddress}`);
      console.log(`[FaucetButton] Faucet contract address: ${contracts.faucet.target}`);
      
      // Check balance before claim
      try {
        const balanceBefore = await contract.balanceOf(wallet.address);
        console.log(`[FaucetButton] BEFORE: ${token} balance = ${balanceBefore.toString()}`);
      } catch (err) {
        console.log(`[FaucetButton] Could not fetch balance before claim: ${err}`);
      }
      
      const tx = await contracts.faucet.claim(contractAddress);
      console.log("[FaucetButton] Transaction submitted:", tx.hash);
      
      const receipt = await tx.wait();
      console.log("[FaucetButton] Transaction confirmed:", receipt?.blockNumber);
      console.log("[FaucetButton] Transaction hash:", receipt?.hash);
      console.log("[FaucetButton] Transaction gas used:", receipt?.gasUsed.toString());
      console.log("[FaucetButton] Transaction status:", receipt?.status);
      console.log("[FaucetButton] Transaction logs count:", receipt?.logs?.length);
      
      // Check balance after claim
      try {
        const balanceAfter = await contract.balanceOf(wallet.address);
        console.log(`[FaucetButton] AFTER: ${token} balance = ${balanceAfter.toString()}`);
        
        if (balanceAfter === 0n) {
          console.warn("[FaucetButton] ⚠️ Transaction succeeded but balance is still 0!");
          console.warn("[FaucetButton] The faucet contract may not be working properly on this fork");
        }
      } catch (err) {
        console.log(`[FaucetButton] Could not fetch balance after claim: ${err}`);
      }
      
      setMessage({ type: "success", text: `Received 1000 ${token}!` });
      
      // Immediately refresh balances after successful claim
      console.log("[FaucetButton] ✓ Faucet claim successful, triggering balance refresh");
      console.log("[FaucetButton] Balance refresh emitter listeners count:", (balanceRefreshEmitter as any).listeners.size);
      balanceRefreshEmitter.emit();
      console.log("[FaucetButton] Balance refresh event emitted");
    } catch (error: unknown) {
      console.error("[FaucetButton] Faucet claim error:", error);
      const err = error as { code?: string; message?: string };
      console.error("[FaucetButton] Error code:", err.code);
      console.error("[FaucetButton] Error message:", err.message);
      
      if (err.code === "CALL_EXCEPTION") {
        setMessage({ type: "error", text: "Cooldown not elapsed (24h)" });
      } else {
        setMessage({ type: "error", text: "Transaction failed" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.isConnected || !isContractsReady) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => claimFromFaucet("USDC")}
        disabled={loading}
        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        Get USDC
      </button>
      <button
        onClick={() => claimFromFaucet("MXNB")}
        disabled={loading}
        className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        Get MXNB
      </button>
      {message && (
        <span
          className={`text-sm font-medium ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
