# Manual Deployment — RACE//FINAL (Studio UI)

## Why manual, and why via the Studio web UI

Per this project's own rules, the final wallet-controlled deployment is
always performed manually by the project owner — this assistant never
holds or requests a private key.

Separately, and unrelated to that rule: a live diagnostic investigation
(`../../genlayer-diagnostics/STUDIONET_INVALID_CONTRACT_REPORT.md`)
found that the `genlayer` CLI's deployment path (`genlayer deploy`)
currently fails against hosted StudioNet for *any* contract — including
GenLayer's own official minimal example and its own official boilerplate
repo's contract, unmodified — with `VM_ERROR: invalid_contract` during
GenVM module loading, before any contract code executes. The exact same
contracts deploy and run correctly through Studio's web UI
(https://studio.genlayer.com). This is a CLI/backend deployment-path
issue, not an application defect — see that report for the full
reproducible investigation. Until it's resolved upstream, **Studio UI is
the verified working deployment path** for this project.

## What you're deploying

- File: [`contracts/race_final.py`](../contracts/race_final.py)
- Contract class: `RaceFinal`
- Constructor: `__init__(self)` — **takes no arguments**. Leave any
  constructor-input fields in the UI empty/blank.
- Pinned runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
  (first line of the file — do not edit it)

Pre-deployment quality gates, already verified and passing as of this
writing (re-run them yourself before deploying if you've pulled newer
changes):

```bash
genvm-lint check contracts/race_final.py --json
pytest tests/direct/ -v
```

## Required network

- **StudioNet** (the stable, persistent one — NOT the "studio-dev" release-candidate preview)
- Chain ID: **61999**
- RPC: `https://studio.genlayer.com/api`
- Web app: https://studio.genlayer.com

## Deployment steps (Studio UI)

1. Open https://studio.genlayer.com in your browser.
2. If this is a new browser profile/session, Studio auto-generates a
   local account for you (shown top-right, e.g. `0x35...6eC4`). This is
   **your** wallet for this session — its key lives only in your browser.
   You may also connect an existing wallet via "Connect Wallet" if you
   prefer to use one you already control.
3. Fund that account: click the droplet/balance icon next to your
   address → "Fund Account" → enter an amount (10 GEN is more than
   enough for testing the full lifecycle: two stakes, a settlement call,
   two withdrawals) → "Fund". This credits instantly.
4. Click the "new file" icon in the "Your Contracts" panel (top-left) and
   upload/paste the full contents of `contracts/race_final.py`. (Or use
   the upload icon to import the file directly.)
5. With `race_final.py` open in the editor, click the ▶ (Run and Debug)
   icon at the top-right of the editor pane.
6. In the "Run and Debug" side panel:
   - **Execution Mode**: leave as **"Normal (Full Consensus)"** — this is
     what runs your contract through real multi-validator consensus, the
     same as production settlement behavior. Do not use a
     single-validator/debug mode for the actual deployment.
   - **Constructor Inputs**: none — the panel should show no required
     fields (or an empty list), since `__init__(self)` takes no
     arguments.
   - Click **"Deploy race_final.py"**.
7. Wait for the deployment transaction to reach **"Accepted"** (shown in
   the panel and in the Logs pane at the bottom — look for "Contract
   deployed", "Consensus reached", "execution finished").
8. **Record the deployed contract address** shown in the panel (e.g.
   "Deployed at 0x..."). You will need this for the smoke test and for
   wiring the frontend later.

## How to verify the deployed schema

In the same Studio session, the "Run and Debug" panel automatically shows
the contract's read/write methods once deployed — if you see
`create_contest`, `join_contest`, `cancel_unmatched`, `settle`,
`refund_after_deadline`, `withdraw`, `get_contest`, `get_withdrawable`,
`get_total_escrow`, `get_next_contest_id` listed under Read/Write
Methods, the schema was extracted successfully and the contract is live.

To verify independently via RPC (no CLI deploy involved, just a read-only
call — this works fine, only `deploy` is affected by the known issue):

```bash
genlayer schema <deployed-contract-address>
```

Expect a JSON schema listing all ten methods above with their parameter
types. If you instead get `Contract <address> not found`, the deployment
did not actually succeed — double check step 7 reached "Accepted" with
`execution_result: SUCCESS` in the logs, not just a transaction hash.

## How to verify the deployed code

```bash
genlayer code <deployed-contract-address>
```

Compare the returned source against `contracts/race_final.py` — it
should match byte-for-byte, including the pinned `Depends` header on line
1. (This command reads on-chain state and is unaffected by the CLI's
deploy-path issue.)

## After deployment

Proceed to [`docs/MANUAL_SMOKE_TEST.md`](MANUAL_SMOKE_TEST.md) to exercise
the full lifecycle against the live deployed contract.

## What NOT to do

- Do not use `genlayer deploy` for this contract until the upstream
  CLI/StudioNet incompatibility documented in
  `genlayer-diagnostics/STUDIONET_INVALID_CONTRACT_REPORT.md` is
  resolved — it will fail with `invalid_contract` regardless of contract
  correctness.
- Do not deploy to `studio-dev.genlayer.com` (chain 61997) — that's a
  separate, temporary release-candidate preview environment; state there
  can reset without notice and it uses a different `genlayer-js` major
  version.
- Do not skip the local quality gates (lint + direct tests) before
  deploying a newer version of the contract than what's documented here.
