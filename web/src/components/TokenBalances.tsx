"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@/hooks/useWallet";
import { FaucetButton } from "@/components/FaucetButton";

// Create a global event emitter for balance refresh requests
const balanceRefreshEmitter = {
  listeners: new Set<() => void>(),
  subscribe(callback: () => void) {
    console.log("[BalanceRefreshEmitter] New subscription added");
    this.listeners.add(callback);
    console.log("[BalanceRefreshEmitter] Current listener count:", this.listeners.size);
    return () => {
      console.log("[BalanceRefreshEmitter] Removing subscription");
      this.listeners.delete(callback);
      console.log("[BalanceRefreshEmitter] Current listener count:", this.listeners.size);
    };
  },
  emit() {
    console.log("[BalanceRefreshEmitter] Emitting refresh event to", this.listeners.size, "listeners");
    this.listeners.forEach((callback, index) => {
      console.log(`[BalanceRefreshEmitter] Calling listener ${index + 1}/${this.listeners.size}`);
      try {
        callback();
      } catch (err) {
        console.error("[BalanceRefreshEmitter] Error in listener callback:", err);
      }
    });
    console.log("[BalanceRefreshEmitter] All listeners notified");
  },
};

export { balanceRefreshEmitter };

export function TokenBalances() {
  const { wallet, contracts, isContractsReady } = useWallet();
  const [balances, setBalances] = useState({
    USDC: "0",
    aUSDC: "0",
    MXNB: "0",
    vMXNB: "0",
  });
  const [loading, setLoading] = useState(true);
  const balanceRefreshRequestRef = useRef(false);

  const formatBalance = (bal: bigint, decimals = 6) => {
    if (bal === 0n) return "0";
    return (Number(bal) / Math.pow(10, decimals)).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  };

  const fetchBalances = useCallback(async () => {
    console.log("[TokenBalances] fetchBalances called");
    console.log("[TokenBalances] Contracts ready:", !!contracts);
    console.log("[TokenBalances] Wallet connected:", wallet.isConnected);
    console.log("[TokenBalances] Wallet address:", wallet.address);
    
    if (!contracts || !wallet.isConnected || !wallet.address) {
      console.log("[TokenBalances] Skipping fetch: missing contracts, connection, or address");
      setLoading(false);
      return;
    }

    try {
      const addr = wallet.address;
      console.log(`[TokenBalances] Fetching balances for address: ${addr}`);
      
      // Fetch balances individually with error handling for each contract
      const balanceResults = await Promise.allSettled([
        contracts.usdc.balanceOf(addr).then(bal => {
          console.log("[TokenBalances] USDC balance fetched:", bal.toString());
          return bal;
        }).catch(err => {
          console.error("[TokenBalances] USDC balanceOf failed:", err);
          return 0n;
        }),
        contracts.ausdc.balanceOf(addr).then(bal => {
          console.log("[TokenBalances] aUSDC balance fetched:", bal.toString());
          return bal;
        }).catch(err => {
          console.error("[TokenBalances] aUSDC balanceOf failed:", err);
          return 0n;
        }),
        contracts.mxnb.balanceOf(addr).then(bal => {
          console.log("[TokenBalances] MXNB balance fetched:", bal.toString());
          return bal;
        }).catch(err => {
          console.error("[TokenBalances] MXNB balanceOf failed:", err);
          return 0n;
        }),
        contracts.vaultV2.balanceOf(addr).then(bal => {
          console.log("[TokenBalances] Vault V2 balance fetched:", bal.toString());
          return bal;
        }).catch(err => {
          console.error("[TokenBalances] Vault V2 balanceOf failed:", err);
          console.warn("[TokenBalances] Vault V2 contract may not be deployed at: ", process.env.NEXT_PUBLIC_VAULT_V2);
          return 0n;
        }),
      ]);

      console.log("[TokenBalances] All balance requests settled");
      
      const usdcBal = balanceResults[0].status === "fulfilled" ? balanceResults[0].value : 0n;
      const ausdcBal = balanceResults[1].status === "fulfilled" ? balanceResults[1].value : 0n;
      const mxnbBal = balanceResults[2].status === "fulfilled" ? balanceResults[2].value : 0n;
      const vmxnbBal = balanceResults[3].status === "fulfilled" ? balanceResults[3].value : 0n;

      const formattedBalances = {
        USDC: formatBalance(usdcBal),
        aUSDC: formatBalance(ausdcBal),
        MXNB: formatBalance(mxnbBal),
        vMXNB: formatBalance(vmxnbBal),
      };
      
      console.log("[TokenBalances] Formatted balances:", formattedBalances);
      console.log("[TokenBalances] Raw balances - USDC:", usdcBal.toString(), "MXNB:", mxnbBal.toString());
      
      setBalances(formattedBalances);
    } catch (error) {
      console.error("[TokenBalances] Failed to fetch balances:", error);
      console.error("[TokenBalances] Make sure the contracts are deployed and the RPC URL is correct");
      console.error("[TokenBalances] RPC URL:", process.env.NEXT_PUBLIC_RPC_URL);
    } finally {
      setLoading(false);
      balanceRefreshRequestRef.current = false;
    }
  }, [contracts, wallet.isConnected, wallet.address]);

  useEffect(() => {
    console.log("[TokenBalances] Setting up effect with fetchBalances dependency");
    
    // Initial fetch
    console.log("[TokenBalances] Performing initial balance fetch");
    fetchBalances();
    
    // Set up polling interval
    console.log("[TokenBalances] Setting up 10-second polling interval");
    const interval = setInterval(() => {
      console.log("[TokenBalances] Polling interval: fetching balances");
      fetchBalances();
    }, 10000);

    // Subscribe to manual refresh requests (e.g., from FaucetButton)
    console.log("[TokenBalances] Subscribing to balance refresh events");
    const unsubscribe = balanceRefreshEmitter.subscribe(() => {
      console.log("[TokenBalances] ✓ Manual refresh requested from FaucetButton");
      balanceRefreshRequestRef.current = true;
      fetchBalances();
    });
    console.log("[TokenBalances] Successfully subscribed to balance refresh emitter");

    return () => {
      console.log("[TokenBalances] Cleaning up: clearing interval and unsubscribing");
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchBalances]);

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
