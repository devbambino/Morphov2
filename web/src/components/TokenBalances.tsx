"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { FaucetButton } from "@/components/FaucetButton";

export function TokenBalances() {
  const { wallet, contracts, isContractsReady } = useWallet();
  const [balances, setBalances] = useState({
    USDC: "0",
    aUSDC: "0",
    MXNB: "0",
    vMXNB: "0",
  });
  const [loading, setLoading] = useState(true);

  const formatBalance = (bal: bigint, decimals = 6) => {
    if (bal === 0n) return "0";
    return (Number(bal) / Math.pow(10, decimals)).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  };

  const fetchBalances = async () => {
    if (!contracts || !wallet.isConnected || !wallet.address) {
      setLoading(false);
      return;
    }

    try {
      const addr = wallet.address;
      
      // Fetch balances individually with error handling for each contract
      const balanceResults = await Promise.allSettled([
        contracts.usdc.balanceOf(addr).catch(err => {
          console.error("USDC balanceOf failed:", err);
          throw err;
        }),
        contracts.ausdc.balanceOf(addr).catch(err => {
          console.error("aUSDC balanceOf failed:", err);
          throw err;
        }),
        contracts.mxnb.balanceOf(addr).catch(err => {
          console.error("MXNB balanceOf failed:", err);
          throw err;
        }),
        contracts.vaultV2.balanceOf(addr).catch(err => {
          console.error("Vault V2 balanceOf failed:", err);
          throw err;
        }),
      ]);

      const usdcBal = balanceResults[0].status === "fulfilled" ? balanceResults[0].value : 0n;
      const ausdcBal = balanceResults[1].status === "fulfilled" ? balanceResults[1].value : 0n;
      const mxnbBal = balanceResults[2].status === "fulfilled" ? balanceResults[2].value : 0n;
      const vmxnbBal = balanceResults[3].status === "fulfilled" ? balanceResults[3].value : 0n;

      setBalances({
        USDC: formatBalance(usdcBal),
        aUSDC: formatBalance(ausdcBal),
        MXNB: formatBalance(mxnbBal),
        vMXNB: formatBalance(vmxnbBal),
      });
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      console.error("Make sure the local fork is running on", process.env.NEXT_PUBLIC_RPC_URL);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [contracts, wallet.isConnected, wallet.address]);

  if (!wallet.isConnected) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Balances</h2>
        <p className="text-gray-500">Connect your wallet to see balances</p>
      </div>
    );
  }

  if (!isContractsReady) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 bg-red-50">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Balances</h2>
        <div className="text-red-700 text-sm">
          <p className="font-semibold mb-2">ℹ️ Local fork not ready</p>
          <p className="mb-2">Make sure the Anvil fork is running:</p>
          <code className="block bg-white p-2 rounded border border-red-300 text-xs mb-2 font-mono">
            ./scripts/setup-fork.sh
          </code>
          <p className="text-xs">Then update .env.local with deployed addresses from .env.fork</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Your Balances</h2>
        <FaucetButton />
      </div>
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">USDC</p>
            <p className="text-lg font-semibold">{balances.USDC}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">aUSDC</p>
            <p className="text-lg font-semibold">{balances.aUSDC}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">MXNB</p>
            <p className="text-lg font-semibold">{balances.MXNB}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">vMXNB (Vault Shares)</p>
            <p className="text-lg font-semibold">{balances.vMXNB}</p>
          </div>
        </div>
      )}
    </div>
  );
}
