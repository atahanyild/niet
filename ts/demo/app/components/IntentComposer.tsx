"use client";

import { useMemo } from "react";
import type { NietOrderInput } from "@/app/lib/orderData";
import { NIET } from "@/app/config/niet";

export function IntentComposer({
  input,
  onChange,
}: {
  input: NietOrderInput;
  onChange: (patch: Partial<NietOrderInput>) => void;
}) {
  const amountDisplay = useMemo(() => {
    const n = Number(input.amountMicroUsdc) / 1_000_000;
    return isFinite(n) ? n.toFixed(6) : "-";
  }, [input.amountMicroUsdc]);

  return (
    <div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">
          Amount (USDC)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.000001"
            min="0"
            value={amountDisplay}
            onChange={(e) =>
              onChange({
                amountMicroUsdc: String(Math.round(Number(e.target.value) * 1_000_000)),
              })
            }
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 focus:border-blue-600 focus:outline-none"
          />
          <span className="text-xs text-neutral-500">{input.amountMicroUsdc} µ</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">
          Max Fee (µUSDC)
        </label>
        <input
          type="number"
          min="0"
          value={input.maxFeeMicroUsdc}
          onChange={(e) => onChange({ maxFeeMicroUsdc: e.target.value })}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 focus:border-blue-600 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">
          Stellar receiver (C-address for Hold fallback)
        </label>
        <input
          type="text"
          value={input.userStellarAddr}
          onChange={(e) => onChange({ userStellarAddr: e.target.value })}
          className="w-full break-all rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100 focus:border-blue-600 focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Default: day-0 test contract ({NIET.DAY_0_HOLD_TARGET.slice(0, 8)}…). Swap for
          your own C-address if you want to receive the Hold-fallback USDC.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">
          Blend pool (destination action target)
        </label>
        <input
          type="text"
          value={input.pool}
          onChange={(e) => onChange({ pool: e.target.value })}
          className="w-full break-all rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100 focus:border-blue-600 focus:outline-none"
        />
      </div>
    </div>
  );
}
