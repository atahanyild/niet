"use client";

import { StatusPill } from "./StatusPill";
import { CHAIN, NIET } from "@/app/config/niet";

export type StageState = "idle" | "active" | "done";

export interface Stage {
  key: string;
  label: string;
  state: StageState;
  detail?: string;
  txHash?: string;
  explorer?: "basescan" | "stellar";
}

export function ProgressStages({
  stages,
  finalState,
}: {
  stages: Stage[];
  finalState?: "settled" | "refunded" | "held";
}) {
  return (
    <ol className="grid gap-4">
      {stages.map((s, i) => (
        <li
          key={s.key}
          className={`flex items-start gap-4 rounded-2xl border p-4 transition-colors ${
            s.state === "done"
              ? "border-emerald-800/50 bg-emerald-950/20"
              : s.state === "active"
              ? "border-blue-800/50 bg-blue-950/20"
              : "border-neutral-800 bg-neutral-950/40"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
              s.state === "done"
                ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                : s.state === "active"
                ? "border-blue-600 bg-blue-900/40 text-blue-300"
                : "border-neutral-700 bg-neutral-900 text-neutral-500"
            }`}
          >
            {s.state === "done" ? "✓" : i + 1}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-neutral-100">{s.label}</div>
              {i === stages.length - 1 && finalState ? (
                <StatusPill
                  label={finalState}
                  tone={finalState === "settled" ? "success" : finalState === "held" ? "warn" : "error"}
                />
              ) : null}
            </div>
            {s.detail ? (
              <p className="mt-1 text-sm text-neutral-400">{s.detail}</p>
            ) : null}
            {s.txHash ? (
              <a
                href={
                  s.explorer === "stellar"
                    ? `${CHAIN.STELLAR_EXPERT_URL}/tx/${s.txHash}`
                    : `${CHAIN.BASESCAN_URL}/tx/${s.txHash}`
                }
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block break-all text-xs text-blue-400 hover:underline"
              >
                {s.txHash}
              </a>
            ) : null}
          </div>
        </li>
      ))}
      <li className="text-xs text-neutral-500">
        NietSettler: {NIET.NIET_SETTLER_STELLAR}
      </li>
    </ol>
  );
}
