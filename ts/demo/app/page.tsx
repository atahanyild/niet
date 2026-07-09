"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo, useState } from "react";

import { ConditionsBuilder } from "./components/ConditionsBuilder";
import { DemoButtons } from "./components/DemoButtons";
import { FallbackSelector } from "./components/FallbackSelector";
import { FlowRunner } from "./components/FlowRunner";
import { IntentComposer } from "./components/IntentComposer";
import { NIET } from "./config/niet";
import { buildDemoIntent, type Demo } from "./lib/intents";
import type { NietOrderInput } from "./lib/orderData";

export default function Home() {
  const [demo, setDemo] = useState<Demo>("hold");
  const [input, setInput] = useState<NietOrderInput>(() => buildDemoIntent("hold"));

  const chooseDemo = (which: Demo) => {
    setDemo(which);
    setInput(buildDemoIntent(which));
  };

  const summary = useMemo(() => {
    const amount = (Number(input.amountMicroUsdc) / 1_000_000).toFixed(6);
    return `${amount} USDC · conditions ${input.conditions.length} · fallback ${input.fallback.tag}`;
  }, [input]);

  return (
    <main className="mx-auto grid max-w-4xl gap-8 px-6 py-12 text-neutral-100">
      <header className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Niet</h1>
            <p className="text-sm text-neutral-400">
              Conditional settlement layer for cross-chain intents on Stellar.
            </p>
          </div>
          <ConnectButton />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500 sm:grid-cols-3">
          <a
            href={`https://sepolia.basescan.org/address/${NIET.ORIGIN_SETTLER}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2 py-1 hover:text-blue-300"
          >
            Base OriginSettler
          </a>
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${NIET.NIET_SETTLER_STELLAR}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2 py-1 hover:text-blue-300"
          >
            Stellar NietSettler
          </a>
          <a
            href="https://github.com/atahanyild/niet"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2 py-1 hover:text-blue-300"
          >
            github.com/atahanyild/niet
          </a>
        </div>
      </header>

      <section className="grid gap-3">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">Demos</h2>
        <DemoButtons active={demo} onChoose={chooseDemo} />
        <p className="text-xs text-neutral-500">Current intent: {summary}</p>
      </section>

      <section className="grid gap-4">
        <IntentComposer input={input} onChange={(p) => setInput({ ...input, ...p })} />
        <ConditionsBuilder
          conditions={input.conditions}
          poolDefault={input.pool}
          onChange={(c) => setInput({ ...input, conditions: c })}
        />
        <FallbackSelector
          value={input.fallback}
          onChange={(f) => setInput({ ...input, fallback: f })}
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">Progress</h2>
        <FlowRunner input={input} />
      </section>

      <footer className="grid gap-1 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        <p>Testnet only. Base Sepolia → Stellar testnet via Circle CCTP V2.</p>
        <p>
          Hold + Refund paths verified end-to-end on live testnet. See
          docs/testnet-verification.md.
        </p>
      </footer>
    </main>
  );
}
