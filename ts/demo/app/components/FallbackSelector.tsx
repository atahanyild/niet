"use client";

import type { FallbackInput } from "@/app/lib/orderData";

export function FallbackSelector({
  value,
  onChange,
}: {
  value: FallbackInput;
  onChange: (v: FallbackInput) => void;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
      <h3 className="text-sm font-semibold text-neutral-200">
        Fallback (fires on condition failure)
      </h3>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({
              tag: "Refund",
              sourceDomain: 6,
              sourceRecipient:
                ("0x000000000000000000000000" +
                  "28fD68Fe39bAB5850362E6357730F1Aaab5AD7fd") as `0x${string}`,
            })
          }
          className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
            value.tag === "Refund"
              ? "border-blue-700 bg-blue-950/40 text-blue-200"
              : "border-neutral-800 bg-neutral-900 text-neutral-400"
          }`}
        >
          Refund to source
        </button>
        <button
          type="button"
          onClick={() => onChange({ tag: "Hold" })}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
            value.tag === "Hold"
              ? "border-blue-700 bg-blue-950/40 text-blue-200"
              : "border-neutral-800 bg-neutral-900 text-neutral-400"
          }`}
        >
          Hold as USDC on Stellar
        </button>
      </div>
      {value.tag === "Refund" ? (
        <div className="grid gap-2">
          <label className="text-xs text-neutral-500">Source CCTP domain</label>
          <input
            type="number"
            value={value.sourceDomain}
            onChange={(e) =>
              onChange({ ...value, sourceDomain: Number(e.target.value) })
            }
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
          />
          <label className="text-xs text-neutral-500">Source recipient (bytes32)</label>
          <input
            type="text"
            value={value.sourceRecipient}
            onChange={(e) =>
              onChange({ ...value, sourceRecipient: e.target.value as `0x${string}` })
            }
            className="w-full break-all rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
          />
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          On failure, USDC transfers to the Stellar receiver you set above.
        </p>
      )}
    </div>
  );
}
