"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Heart, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/providers/wallet-provider";
import { useDonate } from "@/hooks/use-campaigns";
import { donateSchema, type DonateInput } from "@/lib/validation";
import { xlmToStroops } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { explorerTxUrl } from "@/lib/config";

export function DonateDialog({
  campaignId,
  title,
}: {
  campaignId: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const { address, connect } = useWallet();
  const donate = useDonate(campaignId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DonateInput>({ resolver: zodResolver(donateSchema) });

  async function onSubmit(values: DonateInput) {
    if (!address) {
      try {
        await connect();
      } catch {
        return;
      }
      return;
    }
    try {
      const hash = await donate.mutateAsync({
        donor: address,
        amountStroops: xlmToStroops(values.amount),
      });
      toast({
        variant: "success",
        title: "Donation confirmed",
        description: `Thank you for backing “${title}”.`,
      });
      window.open(explorerTxUrl(hash), "_blank", "noopener");
      reset();
      setOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Donation failed",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Heart className="h-4 w-4" />
          Back this project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Back “{title}”</DialogTitle>
          <DialogDescription>
            Funds are held in the on-chain treasury and released to the creator
            only if the goal is met — otherwise you can claim a full refund.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (XLM)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="10.0"
              autoFocus
              {...register("amount")}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full gap-2"
            disabled={donate.isPending}
          >
            {donate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {address ? "Confirm donation" : "Connect wallet to donate"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
