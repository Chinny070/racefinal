import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { ContestCard } from "../components/contest/ContestCard";
import { Button } from "../components/ui/Button";
import { useContestList } from "../hooks/useContestList";
import { CONTEST_STATUS } from "../lib/constants";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "locked", label: "Source locked" },
  { key: "finalized", label: "Finalized" },
] as const;

export function ContestExplorerPage() {
  const { contests, loading, error, refresh } = useContestList();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "open":
        return contests.filter((c) => c.status === CONTEST_STATUS.CREATED);
      case "locked":
        return contests.filter((c) => c.status === CONTEST_STATUS.MATCHED);
      case "finalized":
        return contests.filter((c) => c.resolved);
      default:
        return contests;
    }
  }, [contests, filter]);

  return (
    <PageShell>
      <div className="flex items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="text-[40px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
            Contest explorer
          </h1>
          <p className="text-[14px] text-fog mt-2">
            Every contest, public and read-only. No wallet required to browse.
          </p>
        </div>
        <Link to="/contests/new">
          <Button variant="primary">Create a contest</Button>
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[13px] font-[var(--font-cosmica)] rounded-[10000px] px-4 py-2 border transition-colors ${
              filter === f.key
                ? "bg-obsidian text-snow border-obsidian"
                : "bg-transparent text-iron border-cloud hover:border-iron"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => void refresh()}
          className="ml-auto text-[13px] text-fog hover:text-obsidian transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-[14px] text-fog">Loading contests…</p>}
      {error && <p className="text-[14px] text-ember">{error}</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-[14px] text-fog">No contests match this filter yet.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((c) => (
          <ContestCard key={c.contest_id} contest={c} />
        ))}
      </div>
    </PageShell>
  );
}
