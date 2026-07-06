"use client";

import type { ConditionInput } from "@/app/lib/orderData";

export function ConditionsBuilder({
  conditions,
  poolDefault,
  onChange,
}: {
  conditions: ConditionInput[];
  poolDefault: string;
  onChange: (next: ConditionInput[]) => void;
}) {
  const add = (tag: "RateThreshold" | "TimeBound") => {
    if (tag === "RateThreshold") {
      onChange([...conditions, { tag, pool: poolDefault, minApyBps: 450 }]);
    } else {
      onChange([
        ...conditions,
        { tag, maxStellarLedgerTs: Math.floor(Date.now() / 1000) + 3600 },
      ]);
    }
  };
  const remove = (i: number) => onChange(conditions.filter((_, j) => i !== j));
  const patch = (i: number, p: Partial<ConditionInput>) => {
    const next = conditions.slice();
    next[i] = { ...(next[i] as ConditionInput), ...p } as ConditionInput;
    onChange(next);
  };

  return (
    <div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">Conditions (AND-joined)</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => add("RateThreshold")}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            + Rate
          </button>
          <button
            type="button"
            onClick={() => add("TimeBound")}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            + Time
          </button>
        </div>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No conditions — action fires unconditionally on arrival.
        </p>
      ) : null}

      <ul className="grid gap-3">
        {conditions.map((c, i) => (
          <li
            key={i}
            className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                {c.tag}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                remove
              </button>
            </div>
            {c.tag === "RateThreshold" ? (
              <>
                <label className="text-xs text-neutral-500">Pool (C-address)</label>
                <input
                  type="text"
                  value={c.pool}
                  onChange={(e) => patch(i, { pool: e.target.value })}
                  className="w-full break-all rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
                />
                <label className="text-xs text-neutral-500">Min APY (bps)</label>
                <input
                  type="number"
                  min="0"
                  value={c.minApyBps}
                  onChange={(e) => patch(i, { minApyBps: Number(e.target.value) })}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
                />
              </>
            ) : (
              <>
                <label className="text-xs text-neutral-500">
                  Max Stellar ledger timestamp (unix seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  value={c.maxStellarLedgerTs}
                  onChange={(e) =>
                    patch(i, { maxStellarLedgerTs: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
                />
                <p className="text-xs text-neutral-500">
                  now = {Math.floor(Date.now() / 1000)} — set to 0 to force fail.
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
