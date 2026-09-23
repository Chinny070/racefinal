# Manual Smoke Test — RACE//FINAL (post-deployment, Studio UI)

Run this after completing [`docs/MANUAL_DEPLOYMENT.md`](MANUAL_DEPLOYMENT.md),
against the live deployed contract on StudioNet. All steps use the same
Studio UI "Run and Debug" panel — Write Methods to submit transactions,
Read Methods to verify state. Use **two different accounts** (participant
A = the deployer/creator account, participant B = a second account) so
the two-party lifecycle is genuinely exercised, not simulated with one
wallet on both sides.

For participant B, either connect a second wallet in Studio, or open a
second browser profile / private window pointed at studio.genlayer.com
(Studio auto-generates a fresh local account per browser profile) and
fund it the same way (droplet icon → Fund Account).

Record the actual values you observe at each step — this is a real test
against a real deployment, not a dry run.

## Recommended timing for the test

Pick short-but-real offsets so you don't have to wait long between steps,
e.g. relative to "now" at CREATE time:

- `match_close_time` = now + 5 minutes
- `settle_after` = now + 10 minutes
- `resolution_deadline` = now + 1 hour

All three are Unix timestamps (seconds). You can get one quickly from
any "epoch converter" or your OS: e.g. in a browser console,
`Math.floor(Date.now()/1000) + 300` for 5 minutes from now.

## 1. Create contest (participant A)

With participant A's account active in Studio, call the write method:

```
create_contest(
  participant_a_id: "<canonical id, e.g. a bib number or competitor name>",
  participant_b_id: "<a different canonical id>",
  event_id: "<an event identifier string>",
  source_host: "<e.g. en.wikipedia.org>",
  source_path_prefix: "<e.g. /wiki/2024_Boston_Marathon>",
  canonical_source_url: "https://<source_host><source_path_prefix or a page under it>",
  retrieval_method: "get",
  match_close_time: <unix ts, ~5 min from now>,
  settle_after: <unix ts, ~10 min from now>,
  resolution_deadline: <unix ts, ~1 hour from now>
)
```

Send with **value = your chosen stake**, e.g. `1` GEN (this method is
payable — the value field is separate from the args, look for a "value"
input alongside the argument list in the Studio UI's write-method form).

**Verify**: transaction reaches Accepted/Finalized. Note the `contest_id`
returned (should be `1` for the first contest on a freshly deployed
contract). Call the read method `get_contest(contest_id)` and confirm:
- `status` is `0` (CONTEST_CREATED)
- `creator` matches participant A's address
- `counterparty` is the zero address
- `stake_wei` matches what you sent (in wei — multiply your GEN amount by 10^18)
- all the fields you set (`participant_a_id`, `source_host`,
  `canonical_source_url`, etc.) match exactly what you submitted

## 2. Second participant joins (participant B)

Switch Studio to participant B's account. Call:

```
join_contest(contest_id: <the id from step 1>)
```

Send with **value = the exact same stake** as participant A sent. (Try a
different value first if you want to see the equal-stake enforcement —
expect a revert containing `STAKE_MUST_EQUAL_CREATOR_STAKE` — then retry
with the correct value.)

**Verify**: `get_contest(contest_id)` now shows:
- `status` is `1` (CONTEST_MATCHED)
- `counterparty` matches participant B's address
- `matched_at` is a nonzero, recent timestamp

## 3. Source URL / terms locked (immutability check)

Confirm none of the committed terms changed after matching — re-read
`get_contest(contest_id)` and check `canonical_source_url`,
`participant_a_id`, `participant_b_id`, `event_id`, `stake_wei` are
byte-for-byte identical to what was set in step 1. (There is no method
that could change them — this step is just confirming that by
observation.)

## 4. Settlement timing enforcement

Before `settle_after` is reached, call:

```
settle(contest_id: <id>)
```

**Expect a revert** containing `SETTLEMENT_TOO_EARLY`. This confirms the
contract won't let anyone jump the gun. Wait until the real clock passes
your `settle_after` timestamp before continuing.

## 5. Settle

Once `settle_after` has passed, call `settle(contest_id: <id>)` again
(from either account — the caller does not influence the outcome).

This performs a **real GenVM web fetch + LLM extraction + independent
validator re-check** of your `canonical_source_url` — pick a real,
reachable page for a meaningful test. If your chosen page doesn't
actually establish a final result for both `participant_a_id` and
`participant_b_id`, expect a revert (`RESULTS_NOT_FINAL`,
`PARTICIPANT_NOT_FOUND_A`/`_B`, or an `LLM_ERROR:`/`TRANSIENT:` category)
— **this is correct behavior** (fail-closed, zero payout, contest stays
retryable), not a bug. Retry `settle()` again once you're confident the
source page genuinely supports extraction, or pick a more suitable
source and note that the committed URL can't be changed on an already
-matched contest (by design — create a new contest to test a different
source).

**Verify** on a successful settlement: `get_contest(contest_id)` shows:
- `resolved` is `true`
- `status` is `2` (CONTEST_SETTLED_A), `3` (CONTEST_SETTLED_B), or `4`
  (CONTEST_TIE)
- `winner` matches the expected address (or zero address for a tie)
- `result` object is populated with `source_ok`, `event_match`,
  `is_final`, `participant_a_found`, `participant_b_found`,
  `participant_a_rank`, `participant_b_rank`, `settled_at` — spot-check
  these against the real source page

## 6. Final result

Confirm the deterministic mapping is correct: lower rank should have won.
If `participant_a_rank < participant_b_rank`, `status` must be `2` and
`winner` must be participant A's address (and vice versa for B; equal
ranks must give `status: 4`, zero address).

## 7. Withdrawal

From the winning account (or both accounts, on a tie/refund), call the
read method `get_withdrawable(who: "<address>")` first to see the
expected payout, then call the write method:

```
withdraw()
```

**Verify**: the transaction succeeds, and `get_withdrawable("<address>")`
now returns `0` for that address. Check the account's GEN balance in
Studio increased by the expected amount (minus any gas). Calling
`withdraw()` again immediately should revert with `NOTHING_TO_WITHDRAW`.

## Optional: exercise the refund path

To test `cancel_unmatched` / `refund_after_deadline` instead of a full
settlement, create a **second, separate** contest and either:
- cancel it while still unmatched (`cancel_unmatched`, creator only,
  before anyone joins) — verify the stake becomes withdrawable
  immediately, or
- match it, let `resolution_deadline` pass without ever calling
  `settle()` successfully, then call `refund_after_deadline` (from
  either account — it's permissionless) — verify both participants'
  stakes become withdrawable

## Record your results

For the project record, note down: contest ID(s) used, transaction
hashes for create/join/settle/withdraw, the deployed contract address,
the real source URL tested, and the actual on-chain result observed at
each step. This is the hosted-StudioNet proof the project's release
checklist expects.
