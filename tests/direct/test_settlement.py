"""
Phase 2 — mocked settlement state machine.

Architecture invariant under test throughout this file: `settle(agreement_id)`
is the ONLY resolution entry point and takes no evidence/rank/winner/URL from
the caller. GenVM (leader + independent validator) fetches the committed URL
and extracts structured facts itself; deterministic code only ever acts on
values that survived validator consensus.
"""
import inspect
import json
import time
from datetime import datetime, timedelta, timezone

import pytest


def _addr(raw) -> str:
    from genlayer.py.types import Address
    return str(Address(raw))


def _warp_forward(direct_vm, seconds):
    future = datetime.now(timezone.utc) + timedelta(seconds=seconds)
    direct_vm.warp(future.isoformat())


def _warp_to(direct_vm, unix_ts):
    direct_vm.warp(datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat())


def _times(direct_vm=None, offset_match=60, offset_event=120, offset_deadline=36000):
    if direct_vm is not None:
        now = int(datetime.fromisoformat(direct_vm._datetime).timestamp())
    else:
        now = int(time.time())
    return now + offset_match, now + offset_event, now + offset_deadline


SOURCE_URL = "https://www.oscars.org/results/best-picture"


def _create_args(match_close, event_not_before, deadline, creator_yes=True):
    return [
        0,  # AWARD_WINNER
        "Film X wins Best Picture",
        "Film X",
        "AWARD_SHOW",
        creator_yes,
        "www.oscars.org",
        "/results",
        SOURCE_URL,
        match_close,
        event_not_before,
        deadline,
    ]


def _create_and_match(contract, direct_vm, alice, bob, creator_yes=True, stake=10**18):
    match_close, event_not_before, deadline = _times(direct_vm)
    direct_vm.sender = alice
    direct_vm.value = stake
    agreement_id = contract.create_agreement(*_create_args(match_close, event_not_before, deadline, creator_yes))
    direct_vm.value = 0

    direct_vm.sender = bob
    direct_vm.value = stake
    contract.join_agreement(agreement_id)
    direct_vm.value = 0

    _warp_to(direct_vm, event_not_before + 1)  # pass event_not_before, absolute
    return agreement_id


def _mock_extraction(direct_vm, source_ok=True, event_match=True, is_final=True,
                      is_tie=False, proposition_true=True, status=200):
    direct_vm.mock_web(r".*oscars\.org.*", {"status": status, "body": "<html>result page</html>"})
    payload = {
        "source_ok": source_ok,
        "event_match": event_match,
        "is_final": is_final,
        "is_tie": is_tie,
        "proposition_true": proposition_true,
    }
    direct_vm.mock_llm(r".*", json.dumps(payload))


# ---------------------------------------------------------------------------
# 1-4: caller cannot supply rank / winner / URL — proven at the signature
# level, since settle() takes only agreement_id. Any attempt to pass extra
# settlement-controlling arguments must fail before any contract logic runs.
# ---------------------------------------------------------------------------

def test_settle_signature_accepts_only_agreement_id():
    import ast
    tree = ast.parse(open("contracts/verity.py", encoding="utf-8").read())
    settle_fn = None
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Verity":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "settle":
                    settle_fn = item
    assert settle_fn is not None, "settle() method not found"
    arg_names = [a.arg for a in settle_fn.args.args]
    assert arg_names == ["self", "agreement_id"], (
        "settle() must not accept any evidence/rank/winner/URL parameter"
    )


def test_settle_rejects_caller_supplied_participant_a_rank(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(agreement_id, participant_a_rank=1)


def test_settle_rejects_caller_supplied_winner(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(agreement_id, winner=_addr(direct_alice))


def test_settle_rejects_caller_supplied_source_url(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm)
    with pytest.raises(TypeError):
        contract.settle(agreement_id, source_url="https://attacker.example.com/fake")


# ---------------------------------------------------------------------------
# 5 & 7: mocked leader result alone is insufficient if the independently
# re-running validator rejects it (proven via the documented
# direct_vm.run_validator override, which runs the captured validator_fn
# against a forged leader_result while the validator's own re-fetch still
# uses the real mocks).
# ---------------------------------------------------------------------------

def test_validator_rejects_forged_leader_result(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    # Real (honest) data behind the mock: B wins (proposition_true=False).
    _mock_extraction(direct_vm, proposition_true=False)
    contract.settle(agreement_id)  # captures a validator for run_validator() below

    # A forged leader claiming proposition_true=True (creator/A wins) must be
    # rejected by the validator, which independently re-fetches the real data.
    forged_leader_result = {
        "source_ok": True, "event_match": True, "is_final": True,
        "is_tie": False, "proposition_true": True,
    }
    agreed = direct_vm.run_validator(leader_result=forged_leader_result)
    assert agreed is False


def test_leader_says_a_wins_validator_independently_finds_b_wins(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm, proposition_true=False)  # ground truth: B wins
    contract.settle(agreement_id)  # succeeds honestly, captures a validator

    forged_a_wins = {
        "source_ok": True, "event_match": True, "is_final": True,
        "is_tie": False, "proposition_true": True,
    }
    assert direct_vm.run_validator(leader_result=forged_a_wins) is False

    # The real settlement (from the honest call above) correctly favored B.
    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is True
    assert data["status"] == 3  # STATUS_SETTLED_B
    assert data["winner"] == _addr(direct_bob)


# ---------------------------------------------------------------------------
# 6: malformed leader JSON -> no payout, agreement stays retryable.
# ---------------------------------------------------------------------------

def test_malformed_llm_json_causes_no_payout(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.mock_web(r".*oscars\.org.*", {"status": 200, "body": "<html>result page</html>"})
    direct_vm.mock_llm(r".*", "not valid json {{{")

    with direct_vm.expect_revert("LLM_ERROR"):
        contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is False
    assert data["status"] == 1
    assert contract.get_total_escrow() == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0
    assert contract.get_withdrawable(_addr(direct_bob)) == 0


# ---------------------------------------------------------------------------
# 8: source reports LIVE/preliminary (is_final=False) -> no settlement.
# ---------------------------------------------------------------------------

def test_preliminary_result_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm, is_final=False)

    with direct_vm.expect_revert("UNRESOLVED_RETRY_LATER"):
        contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is False
    assert data["status"] == 1


def test_event_mismatch_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm, event_match=False)

    with direct_vm.expect_revert("UNRESOLVED_RETRY_LATER"):
        contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is False


def test_source_unusable_does_not_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)
    _mock_extraction(direct_vm, source_ok=False)

    with direct_vm.expect_revert("UNRESOLVED_RETRY_LATER"):
        contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is False


def test_settle_before_event_not_before_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    match_close, event_not_before, deadline = _times(offset_match=1, offset_event=3600, offset_deadline=7200)
    direct_vm.sender = direct_alice
    direct_vm.value = 10**18
    agreement_id = contract.create_agreement(*_create_args(match_close, event_not_before, deadline))
    direct_vm.value = 0
    direct_vm.sender = direct_bob
    direct_vm.value = 10**18
    contract.join_agreement(agreement_id)
    direct_vm.value = 0

    _mock_extraction(direct_vm)
    with direct_vm.expect_revert("SETTLEMENT_TOO_EARLY"):
        contract.settle(agreement_id)


# ---------------------------------------------------------------------------
# 9 & 10: temporary web failure -> retryable; successful retry settles
# exactly once.
# ---------------------------------------------------------------------------

def test_transient_failure_then_successful_retry_settles_exactly_once(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.mock_web(r".*oscars\.org.*", {"status": 503, "body": "Service Unavailable"})
    with direct_vm.expect_revert("TRANSIENT"):
        contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is False
    assert data["status"] == 1  # still MATCHED -> retryable
    assert contract.get_total_escrow() == 2 * 10**18

    direct_vm.clear_mocks()
    _mock_extraction(direct_vm, proposition_true=True)
    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["resolved"] is True
    assert data["status"] == 2  # STATUS_SETTLED_A

    with direct_vm.expect_revert("AGREEMENT_NOT_SETTLEABLE"):
        contract.settle(agreement_id)


# ---------------------------------------------------------------------------
# 11: tie credits exactly one original stake to each side.
# ---------------------------------------------------------------------------

def test_tie_refunds_exactly_original_stake_each(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, stake=10**18)
    _mock_extraction(direct_vm, is_tie=True)

    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 4  # STATUS_TIE
    assert data["resolved"] is True
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 10**18
    assert contract.get_total_escrow() == 2 * 10**18  # not yet withdrawn


# ---------------------------------------------------------------------------
# 12: successful A/B result credits exactly the total escrow to the correct side.
# ---------------------------------------------------------------------------

def test_creator_yes_true_creator_wins_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, creator_yes=True, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=True)

    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 2  # STATUS_SETTLED_A
    assert data["winner"] == _addr(direct_alice)
    assert contract.get_withdrawable(_addr(direct_alice)) == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 0


def test_creator_yes_false_counterparty_wins_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, creator_yes=True, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=False)

    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 3  # STATUS_SETTLED_B
    assert data["winner"] == _addr(direct_bob)
    assert contract.get_withdrawable(_addr(direct_bob)) == 2 * 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0


def test_creator_no_false_creator_wins_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, creator_yes=False, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=False)

    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 2  # STATUS_SETTLED_A (creator wins)
    assert data["winner"] == _addr(direct_alice)
    assert contract.get_withdrawable(_addr(direct_alice)) == 2 * 10**18


def test_creator_no_true_counterparty_wins_full_pot(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create_and_match(contract, direct_vm, direct_alice, direct_bob, creator_yes=False, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=True)

    contract.settle(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 3  # STATUS_SETTLED_B (counterparty wins)
    assert data["winner"] == _addr(direct_bob)
    assert contract.get_withdrawable(_addr(direct_bob)) == 2 * 10**18


# ---------------------------------------------------------------------------
# 13: total withdrawable balances never exceed escrow, across many outcomes.
# ---------------------------------------------------------------------------

def test_total_withdrawable_never_exceeds_escrow(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner):
    contract = direct_deploy("contracts/verity.py")

    a1 = _create_and_match(contract, direct_vm, direct_alice, direct_bob, creator_yes=True, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=True)
    contract.settle(a1)

    a2 = _create_and_match(contract, direct_vm, direct_bob, direct_charlie, creator_yes=True, stake=2 * 10**18)
    _mock_extraction(direct_vm, is_tie=True)
    contract.settle(a2)

    a3 = _create_and_match(contract, direct_vm, direct_charlie, direct_owner, creator_yes=False, stake=10**18)
    _mock_extraction(direct_vm, proposition_true=True)  # counterparty (owner) wins
    contract.settle(a3)

    total_withdrawable = (
        contract.get_withdrawable(_addr(direct_alice))
        + contract.get_withdrawable(_addr(direct_bob))
        + contract.get_withdrawable(_addr(direct_charlie))
        + contract.get_withdrawable(_addr(direct_owner))
    )
    assert total_withdrawable == contract.get_total_escrow()
    assert total_withdrawable == (2 * 10**18) + (4 * 10**18) + (2 * 10**18)
