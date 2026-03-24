"use client";

import { useWallet } from "@/hooks/useWallet";

export function WalletConnect() {
  const { wallet, connect, connectWithPrivateKey, disconnect } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getWalletLabel = () => {
    if (wallet.walletType === "anvil") {
      return "Anvil (Auto)";
    } else if (wallet.walletType === "metamask") {
      return "MetaMask";
    }
    return "Not Connected";
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
      {wallet.isConnected && (
        <>
          <span className="text-sm text-green-600 font-medium">
            {getWalletLabel()}
          </span>
          <span className="text-sm text-gray-600">
            {formatAddress(wallet.address!)}
          </span>
          <button
            onClick={
              wallet.walletType === "anvil" ? connect : connectWithPrivateKey
            }
            disabled={wallet.isConnecting}
            className="px-4 py-2 bg-blue-200 text-blue-700 rounded-lg font-medium hover:bg-blue-300 transition-colors disabled:opacity-50"
          >
            {wallet.isConnecting
              ? "Switching..."
              : wallet.walletType === "anvil"
                ? "Switch to MetaMask"
                : "Switch to Anvil"}
          </button>
          <button
            onClick={disconnect}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}
