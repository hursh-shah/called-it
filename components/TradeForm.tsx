"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { lmsrPriceYes, lmsrTradeCost, type Side } from "../lib/lmsr";
import { formatCredits } from "../lib/money";

type Props = {
  marketId: string;
  b: number;
  qYes: number;
  qNo: number;
  tradingClosed: boolean;
  tradingDisabledReason?: string | null;
  userBalanceCents: number;
  userSharesYes: number;
  userSharesNo: number;
};

type Kind = "BUY" | "SELL";
type AmountType = "CREDITS" | "SHARES";

export default function TradeForm(props: Props) {
  const router = useRouter();
  const [side, setSide] = useState<Side>("YES");
  const [kind, setKind] = useState<Kind>("BUY");
  const [amountType, setAmountType] = useState<AmountType>("CREDITS");
  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedAmount = Number(amount);
  const amountNumber = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  const preview = useMemo(() => {
    const b = props.b;
    const qYes = props.qYes;
    const qNo = props.qNo;
    const priceYes = lmsrPriceYes(b, qYes, qNo);

    if (props.tradingDisabledReason) {
      return { priceYes, detail: props.tradingDisabledReason };
    }
    if (props.tradingClosed) return { priceYes, detail: "Trading is closed." };
    if (amountNumber <= 0) return { priceYes, detail: "Enter an amount." };

    if (kind === "SELL" && amountType !== "SHARES") {
      return { priceYes, detail: "Sell uses shares for now." };
    }

    let deltaShares: number;
    if (amountType === "SHARES") {
      deltaShares = kind === "BUY" ? amountNumber : -amountNumber;
    } else {
      return { priceYes, detail: "Share estimate shown after submit." };
    }

    const costCredits = lmsrTradeCost(b, qYes, qNo, side, deltaShares);
    const nextPriceYes =
      side === "YES"
        ? lmsrPriceYes(b, qYes + deltaShares, qNo)
        : lmsrPriceYes(b, qYes, qNo + deltaShares);

    return {
      priceYes,
      nextPriceYes,
      costCredits,
      detail: `${
        costCredits >= 0 ? "Cost" : "Receive"
      }: ${Math.abs(costCredits).toFixed(2)} credits`
    };
  }, [props, side, kind, amountType, amountNumber]);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/markets/${props.marketId}/trade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side,
          kind,
          amountType,
          amount: amountNumber
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Trade failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const maxSellShares = side === "YES" ? props.userSharesYes : props.userSharesNo;
  const tradingDisabled = props.tradingClosed || Boolean(props.tradingDisabledReason);
  const disabled =
    tradingDisabled ||
    isSubmitting ||
    amountNumber <= 0 ||
    (kind === "SELL" && amountType !== "SHARES");

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-sm font-medium">Trade</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Side</span>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as Side)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            disabled={tradingDisabled}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Action</span>
          <select
            value={kind}
            onChange={(e) => {
              const nextKind = e.target.value as Kind;
              setKind(nextKind);
              if (nextKind === "SELL") setAmountType("SHARES");
            }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            disabled={tradingDisabled}
          >
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Amount type</span>
          <select
            value={amountType}
            onChange={(e) => setAmountType(e.target.value as AmountType)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            disabled={tradingDisabled || kind === "SELL"}
          >
            <option value="CREDITS">Credits (buy)</option>
            <option value="SHARES">Shares</option>
          </select>
          {kind === "SELL" ? (
            <p className="text-xs text-zinc-500">Sell uses shares.</p>
          ) : null}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">
            {amountType === "SHARES" ? "Shares" : "Credits"}{" "}
            {kind === "SELL" ? `(max ${maxSellShares.toFixed(4)})` : null}
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            inputMode="decimal"
            disabled={tradingDisabled}
          />
        </label>
      </div>

      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-zinc-400">Now</span>
          <span>YES {Math.round(preview.priceYes * 100)}%</span>
        </div>
        {typeof preview.nextPriceYes === "number" ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-zinc-400">After</span>
            <span>YES {Math.round(preview.nextPriceYes * 100)}%</span>
          </div>
        ) : null}
        <div className="mt-1 text-xs text-zinc-400">{preview.detail}</div>
      </div>

      <div className="mt-3 text-sm text-zinc-300">
        Balance: {formatCredits(props.userBalanceCents)}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
      >
        {tradingDisabled
          ? props.tradingDisabledReason
            ? "Trading disabled"
            : "Trading closed"
          : isSubmitting
            ? "Submitting…"
            : "Submit trade"}
      </button>
    </div>
  );
}
