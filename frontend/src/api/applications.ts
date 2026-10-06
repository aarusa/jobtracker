import { apiFetch } from "./client";
import type {
  ApplicationStatus,
  ScrapeStatus,
  WorkType,
} from "../lib/constants";

export type DocumentRef = {
  id: string;
  label: string;
};

export type StatusHistoryItem = {
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  note: string | null;
  changed_at: string;
};

export type Application = {
  id: string;
  job_url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  work_type: WorkType;
  employment_type: string | null;
  salary_text: string | null;
  description?: string | null;
  date_posted: string | null;
  source_domain: string | null;
  status: ApplicationStatus;
  applied_at: string;
  resume: DocumentRef | null;
  cover_letter: DocumentRef | null;
  scrape_status: ScrapeStatus | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  status_history?: StatusHistoryItem[];
};

export type ApplicationListResponse = {
  items: Application[];
  total: number;
};

export type ApplicationStats = {
  applied: number;
  screening: number;
  interviewing: number;
  offer: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  total: number;
};

export type ApplicationCreatePayload = {
  job_url: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  work_type?: WorkType;
  employment_type?: string | null;
  salary_text?: string | null;
  description?: string | null;
  date_posted?: string | null;
  applied_at?: string | null;
  resume_id?: string | null;
  cover_letter_id?: string | null;
  scrape_status?: ScrapeStatus | null;
  notes?: string | null;
};

export type ApplicationUpdatePayload = Partial<ApplicationCreatePayload> & {
  status?: ApplicationStatus;
  status_note?: string | null;
};

export type ListApplicationsParams = {
  q?: string;
  status?: ApplicationStatus[];
  sort?: string;
  limit?: number;
  offset?: number;
};

export function listApplications(
  params: ListApplicationsParams = {},
): Promise<ApplicationListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  for (const status of params.status ?? []) {
    search.append("status", status);
  }
  const query = search.toString();
  return apiFetch<ApplicationListResponse>(
    `/api/applications${query ? `?${query}` : ""}`,
  );
}

export function getApplicationStats(): Promise<ApplicationStats> {
  return apiFetch<ApplicationStats>("/api/applications/stats");
}

export function getApplication(id: string): Promise<Application> {
  return apiFetch<Application>(`/api/applications/${id}`);
}

export function createApplication(
  payload: ApplicationCreatePayload,
): Promise<Application> {
  return apiFetch<Application>("/api/applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateApplication(
  id: string,
  payload: ApplicationUpdatePayload,
): Promise<Application> {
  return apiFetch<Application>(`/api/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteApplication(id: string): Promise<void> {
  return apiFetch<void>(`/api/applications/${id}`, { method: "DELETE" });
}
