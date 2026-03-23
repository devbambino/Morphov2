"use client";

import { ReactNode } from "react";
import { WalletProvider, useWallet } from "@/hooks/useWallet";
import "./globals.css";

function Header() {
  const { wallet } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gray-900">RapiLoans</h1>
            <nav className="flex gap-6">
              <a href="/borrow" className="text-gray-600 hover:text-gray-900 font-medium">
                Borrow
              </a>
              <a href="/lend" className="text-gray-600 hover:text-gray-900 font-medium">
                Lend
              </a>
            </nav>
          </div>
          {wallet.isConnected ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {formatAddress(wallet.address!)}
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                Connected
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">Connect wallet to start</span>
          )}
        </div>
      </div>
    </header>
  );
}

function RootLayoutContent({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>RapiLoans - MXNB Vault</title>
        <meta name="description" content="Borrow and Lend with RapiLoans MXNB Vault" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-gray-50">
        <WalletProvider>
          <RootLayoutContent>{children}</RootLayoutContent>
        </WalletProvider>
      </body>
    </html>
  );
}
