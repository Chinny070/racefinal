import { useCallback, useEffect, useState } from "react";
import { readAllContests } from "../lib/contract";
import type { Contest } from "../types/contract";

export function useContestList() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await readAllContests();
      setContests(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { contests, loading, error, refresh };
}
