import { BrowserProvider, Contract, Signer } from "ethers";

export interface WalletState {
  address: string | null;
  chainId: number | null;
  balance: string | null;
  isConnected: boolean;
  isConnecting: boolean;
}

export interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
  formatted: string;
}

export interface Position {
  collateral: bigint;
  supplyShares: bigint;
  borrowShares: bigint;
}

export interface MarketInfo {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface ContractInterfaces {
  usdc: Contract;
  mxnb: Contract;
  ausdc: Contract;
  aavePool: Contract;
  morpho: Contract;
  vaultV2: Contract;
  faucet: Contract;
}

export type WalletContextType = {
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  contracts: ContractInterfaces | null;
  isContractsReady: boolean;
};
