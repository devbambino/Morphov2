"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { TokenBalances } from "@/components/TokenBalances";
import { ethers } from "ethers";
import { config, addresses } from "@/lib/config";

export default function LendPage() {
  const { wallet, contracts, isContractsReady } = useWallet();
  
  const [depositAmount, setDepositAmount] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [vaultInfo, setVaultInfo] = useState({
    totalAssets: "0",
    totalShares: "0",
    yieldEarned: "0",
  });

  const showStatus = (type: "success" | "error", text: string) => {
    setStatus({ type, text });
    setTimeout(() => setStatus(null), 5000);
  };

  const toWei = (amount: string, decimals = 6) => {
    return ethers.parseUnits(amount || "0", decimals);
  };

  const fromWei = (val: bigint, decimals = 6) => {
    return ethers.formatUnits(val, decimals);
  };

  // Fetch vault info
  const fetchVaultInfo = async () => {
    if (!contracts || !wallet.address) return;

    try {
      const [totalAssets, totalSupply, userShares] = await Promise.all([
        contracts.vaultV2.totalAssets(),
        contracts.vaultV2.totalSupply(),
        contracts.vaultV2.balanceOf(wallet.address),
      ]);

      const userAssets = Number(fromWei(userShares));
      const vaultAssets = Number(fromWei(totalAssets));
      const vaultShares = Number(fromWei(totalSupply));
      
      // Calculate yield (rough estimate)
      const yieldEarned = vaultShares > 0 
        ? Math.max(0, userAssets - (userShares * vaultAssets / vaultShares)).toFixed(2)
        : "0";

      setVaultInfo({
        totalAssets: vaultAssets.toLocaleString("en-US", { maximumFractionDigits: 2 }),
        totalShares: vaultShares.toLocaleString("en-US", { maximumFractionDigits: 2 }),
        yieldEarned,
      });
    } catch (error) {
      console.error("Failed to fetch vault info:", error);
    }
  };

  useEffect(() => {
    if (wallet.isConnected && isContractsReady) {
      fetchVaultInfo();
      const interval = setInterval(fetchVaultInfo, 10000);
      return () => clearInterval(interval);
    }
  }, [wallet.isConnected, isContractsReady, wallet.address]);

  // Deposit MXNB to Vault
  const depositToVault = async () => {
    if (!contracts || !depositAmount) return;
    setLoading("deposit");
    try {
      const amount = toWei(depositAmount);
      await contracts.mxnb.approve(addresses.vaultV2, amount);
      const tx = await contracts.vaultV2.deposit(amount, wallet.address);
      await tx.wait();
      showStatus("success", `Deposited ${depositAmount} MXNB to vault`);
      setDepositAmount("");
      fetchVaultInfo();
    } catch (error: unknown) {
      console.error(error);
      const err = error as { code?: number; message?: string };
      showStatus("error", err.message || "Transaction failed");
    } finally {
      setLoading(null);
    }
  };

  // Redeem vault shares for MXNB
  const redeemFromVault = async (redeemAll = false) => {
    if (!contracts) return;
    setLoading("redeem");
    try {
      let shares;
      if (redeemAll) {
        shares = await contracts.vaultV2.balanceOf(wallet.address);
      } else {
        showStatus("error", "Please specify amount to redeem");
        setLoading(null);
        return;
      }

      if (shares === 0n) {
        showStatus("error", "No shares to redeem");
        setLoading(null);
        return;
      }

      const tx = await contracts.vaultV2.redeem(shares, wallet.address, wallet.address);
      await tx.wait();
      showStatus("success", "Redeemed all vault shares for MXNB");
      fetchVaultInfo();
    } catch (error: unknown) {
      console.error(error);
      const err = error as { code?: number; message?: string };
      showStatus("error", err.message || "Transaction failed");
    } finally {
      setLoading(null);
    }
  };

  const ActionButton = ({
    onClick,
    label,
    disabled,
    variant = "primary",
  }: {
    onClick: () => void;
    label: string;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger";
  }) => {
    const baseClasses = "px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    const variantClasses = {
      primary: "bg-purple-600 text-white hover:bg-purple-700",
      secondary: "bg-gray-200 text-gray-700 hover:bg-gray-300",
      danger: "bg-red-600 text-white hover:bg-red-700",
    };
    return (
      <button
        onClick={onClick}
        disabled={disabled || !!loading}
        className={`${baseClasses} ${variantClasses[variant]}`}
      >
        {loading ? "Processing..." : label}
      </button>
    );
  };

  if (!wallet.isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Lend MXNB</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-4">Connect your wallet to start lending</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Lend MXNB</h1>

      {status && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            status.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Step 1: Deposit MXNB to Vault */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Deposit MXNB to Vault</h2>
          <p className="text-sm text-gray-500 mb-4">
            Deposit MXNB into the vault to earn yield. Your MXNB will be allocated to the Morpho market for lending.
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <ActionButton onClick={depositToVault} label="Deposit to Vault" disabled={!depositAmount} />
          </div>
        </div>

        {/* Vault Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vault Performance</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600">Total Deposited</p>
              <p className="text-xl font-bold text-purple-900">{vaultInfo.totalAssets} MXNB</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600">Vault Shares</p>
              <p className="text-xl font-bold text-purple-900">{vaultInfo.totalShares} vMXNB</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">Yield Earned</p>
              <p className="text-xl font-bold text-green-900">+{vaultInfo.yieldEarned} MXNB</p>
            </div>
          </div>
        </div>

        {/* Redeem */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Withdraw</h2>
          <p className="text-sm text-gray-500 mb-4">
            Redeem your vault shares to withdraw your MXNB along with earned yield.
          </p>
          <ActionButton 
            onClick={() => redeemFromVault(true)} 
            label="Redeem All" 
            variant="danger"
            disabled={!isContractsReady} 
          />
        </div>

        {/* Token Balances */}
        <TokenBalances />
      </div>
    </div>
  );
}
