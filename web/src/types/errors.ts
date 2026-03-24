/**
 * Custom error types for Ethers.js integration
 */

export interface EthersError extends Error {
  code?: string | number;
  reason?: string;
  method?: string;
  transaction?: {
    to?: string;
    from?: string;
    data?: string;
  };
}

export interface ContractCallError {
  message: string;
  code?: string;
  originalError?: EthersError;
}

/**
 * Parse Ethers.js errors into user-friendly messages
 */
export function parseEthersError(error: unknown): ContractCallError {
  if (!error) {
    return {
      message: "An unknown error occurred",
    };
  }

  const err = error as EthersError;

  // Handle specific error codes
  switch (err.code) {
    case "CALL_EXCEPTION":
      return {
        message: "Transaction reverted. Check your inputs and balances.",
        code: "CALL_EXCEPTION",
        originalError: err,
      };
    case "INSUFFICIENT_FUNDS":
      return {
        message: "Insufficient funds to complete this transaction",
        code: "INSUFFICIENT_FUNDS",
        originalError: err,
      };
    case "NETWORK_ERROR":
      return {
        message: "Network error. Please check your connection.",
        code: "NETWORK_ERROR",
        originalError: err,
      };
    case "TIMEOUT":
      return {
        message: "Transaction timed out. Please try again.",
        code: "TIMEOUT",
        originalError: err,
      };
    case "ACTION_REJECTED":
      return {
        message: "Transaction rejected by user",
        code: "ACTION_REJECTED",
        originalError: err,
      };
    default:
      return {
        message: err.message || "Transaction failed. Please try again.",
        code: err.code?.toString(),
        originalError: err,
      };
  }
}

/**
 * Retry a failed async operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on user rejection
      if ((error as EthersError).code === "ACTION_REJECTED") {
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying with exponential backoff
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
