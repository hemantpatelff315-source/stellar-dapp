import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";
import { Navbar } from "@/components/navbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "StellarFund — Decentralized Crowdfunding on Stellar",
  description:
    "Launch and back crowdfunding campaigns on the Stellar network. Trustless custody, automatic refunds, and on-chain transparency powered by Soroban.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
              StellarFund · Built on Stellar &amp; Soroban
            </footer>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
