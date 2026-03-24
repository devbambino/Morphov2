import { ReactNode } from "react";
import { LayoutClient } from "./layout-client";
import "./globals.css";

export const metadata = {
  title: "RapiLoans - MXNB Vault",
  description: "Borrow and Lend with RapiLoans MXNB Vault",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-gray-50">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
