"use client";

import { useEffect, useState } from "react";
import { config, addresses } from "@/lib/config";

interface ConfigValidation {
  isValid: boolean;
  missingAddresses: string[];
  warnings: string[];
}

/**
 * Validate that all required contract addresses are configured
 * Returns validation status and logs warnings for missing addresses
 */
export function useContractConfig(): ConfigValidation {
  const [validation, setValidation] = useState<ConfigValidation>({
    isValid: true,
    missingAddresses: [],
    warnings: [],
  });

  useEffect(() => {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check each required address
    const requiredAddresses = [
      { key: "usdc", label: "USDC Token" },
      { key: "ausdc", label: "aUSDC Token" },
      { key: "aavePool", label: "Aave Pool" },
      { key: "morpho", label: "Morpho Protocol" },
      { key: "mxnb", label: "MXNB Token" },
      { key: "vaultV2", label: "VaultV2" },
      { key: "oracle", label: "Price Oracle" },
      { key: "faucet", label: "Faucet" },
    ];

    requiredAddresses.forEach(({ key, label }) => {
      const address = addresses[key as keyof typeof addresses];
      if (!address || address === "") {
        missing.push(label);
        console.warn(`[Config] Missing address for ${label}`);
      }
    });

    // Log summary
    if (missing.length > 0) {
      warnings.push(`${missing.length} contract addresses are not configured`);
      console.warn("[Config] Missing addresses:", missing);
    } else {
      console.log("[Config] ✓ All contract addresses configured");
    }

    setValidation({
      isValid: missing.length === 0,
      missingAddresses: missing,
      warnings,
    });
  }, []);

  return validation;
}
