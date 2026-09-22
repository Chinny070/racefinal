"""
RACE//FINAL direct-mode tests — lifecycle (create/match/cancel/refund/withdraw)
and settlement (GenVM web + validator consensus, deterministic rank comparison).

Architecture invariant under test throughout: `settle(contest_id)` is the ONLY
resolution entry point and takes no result/rank/winner/URL from the caller.
GenVM (leader + independent validator) fetches the committed URL and extracts
structured facts itself; deterministic code only ever acts on values that
survived validator consensus, and derives A_WINS/B_WINS/TIE purely from
comparing the two independently-extracted ranks.
"""
import json
import time
from datetime import datetime, timedelta, timezone

import pytest


def _addr(raw) -> str:
    from genlayer.py.types import Address
    return str(Address(raw))


def _warp_to(direct_vm, unix_ts):
    direct_vm.warp(datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat())


def _times(direct_vm=None, offset_match=60, offset_settle=120, offset_deadline=36000):
    if direct_vm is not None:
        now = int(datetime.fromisoformat(direct_vm._datetime).timestamp())
    else:
        now = int(time.time())
    return now + offset_match, now + offset_settle, now + offset_deadline


SOURCE_URL = "https://results.marathon-example.org/2026/final"


def _create_args(match_close, settle_after, deadline,
                  a_id="BIB-101", b_id="BIB-202", event_id="MARATHON-2026-FINAL",
                  host="results.marathon-example.org", path="/2026",
                  url=SOURCE_URL, method="get"):
    return [
        a_id, b_id, event_id,
        host, path, url, method,
        match_close, settle_after, deadline,
    ]


def _create_and_match(contract, direct_vm, alice, bob, stake=10**18, **kwargs):
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = alice
    direct_vm.value = stake
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline, **kwargs))
    direct_vm.value = 0

    direct_vm.sender = bob
    direct_vm.value = stake
    contract.join_contest(contest_id)
    direct_vm.value = 0

    _warp_to(direct_vm, settle_after + 1)
    return contest_id


def _mock_result(direct_vm, source_ok=True, event_match=True, is_final=True,
                  a_found=True, b_found=True, a_rank=1, b_rank=2, status=200):
    direct_vm.mock_web(r".*marathon-example\.org.*", {"status": status, "body": "<html>results</html>"})
    payload = {
        "source_ok": source_ok,
        "event_match": event_match,
        "is_final": is_final,
        "participant_a_found": a_found,
        "participant_b_found": b_found,
        "participant_a_rank": a_rank,
        "participant_b_rank": b_rank,
    }
    direct_vm.mock_llm(r".*", json.dumps(payload))


# ---------------------------------------------------------------------------
# Phase 1 — deterministic lifecycle
# ---------------------------------------------------------------------------

def test_create_contest(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    assert contest_id == 1

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 0
    assert data["creator"] == _addr(direct_alice)
    assert data["participant_a_id"] == "BIB-101"
    assert data["participant_b_id"] == "BIB-202"
    assert data["stake_wei"] == 10**18
    assert data["canonical_source_url"] == SOURCE_URL


def test_create_rejects_zero_stake(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("STAKE_REQUIRED"):
        contract.create_contest(*_create_args(match_close, settle_after, deadline))


def test_create_rejects_same_participant_ids(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    with direct_vm.expect_revert("PARTICIPANTS_MUST_DIFFER"):
        contract.create_contest(*_create_args(match_close, settle_after, deadline, a_id="X", b_id="X"))
    direct_vm.value = 0


def test_create_rejects_non_https_source(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    with direct_vm.expect_revert("SOURCE_MUST_BE_HTTPS"):
        contract.create_contest(*_create_args(
            match_close, settle_after, deadline,
            url="http://results.marathon-example.org/2026/final",
        ))
    direct_vm.value = 0


def test_create_rejects_source_outside_policy(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    with direct_vm.expect_revert("SOURCE_URL_VIOLATES_POLICY"):
        contract.create_contest(*_create_args(
            match_close, settle_after, deadline,
            host="results.marathon-example.org", path="/2026",
            url="https://evil.example.com/2026/final",
        ))
    direct_vm.value = 0


def test_create_rejects_invalid_retrieval_method(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    with direct_vm.expect_revert("INVALID_RETRIEVAL_METHOD"):
        contract.create_contest(*_create_args(match_close, settle_after, deadline, method="scrape"))
    direct_vm.value = 0


def test_join_contest_equal_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 1
    assert data["counterparty"] == _addr(direct_bob)
    # Immutability: committed terms are unchanged by matching.
    assert data["participant_a_id"] == "BIB-101"
    assert data["participant_b_id"] == "BIB-202"
    assert data["canonical_source_url"] == SOURCE_URL
    assert data["stake_wei"] == 10**18


def test_join_rejects_self_match(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 10**18
    with direct_vm.expect_revert("CANNOT_SELF_MATCH"):
        contract.join_contest(contest_id)
    direct_vm.value = 0


def test_join_rejects_wrong_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.sender = direct_bob
    direct_vm.value = 2 * 10**18
    with direct_vm.expect_revert("STAKE_MUST_EQUAL_CREATOR_STAKE"):
        contract.join_contest(contest_id)
    direct_vm.value = 0


def test_join_rejects_duplicate_match(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie
    direct_vm.value = 10**18
    with direct_vm.expect_revert("CONTEST_NOT_JOINABLE"):
        contract.join_contest(contest_id)
    direct_vm.value = 0


def test_cancel_unmatched(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    contract.cancel_unmatched(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 6
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18


def test_cancel_rejects_non_creator(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ONLY_CREATOR_CAN_CANCEL"):
        contract.cancel_unmatched(contest_id)


def test_cancel_rejects_already_matched(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("CONTEST_NOT_CANCELLABLE"):
        contract.cancel_unmatched(contest_id)


def test_refund_before_deadline_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    with direct_vm.expect_revert("DEADLINE_NOT_REACHED"):
        contract.refund_after_deadline(contest_id)


def test_refund_after_deadline_is_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm, offset_match=1, offset_settle=2, offset_deadline=3)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    direct_vm.sender = direct_bob
    direct_vm.value = 10**18
    contract.join_contest(contest_id)
    direct_vm.value = 0

    _warp_to(direct_vm, deadline + 1)
    direct_vm.sender = direct_charlie  # anyone can trigger the permissionless refund
    contract.refund_after_deadline(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 5
    assert data["resolved"] is True
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 10**18


def test_withdraw_pays_out_and_clears_ledger(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    contract.cancel_unmatched(contest_id)

    amount = contract.withdraw()
    assert amount == 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0


def test_double_withdraw_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    contract.cancel_unmatched(contest_id)
    contract.withdraw()
    with direct_vm.expect_revert("NOTHING_TO_WITHDRAW"):
        contract.withdraw()


# ---------------------------------------------------------------------------
# Phase 2 — settlement: GenVM web + validator consensus, deterministic ranks
# ---------------------------------------------------------------------------

def test_settle_signature_accepts_only_contest_id():
    import ast
    tree = ast.parse(open("contracts/race_final.py", encoding="utf-8").read())
    settle_fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "RaceFinal":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "settle":
                    settle_fn = item
    assert settle_fn is not None, "settle() method not found"
    arg_names = [a.arg for a in settle_fn.args.args]
    assert arg_names == ["self", "contest_id"], (
        "settle() must not accept any result/rank/winner/URL parameter"
    )


def test_settle_rejects_caller_supplied_rank(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(contest_id, participant_a_rank=1)


def test_settle_rejects_caller_supplied_winner(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(contest_id, winner=_addr(direct_alice))


def test_settle_rejects_caller_supplied_source_url(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(contest_id, source_url="https://attacker.example.com/fake")


def test_settle_before_settle_after_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    match_close, settle_after, deadline = _times(direct_vm, offset_match=1, offset_settle=3600, offset_deadline=7200)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    contest_id = contract.create_contest(*_create_args(match_close, settle_after, deadline))
    direct_vm.value = 0
    direct_vm.sender = direct_bob
    direct_vm.value = 10**18
    contract.join_contest(contest_id)
    direct_vm.value = 0

    _mock_result(direct_vm)
    with direct_vm.expect_revert("SETTLEMENT_TOO_EARLY"):
        contract.settle(contest_id)


def test_validator_rejects_forged_leader_result(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    # Ground truth behind the mock: B wins (lower rank).
    _mock_result(direct_vm, a_rank=5, b_rank=1)
    contract.settle(contest_id)  # succeeds honestly, captures a validator

    forged_a_wins = {
        "source_ok": True, "event_match": True, "is_final": True,
        "participant_a_found": True, "participant_b_found": True,
        "participant_a_rank": 1, "participant_b_rank": 5,
    }
    assert direct_vm.run_validator(leader_result=forged_a_wins) is False


def test_leader_says_a_wins_validator_independently_finds_b_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, a_rank=5, b_rank=1)  # ground truth: B wins
    contract.settle(contest_id)

    forged_a_wins = {
        "source_ok": True, "event_match": True, "is_final": True,
        "participant_a_found": True, "participant_b_found": True,
        "participant_a_rank": 1, "participant_b_rank": 5,
    }
    assert direct_vm.run_validator(leader_result=forged_a_wins) is False

    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is True
    assert data["status"] == 3  # CONTEST_SETTLED_B (from the honest settle above)
    assert data["winner"] == _addr(direct_bob)


def test_malformed_llm_json_causes_no_payout(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.mock_web(r".*marathon-example\.org.*", {"status": 200, "body": "<html>results</html>"})
    direct_vm.mock_llm(r".*", "not valid json {{{")

    with direct_vm.expect_revert("LLM_ERROR:"):
        contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False
    assert data["status"] == 1
    assert contract.get_total_escrow() == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0
    assert contract.get_withdrawable(_addr(direct_bob)) == 0


def test_negative_rank_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, a_rank=-1, b_rank=2)
    with direct_vm.expect_revert("LLM_ERROR:"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False


def test_preliminary_result_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, is_final=False)
    with direct_vm.expect_revert("RESULTS_NOT_FINAL"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False
    assert data["status"] == 1


def test_event_mismatch_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, event_match=False)
    with direct_vm.expect_revert("RESULTS_NOT_FINAL"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False


def test_source_unusable_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, source_ok=False)
    with direct_vm.expect_revert("RESULTS_NOT_FINAL"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False


def test_participant_a_not_found_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, a_found=False)
    with direct_vm.expect_revert("PARTICIPANT_NOT_FOUND_A"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False


def test_participant_b_not_found_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_result(direct_vm, b_found=False)
    with direct_vm.expect_revert("PARTICIPANT_NOT_FOUND_B"):
        contract.settle(contest_id)
    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False


def test_transient_failure_then_successful_retry_settles_exactly_once(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.mock_web(r".*marathon-example\.org.*", {"status": 503, "body": "Service Unavailable"})
    with direct_vm.expect_revert("TRANSIENT:"):
        contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is False
    assert data["status"] == 1  # still MATCHED -> retryable
    assert contract.get_total_escrow() == 2 * 10**18

    direct_vm.clear_mocks()
    _mock_result(direct_vm, a_rank=1, b_rank=2)  # A wins
    contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["resolved"] is True
    assert data["status"] == 2  # CONTEST_SETTLED_A

    with direct_vm.expect_revert("CONTEST_NOT_SETTLEABLE"):
        contract.settle(contest_id)


def test_tie_refunds_exactly_original_stake_each(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, stake=10**18)
    _mock_result(direct_vm, a_rank=3, b_rank=3)  # equal rank -> tie

    contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 4  # CONTEST_TIE
    assert data["resolved"] is True
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 10**18
    assert contract.get_total_escrow() == 2 * 10**18  # not yet withdrawn


def test_a_wins_lower_rank_credits_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, stake=10**18)
    _mock_result(direct_vm, a_rank=1, b_rank=4)  # A has the lower (better) rank

    contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 2  # CONTEST_SETTLED_A
    assert data["winner"] == _addr(direct_alice)
    assert data["result"]["participant_a_rank"] == 1
    assert data["result"]["participant_b_rank"] == 4
    assert contract.get_withdrawable(_addr(direct_alice)) == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 0


def test_b_wins_lower_rank_credits_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/race_final.py")
    contest_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, stake=10**18)
    _mock_result(direct_vm, a_rank=9, b_rank=2)  # B has the lower (better) rank

    contract.settle(contest_id)

    data = json.loads(contract.get_contest(contest_id))
    assert data["status"] == 3  # CONTEST_SETTLED_B
    assert data["winner"] == _addr(direct_bob)
    assert contract.get_withdrawable(_addr(direct_bob)) == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0


def test_total_withdrawable_never_exceeds_escrow(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner):
    contract = direct_deploy("contracts/race_final.py")

    c1 = _create_and_match(contract, direct_vm, direct_alice, direct_bob, stake=10**18)
    _mock_result(direct_vm, a_rank=1, b_rank=2)  # A wins
    contract.settle(c1)

    c2 = _create_and_match(contract, direct_vm, direct_bob, direct_charlie, stake=2 * 10**18)
    _mock_result(direct_vm, a_rank=5, b_rank=5)  # tie
    contract.settle(c2)

    c3 = _create_and_match(contract, direct_vm, direct_charlie, direct_owner, stake=10**18)
    _mock_result(direct_vm, a_rank=7, b_rank=1)  # counterparty (owner) wins
    contract.settle(c3)

    total_withdrawable = (
        contract.get_withdrawable(_addr(direct_alice))
        + contract.get_withdrawable(_addr(direct_bob))
        + contract.get_withdrawable(_addr(direct_charlie))
        + contract.get_withdrawable(_addr(direct_owner))
    )
    assert total_withdrawable == contract.get_total_escrow()
    assert total_withdrawable == (2 * 10**18) + (4 * 10**18) + (2 * 10**18)
