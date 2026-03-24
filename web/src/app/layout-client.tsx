"use client";

import { ReactNode } from "react";
import { WalletProvider, useWallet } from "@/hooks/useWallet";
import { WalletConnect } from "@/components/WalletConnect";

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
          <WalletConnect />
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

export function LayoutClient({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <RootLayoutContent>{children}</RootLayoutContent>
    </WalletProvider>
  );
}
