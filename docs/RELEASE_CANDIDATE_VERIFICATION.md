# Release Candidate Verification — RACE//FINAL

Status snapshot as of the first successful StudioNet deployment,
2026-09-23.

## Contract

| | |
|---|---|
| Source file | `contracts/race_final.py` |
| Deployed network | StudioNet, chain ID 61999 |
| Contract address | `0x89457832760701BD1941873f2d44E06955e4Ef46` |
| Deployment transaction | `0x19c3afbdf9edb8f529f5489df2cec31f494ae8d88976765159186f844963c7e6` |
| Deployer | `0xaffE15eEc45b68835cc9E5B4Ab85dD5deaE8e70b` |
| Deployment method | Studio UI (manual, wallet-controlled) |
| Pinned GenVM runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source SHA-256 (LF-normalized) | `72199d1f2fccf48c3e98ecacb3de44daaaf0829b0f4fcc5a48925816e197b994` |
| Lint result | `genvm-lint check contracts/race_final.py --json` → `{"ok": true}`, 10 methods (4 view / 6 write), no errors |
| Deployed-source parity | Confirmed byte-identical to local source via `genlayer code <address>` (same SHA-256 both sides) |
| Deployed-schema parity | Confirmed via `genlayer schema <address>`: all 10 methods present with correct param/return types, `ctor: { params: [] }` matching the no-arg constructor |

**Contract is now FROZEN.** No feature changes, cleanup, or refactors
without a new deployment and a new entry in this document.

## Tests

| Suite | Count | Command | Result |
|---|---|---|---|
| Direct (in-memory) | 36 | `pytest tests/direct/ -v` | 36/36 passing |
| Integration (live web transport) | 3 | `pytest tests/integration/ -v -s` | 3/3 passing |

Direct suite covers: full lifecycle (create/match/cancel/refund/
withdraw), equal-stake enforcement, self-match rejection, immutability of
committed terms after matching, and the complete settlement matrix — no
caller-suppliable rank/winner/URL (proven at the signature level and via
rejected-kwarg attempts), a forged/divergent leader result rejected by an
independently-refetching validator, malformed JSON and out-of-range/
wrong-typed ranks rejected pre-consensus, preliminary/event-mismatch/
unusable-source results causing zero state mutation, a transient failure
leaving the contest retryable and a successful retry settling exactly
once, tie handling as a distinct terminal condition from the
non-terminal UNRESOLVED case, both rank-win directions crediting exactly
the total pot to the correct side, and total withdrawable balances never
exceeding escrow across multiple concurrent contests.

Integration suite proves `gl.nondet.web.get()` performs a genuine
outbound HTTPS request from inside a deployed contract's
non-deterministic block, with an independently-executing validator
re-fetch, against both a transport-only endpoint and a real public
results-style page (2024 Boston Marathon Wikipedia article) — see
`docs/LIVE_WEB_VERIFICATION.md` for the documented scope and honest
limitation (LLM extraction was mocked in that specific local proof due to
no LLM credential being available in the development sandbox; the actual
StudioNet deployment above uses StudioNet's own real LLM-routed
validators for genuine extraction).

## Live web

See `docs/LIVE_WEB_VERIFICATION.md` for the full proof, sources tested,
and exact commands.

## Security invariants

Enforced and tested (see `tests/direct/test_race_final.py`):

- Settlement cannot happen before both sides fund, or before `settle_after`.
- Source/event/participant IDs/stake are immutable once committed at
  CREATE — no method exists that could change them after matching.
- Same wallet cannot occupy both sides of a contest.
- Each side must fund exactly the stake the creator committed.
- Settlement occurs at most once (`ALREADY_RESOLVED` guard).
- Unresolved/inconclusive outcomes award nobody and mutate no state.
- Malformed/out-of-range extraction output awards nobody.
- The `settle()` caller cannot influence the outcome — no result, rank,
  winner, or URL parameter exists on that method.
- Total withdrawable balances never exceed total escrow (tested across
  multiple concurrent contests with mixed outcomes).
- Double withdrawal is impossible (ledger zeroed before external
  transfer, checks-effects-interactions).
- A tie refunds exactly the two original stakes, nothing more.
- No privileged result-override method exists anywhere in the contract —
  confirmed by inspection, not just by test coverage.

## Deployment path — known limitation

`genlayer deploy` (the CLI) cannot currently deploy this contract, or
even GenLayer's own official example/boilerplate contracts, to StudioNet
— every attempt fails with `VM_ERROR: invalid_contract` during GenVM
module loading, before any application code runs. Root-caused via a full
controlled-experiment investigation (ruling out contract source, storage
patterns, `Depends` pin, version-marker comments, gas configuration,
consensus contract routing, and schema-preflight ordering) to be a
CLI/StudioNet backend deployment-path incompatibility. **Studio UI
deployment is the verified working path** and is what produced the live
deployment recorded above. Full investigation, kept separate from this
repository per project isolation rules, is available on request.

## Frontend

Not yet built — next phase. Will target the deployed address above via
`genlayer-js@1.1.8`, injected wallet, StudioNet (chain 61999), zero
backend.

## Not yet done

- Frontend wiring and UI.
- A full manual smoke test of the live deployed contract's complete
  lifecycle (create → join → settle → withdraw) — procedure is ready in
  `docs/MANUAL_SMOKE_TEST.md`, awaiting execution against the address
  above.
- Upstream resolution of the CLI deployment issue (tracked externally,
  outside this repository).
