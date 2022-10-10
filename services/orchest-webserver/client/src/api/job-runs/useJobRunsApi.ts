import { defineStoreScope } from "@/store/scoped";
import { Pagination, PipelineRun, PipelineRunStatus } from "@/types";
import { memoizeFor, MemoizePending } from "@/utils/promise";
import { jobRunsApi, JobRunsPageQuery, StatusUpdate } from "./jobRunsApi";

export type PaginationDetails = Pagination & {
  page_number: number;
  page_size: number;
};

export type JobRunsApi = {
  /**
   * The currently fetched page.
   * Hydrated by `fetchPage`.
   */
  runs: PipelineRun[] | undefined;
  /**
   * Metadata about the currently fetched page and available items.
   * Hydrated by `fetchPage`.
   */
  pagination: PaginationDetails | undefined;
  /** Fetches a job runs page and updates `runs` and `page`. */
  fetchPage: MemoizePending<(query: JobRunsPageQuery) => Promise<void>>;
  /** Cancels a job run and updates the local state if successful. */
  cancel: (runUuid: string) => Promise<void>;
  /** Updates the status of a job run in the back-end. */
  setStatus: (update: StatusUpdate) => Promise<void>;
};

const create = defineStoreScope({
  requires: ["jobUuid"],
  additional: ["runUuid"],
});

/** A state container for job runs within the active job scope. */
export const useJobRunsApi = create<JobRunsApi>((set, get) => {
  const setRunStatus = (
    runs: PipelineRun[],
    runUuid: string,
    status: PipelineRunStatus
  ) => runs.map((run) => (run.uuid === runUuid ? { ...run, status } : run));

  const updateStatus = (runUuid: string, status: PipelineRunStatus) => {
    set((state) => ({
      runs: state.runs ? setRunStatus(state.runs, runUuid, status) : state.runs,
    }));
  };

  return {
    runs: undefined,
    pagination: undefined,
    active: undefined,
    fetchPage: memoizeFor(1000, async (query) => {
      const result = await jobRunsApi.fetchPage(get().jobUuid, query);

      set({
        runs: result.pipeline_runs,
        pagination: {
          ...result.pagination_data,
          page_number: query.page,
          page_size: query.pageSize,
        },
      });
    }),
    cancel: async (runUuid) => {
      await jobRunsApi.cancel(get().jobUuid, runUuid);

      updateStatus(runUuid, "ABORTED");
    },
    setStatus: async (update) => {
      await jobRunsApi.setStatus(update);

      updateStatus(update.runUuid, update.status);
    },
  };
});
