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
      const [usdcBal, ausdcBal, mxnbBal, vmxnbBal] = await Promise.all([
        contracts.usdc.balanceOf(addr),
        contracts.ausdc.balanceOf(addr),
        contracts.mxnb.balanceOf(addr),
        contracts.vaultV2.balanceOf(addr),
      ]);

      setBalances({
        USDC: formatBalance(usdcBal),
        aUSDC: formatBalance(ausdcBal),
        MXNB: formatBalance(mxnbBal),
        vMXNB: formatBalance(vmxnbBal),
      });
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [contracts, wallet.isConnected, wallet.address]);

  if (!wallet.isConnected || !isContractsReady) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Balances</h2>
        <p className="text-gray-500">Connect your wallet to see balances</p>
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
