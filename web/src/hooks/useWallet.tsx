"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { BrowserProvider, Contract, Signer } from "ethers";
import { config, addresses } from "@/lib/config";
import { EthersError, retryOperation } from "@/types/errors";
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

  // Refs to track component lifecycle and prevent memory leaks
  const isMountedRef = useRef(true);
  const providerRef = useRef<BrowserProvider | null>(null);
  const listenerSetupRef = useRef(false);
  const currentChainIdRef = useRef<number | null>(null);
  const listenerCallbacksRef = useRef<{
    handleAccountsChanged: ((accounts: string[]) => void) | null;
    handleChainChanged: ((chainIdHex: string) => void) | null;
  }>({
    handleAccountsChanged: null,
    handleChainChanged: null,
  });

  /**
   * Reset wallet state when disconnecting
   */
  const disconnect = useCallback(() => {
    console.log("[useWallet] Disconnect called");

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

  /**
   * Create contract instances with error handling
   */
  const createContractInstances = useCallback(
    (signer: Signer) => {
      try {
        console.log("[useWallet] Creating contract instances...");

        // Verify all required addresses are present
        const requiredAddresses = {
          usdc: addresses.usdc,
          mxnb: addresses.mxnb,
          ausdc: addresses.ausdc,
          aavePool: addresses.aavePool,
          morpho: addresses.morpho,
          vaultV2: addresses.vaultV2,
          faucet: addresses.faucet,
        };

        for (const [key, address] of Object.entries(requiredAddresses)) {
          if (!address) {
            console.warn(`[useWallet] Missing address for ${key}`);
          }
        }

        const contractInstances: ContractInterfaces = {
          usdc: new Contract(addresses.usdc, erc20Abi, signer),
          mxnb: new Contract(addresses.mxnb, erc20Abi, signer),
          ausdc: new Contract(addresses.ausdc, erc20Abi, signer),
          aavePool: new Contract(addresses.aavePool, aavePoolAbi, signer),
          morpho: new Contract(addresses.morpho, morphoAbi, signer),
          vaultV2: new Contract(addresses.vaultV2, vaultV2Abi, signer),
          faucet: new Contract(addresses.faucet, faucetAbi, signer),
        };

        console.log("[useWallet] ✓ Contract instances created successfully");
        return contractInstances;
      } catch (error) {
        console.error("[useWallet] Error creating contract instances:", error);
        throw error;
      }
    },
    []
  );

  /**
   * Connect wallet with retry logic
   */
  const connect = useCallback(async () => {
    console.log("[useWallet] Connect initiated");

    if (typeof window === "undefined") {
      console.error("[useWallet] Window is undefined");
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      console.error("[useWallet] MetaMask is not installed");
      return;
    }

    if (!isMountedRef.current) {
      console.log("[useWallet] Component not mounted, aborting connect");
      return;
    }

    setWallet((prev) => ({ ...prev, isConnecting: true }));

    try {
      // Use retry logic for connection attempt
      await retryOperation(async () => {
        console.log("[useWallet] Requesting accounts...");
        const provider = new BrowserProvider(ethereum);
        providerRef.current = provider;

        // Request accounts with retry
        const accounts = await provider.send("eth_requestAccounts", []);
        console.log("[useWallet] Got accounts:", accounts.length);

        if (!isMountedRef.current) {
          console.log("[useWallet] Component unmounted during account request");
          return;
        }

        if (accounts.length === 0) {
          throw new Error("No accounts returned from MetaMask");
        }

        // Get network and signer
        const network = await provider.getNetwork();
        const newSigner = await provider.getSigner();
        const address = accounts[0];
        const chainId = Number(network.chainId);

        if (!isMountedRef.current) {
          console.log("[useWallet] Component unmounted during setup");
          return;
        }

        // Store chain ID for change detection
        currentChainIdRef.current = chainId;

        // Update wallet state
        setWallet({
          address,
          chainId,
          balance: null,
          isConnected: true,
          isConnecting: false,
        });
        setSigner(newSigner);

        // Create contracts
        try {
          const contractInstances = createContractInstances(newSigner);
          if (isMountedRef.current) {
            setContracts(contractInstances);
            setIsContractsReady(true);
            console.log("[useWallet] ✅ Wallet and contracts ready!");
          }
        } catch (contractError) {
          console.error("[useWallet] Failed to create contracts:", contractError);
          if (isMountedRef.current) {
            setIsContractsReady(false);
          }
        }
      }, 1); // Retry once on failure
    } catch (error) {
      console.error("[useWallet] Connection failed:", error);
      if (isMountedRef.current) {
        setWallet((prev) => ({
          ...prev,
          isConnecting: false,
          isConnected: false,
        }));
      }
    }
  }, [createContractInstances]);

  /**
   * Setup MetaMask event listeners
   */
  useEffect(() => {
    console.log("[useWallet] Setting up MetaMask listeners");
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
      console.log("[useWallet] Listeners already set up");
      return;
    }
    listenerSetupRef.current = true;

    // Define listener callbacks
    const handleAccountsChanged = (accounts: string[]) => {
      console.log("[useWallet] Accounts changed");

      if (!isMountedRef.current) return;

      if (accounts.length === 0) {
        console.log("[useWallet] All accounts disconnected");
        disconnect();
      } else {
        console.log("[useWallet] Account switched to:", accounts[0]);
        // Note: Not auto-reconnecting; user stays connected but address updates
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      console.log("[useWallet] Chain changed to:", chainIdHex);

      if (!isMountedRef.current) return;

      const newChainId = parseInt(chainIdHex, 16);

      // Reload only if chain actually changed
      if (
        currentChainIdRef.current !== null &&
        currentChainIdRef.current !== newChainId
      ) {
        console.log(
          `[useWallet] Reloading due to chain change: ${currentChainIdRef.current} → ${newChainId}`
        );
        window.location.reload();
      } else if (currentChainIdRef.current === null) {
        currentChainIdRef.current = newChainId;
      }
    };

    // Store callbacks for cleanup
    listenerCallbacksRef.current = {
      handleAccountsChanged,
      handleChainChanged,
    };

    // Add listeners
    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    // Cleanup
    return () => {
      console.log("[useWallet] Cleaning up listeners");
      isMountedRef.current = false;
      const { handleAccountsChanged: acc, handleChainChanged: chain } =
        listenerCallbacksRef.current;
      if (acc) ethereum.removeListener("accountsChanged", acc);
      if (chain) ethereum.removeListener("chainChanged", chain);
    };
  }, [disconnect]);

  /**
   * Mark unmounted on component cleanup
   */
  useEffect(() => {
    return () => {
      console.log("[useWallet] Provider unmounting");
      isMountedRef.current = false;
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connect,
        disconnect,
        contracts,
        isContractsReady,
        signer,
      }}
    >
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
