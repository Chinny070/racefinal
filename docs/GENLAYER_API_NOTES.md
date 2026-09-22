# GenLayer API Notes — RACE//FINAL

Verified against raw official documentation fetched directly (not AI-summarized) on 2026-09-22:

- `_reference/docs/full-documentation.txt` ← `https://docs.genlayer.com/full-documentation.txt` (15,733 lines)
- `_reference/docs/sdk-api.txt` ← `https://sdk.genlayer.com/main/_static/ai/api.txt` (4,151 lines)
- `npm view genlayer-js dist-tags` → `{ latest: '1.1.8', rc: '2.0.0-rc.1' }` — confirms `genlayer-js@1.1.8` is the correct stable SDK for **stable Studionet** (chain ID `61999`, RPC `https://studio.genlayer.com/api`). The `2.0.0-rc.1` / `studioDevnet` (chain `61997`) track is a **separate preview environment and must not be used** — full-documentation.txt lines 1699-1845 warn explicitly against mixing the two.
- Local tooling already present and verified: `genlayer-test==0.29.2` (provides `gltest` + direct-mode `pytest` fixtures), `genlayer-py==0.16.3`, `genvm-linter==0.11.1rc2` (provides `genvm-lint`), `genlayer` CLI v0.39.2.
- Fixed upstream Windows bug in the locally-installed `gltest` package (`...\Lib\site-packages\gltest\direct\loader.py`, `_inject_message_to_fd0`): `os.dup2(fd, 0)` duplicates the file handle, so it's still open via fd 0 after `os.close(fd)`, and Windows (unlike POSIX) refuses to unlink an open file. Patched to swallow that specific `PermissionError` on unlink. This is generic tooling infrastructure, unrelated to any specific project.

## Pinned runner (Depends header)

Must be the literal first line of the contract file:

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
```
Source: full-documentation.txt:1893, 2367, 4319 (consistent across every current example).

## Contract class

- Exactly one contract class per file, extends `gl.Contract`.
- `__init__` is the constructor: **not decorated**, private.
- Public methods: `@gl.public.view` (read-only), `@gl.public.write` (state-modifying), `@gl.public.write.payable` (state-modifying + receives native GEN). (full-documentation.txt:1886-1888, 4339)
- Optional lifecycle hooks: `@gl.public.write.payable def __receive__(self)` (value-only transfer, no method name) and `@gl.public.write[.payable] def __handle_undefined_method__(self, method_name, args, kwargs)`. (2617-2626, 3183-3195)

## Storage types

Persistent storage must use GenLayer's own container types, not built-in `list`/`dict`:

- `DynArray[T]` instead of `list[T]` (2115-2131)
- `TreeMap[K, V]` instead of `dict[K, V]` (2133-2150)
- `@allow_storage` decorator **stacked with `@dataclass`** on a class to make it storable — both are required; `@allow_storage` alone fails at runtime with a cryptic `object.__init__()` TypeError on construction (confirmed empirically; also documented at full-documentation.txt:6062, 2152-2166).
- Sized integers: `u256`, `u128`, `u64`, `u32`, `u8`, ... map to EVM `uint256`/`uint128`/etc. (2996)
- `Address` type: construct via `Address("0x...")`, `Address(bytes)`, or base64; `Address(initial_address)` pattern used for storage/constructor params (4405-4528). In direct-mode tests, fixtures like `direct_alice` are raw bytes, not `Address` — wrap with `Address(direct_alice)` before comparing to a contract-returned `str(agreement.creator)`.

## Caller / message context

Inside any method: `gl.message.sender_address` (caller — EOA or contract), `gl.message.origin_address` (original tx submitter, preserved through internal call chains), `gl.message.value` (u256, only populated in `@gl.public.write.payable` methods), `gl.message.contract_address`, `gl.message.chain_id`. (2714-2831)

Deploy detection: `gl.message_raw['is_init']` is true during `__init__`. (2741-2743)

## Timestamps

No special "block timestamp" call — use Python's `datetime`, which GenVM makes deterministic across the main execution path:

```python
from datetime import datetime, timezone
now_unix = int(datetime.now(timezone.utc).timestamp())
```
(2761-2798) Use unix-int seconds for all lock/deadline comparisons.

## Native GEN value

- `u256` denominated in wei (1 GEN = 10^18 wei). (2516)
- Receive: `@gl.public.write.payable` + read `gl.message.value`. (2518-2541)
- Read own balance: `self.balance` (write methods: live, reflects value just received; view methods: snapshot). (2591-2611)
- **Send to an EOA** (needed for any `withdraw()`-style payout to a human wallet): must go through the EVM contract-interface pattern because an EOA payout is an *external* message to the chain layer via the contract's ghost contract:

```python
@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass

# ... inside a @gl.public.write method:
_Recipient(Address(recipient_address)).emit_transfer(value=v)
```
(2567-2589, 2897) This executes on finalization and is irreversible once submitted — use a pull-withdrawal model with a zeroed internal ledger entry *before* calling `emit_transfer` (checks-effects-interactions) to prevent double withdrawal.

- Value to another Intelligent Contract uses `gl.get_contract_at(addr).emit_transfer(...)` / `.emit(value=..., on='finalized').method()`. (2543-2565) — not needed for a two-party stake contract with EOA payouts only.

## Non-deterministic web access

```python
response = gl.nondet.web.get(url)                     # GET request
response = gl.nondet.web.request(url, method='POST', body={...})  # general HTTP
html = gl.nondet.web.render(url, mode='html')          # JS-rendered DOM → HTML text
screenshot = gl.nondet.web.render(url, mode='screenshot')
```
- **`response.status`** (int; the docs prose says `status_code` in a couple of places but the actual SDK dataclass field, confirmed by reading `genlayer/gl/nondet/web.py` in the installed SDK cache, is `status`), `response.body` (bytes — decode with `.decode("utf-8")`).
- **Mandatory constraint**: `gl.nondet.web.*` and `gl.nondet.exec_prompt` may only be called *inside* a function invoked via `gl.eq_principle.*` or `gl.vm.run_nondet_unsafe`/`run_nondet` — never directly in a `@gl.public.write` method body, and never mixed with storage writes or contract calls in that same nondet function. (3408-3437, 5196)
- Choose `web.get`/`web.request` for official results pages that expose usable static/JSON text; reserve `web.render` for sources that require JS execution to produce the result in the DOM.
- Raw web content is untrusted/hostile data — never trust it as instructions, only as data to extract structured fields from.
- `gl.nondet.exec_prompt(prompt)` defaults to `response_format='text'` (returns `str`) on the real network. In **direct-mode tests**, `direct_vm.mock_llm(pattern, json_string)` auto-parses a JSON-shaped mock string and hands back a `dict`, not a `str` — contract code that calls `exec_prompt` must handle both `str` and `dict` return values to work correctly under direct-mode tests and on the real network.

## Equivalence Principle (validator consensus)

Three usable patterns, in increasing order of flexibility. **Partial field matching** (Pattern 1) is the right choice whenever settlement depends on a handful of structured, deterministic-comparable fields extracted from a messy page — exactly the case for a public results page:

```python
@gl.public.write
def settle(self, contest_id: int):
    def leader_fn():
        web_data = gl.nondet.web.get(committed_url)          # fetch
        prompt = f"... extract structured result JSON ..."
        response = gl.nondet.exec_prompt(prompt)              # LLM extraction
        raw = response if isinstance(response, dict) else json.loads(response)
        return raw                                            # structured dict — only this crosses into storage

    def validator_fn(leader_result) -> bool:
        if not isinstance(leader_result, gl.vm.Return):
            return False                                       # leader errored -> reject/disagree, safe
        validator_data = leader_fn()                           # validator INDEPENDENTLY re-fetches + re-extracts
        leader_data = leader_result.calldata
        return all(leader_data.get(f) == validator_data.get(f) for f in REQUIRED_FIELDS)
        # bounded rationale/free text field, if present, is deliberately excluded from comparison

    result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
    # deterministic code below re-validates `result` before any storage mutation
```
(5304-5350) `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` is the recommended primitive for custom leader/validator logic (5633-5637: "Custom leader/validator patterns (recommended)"). The validator receives a `gl.vm.Result`: check `isinstance(leader_result, gl.vm.Return)` before trusting `.calldata`; `gl.vm.UserError`/`gl.vm.VMError` on the leader side must be treated as reject-safe. (5684-5699)

`gl.eq_principle.strict_eq(fn)` and `gl.eq_principle.prompt_comparative(fn, principle=...)` exist as convenience wrappers but are not appropriate for numeric-rank settlement — `strict_eq` requires byte-identical output (wrong for live web pages / LLM wording) and `prompt_comparative` hands a natural-language verdict rather than the deterministic structured comparison a payout decision needs.

**Direct-mode testing of validator disagreement**: `direct_vm.run_validator(leader_result=<forged dict>, index=-1)` re-runs the most-recently-captured `validator_fn` against a forged leader result while the validator's own re-fetch still uses whatever mocks are currently set — this is the documented way to prove "a forged/divergent leader result is rejected" without needing genuinely different leader vs. validator network responses. (17331-17364)

## Error taxonomy

Official docs define and use exactly a four-category convention, as string prefixes on `gl.vm.UserError` messages compared inside `validator_fn`:

```python
ERROR_EXPECTED  = "[EXPECTED]"    # deterministic business-logic errors — must match exactly between leader/validator
ERROR_EXTERNAL  = "[EXTERNAL]"    # deterministic external-API errors (e.g. 4xx) — must match exactly
ERROR_TRANSIENT = "[TRANSIENT]"   # timeouts / 5xx — if both leader and validator hit transient errors, agree (retry later)
ERROR_LLM       = "[LLM_ERROR]"   # LLM/GenVM-level errors — always disagree, forces retry with different validators
```
(5644-5682) A contract-side helper (`_handle_leader_error` or equivalent) implements this comparison so no error path ever falls through to a state mutation that awards funds.

`raise gl.vm.UserError("message")` is the standard revert mechanism; catchable inside nondet blocks via `except gl.vm.UserError as e: e.message`. (2238-2286)

## Testing

**Direct mode** (in-memory, fastest, no server) — `pytest tests/direct/ -v`. Fixtures: `direct_vm`, `direct_deploy`, `direct_alice`, `direct_bob`, `direct_charlie`, `direct_owner`, `direct_accounts`. Mock nondet calls with `direct_vm.mock_web(url_regex, {"status":200,"body":...})` and `direct_vm.mock_llm(prompt_regex, json_string)`; assert reverts with `direct_vm.expect_revert("message")`; `direct_vm.clear_mocks()` between scenarios; set caller via `direct_vm.sender = direct_alice`; set payable value via `direct_vm.value = amount` before the call (reset to `0` after — it is NOT a call-site `value=` kwarg); advance the deterministic clock with `direct_vm.warp(iso_string)` (there is no `advance_time`). (4042-4108, 17160-17176)

**Integration mode** (real GenVM environment, JSON-RPC) — `gltest tests/integration/ -v -s [--network studionet]`. Uses `from gltest import get_contract_factory, get_default_account` and `from gltest.assertions import tx_execution_succeeded, tx_execution_failed`. `factory.deploy(args=[...])` returns a live contract handle; write calls return a tx object — `.transact()` to submit, assert with `tx_execution_succeeded(receipt)`; view calls use `.call()`. `gltest.types.MockedWebResponse` / `MockedLLMResponse` exist for integration-level mock injection when hosted retrieval isn't being exercised. (4110-4137, 16419-16545, 16601-17021)

**Lint** — `genvm-lint check contracts/<file>.py --json` after every contract change (installed locally as `genvm-linter`).

## Frontend (genlayer-js@1.1.8)

```ts
import { createClient, createAccount, isSuccessful } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

// Read-only / public browsing — no wallet required
const client = createClient({ chain: studionet });

const value = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'get_contest',
  args: [contestId],
});

// Wallet-backed write — injected provider (e.g. MetaMask) supplies the account
const client = createClient({ chain: studionet, account: createAccount() /* or from injected wallet */ });
const txId = await client.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: 'settle',
  args: [contestId],
  value: undefined, // only for payable calls (create/join funding)
});

const receipt = await client.waitForTransactionReceipt({ hash: txId, waitUntil: 'finalized' });
if (!isSuccessful(receipt)) { /* surface failure, do not claim success */ }
// then re-read authoritative state via readContract before showing the user anything as final
```
(9138-9469) Note (9510): once `writeContract` returns a tx ID, a client-side timeout is not evidence of failure — resume tracking that ID rather than blind-retrying (prevents duplicate submissions in the UI).

**Network — do not confuse with the RC preview:**

| | Stable Studionet (USE THIS) | Studio-dev preview (DO NOT USE) |
|---|---|---|
| RPC | `https://studio.genlayer.com/api` | `https://studio-dev.genlayer.com/api` |
| Chain ID | `61999` | `61997` |
| SDK | `genlayer-js@1.1.8`, chain export `studionet` | `genlayer-js@2.0.0-rc.1`, chain export `studioDevnet` |
