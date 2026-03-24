"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { TokenBalances } from "@/components/TokenBalances";
import { WalletConnect } from "@/components/WalletConnect";
import { ErrorModal } from "@/components/ErrorModal";
import { parseEthersError, retryOperation } from "@/types/errors";
import { ethers } from "ethers";
import { addresses } from "@/lib/config";

interface MarketParams {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}

const MARKET_PARAMS: MarketParams = {
  loanToken: addresses.mxnb,
  collateralToken: addresses.ausdc,
  oracle: addresses.oracle,
  irm: "0xb6ac9477D574EE2a7BF32d2475b303fb70968AA4",
  lltv: BigInt("770000000000000000"), // 77%
};

export default function BorrowPage() {
  const { wallet, contracts, isContractsReady } = useWallet();

  const [supplyAmount, setSupplyAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [withdrawCollateralAmount, setWithdrawCollateralAmount] = useState("");
  const [withdrawUSDCAmount, setWithdrawUSDCAmount] = useState("");

  const [loading, setLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; title: string; message: string; onRetry?: () => void } | null>(null);

  const showStatus = (type: "success" | "error", text: string) => {
    setStatus({ type, text });
    setTimeout(() => setStatus(null), 5000);
  };

  const showError = (title: string, message: string, onRetry?: () => void) => {
    setErrorModal({ isOpen: true, title, message, onRetry });
    showStatus("error", title);
  };

  const closeErrorModal = () => {
    setErrorModal((prev) => (prev ? { ...prev, isOpen: false } : null));
  };

  const toWei = (amount: string, decimals = 6) => {
    return ethers.parseUnits(amount || "0", decimals);
  };

  const fromWei = (val: bigint, decimals = 6) => {
    return ethers.formatUnits(val, decimals);
  };

  // Step 1: Supply USDC to Aave with retry
  const supplyToAave = async () => {
    if (!contracts || !supplyAmount) return;
    setLoading("supplyAave");
    
    const retry = async () => {
      setLoading("supplyAave");
      supplyToAave();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(supplyAmount);
        const approveTx = await contracts.usdc.approve(addresses.aavePool, amount);
        await approveTx.wait();
        
        const tx = await contracts.aavePool.supply(addresses.usdc, amount, wallet.address, 0);
        await tx.wait();
      }, 1);

      showStatus("success", `Supplied ${supplyAmount} USDC to Aave`);
      setSupplyAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Supply Failed", parsed.message, retry);
    } finally {
      setLoading(null);
    }
  };

  // Step 2: Supply aUSDC as collateral to Morpho with retry
  const supplyCollateralToMorpho = async () => {
    if (!contracts || !collateralAmount) return;
    setLoading("supplyCollateral");

    const retry = async () => {
      setLoading("supplyCollateral");
      supplyCollateralToMorpho();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(collateralAmount);
        const approveTx = await contracts.ausdc.approve(addresses.morpho, amount);
        await approveTx.wait();

        const tx = await contracts.morpho.supplyCollateral(
          MARKET_PARAMS,
          amount,
          wallet.address,
          "0x"
        );
        await tx.wait();
      }, 1);

      showStatus("success", `Supplied ${collateralAmount} aUSDC as collateral`);
      setCollateralAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Collateral Supply Failed", parsed.message, retry);
    } finally {
      setLoading(null);
    }
  };

  // Step 3: Borrow MXNB with retry
  const borrowFromMorpho = async () => {
    if (!contracts || !borrowAmount) return;
    setLoading("borrow");

    const retry = async () => {
      setLoading("borrow");
      borrowFromMorpho();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(borrowAmount);
        const tx = await contracts.morpho.borrow(
          MARKET_PARAMS,
          amount,
          0,
          wallet.address,
          wallet.address
        );
        await tx.wait();
      }, 1);

      showStatus("success", `Borrowed ${borrowAmount} MXNB`);
      setBorrowAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Borrow Failed", parsed.message, retry);
    } finally {
      setLoading(null);
    }
  };

  // Step 4: Repay MXNB with retry
  const repayToMorpho = async () => {
    if (!contracts || !repayAmount) return;
    setLoading("repay");

    const retry = async () => {
      setLoading("repay");
      repayToMorpho();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(repayAmount);
        const approveTx = await contracts.mxnb.approve(addresses.morpho, amount);
        await approveTx.wait();

        const tx = await contracts.morpho.repay(
          MARKET_PARAMS,
          amount,
          0,
          wallet.address,
          "0x"
        );
        await tx.wait();
      }, 1);

      showStatus("success", `Repaid ${repayAmount} MXNB`);
      setRepayAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Repay Failed", parsed.message, retry);
    } finally {
      setLoading(null);
    }
  };

  // Step 5: Withdraw collateral aUSDC from Morpho with retry
  const withdrawCollateralFromMorpho = async () => {
    if (!contracts || !withdrawCollateralAmount) return;
    setLoading("withdrawCollateral");

    const retry = async () => {
      setLoading("withdrawCollateral");
      withdrawCollateralFromMorpho();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(withdrawCollateralAmount);
        const tx = await contracts.morpho.withdrawCollateral(
          MARKET_PARAMS,
          amount,
          wallet.address,
          wallet.address
        );
        await tx.wait();
      }, 1);

      showStatus("success", `Withdrawn ${withdrawCollateralAmount} aUSDC`);
      setWithdrawCollateralAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Withdrawal Failed", parsed.message, retry);
    } finally {
      setLoading(null);
    }
  };

  // Step 6: Withdraw USDC from Aave with retry
  const withdrawFromAave = async () => {
    if (!contracts || !withdrawUSDCAmount) return;
    setLoading("withdrawAave");

    const retry = async () => {
      setLoading("withdrawAave");
      withdrawFromAave();
    };

    try {
      await retryOperation(async () => {
        const amount = toWei(withdrawUSDCAmount);
        const tx = await contracts.aavePool.withdraw(addresses.usdc, amount, wallet.address);
        await tx.wait();
      }, 1);

      showStatus("success", `Withdrawn ${withdrawUSDCAmount} USDC from Aave`);
      setWithdrawUSDCAmount("");
    } catch (error) {
      const parsed = parseEthersError(error);
      showError("Aave Withdrawal Failed", parsed.message, retry);
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
      primary: "bg-blue-600 text-white hover:bg-blue-700",
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
        <h1 className="text-2xl font-bold mb-6">Borrow MXNB</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <WalletConnect />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Borrow MXNB</h1>

      {status && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            status.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {status.text}
        </div>
      )}

      {errorModal && (
        <ErrorModal
          isOpen={errorModal.isOpen}
          title={errorModal.title}
          message={errorModal.message}
          onClose={closeErrorModal}
          onRetry={errorModal.onRetry}
          showRetry={!!errorModal.onRetry}
        />
      )}

      <div className="space-y-6">
        {/* Step 1: Supply USDC to Aave */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Supply USDC to Aave</h2>
          <p className="text-sm text-gray-500 mb-4">
            Supply USDC to Aave V3 to receive aUSDC, which can be used as collateral.
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              value={supplyAmount}
              onChange={(e) => setSupplyAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <ActionButton onClick={supplyToAave} label="Supply to Aave" disabled={!supplyAmount || !isContractsReady} />
          </div>
        </div>

        {/* Step 2: Supply aUSDC as Collateral */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Supply aUSDC as Collateral</h2>
          <p className="text-sm text-gray-500 mb-4">
            Supply your aUSDC to Morpho as collateral to enable borrowing.
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              value={collateralAmount}
              onChange={(e) => setCollateralAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <ActionButton onClick={supplyCollateralToMorpho} label="Supply Collateral" disabled={!collateralAmount || !isContractsReady} />
          </div>
        </div>

        {/* Step 3: Borrow MXNB */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 3: Borrow MXNB</h2>
          <p className="text-sm text-gray-500 mb-4">
            Borrow MXNB using your aUSDC as collateral. Max LTV is 77%.
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              value={borrowAmount}
              onChange={(e) => setBorrowAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <ActionButton onClick={borrowFromMorpho} label="Borrow MXNB" disabled={!borrowAmount || !isContractsReady} />
          </div>
        </div>

        {/* Repay & Withdraw Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage Your Loan</h2>

          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="number"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder="Repay Amount"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <ActionButton onClick={repayToMorpho} label="Repay MXNB" disabled={!repayAmount || !isContractsReady} variant="secondary" />
            </div>

            <div className="flex gap-3">
              <input
                type="number"
                value={withdrawCollateralAmount}
                onChange={(e) => setWithdrawCollateralAmount(e.target.value)}
                placeholder="Withdraw Collateral Amount"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <ActionButton onClick={withdrawCollateralFromMorpho} label="Withdraw aUSDC" disabled={!withdrawCollateralAmount || !isContractsReady} variant="secondary" />
            </div>

            <div className="flex gap-3">
              <input
                type="number"
                value={withdrawUSDCAmount}
                onChange={(e) => setWithdrawUSDCAmount(e.target.value)}
                placeholder="Withdraw USDC Amount"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <ActionButton onClick={withdrawFromAave} label="Withdraw from Aave" disabled={!withdrawUSDCAmount || !isContractsReady} variant="danger" />
            </div>
          </div>
        </div>

        {/* Token Balances */}
        <TokenBalances />
      </div>
    </div>
  );
}
