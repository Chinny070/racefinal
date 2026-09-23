import { useCallback, useEffect, useState } from "react";
import { readContest } from "../lib/contract";
import type { Contest } from "../types/contract";

export function useContest(contestId: number | null) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (contestId === null || Number.isNaN(contestId)) {
      setLoading(false);
      return;
    }
    try {
      const c = await readContest(contestId);
      setContest(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Contest not found.");
      setContest(null);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return { contest, loading, error, refresh };
}
