# Live Web Verification — RACE//FINAL Phase 3

This document records exactly what was, and was not, proven live in this
phase, and how. See `docs/TOOLING_NOTES.md` for why the environment shaped
this approach (no working Docker engine, no LLM provider credential).

## Scope of this phase

Two things had to be proven separately, because only one of them could
genuinely be exercised live in this environment:

1. **Web transport** (`gl.nondet.web.get`) — **PROVEN LIVE.** A real
   outbound HTTPS request, made from inside a deployed Intelligent
   Contract's non-deterministic block, reaching a real public endpoint and
   returning real response bytes.
2. **LLM extraction** (`gl.nondet.exec_prompt`) — **NOT PROVEN LIVE.** No
   LLM provider credential (OpenAI/Anthropic API key, or a local Ollama
   install reachable without Docker) is available in this sandbox. This
   step remains mocked. The mock is fed by the real page content the live
   fetch actually returned, and the mock's assigned values were verified by
   hand against the real page at the time of writing (see below) — but the
   *extraction itself* was not performed by a real model.

Everything downstream of extraction — deterministic rank comparison,
settlement, state mutation, accounting — is exercised exactly as it would
be with a real model's output, because the contract code has no branch
that knows or cares whether `exec_prompt`'s answer came from a real LLM or
a test harness.

## PROOF 1 — TRANSPORT

**SOURCE URL**: `https://httpbin.org/get`

**SOURCE TYPE**: JSON (public HTTPS echo endpoint)

**GENVM WEB METHOD**: `gl.nondet.web.get(url)`

**WHY THIS METHOD**: pure transport proof, no product logic. `web.get` is
the right choice generally for any source with usable static text/JSON
(vs. `web.render`, reserved for JS-rendered DOM).

**CONTRACT ENTRY POINT**: `TransportProbe.probe(url)` —
`tests/integration/fixtures/transport_probe.py`, a minimal test-only
contract (NOT the product contract) that does nothing but
`gl.nondet.web.get(url)` inside a `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)` block and stores `status`/`body_length`.

**CALLER-SUPPLIED RESULT DATA**: NONE (`probe(url)` takes a URL because
this is a transport-only test double, not the product contract — the
product contract's `settle(contest_id)` takes no URL at all).

**MECHANISM**: `gltest`'s own `direct_vm._live_web_handler` hook (the same
seam `glsim` itself uses internally — see
`gltest/direct/wasi_mock.py::_handle_web_request`, "Live handler fallback
(glsim mode)") was wired directly to `urllib.request.urlopen`, bypassing
the mock table entirely. When GenVM's WASI layer issues a `WebRequest`
call, `wasi_mock.py` finds no matching mock and falls through to this live
handler, which performs an actual network call and returns the real
response in the exact shape the SDK expects
(`{"ok": {"response": {"status": ..., "headers": ..., "body": ...}}}`).

**INTEGRATION TEST COMMAND**:
```bash
pytest tests/integration/test_live_web_settlement.py::test_genvm_web_get_reaches_real_internet_endpoint -v -s
```

**RESULT**: **PASS.** `status == 200`, `body_length > 20` (real JSON body
returned by httpbin.org). Confirmed the validator's independent re-fetch
(inside `TransportProbe.probe`'s `validator_fn`, which calls `leader_fn()`
a second time) also performs a second real network round-trip against the
same live endpoint.

**PROOF OF CONTRACT-SIDE ACCESS**: the fetch happens inside
`gl.nondet.web.get()`, called from within `leader_fn`/`validator_fn`
closures that are only ever invoked via `gl.vm.run_nondet_unsafe` inside a
`@gl.public.write` contract method (`probe`) — this is GenVM's own
non-deterministic execution path, not test-harness code calling `httpx`
directly and handing the contract a result.

**VALIDATOR INDEPENDENT RE-FETCH**: YES — `validator_fn` in
`transport_probe.py` calls `leader_fn()` again, independently, and compares
its own real fetch's status against the leader's.

## PROOF 2 — PRODUCT-SHAPED SOURCE

**SOURCE URL**: `https://en.wikipedia.org/wiki/2024_Boston_Marathon`

**SOURCE TYPE**: static HTML (Wikipedia article with a results table)

**GENVM WEB METHOD**: `gl.nondet.web.get(url)` (the contest's
`retrieval_method` is `"get"` — the page's results table is present in the
initial HTML, no JS rendering required, matching this project's own rule
of preferring `get`/`request` over `render` whenever the source exposes
usable static content)

**WHY THIS SOURCE**: it is a real, stable, publicly-editable-but-rarely-
vandalized reference page identifying a real event (2024 Boston Marathon),
with two real, independently-verifiable competitors and their real final
placements — exactly the "identifiable event / two identifiable
competitors / final state / numeric rank" shape the task requires. A
genuine live official results portal was considered but rejected for this
proof: many marathon results portals are JS-heavy, session-gated, or
anti-bot protected in ways that would make the test flaky for reasons
unrelated to the contract logic being proven. This is disclosed here
rather than silently worked around.

**GROUND TRUTH USED** (verified by direct inspection of the live article on
2026-09-22): men's elite race — 1st place Sisay Lemma (Ethiopia,
2:06:17), 3rd place Evans Chebet (Kenya, 2:07:22). `participant_a_id =
"Sisay Lemma"`, `participant_b_id = "Evans Chebet"`,
`participant_a_rank = 1`, `participant_b_rank = 3` → A has the lower
(better) rank → `A_WINS`.

**CONTRACT ENTRY POINT**: `RaceFinal.settle(contest_id)` — the real product
method, called with **only** `contest_id`.

**CALLER-SUPPLIED RESULT DATA**: NONE. The contest's `canonical_source_url`,
`participant_a_id`, `participant_b_id`, and `event_id` were all committed
at `create_contest(...)` time, before either side knew or could know the
race outcome. `settle()`'s signature is `(self, contest_id: int)` — proven
by `test_settle_signature_accepts_only_contest_id` (AST-level check) and by
`test_settle_rejects_caller_supplied_rank` /
`..._winner` / `..._source_url` (each attempts to pass an extra kwarg and
asserts `TypeError`) in `tests/direct/test_race_final.py`.

**NORMALIZED FIELDS** (what crosses from the non-deterministic block into
deterministic settlement logic — never raw HTML, never free-form
rationale):
```json
{
  "source_ok": true,
  "event_match": true,
  "is_final": true,
  "participant_a_found": true,
  "participant_b_found": true,
  "participant_a_rank": 1,
  "participant_b_rank": 3
}
```

**INTEGRATION TEST COMMAND**:
```bash
pytest tests/integration/test_live_web_settlement.py::test_settle_performs_real_web_fetch_and_settles_from_live_content -v -s
```

**RESULT**: **PASS.** The live fetch inside the test first sanity-checks
reachability and real content (`status == 200`, body > 1000 bytes,
contains "Boston Marathon") — the test is written to `pytest.skip(...)`
rather than fabricate a result if the live source is ever unreachable. Then
`settle(contest_id)` runs the real product code path: `leader_fn` performs
the real `gl.nondet.web.get()` against the live URL, the (mocked, see
"Scope" above) extraction step reports the ground-truth fields above, and
deterministic comparison correctly derives `CONTEST_SETTLED_A` — matching
the real-world result that Sisay Lemma placed ahead of Evans Chebet.
`data["winner"]` correctly resolves to participant A's wallet
(`direct_alice`), and `data["result"]["participant_a_rank"] /
participant_b_rank` match the real ranks exactly.

**PROOF OF CONTRACT-SIDE ACCESS**: identical mechanism to Proof 1 — the
fetch happens inside `settle()`'s `leader_fn`, invoked only via
`gl.vm.run_nondet_unsafe`, with the live handler wired the same way.

**VALIDATOR INDEPENDENT RE-FETCH**: YES — `settle()`'s `validator_fn` (see
`contracts/race_final.py`) calls `leader_fn()` a second time whenever the
leader succeeded, meaning it performs a second, fully independent real
HTTPS GET against the live Wikipedia article, then compares its own
independently-derived structured fields against the leader's before
agreeing to settle.

## Negative live case

**TEST**: `test_negative_case_wrong_event_causes_zero_state_mutation`

**SETUP**: the real live fetch succeeds exactly as in Proof 2 (same real
URL, same real content), but the extraction step reports
`event_match: false` — simulating "the committed event id does not
actually correspond to what this real page shows" (e.g. a stale/incorrect
event commitment).

**COMMAND**:
```bash
pytest tests/integration/test_live_web_settlement.py::test_negative_case_wrong_event_causes_zero_state_mutation -v -s
```

**RESULT**: **PASS.** `settle()` reverts with `EXTERNAL:RESULTS_NOT_FINAL`.
Re-reading contract state afterward confirms: `resolved == false`,
`status == 1` (still `CONTEST_MATCHED`, i.e. retryable), and both
`get_withdrawable(...)` values remain `0` — zero funds moved, contest not
locked out, matching the "fail closed, stay retryable" requirement.

## Equivalence / validation approach used

Structured partial-field matching (not `strict_eq` over raw HTML, not
free-form LLM rationale): `validator_fn` re-derives the same seven-field
dict independently and requires every field to match the leader's exactly
before accepting the leader's result — see `contracts/race_final.py`,
`settle()`. Direct-mode tests separately prove (in
`tests/direct/test_race_final.py`) that `direct_vm.run_validator()` with a
deliberately forged leader result is rejected — that proof is orthogonal
to and consistent with what's demonstrated live here.

## Limitations

- The LLM extraction step (`gl.nondet.exec_prompt`) was not exercised with
  a real model in this phase — no provider credential is available in this
  sandbox (see `docs/TOOLING_NOTES.md` §5). What *is* proven live is that
  the network transport step genuinely reaches the real internet from
  inside GenVM's non-deterministic execution path, and that everything
  downstream of extraction (deterministic settlement, accounting, revert
  safety) operates correctly on whatever structured data that step
  produces — real or mocked.
- No full multi-validator GenVM consensus round (`genlayer up` /
  Docker-based localnet, or hosted Studionet) was exercised in this phase;
  that requires either a working Docker engine (unavailable here) or a
  funded Studionet account (requires a manual browser faucet action,
  explicitly out of scope for autonomous execution per this project's
  human-wallet-boundary rule). This remains the next step before/at the
  hosted StudioNet handoff, once the user performs the funding action
  themselves.
- The Wikipedia source used for Proof 2 is a real, stable page but is not
  itself the "official" results portal a production deployment would
  commit to — this was a deliberate, disclosed substitution (see "Why this
  source" above), not a fabricated leaderboard.
