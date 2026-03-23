"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { ethers } from "ethers";

export function FaucetButton() {
  const { wallet, contracts, isContractsReady } = useWallet();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const claimFromFaucet = async (token: "USDC" | "MXNB") => {
    if (!contracts || !wallet.isConnected) return;

    setLoading(true);
    setMessage(null);

    try {
      const contract = token === "USDC" ? contracts.usdc : contracts.mxnb;
      const tx = await contracts.faucet.claim(contract.target);
      await tx.wait();
      setMessage({ type: "success", text: `Received 1000 ${token}!` });
    } catch (error: unknown) {
      console.error("Faucet error:", error);
      const err = error as { code?: string; message?: string };
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
