"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { ethers } from "ethers";
import erc20Abi from "@/lib/abis/erc20.json";

type LogEntry = {
    timestamp: string;
    action: string;
    status: "info" | "success" | "error" | "pending";
    message: string;
    details?: string;
};

export default function DebugPage() {
    const { wallet, contracts, isContractsReady, signer } = useWallet();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [balances, setBalances] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const addLog = (
        action: string,
        status: LogEntry["status"],
        message: string,
        details?: string
    ) => {
        const entry: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            action,
            status,
            message,
            details,
        };
        setLogs((prev) => [...prev, entry]);
        console.log(`[${action}]`, message, details || "");
    };

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const fetchAllBalances = async () => {
        if (!contracts || !wallet.address) {
            addLog("Balances", "error", "Wallet not connected or contracts not ready");
            return;
        }

        setLoading(true);
        addLog("Balances", "pending", "Fetching all balances...");

        try {
            const [usdcBal, mxnbBal, ausdcBal, vaultBal] = await Promise.all([
                contracts.usdc.balanceOf(wallet.address),
                contracts.mxnb.balanceOf(wallet.address),
                contracts.ausdc.balanceOf(wallet.address),
                contracts.vaultV2.balanceOf(wallet.address),
            ]);

            const formatted = {
                USDC: (Number(usdcBal) / 1e6).toFixed(2),
                MXNB: (Number(mxnbBal) / 1e6).toFixed(2),
                aUSDC: (Number(ausdcBal) / 1e6).toFixed(2),
                vMXNB: (Number(vaultBal) / 1e6).toFixed(2),
            };

            setBalances(formatted);
            addLog("Balances", "success", "Balances fetched successfully",
                JSON.stringify(formatted));
        } catch (error: any) {
            addLog(
                "Balances",
                "error",
                `Failed to fetch balances: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    const testTokenTransfer = async (tokenName: "USDC" | "MXNB") => {
        if (!contracts || !wallet.address || !signer) {
            addLog(tokenName, "error", "Wallet not connected");
            return;
        }

        setLoading(true);
        const token = tokenName === "USDC" ? contracts.usdc : contracts.mxnb;
        const amount = ethers.parseUnits("1", 6);

        try {
            addLog(tokenName, "pending", `Checking balance of ${wallet.address}`);
            const balance = await token.balanceOf(wallet.address);
            addLog(tokenName, "info", `Current balance: ${balance.toString()}`);

            if (balance < amount) {
                addLog(tokenName, "error", `Insufficient balance. Have: ${balance}, Need: ${amount}`);
                return;
            }

            addLog(tokenName, "pending", `Approving ${amount} tokens for transfer...`);
            const approveTx = await token.approve(wallet.address, amount);
            const approveReceipt = await approveTx.wait();
            addLog(
                tokenName,
                "success",
                `Approved ${amount} tokens`,
                `TxHash: ${approveTx.hash}`
            );

            addLog(tokenName, "pending", "Attempting transfer...");
            const transferTx = await token.transfer(wallet.address, amount);
            const transferReceipt = await transferTx.wait();
            addLog(
                tokenName,
                "success",
                "Transfer successful",
                `TxHash: ${transferTx.hash}`
            );

            await fetchAllBalances();
        } catch (error: any) {
            addLog(
                tokenName,
                "error",
                `Transfer failed: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    const testFaucetClaim = async (token: "USDC" | "MXNB") => {
        if (!contracts || !wallet.address) {
            addLog("Faucet", "error", "Wallet not connected");
            return;
        }

        setLoading(true);

        try {
            const tokenAddr = token === "USDC" ? contracts.usdc.target : contracts.mxnb.target;
            addLog(
                "Faucet",
                "pending",
                `Claiming ${token} from faucet...`,
                `Token: ${tokenAddr}`
            );

            const tx = await contracts.faucet.claim(tokenAddr);
            addLog("Faucet", "info", "Transaction submitted", `TxHash: ${tx.hash}`);

            const receipt = await tx.wait();
            addLog("Faucet", "success", `${token} claim successful`,
                `Block: ${receipt?.blockNumber}, Gas: ${receipt?.gasUsed.toString()}`
            );

            await fetchAllBalances();
        } catch (error: any) {
            addLog(
                "Faucet",
                "error",
                `Faucet claim failed: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    const testVaultDeposit = async () => {
        if (!contracts || !wallet.address) {
            addLog("VaultV2", "error", "Wallet not connected");
            return;
        }

        setLoading(true);

        try {
            const depositAmount = ethers.parseUnits("1", 6);

            // Check MXNB balance
            addLog("VaultV2", "pending", "Checking MXNB balance...");
            const mxnbBalance = await contracts.mxnb.balanceOf(wallet.address);
            addLog("VaultV2", "info", `MXNB balance: ${mxnbBalance.toString()}`);

            if (mxnbBalance < depositAmount) {
                addLog("VaultV2", "error", `Insufficient MXNB. Have: ${mxnbBalance}, Need: ${depositAmount}`);
                return;
            }

            // Approve vault to spend MXNB
            addLog("VaultV2", "pending", "Approving VaultV2 to spend MXNB...");
            const approveTx = await contracts.mxnb.approve(contracts.vaultV2.target, depositAmount);
            await approveTx.wait();
            addLog("VaultV2", "success", "Approved VaultV2");

            // Deposit
            addLog("VaultV2", "pending", `Depositing ${depositAmount}...`);
            const depositTx = await contracts.vaultV2.deposit(
                depositAmount,
                wallet.address
            );
            const receipt = await depositTx.wait();
            addLog("VaultV2", "success", "Deposit successful",
                `TxHash: ${depositTx.hash}, Block: ${receipt?.blockNumber}`
            );

            await fetchAllBalances();
        } catch (error: any) {
            addLog(
                "VaultV2",
                "error",
                `Deposit failed: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    const testContractRead = async (contractName: string, method: string) => {
        if (!contracts) {
            addLog(contractName, "error", "Contracts not ready");
            return;
        }

        setLoading(true);

        try {
            addLog(contractName, "pending", `Reading ${method}...`);

            let result;
            if (contractName === "USDC" && method === "decimals") {
                result = await contracts.usdc.decimals();
                const symbol = await contracts.usdc.symbol();
                addLog("USDC", "info", `usdc symbol: ${symbol}`);
                addLog("USDC", "pending", `Checking usdc balance... ${wallet.address}`);
                const usdcBalance = await contracts.usdc.balanceOf(wallet.address);
                addLog("USDC", "info", `usdc balance: ${usdcBalance.toString()}`);
            } else if (contractName === "MXNB" && method === "decimals") {
                result = await contracts.mxnb.decimals();
                const symbol = await contracts.mxnb.symbol();
                addLog("MXNB", "info", `mxnb symbol: ${symbol}`);
                addLog("MXNB", "pending", `Checking mxnb balance... ${wallet.address}`);
                const mxnBalance = await contracts.mxnb.balanceOf(wallet.address);
                addLog("MXNB", "info", `mxnb balance: ${mxnBalance.toString()}`);
            } else if (contractName === "Oracle" && method === "price") {
                result = await contracts.vaultV2.oracle();
            }

            addLog(contractName, "success", `${method} = ${result ? result.toString() : "N/A"}`);
        } catch (error: any) {
            addLog(
                contractName,
                "error",
                `Read failed: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    const checkContractCode = async (contractName: string) => {
        if (!contracts) {
            addLog(contractName, "error", "Contracts not ready");
            return;
        }

        setLoading(true);

        try {
            let address = "";
            let contract = null;

            if (contractName === "USDC") {
                address = contracts.usdc.target as string;
                contract = contracts.usdc;
            } else if (contractName === "MXNB") {
                address = contracts.mxnb.target as string;
                contract = contracts.mxnb;
            } else if (contractName === "Faucet") {
                address = contracts.faucet.target as string;
                contract = contracts.faucet;
            }

            if (!address) {
                addLog(contractName, "error", "No address configured");
                return;
            }

            addLog(contractName, "pending", `Checking code at ${address}...`);

            // Check if contract has code
            const code = await contracts.usdc.runner?.provider?.getCode(address);

            if (!code || code === "0x") {
                addLog(
                    contractName,
                    "error",
                    `No contract code at ${address}. Address is empty!`,
                    `Check if contract was actually deployed at this address on the fork.`
                );
                return;
            }

            addLog(
                contractName,
                "success",
                `Contract exists at ${address}`,
                `Code length: ${code.length} bytes`
            );

            // Try to call decimals as a test
            try {
                const decimals = await contract?.decimals?.();
                addLog(contractName, "success", `decimals() = ${decimals}`);
            } catch (err: any) {
                addLog(
                    contractName,
                    "error",
                    `decimals() call failed: ${err.message}`,
                    "Contract may not match the ABI"
                );
            }
        } catch (error: any) {
            addLog(
                contractName,
                "error",
                `Code check failed: ${error.message}`,
                error.toString()
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold mb-6">Contract Debug & Test Page</h1>

                {/* Wallet Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h2 className="text-xl font-semibold mb-3">Wallet Status</h2>
                        <div className="space-y-2 text-sm">
                            <div>
                                <span className="text-gray-400">Connected:</span>
                                <span className={`ml-2 font-mono ${wallet.isConnected ? "text-green-400" : "text-red-400"}`}>
                                    {wallet.isConnected ? "✓" : "✗"} {wallet.isConnected ? "Yes" : "No"}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">Address:</span>
                                <span className="ml-2 font-mono text-xs break-all">{wallet.address || "N/A"}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Contracts Ready:</span>
                                <span className={`ml-2 font-mono ${isContractsReady ? "text-green-400" : "text-red-400"}`}>
                                    {isContractsReady ? "✓" : "✗"}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">Chain ID:</span>
                                <span className="ml-2 font-mono">{wallet.chainId || "N/A"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Balances */}
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-xl font-semibold">Balances</h2>
                            <button
                                onClick={fetchAllBalances}
                                disabled={loading || !wallet.isConnected}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm"
                            >
                                Refresh
                            </button>
                        </div>
                        <div className="space-y-2 text-sm">
                            {Object.entries(balances).map(([token, balance]) => (
                                <div key={token} className="flex justify-between items-center">
                                    <span className="text-gray-400">{token}:</span>
                                    <span className="font-mono font-semibold text-green-400">
                                        {balance || "0"}
                                    </span>
                                </div>
                            ))}
                            {Object.keys(balances).length === 0 && (
                                <p className="text-gray-500 text-xs italic">Click Refresh to load balances</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Test Controls */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Contract Interactions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <button
                            onClick={() => testFaucetClaim("USDC")}
                            disabled={loading || !wallet.isConnected}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Claim USDC
                        </button>
                        <button
                            onClick={() => testFaucetClaim("MXNB")}
                            disabled={loading || !wallet.isConnected}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Claim MXNB
                        </button>
                        <button
                            onClick={() => testTokenTransfer("USDC")}
                            disabled={loading || !wallet.isConnected}
                            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Test USDC Transfer
                        </button>
                        <button
                            onClick={() => testTokenTransfer("MXNB")}
                            disabled={loading || !wallet.isConnected}
                            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Test MXNB Transfer
                        </button>
                        <button
                            onClick={testVaultDeposit}
                            disabled={loading || !wallet.isConnected}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Test Vault Deposit
                        </button>
                        
                        <button
                            onClick={() => testContractRead("USDC", "decimals")}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Test USDC.decimals()
                        </button>
                        <button
                            onClick={() => testContractRead("MXNB", "decimals")}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Test MXNB.decimals()
                        </button>
                        <button
                            onClick={() => checkContractCode("USDC")}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Check USDC Code
                        </button>
                        <button
                            onClick={() => checkContractCode("MXNB")}
                            disabled={loading || !isContractsReady}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Check MXNB Code
                        </button>
                        <button
                            onClick={() => checkContractCode("Faucet")}
                            disabled={loading || !isContractsReady}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded font-medium text-sm"
                        >
                            Check Faucet Code
                        </button>
                        <button
                            onClick={() => setLogs([])}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium text-sm"
                        >
                            Clear Logs
                        </button>
                    </div>
                </div>

                {/* Logs */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h2 className="text-xl font-semibold mb-4">Interaction Logs</h2>
                    <div className="bg-gray-900 rounded border border-gray-700 p-4 h-96 overflow-y-auto font-mono text-xs">
                        {logs.length === 0 ? (
                            <p className="text-gray-500 italic">No logs yet. Start testing...</p>
                        ) : (
                            <div className="space-y-2">
                                {logs.map((log, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex gap-3">
                                            <span className="text-gray-500">[{log.timestamp}]</span>
                                            <span className="font-bold text-gray-400">{log.action}</span>
                                            <span
                                                className={`font-bold ${log.status === "success"
                                                        ? "text-green-400"
                                                        : log.status === "error"
                                                            ? "text-red-400"
                                                            : log.status === "pending"
                                                                ? "text-yellow-400"
                                                                : "text-blue-400"
                                                    }`}
                                            >
                                                [{log.status.toUpperCase()}]
                                            </span>
                                            <span className="text-gray-300">{log.message}</span>
                                        </div>
                                        {log.details && (
                                            <div className="ml-6 text-gray-500 break-all">
                                                {log.details}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Contract Addresses */}
                <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <h3 className="font-semibold mb-3">Contract Addresses</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                            <span className="text-gray-400">USDC:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.usdc?.target || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">MXNB:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.mxnb?.target || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">aUSDC:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.ausdc?.target || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">VaultV2:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.vaultV2?.target || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Faucet:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.faucet?.target || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400">Morpho:</span>
                            <span className="ml-2 font-mono text-blue-400 break-all">
                                {contracts?.morpho?.target || "N/A"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
