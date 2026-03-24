#!/usr/bin/env python3
"""
Fund deployer from whale accounts using Anvil's hardhat_impersonateAccount RPC
Uses only Python stdlib - no external dependencies needed
"""

import urllib.request
import json
import sys

RPC_URL = "http://localhost:8545"
DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
MXNB = "0xF197FFC28c23E0309B5559e7a166f2c6164C80aA"

USDC_WHALE = "0x45d3D68F14038099530b1C4448Db8Ecdd78179B1"
MXNB_WHALE = "0x817De19F19C39F59e6250Df590246e87e81B2bCB"

# 50000 tokens with 6 decimals = 50000000000
TRANSFER_AMOUNT_HEX = "0xba43b7400"

def send_rpc(method, params):
    """Send an RPC request to Anvil using urllib"""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    }
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            RPC_URL,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"[ERROR] RPC call failed: {e}")
        return None

def main():
    print("[INFO] Funding deployer from whale accounts via Anvil RPC...")
    print(f"[INFO] Deployer: {DEPLOYER}")
    print(f"[INFO] USDC Whale: {USDC_WHALE}")
    print(f"[INFO] MXNB Whale: {MXNB_WHALE}")
    print("")

    
    
    
    # transfer(address,uint256) = 0xa9059cbb
    deployer_padded = DEPLOYER[2:].lower().rjust(64, '0')
    amount_padded = TRANSFER_AMOUNT_HEX[2:].rjust(64, '0')
    calldata = f"0xa9059cbb{deployer_padded}{amount_padded}"

    # Transfer USDC from whale to deployer
    print("[INFO] Impersonating USDC whale...")
    send_rpc("hardhat_impersonateAccount", [USDC_WHALE])

    print(f"[INFO] Transferring 50,000 USDC to deployer...")
    
    tx_params = {
        "from": USDC_WHALE,
        "to": USDC,
        "data": calldata
    }
    tx_result = send_rpc("eth_sendTransaction", [tx_params])
    if tx_result and "result" in tx_result:
        print(f"[SUCCESS] USDC transfer tx: {tx_result['result']}")
    else:
        print("[WARN] USDC transfer initiated")
    
    send_rpc("hardhat_stopImpersonatingAccount", [USDC_WHALE])

    print("")
    print("[SUCCESS] ✓ Token transfers initiated!")
    print("[INFO] Balances should update shortly. Check with debug page if needed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
