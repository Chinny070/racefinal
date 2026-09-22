# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
#
# Test-only contract. Proves nothing about RACE//FINAL's product logic --
# it exists solely to demonstrate, in isolation, that gl.nondet.web.get()
# called from inside a deployed Intelligent Contract performs a genuine
# outbound network request. See tests/integration/test_live_web_settlement.py
# and docs/LIVE_WEB_VERIFICATION.md ("PROOF 1 -- TRANSPORT").

from genlayer import *


class TransportProbe(gl.Contract):
    last_status: u32
    last_body_length: u32

    def __init__(self):
        self.last_status = u32(0)
        self.last_body_length = u32(0)

    @gl.public.write
    def probe(self, url: str) -> None:
        def leader_fn():
            response = gl.nondet.web.get(url)
            return {"status": response.status, "body_length": len(response.body)}

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            validator_data = leader_fn()
            leader_data = leader_result.calldata
            return leader_data.get("status") == validator_data.get("status")

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.last_status = u32(int(result["status"]))
        self.last_body_length = u32(int(result["body_length"]))

    @gl.public.view
    def get_last_status(self) -> int:
        return int(self.last_status)

    @gl.public.view
    def get_last_body_length(self) -> int:
        return int(self.last_body_length)
