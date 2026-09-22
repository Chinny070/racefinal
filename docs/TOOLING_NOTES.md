# Tooling Notes — machine-local patches and environment findings

This file exists so another developer (or a clean CI machine) understands
exactly how this development environment differs from a stock GenLayer
tooling install, and why.

## 1. Windows `os.unlink` bug in `gltest` direct-mode loader

**Package**: `genlayer-test` (installed at `0.29.2`, the latest published
version as of 2026-09-22 — confirmed via `pip index versions genlayer-test`).

**File changed**: `<python-install>\Lib\site-packages\gltest\direct\loader.py`,
function `_inject_message_to_fd0` (used by every `direct_deploy(...)` call —
i.e. every direct-mode test).

**Exact bug**: the function creates a temp file, writes the encoded message
into it, then does:

```python
fd, path = tempfile.mkstemp()
try:
    os.write(fd, encoded)
    os.lseek(fd, 0, os.SEEK_SET)
    original_stdin = os.dup(0)
    vm._original_stdin_fd = original_stdin
    os.dup2(fd, 0)          # <-- fd 0 now points at the SAME underlying file
finally:
    os.close(fd)            # closes the *original* fd, not the fd-0 duplicate
    os.unlink(path)          # FAILS on Windows: fd 0 still holds it open
```

`os.dup2(fd, 0)` makes file descriptor 0 a duplicate of `fd`; the two
descriptors share the same underlying OS file handle. `os.close(fd)` closes
only the original descriptor number, not the handle itself, because fd 0
still references it. On POSIX, `unlink` on a still-open file is legal (the
directory entry is removed, the file's actual bytes are freed once the last
handle closes) — this is normal, common Unix temp-file cleanup and works
fine on Linux/macOS. On Windows, `DeleteFile`/`unlink` on a file with any
open handle raises `ERROR_SHARING_VIOLATION`, surfaced by CPython as
`PermissionError: [WinError 32] The process cannot access the file because
it is being used by another process`.

**Result before the patch**: every single `direct_deploy(...)` call failed
immediately with that `PermissionError`, making Phase 1 direct-mode testing
completely unusable on this machine.

**Exact fix applied** (same file, same function):

```python
    finally:
        os.close(fd)
        try:
            os.unlink(path)
        except PermissionError:
            # Windows: os.dup2(fd, 0) duplicates the underlying file handle,
            # so it stays open (via fd 0) after os.close(fd) above, and
            # Windows refuses to unlink an open file (unlike POSIX). The
            # temp file is harmless to leak here; OS temp-dir cleanup
            # reclaims it eventually. See docs/GENLAYER_API_NOTES.md.
            pass
```

**Why Windows required it**: this is a genuine Windows/POSIX filesystem
semantics difference (delete-while-open), not a GenLayer-specific design
choice — the same pattern (`mkstemp` + `dup2` + `unlink` while still
referenced) is a very common Unix idiom that silently breaks on Windows
unless the temp file was opened with `O_TEMPORARY`/`FILE_SHARE_DELETE`,
which `tempfile.mkstemp()` does not do by default on Windows.

**Scope — direct tests only.** This function (`_inject_message_to_fd0`) is
exclusively part of `gltest.direct`, the in-memory/no-server test runner
(`pytest tests/direct/`). It is not on the code path for `gltest
tests/integration/` (real JSON-RPC against a live node), which never calls
this function. **Integration tests are unaffected by this bug and do not
depend on this patch.**

**Does a clean machine need this patch?** Yes, if and only if: (a) it is
Windows, and (b) it runs `pytest tests/direct/` with the current
`genlayer-test==0.29.2`. Linux/macOS machines are unaffected — `unlink` on
an open file just works there, so the `try/except PermissionError` is a
no-op that never triggers (the `unlink` call succeeds on the first try).

**Upstream status**: not independently confirmed — this environment has no
outbound access to check `genlayer-test`'s GitHub issue tracker for an
existing report. Given the bug is Windows-only and the package's own
network-target defaults (`localnet`, port `4000`) suggest a primarily
Linux/Docker-oriented development loop, it's plausible this simply has not
been exercised on Windows upstream. **Recommendation for a clean machine**:
try `pytest tests/direct/` unpatched first — if on Linux/macOS it will
almost certainly just work; if on Windows and it fails with the exact
`PermissionError` above, apply the patch shown here (or report it
upstream).

**This patch was not reverted.** Per instructions, it was left in place
since Phase 1 (deterministic, machine-local, well-understood, and
Windows-only in effect) — it is a prerequisite for `pytest tests/direct/`
to run at all on this machine.

## 2. GenLayer CLI installed

`npm install -g genlayer` → CLI **v0.39.2**. Successfully verified with
`genlayer --version` / `genlayer --help`. No local patches needed for the
CLI itself.

## 3. `genvm-linter` first-run artifact download

`genvm-lint check ...` downloads a ~310 MB GenVM runtime artifact
(`genvm-universal-genlayerlabs-genvm-manager-v0.6.0-rc6.tar.xz`) into
`~/.cache/genvm-linter/` on first use. One run hit a transient
`[WinError 5] Access is denied` renaming the downloaded temp file to its
final name (root cause not fully diagnosed — plausibly a concurrent
`genvm-lint` invocation from an overlapping command in this session, or a
transient antivirus file lock, both common Windows-only failure modes for
rename-after-download). The artifact was already present at full size on
the next run and `genvm-lint check` succeeded immediately after — no code
change was required, this is noted here only so the download quirk isn't
mistaken for an install failure by a future run.

## 4. Docker Desktop is present but its engine backend is not running

`docker --version` reports `27.5.1` and Docker process names appear in
`Get-Process`, but `docker info` / any `docker` command that needs the
daemon hangs and ultimately fails with:

```
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/info":
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

This means Docker Desktop's Linux-engine backend was never started in this
session's environment — the CLI binary and some helper processes exist,
but there is no reachable daemon. This is a genuine environment constraint,
not something introduced by this work: `genlayer init && genlayer up`
(GenLayer's own documented local-network path, which uses Docker Compose)
is therefore unavailable here.

**What this blocked**: standing up a full multi-validator local GenVM
network (`genlayer up`, optionally `--ollama` for a no-API-key local LLM)
for genuinely end-to-end `gltest tests/integration/` runs with real
consensus among independently-running validator processes.

**What was used instead**: `glsim` (`pip install "genlayer-test[sim]"`), a
single-process, Docker-free GenLayer network the SDK also documents
(`api-references/genlayer-test/glsim`), and — for the specific live-web
proof in this phase — `gltest`'s own `direct_vm._live_web_handler` hook
(the same seam `glsim` itself uses to bridge a WASI web request to a real
network client), wired directly to a real `urllib.request` call. See
`docs/LIVE_WEB_VERIFICATION.md` for exactly what this did and did not
prove.

**One operator mistake worth recording**: while probing whether Docker was
usable, a `taskkill /F /IM docker.exe` was run by mistake (intended as a
harmless read-only check, it was not). Verified immediately after: the
engine backend was already unreachable *before* that command (the pipe
error above is a "never started," not a "crashed," error), a fresh
`docker` CLI process had already respawned, and `docker info` still
returns the same "not running" state either way — so no functioning Docker
workload was disrupted. Recorded here for transparency, not because it
changed anything.

## 5. No LLM provider credential is available in this sandbox

Checked: no `OPENAI_API_KEY`, no `ANTHROPIC_API_KEY`, no local `ollama`
binary on PATH. `glsim --llm-provider` requires `provider:model` with a
correspondingly-configured credential; `genlayer up --ollama` needs Docker
(see above). This means **no genuinely-live LLM inference (the
`gl.nondet.exec_prompt` extraction step) was exercised in this phase** —
only the web-transport step (`gl.nondet.web.get`) was proven live. See
`docs/LIVE_WEB_VERIFICATION.md` for the precise scope of what "real" means
in the Phase 3 tests, and what remains to be proven once a credential (or
the Docker+Ollama path) becomes available.
