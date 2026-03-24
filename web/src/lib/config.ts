export const config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545",
  privateRpcUrl: process.env.NEXT_PUBLIC_PRIVATE_RPC_URL || "/api/rpc",
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "43114", 10),
  deployerPrivateKey: process.env.NEXT_PUBLIC_PRIVATE_KEY || "",
  
  aavePool: process.env.NEXT_PUBLIC_AAVE_POOL || "",
  usdc: process.env.NEXT_PUBLIC_USDC || "",
  ausdc: process.env.NEXT_PUBLIC_AUSDC || "",
  
  morpho: process.env.NEXT_PUBLIC_MORPHO || "",
  mxnb: process.env.NEXT_PUBLIC_MXNB || "",
  marketId: process.env.NEXT_PUBLIC_MORPHO_MARKET_ID || "",
  
  vaultV2: process.env.NEXT_PUBLIC_VAULT_V2 || "",
  adapter: process.env.NEXT_PUBLIC_ADAPTER || "",
  oracle: process.env.NEXT_PUBLIC_ORACLE || "",
  faucet: process.env.NEXT_PUBLIC_FAUCET || "",
};

export const addresses = {
  aavePool: config.aavePool,
  usdc: config.usdc,
  ausdc: config.ausdc,
  morpho: config.morpho,
  mxnb: config.mxnb,
  marketId: config.marketId,
  vaultV2: config.vaultV2,
  adapter: config.adapter,
  oracle: config.oracle,
  faucet: config.faucet,
};
