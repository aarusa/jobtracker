import { apiFetch } from "./client";
import type { ScrapeStatus, WorkType } from "../lib/constants";

export type ScrapePreview = {
  job_url: string;
  job_url_normalized: string;
  source_domain: string;
  title: string | null;
  company: string | null;
  location: string | null;
  work_type: WorkType;
  employment_type: string | null;
  salary_text: string | null;
  description: string | null;
  date_posted: string | null;
  scrape_status: ScrapeStatus;
  message: string | null;
  existing_application_id: string | null;
};

export function scrapePreview(url: string): Promise<ScrapePreview> {
  return apiFetch<ScrapePreview>("/api/scrape/preview", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}
