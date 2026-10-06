import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createApplication,
  deleteApplication,
  getApplication,
  getApplicationStats,
  listApplications,
  updateApplication,
  type ApplicationCreatePayload,
  type ApplicationUpdatePayload,
  type ListApplicationsParams,
} from "../api/applications";
import { scrapePreview } from "../api/scrape";

export const applicationsQueryKey = ["applications"] as const;
export const applicationStatsQueryKey = ["applications", "stats"] as const;

export function useApplications(params: ListApplicationsParams) {
  return useQuery({
    queryKey: [...applicationsQueryKey, "list", params],
    queryFn: () => listApplications(params),
  });
}

export function useApplicationStats() {
  return useQuery({
    queryKey: applicationStatsQueryKey,
    queryFn: getApplicationStats,
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: [...applicationsQueryKey, "detail", id],
    queryFn: () => getApplication(id!),
    enabled: Boolean(id),
  });
}

function invalidateApplications(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: applicationsQueryKey });
  void queryClient.invalidateQueries({ queryKey: applicationStatsQueryKey });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplicationCreatePayload) => createApplication(payload),
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: ApplicationUpdatePayload;
    }) => updateApplication(id, payload),
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useScrapePreview() {
  return useMutation({
    mutationFn: (url: string) => scrapePreview(url),
  });
}
