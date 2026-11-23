import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../../lib/api";
import type { Run } from "../../lib/types";

/** Poll a batch analysis run every 1.5 s while it is running. */
export function useRun(runId: number | null, onDone?: (run: Run) => void) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId!),
    enabled: runId !== null,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1500 : false),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status && status !== "running" && query.data) {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["repos"] });
      onDone?.(query.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return query;
}
