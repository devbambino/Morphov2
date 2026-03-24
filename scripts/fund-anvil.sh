#!/bin/bash

# Fund Anvil accounts via RPC
# This script directly funds accounts on the Anvil fork before running the setup script
# Uses anvil_setBalance RPC method which works even without cheatcodes

set -e

ANVIL_RPC="http://localhost:8545"
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# Check if Anvil is running
if ! curl -s "$ANVIL_RPC" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' > /dev/null 2>&1; then
    echo "[ERROR] Anvil is not running on $ANVIL_RPC"
    exit 1
fi

echo "[INFO] Funding deployer account on Anvil..."

# Fund deployer with ETH (in wei) - set to 100 ETH
DEPLOYER_ETH="0x56BC75E2D630B0D53597F21B278ECC4D69EFF55E540000000" # 100 ETH in wei

curl -s "$ANVIL_RPC" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"anvil_setBalance\",\"params\":[\"$DEPLOYER\", \"$DEPLOYER_ETH\"],\"id\":1}" \
  > /dev/null

echo "[SUCCESS] Deployer funded with ETH"

# The USDC and MXNB funding will be done via the forge script using proper token transfers
echo "[INFO] Token funding will be handled by the forge script via transfers"
