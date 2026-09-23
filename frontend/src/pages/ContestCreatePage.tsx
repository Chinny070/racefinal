import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { TxStateBadge } from "../components/contest/TxStateBadge";
import { useWallet } from "../state/WalletProvider";
import { useTxState } from "../hooks/useTxState";
import { createContest } from "../lib/contract";
import { genToWei, nowUnix } from "../lib/format";
import { RETRIEVAL_METHODS, STAKE_PRESETS } from "../lib/constants";
import type { CreateContestInput } from "../types/contract";

function toDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function ContestCreatePage() {
  const { address, client, connect, error: walletError } = useWallet();
  const navigate = useNavigate();
  const { phase, txHash, error: txError, run } = useTxState();

  const now = nowUnix();
  const [form, setForm] = useState({
    participantAId: "",
    participantBId: "",
    eventId: "",
    canonicalSourceUrl: "",
    sourceHost: "",
    sourcePathPrefix: "",
    retrievalMethod: "get" as "get" | "render",
    stake: STAKE_PRESETS[0] as number,
    matchCloseTime: toDatetimeLocal(now + 3600),
    settleAfter: toDatetimeLocal(now + 7200),
    resolutionDeadline: toDatetimeLocal(now + 86400),
  });
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function deriveHostAndPrefix(url: string) {
    try {
      const u = new URL(url);
      update("sourceHost", u.hostname);
      update("sourcePathPrefix", u.pathname);
    } catch {
      // invalid URL so far, leave host/prefix as typed
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!client || !address) {
      setFormError("Connect a wallet to create a contest.");
      return;
    }
    if (!form.canonicalSourceUrl.startsWith("https://")) {
      setFormError("Source URL must be HTTPS.");
      return;
    }
    if (form.participantAId.trim() === form.participantBId.trim()) {
      setFormError("Participant A and B must be different.");
      return;
    }

    const input: CreateContestInput = {
      participantAId: form.participantAId.trim(),
      participantBId: form.participantBId.trim(),
      eventId: form.eventId.trim(),
      sourceHost: form.sourceHost.trim(),
      sourcePathPrefix: form.sourcePathPrefix.trim(),
      canonicalSourceUrl: form.canonicalSourceUrl.trim(),
      retrievalMethod: form.retrievalMethod,
      matchCloseTime: fromDatetimeLocal(form.matchCloseTime),
      settleAfter: fromDatetimeLocal(form.settleAfter),
      resolutionDeadline: fromDatetimeLocal(form.resolutionDeadline),
      stakeWei: genToWei(form.stake),
    };

    await run(async () => {
      const hash = await createContest(client, input);
      return hash;
    }, client);
  }

  const busy = phase === "submitted" || phase === "pending";

  return (
    <PageShell>
      <div className="max-w-[640px] mx-auto">
        <Badge variant="outline" className="mb-4">
          New contest
        </Badge>
        <h1 className="text-[40px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
          Commit the terms before the result is known.
        </h1>
        <p className="text-[14px] text-fog mt-3 mb-10">
          Once a second participant joins, every field below becomes immutable.
          There is no way to change the source, the participants, or the stake
          after that point.
        </p>

        <form onSubmit={handleSubmit}>
          <Card className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Participant A (you)">
                <Input
                  required
                  placeholder="e.g. Sisay Lemma"
                  value={form.participantAId}
                  onChange={(e) => update("participantAId", e.target.value)}
                />
              </Field>
              <Field label="Participant B">
                <Input
                  required
                  placeholder="e.g. Evans Chebet"
                  value={form.participantBId}
                  onChange={(e) => update("participantBId", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Event identifier">
              <Input
                required
                placeholder="e.g. 2026-BOSTON-MARATHON-MENS-ELITE"
                value={form.eventId}
                onChange={(e) => update("eventId", e.target.value)}
              />
            </Field>

            <Field label="Canonical results URL" hint="The exact page validators will fetch at settlement.">
              <Input
                required
                type="url"
                placeholder="https://example.org/results"
                value={form.canonicalSourceUrl}
                onChange={(e) => {
                  update("canonicalSourceUrl", e.target.value);
                  deriveHostAndPrefix(e.target.value);
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Source host" hint="Auto-filled from the URL.">
                <Input
                  required
                  value={form.sourceHost}
                  onChange={(e) => update("sourceHost", e.target.value)}
                />
              </Field>
              <Field label="Path prefix" hint="Optional; restricts the allowed path.">
                <Input
                  value={form.sourcePathPrefix}
                  onChange={(e) => update("sourcePathPrefix", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Retrieval method">
              <Select
                value={form.retrievalMethod}
                onChange={(e) => update("retrievalMethod", e.target.value as "get" | "render")}
              >
                {RETRIEVAL_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "get" ? "GET — static page text/JSON" : "Render — JS-rendered page"}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Stake per side (GEN)">
              <div className="flex items-center gap-2 flex-wrap">
                {STAKE_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => update("stake", preset)}
                    className={`text-[13px] font-[var(--font-cosmica)] rounded-[10000px] px-4 py-2 border transition-colors ${
                      form.stake === preset
                        ? "bg-obsidian text-snow border-obsidian"
                        : "bg-transparent text-iron border-cloud hover:border-iron"
                    }`}
                  >
                    {preset} GEN
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Match closes">
                <Input
                  required
                  type="datetime-local"
                  value={form.matchCloseTime}
                  onChange={(e) => update("matchCloseTime", e.target.value)}
                />
              </Field>
              <Field label="Settles after">
                <Input
                  required
                  type="datetime-local"
                  value={form.settleAfter}
                  onChange={(e) => update("settleAfter", e.target.value)}
                />
              </Field>
              <Field label="Refund deadline">
                <Input
                  required
                  type="datetime-local"
                  value={form.resolutionDeadline}
                  onChange={(e) => update("resolutionDeadline", e.target.value)}
                />
              </Field>
            </div>

            {formError && <p className="text-[13px] text-ember">{formError}</p>}
            {txError && <p className="text-[13px] text-ember">{txError}</p>}
            {walletError && !address && <p className="text-[13px] text-ember">{walletError}</p>}

            <div className="flex items-center gap-4 pt-2">
              {!address ? (
                <Button type="button" onClick={connect}>
                  Connect wallet to continue
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : `Lock ${form.stake} GEN and create`}
                </Button>
              )}
              <TxStateBadge phase={phase} />
            </div>

            {phase === "finalized" && (
              <div className="pt-2 border-t border-cloud">
                <p className="text-[13px] text-fog mb-2">
                  Contest created. Transaction {txHash?.slice(0, 10)}…
                </p>
                <Button type="button" variant="neutral" onClick={() => navigate("/contests")}>
                  View in explorer
                </Button>
              </div>
            )}
          </Card>
        </form>
      </div>
    </PageShell>
  );
}
