"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

  const connect = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("MetaMask is not installed");
      return;
    }

    setWallet((prev) => ({ ...prev, isConnecting: true }));

    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      const signer = await provider.getSigner();

      setSigner(signer);

      const address = accounts[0];
      const chainId = Number(network.chainId);

      setWallet({
        address,
        chainId,
        balance: null,
        isConnected: true,
        isConnecting: false,
      });

      const usdc = new Contract(addresses.usdc, erc20Abi, signer);
      const mxnb = new Contract(addresses.mxnb, erc20Abi, signer);
      const ausdc = new Contract(addresses.ausdc, erc20Abi, signer);
      const aavePool = new Contract(addresses.aavePool, aavePoolAbi, signer);
      const morpho = new Contract(addresses.morpho, morphoAbi, signer);
      const vaultV2 = new Contract(addresses.vaultV2, vaultV2Abi, signer);
      const faucet = new Contract(addresses.faucet, faucetAbi, signer);

      setContracts({ usdc, mxnb, ausdc, aavePool, morpho, vaultV2, faucet });
      setIsContractsReady(true);
    } catch (error) {
      console.error("Failed to connect:", error);
      setWallet((prev) => ({ ...prev, isConnecting: false }));
    }
  };

  const disconnect = () => {
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
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (wallet.isConnected) {
        connect();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);

    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, [wallet.isConnected]);

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
