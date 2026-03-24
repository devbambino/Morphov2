import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy RPC calls to the local Anvil instance
 * This allows the browser to communicate with localhost:8545
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward the RPC request to localhost Anvil
    const response = await fetch("http://localhost:8545", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[RPC Proxy] Error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
        id: null,
      },
      { status: 500 }
    );
  }
}
