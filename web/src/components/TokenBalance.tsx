"use client";

import { useState, useEffect } from "react";
import { Contract, Signer } from "ethers";

interface TokenBalanceProps {
  contract: Contract | null;
  symbol: string;
  decimals?: number;
  walletAddress: string | null;
}

export function TokenBalance({ contract, symbol, decimals = 6, walletAddress }: TokenBalanceProps) {
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contract || !walletAddress) {
      setLoading(false);
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await contract.balanceOf(walletAddress);
        setBalance(formatBalance(bal, decimals));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [contract, decimals, walletAddress]);

  const formatBalance = (bal: bigint, dec: number) => {
    const formatted = Number(bal) / Math.pow(10, dec);
    return formatted.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600">{symbol}:</span>
      {loading ? (
        <span className="text-gray-400">...</span>
      ) : (
        <span className="font-semibold">{balance}</span>
      )}
    </div>
  );
}
