"use client";

import type { Demo } from "@/app/lib/intents";

export function DemoButtons({
  active,
  onChoose,
}: {
  active: Demo;
  onChoose: (which: Demo) => void;
}) {
  const items: Array<{ which: Demo; title: string; sub: string }> = [
    {
      which: "happy",
      title: "Happy path",
      sub: "Conditions pass → Blend supply fires",
    },
    { which: "refund", title: "Refund on failure", sub: "Condition fails → refund to source" },
    { which: "hold", title: "Hold on failure", sub: "Condition fails → keep USDC on Stellar" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <button
          type="button"
          key={it.which}
          onClick={() => onChoose(it.which)}
          className={`grid gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
            active === it.which
              ? "border-blue-700 bg-blue-950/40"
              : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900"
          }`}
        >
          <div className="text-sm font-semibold text-neutral-100">{it.title}</div>
          <div className="text-xs text-neutral-500">{it.sub}</div>
        </button>
      ))}
    </div>
  );
}
