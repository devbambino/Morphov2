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
    print_error "Anvil is already running on port 8545"
    print_status "Kill existing anvil with: pkill -f anvil"
    exit 1
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

# Set private key as environment variable for the forge script
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Run the setup fork script
print_status "Running SetupFork.s.sol..."
if forge script script/SetupFork.s.sol \
    --rpc-url http://localhost:8545 \
    --broadcast \
    -vvv; then
    print_success "Fork setup complete!"
else
    print_error "Forge script failed, but anvil is still running on port 8545"
    print_status "Anvil logs: tail -f anvil.log"
    exit 1
fi
print_status "Environment variables written to .env.fork"
print_status ""
print_status "To start the Next.js app:"
print_status "  1. Copy .env.fork to web/.env.local:"
print_status "     cp web/.env.fork web/.env.local"
print_status "  2. Start the dev server:"
print_status "     cd web && npm run dev"
print_status ""
print_status "Note: You'll need to manually update the addresses in .env.local"
print_status "      after running the forge script (check .env.fork for deployed addresses)"
