"use client";

import type { Demo } from "@/app/lib/intents";

interface Item {
  which: Demo;
  title: string;
  sub: string;
  disabled?: boolean;
  disabledNote?: string;
}

export function DemoButtons({
  active,
  onChoose,
}: {
  active: Demo;
  onChoose: (which: Demo) => void;
}) {
  const items: Item[] = [
    {
      which: "hold",
      title: "Hold on failure",
      sub: "Condition fails → keep USDC on Stellar",
    },
    {
      which: "refund",
      title: "Refund on failure",
      sub: "Condition fails → refund to source",
    },
    {
      which: "happy",
      title: "Happy path (Blend)",
      sub: "Condition passes → Blend supply fires",
      disabled: true,
      disabledNote:
        "Testnet only: Blend testnet pool doesn't accept Circle USDC. Works on mainnet (Phase 2).",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <button
          type="button"
          key={it.which}
          onClick={() => !it.disabled && onChoose(it.which)}
          disabled={it.disabled}
          title={it.disabledNote}
          className={`grid gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
            it.disabled
              ? "border-neutral-900 bg-neutral-950/20 opacity-50 cursor-not-allowed"
              : active === it.which
              ? "border-blue-700 bg-blue-950/40"
              : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900"
          }`}
        >
          <div className="text-sm font-semibold text-neutral-100">{it.title}</div>
          <div className="text-xs text-neutral-500">{it.sub}</div>
          {it.disabledNote ? (
            <div className="mt-1 text-[10px] uppercase tracking-wider text-amber-500">
              testnet pool unavailable
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}
