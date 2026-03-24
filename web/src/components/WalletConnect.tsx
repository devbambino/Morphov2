"use client";

import { useWallet } from "@/hooks/useWallet";

export function WalletConnect() {
  const { wallet, connect, disconnect, isContractsReady } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!wallet.isConnected) {
    return (
      <button
        onClick={connect}
        disabled={wallet.isConnecting}
        className="px-8 text-center text-black"
      >
        {wallet.isConnecting ? "Connecting..." : "Connect MetaMask"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {isContractsReady && (
        <span className="text-sm text-green-600 font-medium">Connected</span>
      )}
      <button
        onClick={disconnect}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
      >
        {formatAddress(wallet.address!)}
      </button>
    </div>
  );
}
