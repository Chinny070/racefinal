# RACE//FINAL

A two-party public competition result settlement protocol built on
[GenLayer](https://genlayer.com) Intelligent Contracts.

**Live app**: https://frontend-pi-brown-73.vercel.app
**Repository**: https://github.com/Chinny070/racefinal

## What it does

Two participants (A = contest creator, B = whoever joins) lock equal GEN
stakes around a committed public results URL, an event identifier, and a
settlement-unlock timestamp. Once both sides fund the contest, every one
of those terms becomes immutable.

At settlement, GenLayer's validators — not the caller, not a frontend,
not an oracle — independently fetch the precommitted source, independently
extract structured facts (is the source usable? does it match the
committed event? is the result final? are both participants found? what
are their numeric ranks?), and reach consensus on those facts. Only after
independent validator agreement does deterministic contract code compare
the two ranks and derive `A_WINS` / `B_WINS` / `TIE` — no LLM ever decides
who gets paid, and the caller of `settle()` supplies nothing but a bare
`contest_id`.

If retrieval or consensus is ever inconclusive, the transaction reverts
with zero state mutation and zero payout — the contest stays locked and
retryable by anyone until a resolution deadline, after which a
permissionless refund becomes available. No admin override exists
anywhere in the contract.

## Why GenLayer

Public competition results live in ordinary, messy web pages — not a
deterministic on-chain oracle. GenLayer's non-deterministic execution +
validator consensus is what lets a smart contract safely read that kind
of source without trusting any single party's claim about what it says.

## Architecture — zero backend

```
Frontend (genlayer-js)  →  injected wallet  →  StudioNet (chain 61999)  →  RaceFinal contract  →  GenVM (real web fetch + LLM extraction)  →  independent validator consensus  →  deterministic settlement
```

There is no backend server, no database, no Supabase/Firebase, and no API
layer of any kind. The frontend reads and writes directly against the
deployed contract; all trust-sensitive logic (source retrieval, fact
extraction, consensus, settlement) lives in the contract and in GenVM.

## Deployed contract

| | |
|---|---|
| Network | StudioNet |
| Chain ID | 61999 |
| Contract address | `0x89457832760701BD1941873f2d44E06955e4Ef46` |
| Deployment tx | `0x19c3afbdf9edb8f529f5489df2cec31f494ae8d88976765159186f844963c7e6` |
| Deployment method | Studio UI (manual, wallet-controlled) |
| Deployment record | [`deployments/studionet.json`](deployments/studionet.json) |

See [`docs/MANUAL_DEPLOYMENT.md`](docs/MANUAL_DEPLOYMENT.md) for exactly
how this was deployed, and why Studio UI rather than the CLI — see
"Known limitations" below.

## Setup

```bash
pip install "genlayer-test[sim]"   # genlayer-test, gltest, direct-mode fixtures
npm install -g genlayer            # genlayer CLI (used for reads/writes and diagnostics; not deploy — see below)
```

## Lint

```bash
genvm-lint check contracts/race_final.py --json
```

## Direct tests (in-memory, fastest, no network)

```bash
pytest tests/direct/ -v
```

36/36 passing as of this writing: full lifecycle (create/match/cancel/
refund/withdraw) plus the complete settlement matrix (no caller-suppliable
rank/winner/URL, forged-leader rejection via independent validator
re-fetch, malformed/negative-rank rejection, preliminary/mismatch/
unusable-source non-settlement, transient-failure retry, tie handling,
both-direction rank-win payouts, escrow conservation across multiple
contests).

## Integration tests (real network calls)

```bash
pytest tests/integration/ -v -s
```

Includes a live-web-transport proof: `gl.nondet.web.get()` genuinely
reaching a real public endpoint from inside a deployed contract's
non-deterministic block, with independent validator re-fetch — see
[`docs/LIVE_WEB_VERIFICATION.md`](docs/LIVE_WEB_VERIFICATION.md) for the
full writeup and its honestly-stated limitations (no LLM provider
credential was available in the sandbox this was developed in, so LLM
extraction itself was mocked in that specific proof — the live deployment
above exercises the real thing end-to-end).

## Frontend

Not yet wired — next step. Will use `genlayer-js@1.1.8`, an injected
browser wallet, targeting StudioNet (chain 61999) at the deployed address
above. No backend, no Supabase, no custom API server.

## StudioNet settings

| | |
|---|---|
| RPC | `https://studio.genlayer.com/api` |
| Chain ID | `61999` |
| Studio web app | https://studio.genlayer.com |

Do not confuse with the separate `studio-dev.genlayer.com` release-candidate
preview (chain 61997) — different chain, different consensus deployment,
state can reset without notice.

## Deployment workflow

See [`docs/MANUAL_DEPLOYMENT.md`](docs/MANUAL_DEPLOYMENT.md) (how to
deploy via Studio UI) and
[`docs/MANUAL_SMOKE_TEST.md`](docs/MANUAL_SMOKE_TEST.md) (full two-account
lifecycle walkthrough against a live deployment).

## Known limitations

- **`genlayer deploy` (the CLI) currently cannot deploy this contract to
  StudioNet** — nor can it deploy GenLayer's own official minimal example
  contract or its own official boilerplate repo's contract, unmodified.
  Every CLI deployment attempt fails with `VM_ERROR: invalid_contract`
  during GenVM module loading, before any application code runs, while
  the identical contract deploys and runs correctly through Studio's web
  UI. This was root-caused, with a full reproducible investigation
  (ruling out contract source, storage patterns, the `Depends` pin,
  version markers, gas, consensus routing, and schema-preflight ordering)
  to be a CLI/StudioNet backend deployment-path incompatibility, not an
  application defect. **Studio UI deployment is the verified working
  path** and is what was used for the live deployment above. Full
  investigation is kept in a separate, untracked local directory
  (`genlayer-diagnostics/`, outside this repository) pending upstream
  resolution.
- The frontend is not yet built.
