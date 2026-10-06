export type ApplicationStatus =
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type WorkType = "remote" | "hybrid" | "onsite" | "unknown";

export type ScrapeStatus = "success" | "partial" | "failed" | "manual";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STATUS_BADGE_CLASSES: Record<ApplicationStatus, string> = {
  applied: "bg-sky-100 text-sky-800",
  screening: "bg-amber-100 text-amber-900",
  interviewing: "bg-violet-100 text-violet-900",
  offer: "bg-emerald-100 text-emerald-900",
  accepted: "bg-teal-100 text-teal-900",
  rejected: "bg-rose-100 text-rose-900",
  withdrawn: "bg-slate-100 text-slate-700",
};

export const WORK_TYPES: WorkType[] = ["unknown", "remote", "hybrid", "onsite"];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  unknown: "Unknown",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const SORT_OPTIONS = [
  { value: "-applied_at", label: "Applied date (newest)" },
  { value: "applied_at", label: "Applied date (oldest)" },
  { value: "-updated_at", label: "Last updated (newest)" },
  { value: "updated_at", label: "Last updated (oldest)" },
] as const;

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
