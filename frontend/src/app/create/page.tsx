"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/providers/wallet-provider";
import { useCreateCampaign } from "@/hooks/use-campaigns";
import {
  createCampaignSchema,
  type CreateCampaignInput,
} from "@/lib/validation";
import { xlmToStroops } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { explorerTxUrl } from "@/lib/config";

const DURATIONS = [7, 14, 30, 60, 90];

export default function CreateCampaignPage() {
  const router = useRouter();
  const { address, connect, isConnecting } = useWallet();
  const create = useCreateCampaign();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: { durationDays: 30 },
  });

  const duration = watch("durationDays");

  async function onSubmit(values: CreateCampaignInput) {
    if (!address) {
      try {
        await connect();
      } catch {
        /* toast handled in connect button flow */
      }
      return;
    }
    try {
      const hash = await create.mutateAsync({
        creator: address,
        title: values.title,
        description: values.description,
        goalStroops: xlmToStroops(values.goal),
        durationSecs: Math.round(values.durationDays * 86_400),
      });
      toast({
        variant: "success",
        title: "Campaign launched",
        description: "Your campaign is now live on-chain.",
      });
      window.open(explorerTxUrl(hash), "_blank", "noopener");
      router.push("/");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create campaign",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Rocket className="h-5 w-5 text-primary" />
            Launch a campaign
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="A clear, compelling title" {...register("title")} />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="What are you raising funds for, and why?"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Funding goal (XLM)</Label>
              <Input
                id="goal"
                inputMode="decimal"
                placeholder="1000"
                {...register("goal")}
              />
              {errors.goal && (
                <p className="text-sm text-destructive">{errors.goal.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={duration === d ? "default" : "outline"}
                    onClick={() =>
                      setValue("durationDays", d, { shouldValidate: true })
                    }
                  >
                    {d} days
                  </Button>
                ))}
              </div>
              {errors.durationDays && (
                <p className="text-sm text-destructive">
                  {errors.durationDays.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full gap-2"
              disabled={create.isPending || isConnecting}
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {address ? "Launch campaign" : "Connect wallet to continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
