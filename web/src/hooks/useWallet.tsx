"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { BrowserProvider, Contract, ContractRunner, Signer } from "ethers";
import { config, addresses } from "@/lib/config";
import erc20Abi from "@/lib/abis/erc20.json";
import aavePoolAbi from "@/lib/abis/aavePool.json";
import morphoAbi from "@/lib/abis/morpho.json";
import vaultV2Abi from "@/lib/abis/vaultV2.json";
import faucetAbi from "@/lib/abis/faucet.json";

interface WalletState {
  address: string | null;
  chainId: number | null;
  balance: string | null;
  isConnected: boolean;
  isConnecting: boolean;
}

interface ContractInterfaces {
  usdc: Contract;
  mxnb: Contract;
  ausdc: Contract;
  aavePool: Contract;
  morpho: Contract;
  vaultV2: Contract;
  faucet: Contract;
}

interface WalletContextType {
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  contracts: ContractInterfaces | null;
  isContractsReady: boolean;
  signer: Signer | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    balance: null,
    isConnected: false,
    isConnecting: false,
  });
  const [contracts, setContracts] = useState<ContractInterfaces | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [isContractsReady, setIsContractsReady] = useState(false);
  
  // Refs to track component lifecycle
  const isMountedRef = useRef(true);
  const providerRef = useRef<BrowserProvider | null>(null);
  const listenerSetupRef = useRef(false);
  const currentChainIdRef = useRef<number | null>(null);

  // Disconnect function with proper logging
  const disconnect = useCallback(() => {
    console.log("[useWallet] Disconnect called");
    console.trace("[useWallet] Disconnect stack trace");
    
    if (!isMountedRef.current) {
      console.log("[useWallet] Component not mounted, skipping disconnect");
      return;
    }

    setWallet({
      address: null,
      chainId: null,
      balance: null,
      isConnected: false,
      isConnecting: false,
    });
    setContracts(null);
    setSigner(null);
    setIsContractsReady(false);
  }, []);

  // Connect function with proper error handling
  const connect = useCallback(async () => {
    console.log("[useWallet] Connect clicked");
    
    if (typeof window === "undefined") {
      console.error("[useWallet] Window is undefined");
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert("MetaMask is not installed");
      return;
    }

    if (!isMountedRef.current) {
      console.log("[useWallet] Component not mounted, aborting connect");
      return;
    }

    setWallet((prev) => ({ ...prev, isConnecting: true }));

    try {
      console.log("[useWallet] Requesting accounts...");
      // Create a fresh provider for this connection
      const provider = new BrowserProvider(ethereum);
      providerRef.current = provider;

      // Request accounts
      const accounts = await provider.send("eth_requestAccounts", []);
      console.log("[useWallet] Got accounts:", accounts);

      if (!isMountedRef.current) {
        console.log("[useWallet] Component unmounted during account request");
        return;
      }

      if (accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask");
      }

      // Get network info
      const network = await provider.getNetwork();
      console.log("[useWallet] Got network:", { chainId: network.chainId });

      // Get signer
      const newSigner = await provider.getSigner();
      console.log("[useWallet] Got signer for address:", accounts[0]);

      if (!isMountedRef.current) {
        console.log("[useWallet] Component unmounted during signer creation");
        return;
      }

      const address = accounts[0];
      const chainId = Number(network.chainId);

      // Store the chain ID so we can detect actual changes
      currentChainIdRef.current = chainId;

      // Update wallet state
      console.log("[useWallet] Updating wallet state...");
      setWallet({
        address,
        chainId,
        balance: null,
        isConnected: true,
        isConnecting: false,
      });
      setSigner(newSigner);

      // Create contract instances
      try {
        console.log("[useWallet] Creating contract instances...");
        console.log("[useWallet] Using addresses:", {
          usdc: addresses.usdc.substring(0, 10) + "...",
          morpho: addresses.morpho.substring(0, 10) + "...",
          vaultV2: addresses.vaultV2.substring(0, 10) + "...",
        });

        const usdc = new Contract(addresses.usdc, erc20Abi, newSigner);
        const mxnb = new Contract(addresses.mxnb, erc20Abi, newSigner);
        const ausdc = new Contract(addresses.ausdc, erc20Abi, newSigner);
        const aavePool = new Contract(addresses.aavePool, aavePoolAbi, newSigner);
        const morpho = new Contract(addresses.morpho, morphoAbi, newSigner);
        const vaultV2 = new Contract(addresses.vaultV2, vaultV2Abi, newSigner);
        const faucet = new Contract(addresses.faucet, faucetAbi, newSigner);

        if (!isMountedRef.current) {
          console.log("[useWallet] Component unmounted during contract creation");
          return;
        }

        setContracts({ usdc, mxnb, ausdc, aavePool, morpho, vaultV2, faucet });
        setIsContractsReady(true);
        console.log("[useWallet] ✅ Wallet connected successfully!");
      } catch (contractError) {
        console.error("[useWallet] Error creating contracts:", contractError);
        // Keep wallet connected even if contracts fail
        console.log("[useWallet] Wallet is connected, but contracts failed to load");
        setIsContractsReady(false);
      }
    } catch (error) {
      console.error("[useWallet] Connection failed:", error);
      if (isMountedRef.current) {
        setWallet((prev) => ({ ...prev, isConnecting: false, isConnected: false }));
      }
    }
  }, []);

  // Setup MetaMask event listeners - only once
  useEffect(() => {
    console.log("[useWallet] useEffect: Setting up listeners");
    isMountedRef.current = true;

    if (typeof window === "undefined") {
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      console.log("[useWallet] MetaMask not available");
      return;
    }

    // Only set up listeners once
    if (listenerSetupRef.current) {
      console.log("[useWallet] Listeners already set up, skipping");
      return;
    }
    listenerSetupRef.current = true;

    const handleAccountsChanged = (accounts: string[]) => {
      console.log("[useWallet] accountsChanged event fired with accounts:", accounts);
      
      if (!isMountedRef.current) {
        console.log("[useWallet] Component not mounted, ignoring event");
        return;
      }

      if (accounts.length === 0) {
        console.log("[useWallet] All accounts disconnected");
        disconnect();
      } else {
        console.log("[useWallet] Accounts changed to:", accounts[0]);
        // Don't reconnect automatically
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      console.log("[useWallet] Chain changed event fired with chainId:", chainIdHex);
      
      if (!isMountedRef.current) {
        console.log("[useWallet] Component not mounted, ignoring chain change");
        return;
      }

      // Convert hex to decimal
      const newChainId = parseInt(chainIdHex, 16);
      console.log("[useWallet] Converted to decimal chainId:", newChainId);
      console.log("[useWallet] Current stored chainId:", currentChainIdRef.current);

      // Only reload if the chain actually changed
      if (currentChainIdRef.current !== null && currentChainIdRef.current !== newChainId) {
        console.log("[useWallet] Chain actually changed from", currentChainIdRef.current, "to", newChainId);
        console.log("[useWallet] Reloading page due to actual chain change");
        window.location.reload();
      } else if (currentChainIdRef.current === null) {
        console.log("[useWallet] First time setting chain, not reloading");
        currentChainIdRef.current = newChainId;
      } else {
        console.log("[useWallet] Chain event but same chain, no reload needed");
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      console.log("[useWallet] useEffect cleanup: Removing listeners");
      isMountedRef.current = false;
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[useWallet] Component unmounting");
      isMountedRef.current = false;
    };
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, connect, disconnect, contracts, isContractsReady, signer }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
