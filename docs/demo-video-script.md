# Niet demo video script

**Target duration:** 3:30 (comfortable trim to 3:00 if needed)
**Recording tool:** QuickTime → File → New Screen Recording, mic on
**Voice:** conversational, not scripted-sounding. Cadence around 150 words/min. The narration below is a *guide*, not a teleprompter — read the intent, say it your way.

---

## Pre-flight checklist

Before hitting record:

1. **Open all tabs in order** (Cmd-1 for the first tab, etc.):
   1. [demo-b59axz4dn-atahanyilds-projects.vercel.app](https://demo-b59axz4dn-atahanyilds-projects.vercel.app) — the demo
   2. [github.com/atahanyild/niet](https://github.com/atahanyild/niet) — the repo
   3. Terminal window with `docs/demo-video-script.md` open and the script visible for reference
   4. [Basescan tx 0xbfb67fd3...](https://sepolia.basescan.org/tx/0xbfb67fd3d93c0b8d3f836cc9ca1c8feb81044a9a3739e4e7741369de296a7342) — known Hold burn (backup)
   5. [Stellar Expert tx d8d7e64b...](https://stellar.expert/explorer/testnet/tx/d8d7e64b0db63ba360eb5d94afa20beb49791c9157fdffdd62114437101aa44c) — known Hold settle (backup)
2. **MetaMask** unlocked, showing your Base Sepolia account with ≥ 2 USDC.
3. **Base Sepolia RPC** confirmed working (approve + open runs cleanly locally first).
4. **Close** Slack, Discord, Mail, calendar — anything with notifications.
5. **Zoom level** on the demo tab: Cmd-0 (100%). Then Cmd-+ once or twice to make text readable in the recording.
6. Do **one dry run** end-to-end before recording. Note where the "In flight" state lands so you know when to switch tabs during the real take.

If anything looks off, restart the take — do NOT try to edit.

---

## Timing skeleton

| Segment | Duration | Cumulative |
|---|---|---|
| A. Positioning | 0:00 – 0:25 | 0:25 |
| B. What Niet is (three legs) | 0:25 – 0:55 | 0:55 |
| C. Live demo — Hold path | 0:55 – 2:35 | 2:35 |
| D. Architecture + agent install | 2:35 – 3:10 | 3:10 |
| E. Outro | 3:10 – 3:30 | 3:30 |

---

## A. Positioning (0:00 – 0:25)

**On screen:** demo landing page. Camera stays on the header.

**Say (approximately):**
> "This is Niet. It's a conditional settlement layer for cross-chain intents on Stellar. A user or an AI agent signs one intent on Base; USDC arrives on Stellar; conditions get evaluated at settlement time; and either the composed action fires — like a Blend supply — or a pre-declared fallback runs: refund to the source chain, or hold the USDC on Stellar. All in one atomic transaction."

**Cut cue:** finish the sentence, pause half a beat, then move on. Don't linger.

---

## B. What Niet is — three legs (0:25 – 0:55)

**On screen:** scroll slowly down the demo page so viewers see the IntentComposer + ConditionsBuilder + FallbackSelector, then back to top.

**Say:**
> "Three legs. One: atomic destination composition — USDC arrives at a Soroban contract and gets deposited straight into Blend, in a single Stellar transaction. Two: a conditions DSL — the intent execution is gated by conditions the user picks, evaluated at settlement time, on-chain. Three: an ERC-7683-flavored intent format, published as a Stellar SEP-draft candidate, so any EVM solver can eventually fulfill into Stellar."

**Cut cue:** as soon as you land on the last word, click the **Hold on failure** button in the demo. That transition kicks you into the demo section naturally.

---

## C. Live demo — Hold path (0:55 – 2:35)

**Sub-timing:**

| Beat | Approx timestamp | What happens |
|---|---|---|
| C1 — pick demo | 0:55 – 1:05 | Click "Hold on failure" button; briefly explain what will happen |
| C2 — connect wallet | 1:05 – 1:20 | RainbowKit → MetaMask connect |
| C3 — sign & open | 1:20 – 1:45 | Click Sign & open; MetaMask approve, then MetaMask open |
| C4 — progress stages | 1:45 – 2:25 | Watch approve → burn → iris → mint → held resolve in real time |
| C5 — verify on explorers | 2:25 – 2:35 | Click through Basescan + Stellar Expert links |

### C1 (10s): pick the demo

**On screen:** the three demo buttons row.

**Say (while clicking "Hold on failure"):**
> "I'll run the Hold-on-failure path. This intent says: try to supply to Blend — but only if the ledger timestamp is before this deadline. The deadline is set to zero, so the condition will fail, and the fallback fires: keep the USDC on Stellar at my address."

### C2 (15s): connect wallet

**On screen:** click **Connect Wallet**, pick MetaMask, approve.

**Say:**
> "Connecting a Base Sepolia wallet. The demo only talks to my wallet — the API never handles keys."

### C3 (25s): sign the two transactions

**On screen:** click **Sign & open intent**. MetaMask pops for USDC approve. Sign. Second pop for the OriginSettler.open call. Sign again.

**Say (while signing):**
> "Two signatures. First, approve one USDC to the OriginSettler on Base Sepolia. Second, call `open` on the OriginSettler with the ERC-7683 order. That order carries the packed hookData — action, conditions, fallback, all in one payload."

### C4 (40s): watch the flow settle

**On screen:** progress stages light up one after another. Signed → Burned → Attested → Minted → Held.

**Say (pacing yourself as stages fire — total ~30-40 seconds of real time):**
> "Now Circle CCTP burns the USDC on Base and Iris attests the message. This normally takes about 15 seconds on Fast Transfer. Once attested, my relayer submits the mint on Stellar. The NietSettler contract validates the CCTP message, decodes the hookData into a NietIntent, evaluates the timestamp condition — which fails, because the deadline was zero — and routes to the Hold fallback. USDC gets transferred to the receiver address I put in the intent."

Wait for **Held** pill to appear. It should be green.

### C5 (10s): explorer verification

**On screen:** click the Basescan link under "Burned on Base" — new tab shows the burn tx. Cmd-W back. Click the Stellar Expert link under "Settled/Refunded/Held" — shows the Stellar tx with the IntentHeld event.

**Say:**
> "Full receipts. Basescan shows the CCTP burn. Stellar Expert shows the mint plus the IntentHeld event, matched on the intent hash."

---

## D. Architecture + agent install (2:35 – 3:10)

**On screen:** switch to the terminal / open `README.md` in a text editor. Scroll to the deployed-addresses table + npm badge.

**Say:**
> "Under the hood: two contracts. On Base, a Solidity OriginSettler that implements ERC-7683 and wraps Circle's TokenMessengerV2. On Stellar, a Soroban contract called NietSettler that receives the CCTP mint, decodes the intent, evaluates conditions, and routes to Blend or a fallback. Everything's open source under MIT. Refund path is also verified end-to-end — six CCTP events in a single Stellar transaction."

**On screen:** flip to a terminal and type (or paste):
```
npx @atahanyild/niet-mcp-server
```

**Say (while showing it):**
> "For AI agents, there's an MCP server on npm — one-command install. Three tools: quote, execute, and status. Conditions are first-class parameters, so an agent can express something like: rebalance a thousand USDC into Blend, only if the pool APY is above 4.5 percent, else hold. In one signed intent."

---

## E. Outro (3:10 – 3:30)

**On screen:** switch to the GitHub repo tab, scroll to the top of the README.

**Say:**
> "Repo is github.com slash atahanyild slash niet. Demo is live. MCP server is on npm. Built with Stellar Türkiye Instawards. Thanks for watching."

**Cut cue:** stop recording immediately. Trim any trailing silence in QuickTime (Edit → Trim).

---

## Post-recording

1. Trim silence at the head and tail (QuickTime → Edit → Trim, drag handles).
2. Export as 1080p H.264 mp4 (default Save is fine).
3. Filename: `niet-demo-2026-07.mp4`.
4. Save to `docs/media/` in the repo. (Add `.gitignore` entry if the file is >50 MB; use Loom or YouTube unlisted instead and link from README.)
5. Commit:
   ```
   git add docs/media/niet-demo-2026-07.mp4
   git commit -m "docs: demo video (3:30, Hold path end-to-end)"
   ```
6. Optionally embed the video in the README under a `## Demo video` section.

## If a live take fails

Two fallbacks:

- **A) Reuse the known Hold receipts.** Skip C2–C4 entirely. Open the two prewired tabs (Basescan `0xbfb67fd3…` and Stellar Expert `d8d7e64b…`) and narrate them: "here's a settled run — burn on Base, Iris attests, settle on Stellar with the IntentHeld event." Cuts the demo to ~1 minute.
- **B) Do a Refund-path demo instead.** Same script structure, but pick the "Refund on failure" button. The known Refund receipts are `0xcb9df519…` (Base) and `fa48c886…` (Stellar).

The video does not have to be pixel-perfect — reviewers only need to see: signed one intent, watched the flow, saw the result on-chain. Do NOT try to re-record just to fix a small stumble.
