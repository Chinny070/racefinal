# Live Smoke Test Result — RACE//FINAL on StudioNet

Date: 2026-09-23
Network: StudioNet, chain ID 61999, RPC `https://studio.genlayer.com/api`
Contract: `0x89457832760701BD1941873f2d44E06955e4Ef46` ([deployments/studionet.json](../deployments/studionet.json))
Accounts used: `racefinal-test-a` (`0xBB286386dcF5F659F12c1E6272dc2a3372aEE226`) and
`racefinal-test-b` (`0x3051c8c2970D86a9AB329FC9e3a79d2fA0050d5C`) — dedicated
project test accounts only. No other account (`bradbury-e2e`, `default`,
or any other project's) was ever set as active or used to sign a
transaction.

**Result: PASS.** The complete lifecycle was proven live against the
frozen, deployed contract: create → match → invalid-action rejection →
real settlement (genuine GenVM web fetch + real LLM extraction +
independent validator consensus, zero mocks) → correct deterministic
outcome → withdrawal, with double-withdrawal and cross-side withdrawal
both correctly blocked.

`contracts/race_final.py` was not modified at any point during this test.

## A tooling note before the results: how the payable calls were made

The `genlayer write` CLI subcommand's payable-value handling was
inspected directly in its source
(`genlayer/dist/index.js`, `WriteAction.write`) and found to hardcode
`value: 0n` on every call — **it cannot send GEN with a payable method at
all**, regardless of flags. This is a distinct bug from the previously
documented StudioNet deploy-path issue. `create_contest` and
`join_contest` are both `@gl.public.write.payable`, so they were called
instead via a small local script using `genlayer-py`'s
`client.write_contract(..., value=...)`, which does expose a working
`value` parameter (source-verified: `genlayer_py/contracts/actions.py`).
All non-payable calls (`settle`, `withdraw`, `cancel_unmatched`, reads)
used the standard `genlayer write`/`genlayer call` CLI as normal. Scripts
are in `genlayer-diagnostics/smoke_test_scripts/` (outside this repo, per
project isolation rules), not committed here.

Separately, `genlayer call --args 0x...` auto-detects a 0x-prefixed
40-hex-char string as the `address` calldata type, which doesn't match
`get_withdrawable(who: str)`'s actual `string` parameter type and errors.
Reads of that method used the same `genlayer-py` script path
(`read_contract`) instead.

## STEP 1 — Create contest

**Stake**: 0.01 GEN (`10000000000000000` wei) — smallest practical
denomination for this test.

Three contests were created in total over the course of this test (see
"What didn't work on the first pass" below for why); the one that
completed the full lifecycle is **contest_id 3**.

**Transaction**: `0x02c2a64c46d3ec6248fed5f2c2133d9ff6f07e0c5d76858c8d23d04764b34d99`
— `status_name: FINALIZED`

**Verified via `get_contest(3)` immediately after**:
```json
{
  "canonical_source_url": "https://en.wikipedia.org/w/index.php?title=2024_Boston_Marathon&action=raw",
  "event_id": "2024-BOSTON-MARATHON-MENS-ELITE-WIKITEXT",
  "participant_a_id": "Sisay Lemma",
  "participant_b_id": "Evans Chebet",
  "source_host": "en.wikipedia.org",
  "source_path_prefix": "/w/index.php",
  "retrieval_method": "get",
  "stake_wei": 10000000000000000,
  "status": 0,
  "creator": "0xBB286386dcF5F659F12c1E6272dc2a3372aEE226"
}
```
Source URL, event, both participant IDs, stake, and all three timestamps
stored exactly as submitted.

## STEP 2 — Second participant joins

**Transaction**: `0xf2da0f075b14ba5ef7362b6c06329b2ef3eec2940ed14d2bb1d6b97f2d93f93a`
— `status_name: FINALIZED`, all `execution_result: SUCCESS`

**Verified**: `get_contest(3)` afterward shows `status: 1` (MATCHED),
`counterparty` = test-b's address, `matched_at` a real nonzero timestamp
— and every immutable field (`canonical_source_url`, `participant_a_id`,
`participant_b_id`, `stake_wei`, etc.) byte-identical to step 1. No
method exists on the contract that could have changed them; this was
confirmed by direct re-read, not by inference.

## STEP 3 — Invalid actions correctly rejected

- `cancel_unmatched(1)` on an already-matched contest →
  **`EXPECTED:CONTEST_NOT_CANCELLABLE`** (tested on contest 1, which was
  matched at the time)
- `settle(1)` before `settle_after` → **`EXPECTED:SETTLEMENT_TOO_EARLY`**
- `get_withdrawable(...)` for both participants, pre-settlement → **`0`**
  for both, on every contest, confirmed via direct read

(These three checks were performed against contest 1 before its own
settlement attempts began — same contract, same invariants, valid proof
of the guard logic regardless of which contest_id.)

## STEP 4 — Settlement: real GenVM web + LLM + validator consensus, zero mocks

**Call signature confirmed**: `settle(contest_id)` — a bare integer, no
result/rank/winner/URL parameter exists on the method (confirmed both by
the deployed schema, `genlayer schema <address>`, and by direct
inspection of `contracts/race_final.py`).

**Transaction**: `0x8171ad5045372bf4b9e57a35b9004018a1f02f9a7abf9e0b5cedcaf10cb75471`
was the *third* attempt overall (see below) but the first against contest
3's better-suited source; the one that actually succeeded was a
subsequent call on contest 3 — receipt:

```
result_name: MAJORITY_AGREE
status_name: ACCEPTED
```

Every validator independently performed: a real HTTPS GET of the
committed `canonical_source_url`, a real LLM extraction call against a
genuinely different model per validator (this round's leader used
`gpt-5.4`-family routing; other validators in earlier rounds used
`gemini`, `gpt-oss`, `deepseek`, `kimi`, `gemma`, `qwen`, `glm` family
policies via StudioNet's `llm-router`), and independently produced
matching structured output before consensus accepted it. No mock of any
kind was used at any layer — this ran against the live, hosted StudioNet
deployment.

**Final state, `get_contest(3)`**:
```json
{
  "resolved": true,
  "status": 2,
  "winner": "0xBB286386dcF5F659F12c1E6272dc2a3372aEE226",
  "has_result_record": true,
  "result": {
    "source_ok": true,
    "event_match": true,
    "is_final": true,
    "participant_a_found": true,
    "participant_b_found": true,
    "participant_a_rank": 1,
    "participant_b_rank": 3,
    "settled_at": 1790171986
  }
}
```

## STEP 5 — Final outcome

`status: 2` = `CONTEST_SETTLED_A`. `winner` = test-a's address = the
creator = participant A = Sisay Lemma. Deterministic mapping correct:
rank 1 < rank 3 → A wins, exactly as the design requires (lower rank
wins, derived by plain Python comparison, not by the LLM).

**Accounting, read directly after settlement**:
- `get_withdrawable(test-a)` = `20000000000000000` (0.02 GEN — the full
  pot, 2× stake)
- `get_withdrawable(test-b)` = `0`
- `get_total_escrow()` = `50000000000000000` (0.05 GEN — sum across all
  three contests created during this test: contest 1's 0.02 GEN still
  locked/unresolved, contest 2's 0.01 GEN from its unmatched creator
  stake, and contest 3's 0.02 GEN now credited-but-not-yet-withdrawn;
  `0.02 + 0.01 + 0.02 = 0.05`, consistent)

## STEP 6 — Withdrawal

**Transaction**: `withdraw()` as test-a → `execution_result: SUCCESS`,
return value `20000000000000000` (exactly the expected 0.02 GEN)

**Verified**:
- `genlayer account show --account racefinal-test-a` balance rose from
  9.97 → 9.99 GEN region consistent with 0.02 GEN credited minus prior
  gas/stake spend across three `create_contest` calls (10 → 9.99 after
  all activity, net of the 0.02 GEN payout — no discrepancy)
- Immediate second `withdraw()` call as test-a → **`EXPECTED:NOTHING_TO_WITHDRAW`**
  (double withdrawal blocked)
- `withdraw()` as test-b (the losing side) → **`EXPECTED:NOTHING_TO_WITHDRAW`**
  (loser cannot claim winner's funds — confirmed by the same guard,
  since test-b's own withdrawable balance was already and remains `0`)

## What didn't work on the first pass, and why (kept for the record)

Contest 1 used `https://en.wikipedia.org/wiki/2024_Boston_Marathon`
(rendered-article HTML, `retrieval_method: "get"`) as its source. Three
live `settle(1)` attempts were made:

1. `LLM_ERROR:INVALID_RANK_participant_a_rank`
2. `LLM_ERROR:MALFORMED_JSON`
3. `MAJORITY_DISAGREE` / `UNDETERMINED` (mixed SUCCESS/ERROR across validators)

**Every single attempt correctly caused zero state mutation and zero
payout** — re-reading `get_contest(1)` after each attempt confirmed
`resolved: false`, `status: 1` (still MATCHED, retryable) throughout.
This is the fail-closed design working exactly as intended under genuine
real-world conditions, not a bug.

Root cause, diagnosed directly (not guessed): the raw HTML article page
is 319,935 characters long, and `"Sisay Lemma"` first appears at
character index 42,268 — entirely outside the contract's 20,000-character
truncation window (`contracts/race_final.py`'s `settle()`, `if len(body)
> 20000: body = body[:20000]`, an intentional, reasonable safety bound
against unbounded page sizes, left as-is per the frozen-contract
constraint). The LLM genuinely never saw the results table.

Contest 1 was deliberately left unresolved as a live artifact of this
finding — it remains permissionlessly refundable via
`refund_after_deadline` after its `resolution_deadline`
(`1790173032`), which was not exercised further here since the
lifecycle's success path (contest 3) already demonstrates the refund
guard's sibling paths (`SETTLEMENT_TOO_EARLY`, `CONTEST_NOT_CANCELLABLE`)
and the contract's own direct-mode test suite already covers
`refund_after_deadline` exhaustively (`tests/direct/test_race_final.py`).

Contest 2, created with the same corrected source as contest 3 but too
tight a match-window buffer (120s) relative to real StudioNet transaction
latency observed throughout this session, failed to join in time
(`EXPECTED:MATCH_WINDOW_CLOSED`) and was abandoned in favor of contest 3
with generous buffers (600s/660s). Its 0.01 GEN creator stake remains
uncollected — recoverable via `cancel_unmatched(2)` by test-a (still
`CONTEST_CREATED`, never matched), not exercised here since it's outside
the scope of this smoke test's success-path proof.

**Fix used for contest 3**: switched to Wikipedia's raw-wikitext API
endpoint for the same article
(`https://en.wikipedia.org/w/index.php?title=2024_Boston_Marathon&action=raw`)
— a legitimate, real, official Wikipedia data source, just markup rather
than rendered HTML — which is only 15,735 characters total, with the
results table (containing both participants and explicit place markers)
beginning around character 5,636, comfortably inside the 20,000-character
window. This is a source-selection fix, not a contract change.

## Limitations

- The 20,000-character extraction window is a real, load-bearing
  constraint for any `retrieval_method: "get"` source — a production
  deployment or frontend should validate that a chosen source's relevant
  content actually falls within that window before committing to it at
  `create_contest` time, or use `retrieval_method: "render"` for sources
  where that's not achievable via raw HTML. This test did not exercise
  the `"render"` path live.
- `genlayer write`'s inability to send payable value, and `genlayer
  call`'s address/string type ambiguity for hex-string arguments, are
  both CLI-level issues distinct from (and secondary to) the previously
  documented StudioNet deployment-path bug. They did not block this test
  (worked around via `genlayer-py` directly) but would block anyone
  relying on the CLI alone for payable interactions.
- Contests 1 and 2 were left in their respective in-progress states
  (retryable-unresolved and uncollected-unmatched) as accurate artifacts
  of this live test rather than being cleaned up, since doing so wasn't
  necessary to prove the lifecycle and this document records their exact
  state for anyone inspecting the contract afterward.

## Next step

Frontend wiring, targeting the verified live contract above.
