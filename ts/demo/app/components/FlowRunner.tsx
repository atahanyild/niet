"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";

import { ORIGIN_SETTLER_ABI, USDC_ABI } from "@/app/lib/abi";
import { CHAIN, NIET } from "@/app/config/niet";
import {
  ORDER_DATA_TYPE,
  computeIntentHashPacked,
  encodeOrderData,
} from "@/app/lib/orderData";
import type { NietOrderInput } from "@/app/lib/orderData";
import { fetchStatus } from "@/app/lib/status";
import { ProgressStages, type Stage } from "./ProgressStages";

const EMPTY_STAGES: Stage[] = [
  { key: "sign", label: "Signed on Base", state: "idle" },
  { key: "burn", label: "Burned on Base (CCTP)", state: "idle" },
  { key: "iris", label: "Attested by Circle Iris", state: "idle" },
  { key: "mint", label: "Minted on Stellar", state: "idle" },
  { key: "final", label: "Settled / Refunded / Held", state: "idle" },
];

export function FlowRunner({ input }: { input: NietOrderInput }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });

  const [stages, setStages] = useState<Stage[]>(EMPTY_STAGES);
  const [intentHash, setIntentHash] = useState<string | undefined>();
  const [burnTx, setBurnTx] = useState<string | undefined>();
  const [finalState, setFinalState] = useState<"settled" | "refunded" | "held" | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);

  const setStage = useCallback((key: string, patch: Partial<Stage>) => {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const reset = () => {
    setStages(EMPTY_STAGES);
    setIntentHash(undefined);
    setBurnTx(undefined);
    setFinalState(undefined);
    setError(undefined);
  };

  const submit = useCallback(async () => {
    if (!address || !walletClient || !publicClient) {
      setError("Connect a Base Sepolia wallet first.");
      return;
    }
    reset();
    setRunning(true);
    try {
      const orderData = encodeOrderData(input);
      const iHash = computeIntentHashPacked(
        CHAIN.BASE_SEPOLIA_ID,
        NIET.ORIGIN_SETTLER,
        address,
        0n,
        orderData,
      );
      setIntentHash(iHash);
      setStage("sign", { state: "active", detail: `intent_hash ${iHash.slice(0, 10)}…` });

      // Approve USDC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wc = walletClient as any;
      const approveHash = await wc.writeContract({
        address: NIET.USDC_BASE_SEPOLIA,
        abi: USDC_ABI,
        functionName: "approve",
        args: [NIET.ORIGIN_SETTLER, BigInt(input.amountMicroUsdc)],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      setStage("sign", { state: "done", detail: "USDC approved to OriginSettler" });
      setStage("burn", { state: "active" });

      // Open
      const openHash = await wc.writeContract({
        address: NIET.ORIGIN_SETTLER,
        abi: ORIGIN_SETTLER_ABI,
        functionName: "open",
        args: [
          {
            fillDeadline: Math.floor(Date.now() / 1000) + 3600,
            orderDataType: ORDER_DATA_TYPE,
            orderData,
          },
        ],
      });
      setBurnTx(openHash);
      await publicClient.waitForTransactionReceipt({ hash: openHash });
      setStage("burn", { state: "done", txHash: openHash, explorer: "basescan" });
      setStage("iris", { state: "active", detail: "Polling Iris sandbox…" });
      setStage("mint", { state: "idle", detail: "Waits for attestation" });
      setStage("final", { state: "idle" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }, [address, publicClient, walletClient, input, setStage]);

  // Poll status once we have an intent hash + burn tx
  useEffect(() => {
    if (!intentHash || !burnTx) return;
    let cancelled = false;
    const tick = async () => {
      const s = await fetchStatus(intentHash);
      if (cancelled) return;
      if (s.state === "settled" || s.state === "refunded" || s.state === "held") {
        setFinalState(s.state);
        setStage("iris", { state: "done", detail: "Attestation completed" });
        setStage("mint", {
          state: "done",
          detail: "USDC minted to NietSettler",
        });
        setStage("final", {
          state: "done",
          detail: labelFor(s.state),
          txHash: s.stellarTxHash,
          explorer: "stellar",
        });
        setRunning(false);
      } else if (s.detail && s.detail.includes("API")) {
        setStage("iris", {
          state: "active",
          detail:
            "Status API unavailable — attestation likely in-flight (poll manually).",
        });
      }
    };
    tick();
    const id = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intentHash, burnTx, setStage]);

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={running || !isConnected}
          onClick={submit}
          className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white disabled:bg-neutral-800 disabled:text-neutral-600"
        >
          {running ? "In flight…" : "Sign & open intent"}
        </button>
        {error ? (
          <span className="break-all text-xs text-red-400">{error}</span>
        ) : null}
      </div>
      <ProgressStages stages={stages} finalState={finalState} />
    </div>
  );
}

function labelFor(state: "settled" | "refunded" | "held"): string {
  return state === "settled"
    ? "Composed action fired (Blend supply)"
    : state === "held"
    ? "Held at Stellar receiver"
    : "Refunded to source";
}
