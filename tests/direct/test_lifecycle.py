import json
import time
from datetime import datetime, timedelta, timezone

import pytest


def _addr(raw) -> str:
    # genlayer's SDK path is only wired onto sys.path once direct_deploy has
    # run (see gltest.direct.sdk_loader.setup_sdk_paths), so import lazily.
    from genlayer.py.types import Address
    return str(Address(raw))


def _warp_forward(direct_vm, seconds):
    future = datetime.now(timezone.utc) + timedelta(seconds=seconds)
    direct_vm.warp(future.isoformat())


def _with_value(direct_vm, amount):
    direct_vm.value = amount


def _times(offset_match=3600, offset_event=7200, offset_deadline=14400):
    now = int(time.time())
    return now + offset_match, now + offset_event, now + offset_deadline


def _create_args(match_close=None, event_not_before=None, deadline=None,
                  outcome_type=0, creator_yes=True,
                  host="www.oscars.org", path="/results",
                  url="https://www.oscars.org/results/best-picture"):
    if match_close is None:
        match_close, event_not_before, deadline = _times()
    return [
        outcome_type,
        "Film X wins Best Picture",
        "Film X",
        "AWARD_SHOW",
        creator_yes,
        host,
        path,
        url,
        match_close,
        event_not_before,
        deadline,
    ]


def _create(contract, direct_vm, sender, value=10**18, **kwargs):
    direct_vm.sender = sender
    _with_value(direct_vm, value)
    agreement_id = contract.create_agreement(*_create_args(**kwargs))
    _with_value(direct_vm, 0)
    return agreement_id


def _join(contract, direct_vm, sender, agreement_id, value=10**18):
    direct_vm.sender = sender
    _with_value(direct_vm, value)
    contract.join_agreement(agreement_id)
    _with_value(direct_vm, 0)


def test_create_agreement(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    match_close, event_not_before, deadline = _times()

    agreement_id = _create(contract, direct_vm, direct_alice,
                            match_close=match_close, event_not_before=event_not_before, deadline=deadline)
    assert agreement_id == 1

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 0
    assert data["creator"] == _addr(direct_alice)
    assert data["constitution"]["stake_wei"] == 10**18
    assert data["constitution"]["canonical_source_url"] == "https://www.oscars.org/results/best-picture"


def test_create_rejects_zero_stake(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    with direct_vm.expect_revert("STAKE_REQUIRED"):
        _create(contract, direct_vm, direct_alice, value=0)


def test_create_rejects_non_https_source(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    with direct_vm.expect_revert("SOURCE_MUST_BE_HTTPS"):
        _create(contract, direct_vm, direct_alice, url="http://www.oscars.org/results/best-picture")


def test_create_rejects_source_outside_policy(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    with direct_vm.expect_revert("SOURCE_URL_VIOLATES_POLICY"):
        _create(contract, direct_vm, direct_alice,
                host="www.oscars.org", path="/results", url="https://www.evil.com/results/best-picture")


def test_join_agreement_equal_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    _join(contract, direct_vm, direct_bob, agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 1
    assert data["counterparty"] == _addr(direct_bob)


def test_join_rejects_self_match(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    with direct_vm.expect_revert("CANNOT_SELF_MATCH"):
        _join(contract, direct_vm, direct_alice, agreement_id)


def test_join_rejects_wrong_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    with direct_vm.expect_revert("STAKE_MUST_EQUAL_CREATOR_STAKE"):
        _join(contract, direct_vm, direct_bob, agreement_id, value=2 * 10**18)


def test_join_rejects_duplicate_match(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    _join(contract, direct_vm, direct_bob, agreement_id)
    with direct_vm.expect_revert("AGREEMENT_NOT_JOINABLE"):
        _join(contract, direct_vm, direct_charlie, agreement_id)


def test_cancel_unmatched(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.cancel_unmatched(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 6
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18


def test_cancel_rejects_non_creator(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ONLY_CREATOR_CAN_CANCEL"):
        contract.cancel_unmatched(agreement_id)


def test_cancel_rejects_already_matched(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    _join(contract, direct_vm, direct_bob, agreement_id)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("AGREEMENT_NOT_CANCELLABLE"):
        contract.cancel_unmatched(agreement_id)


def test_refund_before_deadline_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    _join(contract, direct_vm, direct_bob, agreement_id)
    with direct_vm.expect_revert("DEADLINE_NOT_REACHED"):
        contract.refund_after_deadline(agreement_id)


def test_refund_after_deadline_is_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/verity.py")
    match_close, event_not_before, deadline = _times(offset_match=1, offset_event=2, offset_deadline=3)
    agreement_id = _create(contract, direct_vm, direct_alice,
                            match_close=match_close, event_not_before=event_not_before, deadline=deadline)
    _join(contract, direct_vm, direct_bob, agreement_id)

    _warp_forward(direct_vm, 10)
    direct_vm.sender = direct_charlie  # anyone can trigger the permissionless refund
    contract.refund_after_deadline(agreement_id)

    data = json.loads(contract.get_agreement(agreement_id))
    assert data["status"] == 5
    assert data["resolved"] is True
    assert contract.get_withdrawable(_addr(direct_alice)) == 10**18
    assert contract.get_withdrawable(_addr(direct_bob)) == 10**18


def test_refund_rejected_if_already_resolved(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    match_close, event_not_before, deadline = _times(offset_match=1, offset_event=2, offset_deadline=3)
    agreement_id = _create(contract, direct_vm, direct_alice,
                            match_close=match_close, event_not_before=event_not_before, deadline=deadline)
    _join(contract, direct_vm, direct_bob, agreement_id)
    _warp_forward(direct_vm, 10)
    contract.refund_after_deadline(agreement_id)
    with direct_vm.expect_revert("NOT_REFUNDABLE_STATUS"):
        contract.refund_after_deadline(agreement_id)


def test_withdraw_pays_out_and_clears_ledger(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.cancel_unmatched(agreement_id)

    amount = contract.withdraw()
    assert amount == 10**18
    assert contract.get_withdrawable(_addr(direct_alice)) == 0


def test_withdraw_rejects_when_nothing_owed(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("NOTHING_TO_WITHDRAW"):
        contract.withdraw()


def test_double_withdraw_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/verity.py")
    agreement_id = _create(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    contract.cancel_unmatched(agreement_id)
    contract.withdraw()
    with direct_vm.expect_revert("NOTHING_TO_WITHDRAW"):
        contract.withdraw()


def test_accounting_conservation_on_refund(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/verity.py")
    match_close, event_not_before, deadline = _times(offset_match=1, offset_event=2, offset_deadline=3)
    agreement_id = _create(contract, direct_vm, direct_alice,
                            match_close=match_close, event_not_before=event_not_before, deadline=deadline)
    _join(contract, direct_vm, direct_bob, agreement_id)
    assert contract.get_total_escrow() == 2 * 10**18

    _warp_forward(direct_vm, 10)
    contract.refund_after_deadline(agreement_id)

    direct_vm.sender = direct_alice
    contract.withdraw()
    direct_vm.sender = direct_bob
    contract.withdraw()
    assert contract.get_total_escrow() == 0
