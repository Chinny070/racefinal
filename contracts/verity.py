# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from genlayer import *

# ---------------------------------------------------------------------------
# VERITY — constitution-bound authoritative event resolution
#
# Lifecycle:  CREATE -> MATCH -> WAIT -> FREEZE EVIDENCE -> ADJUDICATE
#             -> SETTLE -> WITHDRAW
# Safety:     MATCH -> cannot safely resolve -> deadline -> REFUND -> WITHDRAW
# ---------------------------------------------------------------------------

# ---- error taxonomy (see docs/GENLAYER_API_NOTES.md) ----
ERR_EXPECTED = "[EXPECTED]"
ERR_EXTERNAL = "[EXTERNAL]"
ERR_TRANSIENT = "[TRANSIENT]"
ERR_LLM = "[LLM_ERROR]"

# ---- outcome type ----
OUTCOME_TYPE_AWARD_WINNER = 0
OUTCOME_TYPE_COMPETITION_WINNER = 1

# ---- lifecycle status ----
STATUS_CREATED = 0          # created, awaiting counterparty
STATUS_MATCHED = 1          # both sides funded, awaiting event
STATUS_EVIDENCE_FROZEN = 2  # evidence retrieved & committed, awaiting adjudication
STATUS_SETTLED_A = 3        # creator wins
STATUS_SETTLED_B = 4        # counterparty wins
STATUS_REFUNDED = 5         # unresolved/invalid-event/timeout -> refunded
STATUS_CANCELLED = 6        # unmatched creator cancelled

# ---- semantic outcome (adjudication result) ----
SEMANTIC_CONFIRMED_TRUE = 0
SEMANTIC_CONFIRMED_FALSE = 1
SEMANTIC_UNRESOLVED = 2
SEMANTIC_INVALID_EVENT = 3


@allow_storage
@dataclass
class Constitution:
    """Truth-defining rules committed at CREATE, frozen before the result is known."""
    outcome_type: u8
    proposition: str
    subject: str
    event_category: str
    creator_position_yes: bool          # True = creator took YES, False = creator took NO
    stake_wei: u256
    source_host: str                    # required HTTPS host, e.g. "www.oscars.org"
    source_path_prefix: str             # required path prefix on that host
    canonical_source_url: str           # the exact precommitted URL evidence must be fetched from
    match_close_time: u256              # unix seconds; MATCH must occur at/after CREATE and before this
    event_not_before: u256              # unix seconds; resolution evidence must not be trusted before this
    resolution_deadline: u256           # unix seconds; after this, permissionless refund is allowed


@allow_storage
@dataclass
class Evidence:
    """Frozen evidence record — committed contract state, created before adjudication."""
    evidence_id: u256
    agreement_id: u256
    source_url: str                     # actual URL fetched (must match constitution policy)
    retrieval_method: str                # "get" | "render"
    frozen_at: u256                     # unix seconds
    raw_excerpt: str                    # small bounded excerpt for audit/UI (not full page)


@allow_storage
@dataclass
class Agreement:
    agreement_id: u256
    creator: Address
    counterparty: Address               # zero address until matched
    constitution: Constitution
    status: u8
    created_at: u256
    matched_at: u256
    creator_funded: bool
    counterparty_funded: bool
    evidence_id: u256                   # 0 = no evidence frozen yet (ids start at 1)
    has_evidence: bool
    semantic_outcome: u8
    resolved: bool
    winner: Address                     # zero address unless STATUS_SETTLED_A/B


def _zero_address() -> Address:
    return Address("0x0000000000000000000000000000000000000000")


def _now() -> u256:
    return u256(int(datetime.now(timezone.utc).timestamp()))


def _url_matches_policy(url: str, host: str, path_prefix: str) -> bool:
    """Conservative HTTPS host + path-prefix source validation. No source shopping after MATCH."""
    prefix = "https://" + host
    if not url.startswith(prefix):
        return False
    rest = url[len(prefix):]
    if rest and rest[0] not in ("/", "?", "#"):
        # e.g. host "example.com" must not match "example.com.evil.com"
        return False
    if path_prefix:
        path_start = "https://" + host + path_prefix
        if not url.startswith(path_start):
            return False
    # reject any fragment/query games that could be used to smuggle a different resource
    if ".." in url:
        return False
    return True


class Verity(gl.Contract):
    agreements: TreeMap[u256, Agreement]
    evidences: TreeMap[u256, Evidence]
    next_agreement_id: u256
    next_evidence_id: u256
    withdrawable: TreeMap[Address, u256]
    total_escrow: u256          # sum of all funded stakes not yet withdrawn (accounting conservation check)

    def __init__(self):
        self.next_agreement_id = u256(1)
        self.next_evidence_id = u256(1)
        self.total_escrow = u256(0)

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------
    @gl.public.write.payable
    def create_agreement(
        self,
        outcome_type: int,
        proposition: str,
        subject: str,
        event_category: str,
        creator_position_yes: bool,
        source_host: str,
        source_path_prefix: str,
        canonical_source_url: str,
        match_close_time: int,
        event_not_before: int,
        resolution_deadline: int,
    ) -> int:
        if outcome_type not in (OUTCOME_TYPE_AWARD_WINNER, OUTCOME_TYPE_COMPETITION_WINNER):
            raise gl.vm.UserError(f"{ERR_EXPECTED} INVALID_OUTCOME_TYPE")
        if len(proposition) == 0 or len(proposition) > 500:
            raise gl.vm.UserError(f"{ERR_EXPECTED} INVALID_PROPOSITION_LENGTH")
        if len(source_host) == 0 or not source_host.startswith("www.") and "." not in source_host:
            raise gl.vm.UserError(f"{ERR_EXPECTED} INVALID_SOURCE_HOST")
        if not canonical_source_url.startswith("https://"):
            raise gl.vm.UserError(f"{ERR_EXPECTED} SOURCE_MUST_BE_HTTPS")
        if not _url_matches_policy(canonical_source_url, source_host, source_path_prefix):
            raise gl.vm.UserError(f"{ERR_EXPECTED} SOURCE_URL_VIOLATES_POLICY")

        stake = gl.message.value
        if stake == u256(0):
            raise gl.vm.UserError(f"{ERR_EXPECTED} STAKE_REQUIRED")

        now = _now()
        if u256(match_close_time) <= now:
            raise gl.vm.UserError(f"{ERR_EXPECTED} MATCH_CLOSE_MUST_BE_FUTURE")
        if u256(event_not_before) < u256(match_close_time):
            raise gl.vm.UserError(f"{ERR_EXPECTED} EVENT_NOT_BEFORE_MUST_BE_AFTER_MATCH_CLOSE")
        if u256(resolution_deadline) <= u256(event_not_before):
            raise gl.vm.UserError(f"{ERR_EXPECTED} DEADLINE_MUST_BE_AFTER_EVENT")

        constitution = Constitution(
            outcome_type=u8(outcome_type),
            proposition=proposition,
            subject=subject,
            event_category=event_category,
            creator_position_yes=creator_position_yes,
            stake_wei=stake,
            source_host=source_host,
            source_path_prefix=source_path_prefix,
            canonical_source_url=canonical_source_url,
            match_close_time=u256(match_close_time),
            event_not_before=u256(event_not_before),
            resolution_deadline=u256(resolution_deadline),
        )

        agreement_id = self.next_agreement_id
        self.next_agreement_id = u256(int(self.next_agreement_id) + 1)

        self.agreements[agreement_id] = Agreement(
            agreement_id=agreement_id,
            creator=gl.message.sender_address,
            counterparty=_zero_address(),
            constitution=constitution,
            status=u8(STATUS_CREATED),
            created_at=now,
            matched_at=u256(0),
            creator_funded=True,
            counterparty_funded=False,
            evidence_id=u256(0),
            has_evidence=False,
            semantic_outcome=u8(SEMANTIC_UNRESOLVED),
            resolved=False,
            winner=_zero_address(),
        )

        self.withdrawable[gl.message.sender_address] = u256(
            int(self.withdrawable.get(gl.message.sender_address, u256(0))) + 0
        )
        self.total_escrow = u256(int(self.total_escrow) + int(stake))
        return int(agreement_id)

    # ------------------------------------------------------------------
    # MATCH
    # ------------------------------------------------------------------
    @gl.public.write.payable
    def join_agreement(self, agreement_id: int) -> None:
        agreement = self._get_agreement(u256(agreement_id))
        if int(agreement.status) != STATUS_CREATED:
            raise gl.vm.UserError(f"{ERR_EXPECTED} AGREEMENT_NOT_JOINABLE")
        if gl.message.sender_address == agreement.creator:
            raise gl.vm.UserError(f"{ERR_EXPECTED} CANNOT_SELF_MATCH")
        now = _now()
        if now >= agreement.constitution.match_close_time:
            raise gl.vm.UserError(f"{ERR_EXPECTED} MATCH_WINDOW_CLOSED")
        if gl.message.value != agreement.constitution.stake_wei:
            raise gl.vm.UserError(f"{ERR_EXPECTED} STAKE_MUST_EQUAL_CREATOR_STAKE")

        agreement.counterparty = gl.message.sender_address
        agreement.counterparty_funded = True
        agreement.status = u8(STATUS_MATCHED)
        agreement.matched_at = now
        self.agreements[u256(agreement_id)] = agreement

        self.total_escrow = u256(int(self.total_escrow) + int(gl.message.value))

    # ------------------------------------------------------------------
    # CANCEL (unmatched creator only)
    # ------------------------------------------------------------------
    @gl.public.write
    def cancel_unmatched(self, agreement_id: int) -> None:
        agreement = self._get_agreement(u256(agreement_id))
        if int(agreement.status) != STATUS_CREATED:
            raise gl.vm.UserError(f"{ERR_EXPECTED} AGREEMENT_NOT_CANCELLABLE")
        if gl.message.sender_address != agreement.creator:
            raise gl.vm.UserError(f"{ERR_EXPECTED} ONLY_CREATOR_CAN_CANCEL")

        agreement.status = u8(STATUS_CANCELLED)
        self.agreements[u256(agreement_id)] = agreement
        self._credit(agreement.creator, agreement.constitution.stake_wei)

    # ------------------------------------------------------------------
    # TIMEOUT / REFUND (permissionless, after resolution_deadline, no valid settlement)
    # ------------------------------------------------------------------
    @gl.public.write
    def refund_after_deadline(self, agreement_id: int) -> None:
        agreement = self._get_agreement(u256(agreement_id))
        if int(agreement.status) not in (STATUS_MATCHED, STATUS_EVIDENCE_FROZEN):
            raise gl.vm.UserError(f"{ERR_EXPECTED} NOT_REFUNDABLE_STATUS")
        if agreement.resolved:
            raise gl.vm.UserError(f"{ERR_EXPECTED} ALREADY_RESOLVED")
        now = _now()
        if now < agreement.constitution.resolution_deadline:
            raise gl.vm.UserError(f"{ERR_EXPECTED} DEADLINE_NOT_REACHED")

        agreement.status = u8(STATUS_REFUNDED)
        agreement.resolved = True
        self.agreements[u256(agreement_id)] = agreement

        stake = agreement.constitution.stake_wei
        self._credit(agreement.creator, stake)
        self._credit(agreement.counterparty, stake)

    # ------------------------------------------------------------------
    # WITHDRAW
    # ------------------------------------------------------------------
    @gl.public.write
    def withdraw(self) -> int:
        who = gl.message.sender_address
        amount = self.withdrawable.get(who, u256(0))
        if int(amount) == 0:
            raise gl.vm.UserError(f"{ERR_EXPECTED} NOTHING_TO_WITHDRAW")

        # checks-effects-interactions: zero the ledger before the external transfer
        self.withdrawable[who] = u256(0)
        self.total_escrow = u256(int(self.total_escrow) - int(amount))

        _Recipient(who).emit_transfer(value=amount)
        return int(amount)

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------
    def _get_agreement(self, agreement_id: u256) -> Agreement:
        agreement = self.agreements.get(agreement_id, None)
        if agreement is None:
            raise gl.vm.UserError(f"{ERR_EXPECTED} AGREEMENT_NOT_FOUND")
        return agreement

    def _credit(self, who: Address, amount: u256) -> None:
        current = self.withdrawable.get(who, u256(0))
        self.withdrawable[who] = u256(int(current) + int(amount))

    # ------------------------------------------------------------------
    # reads
    # ------------------------------------------------------------------
    @gl.public.view
    def get_agreement(self, agreement_id: int) -> str:
        agreement = self.agreements.get(u256(agreement_id), None)
        if agreement is None:
            raise gl.vm.UserError(f"{ERR_EXPECTED} AGREEMENT_NOT_FOUND")
        c = agreement.constitution
        return json.dumps({
            "agreement_id": int(agreement.agreement_id),
            "creator": str(agreement.creator),
            "counterparty": str(agreement.counterparty),
            "status": int(agreement.status),
            "created_at": int(agreement.created_at),
            "matched_at": int(agreement.matched_at),
            "evidence_id": int(agreement.evidence_id),
            "has_evidence": agreement.has_evidence,
            "semantic_outcome": int(agreement.semantic_outcome),
            "resolved": agreement.resolved,
            "winner": str(agreement.winner),
            "constitution": {
                "outcome_type": int(c.outcome_type),
                "proposition": c.proposition,
                "subject": c.subject,
                "event_category": c.event_category,
                "creator_position_yes": c.creator_position_yes,
                "stake_wei": int(c.stake_wei),
                "source_host": c.source_host,
                "source_path_prefix": c.source_path_prefix,
                "canonical_source_url": c.canonical_source_url,
                "match_close_time": int(c.match_close_time),
                "event_not_before": int(c.event_not_before),
                "resolution_deadline": int(c.resolution_deadline),
            },
        }, sort_keys=True)

    @gl.public.view
    def get_evidence(self, evidence_id: int) -> str:
        evidence = self.evidences.get(u256(evidence_id), None)
        if evidence is None:
            raise gl.vm.UserError(f"{ERR_EXPECTED} EVIDENCE_NOT_FOUND")
        return json.dumps({
            "evidence_id": int(evidence.evidence_id),
            "agreement_id": int(evidence.agreement_id),
            "source_url": evidence.source_url,
            "retrieval_method": evidence.retrieval_method,
            "frozen_at": int(evidence.frozen_at),
            "raw_excerpt": evidence.raw_excerpt,
        }, sort_keys=True)

    @gl.public.view
    def get_withdrawable(self, who: str) -> int:
        return int(self.withdrawable.get(Address(who), u256(0)))

    @gl.public.view
    def get_total_escrow(self) -> int:
        return int(self.total_escrow)

    @gl.public.view
    def get_next_agreement_id(self) -> int:
        return int(self.next_agreement_id)


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass
