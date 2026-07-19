"use client";

import { Wallet, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/wallet-provider";
import { truncateAddress } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function ConnectButton() {
  const { address, isConnecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={disconnect}
        className="gap-2"
        title="Disconnect wallet"
      >
        <span className="font-mono">{truncateAddress(address)}</span>
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isConnecting}
      onClick={async () => {
        try {
          await connect();
        } catch (e) {
          toast({
            variant: "destructive",
            title: "Connection failed",
            description: e instanceof Error ? e.message : String(e),
          });
        }
      }}
      className="gap-2"
    >
      <Wallet className="h-4 w-4" />
      {isConnecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
