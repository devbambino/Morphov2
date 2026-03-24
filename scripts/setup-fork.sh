#!/bin/bash

# Setup Fork Script
# Starts anvil forked from Avalanche mainnet and runs the deployment script
# Usage: ./scripts/setup-fork.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if anvil is running
if pgrep -f "anvil.*8545" > /dev/null 2>&1; then
    print_status "Anvil already running. Killing it to start fresh..."
    pkill -f "anvil.*8545"
    sleep 2
    print_success "Stopped existing anvil process"
fi

print_status "Starting anvil forked from Avalanche mainnet..."

# Start anvil in background
anvil --fork-url https://api.avax.network/ext/bc/C/rpc \
      --host 0.0.0.0 --port 8545 \
      --chain-id 43114 \
      --accounts 1 > anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for anvil to start
sleep 5

# Verify anvil is running
if ! kill -0 $ANVIL_PID 2>/dev/null; then
    print_error "Failed to start anvil"
    cat anvil.log
    exit 1
fi

print_success "Anvil started (PID: $ANVIL_PID)"
print_status "Anvil is running in the background. To view logs: tail -f anvil.log"
print_status ""

# Fund deployer via Anvil RPC before running setup script
# This directly sets the balance on the fork without needing cheat codes
print_status "Funding deployer account via Anvil RPC..."
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
# 100 AVAX in wei (native token on Avalanche)
DEPLOYER_AVAX="0x56BC75E2D630B0D53597F21B278ECC4D69EFF55E540000000"

curl -s http://localhost:8545 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"anvil_setBalance\",\"params\":[\"$DEPLOYER\", \"$DEPLOYER_AVAX\"],\"id\":1}" \
  > /dev/null

print_success "Deployer funded with 100 AVAX"
print_status ""

# Set private key as environment variable for the forge script
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Run the setup fork script
print_status "Running SetupFork.s.sol..."
if forge script script/SetupFork.s.sol \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --sender "$DEPLOYER" \
    -vvv; then
    print_success "Fork setup complete!"
else
    print_error "Forge script failed, but anvil is still running on port 8545"
    print_status "Anvil logs: tail -f anvil.log"
    exit 1
fi

print_status ""
print_status "Running token funding from whale accounts..."
if python3 scripts/fund-deployer-from-whales.js; then
    print_success "Token funding complete!"
else
    print_error "Token funding failed"
    exit 1
fi
print_status "Environment variables written to .env.fork"
print_status ""

# Verify the setup
if [ -f ".env.fork" ]; then
    print_success ".env.fork created successfully"
    print_status "Copy it to the web app:"
    print_status "  cp .env.fork web/.env.local"
else
    print_error ".env.fork was not created"
    exit 1
fi

print_status ""
print_success "=========================================="
print_success "ANVIL FORK SETUP COMPLETE"
print_success "=========================================="
print_status ""
print_status "Anvil is running on http://localhost:8545"
print_status "Forked from Avalanche mainnet at block $FORK_BLOCK"
print_status ""
print_status "Next steps:"
print_status "  1. Copy .env.fork to web/.env.local:"
print_status "     cp .env.fork web/.env.local"
print_status ""
print_status "  2. Start the Next.js dev server:"
print_status "     cd web && npm run dev"
print_status ""
print_status "  3. Open http://localhost:3000/debug to test contracts"
print_status ""
print_status "  4. Contracts are deployed and ready to use"
print_status "     See .env.fork for deployed addresses"
print_status ""
