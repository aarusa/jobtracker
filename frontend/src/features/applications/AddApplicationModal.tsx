import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../../api/client";
import type { ScrapePreview } from "../../api/scrape";
import {
  applicationFormSchema,
  type ApplicationFormValues,
} from "./schemas";
import {
  useCreateApplication,
  useScrapePreview,
} from "../../hooks/useApplications";
import { useDocuments } from "../../hooks/useDocuments";
import {
  todayISODate,
  WORK_TYPE_LABELS,
  WORK_TYPES,
  type ScrapeStatus,
  type WorkType,
} from "../../lib/constants";

type AddApplicationModalProps = {
  open: boolean;
  onClose: () => void;
};

const emptyDefaults: ApplicationFormValues = {
  job_url: "",
  title: "",
  company: "",
  location: "",
  work_type: "unknown",
  employment_type: "",
  salary_text: "",
  description: "",
  date_posted: "",
  applied_at: todayISODate(),
  resume_id: "",
  cover_letter_id: "",
  scrape_status: "manual",
  notes: "",
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function AddApplicationModal({ open, onClose }: AddApplicationModalProps) {
  const titleId = useId();
  const navigate = useNavigate();
  const scrapeMutation = useScrapePreview();
  const createMutation = useCreateApplication();
  const { data: documents = [] } = useDocuments();

  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    if (!open) return;
    reset({ ...emptyDefaults, applied_at: todayISODate() });
    setUrlDraft("");
    setScrapeMessage(null);
    setExistingId(null);
    setFormError(null);
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const resumes = documents.filter((doc) => doc.kind === "resume");
  const coverLetters = documents.filter((doc) => doc.kind === "cover_letter");

  function applyScrape(result: ScrapePreview) {
    setValue("job_url", result.job_url);
    setValue("title", result.title ?? "");
    setValue("company", result.company ?? "");
    setValue("location", result.location ?? "");
    setValue("work_type", result.work_type);
    setValue("employment_type", result.employment_type ?? "");
    setValue("salary_text", result.salary_text ?? "");
    setValue("description", result.description ?? "");
    setValue("date_posted", result.date_posted ?? "");
    setValue("scrape_status", result.scrape_status);
    setScrapeMessage(result.message);
    setExistingId(result.existing_application_id);
  }

  async function handleFetchDetails(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const url = urlDraft.trim() || getValues("job_url").trim();
    if (!url) {
      setFormError("Paste a job URL first.");
      return;
    }
    try {
      const result = await scrapeMutation.mutateAsync(url);
      setUrlDraft(result.job_url);
      applyScrape(result);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.detail
          : "Could not fetch job details. You can still fill the form manually.",
      );
      setValue("job_url", url);
      setValue("scrape_status", "failed");
      setScrapeMessage(
        "Could not fetch details automatically. Please fill in the fields manually.",
      );
    }
  }

  async function onSubmit(values: ApplicationFormValues) {
    setFormError(null);
    try {
      const created = await createMutation.mutateAsync({
        job_url: values.job_url,
        title: emptyToNull(values.title),
        company: emptyToNull(values.company),
        location: emptyToNull(values.location),
        work_type: values.work_type as WorkType,
        employment_type: emptyToNull(values.employment_type),
        salary_text: emptyToNull(values.salary_text),
        description: emptyToNull(values.description),
        date_posted: emptyToNull(values.date_posted),
        applied_at: values.applied_at,
        resume_id: emptyToNull(values.resume_id),
        cover_letter_id: emptyToNull(values.cover_letter_id),
        scrape_status: (values.scrape_status || "manual") as ScrapeStatus,
        notes: emptyToNull(values.notes),
      });
      onClose();
      navigate(`/applications/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.existingApplicationId) {
        setExistingId(err.existingApplicationId);
        setFormError(err.detail);
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.detail
          : "Could not save the application. Please try again.",
      );
    }
  }

  if (!open) return null;

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-4 w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Add application
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste a job URL to fetch details, then review and save.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <form onSubmit={handleFetchDetails} className="space-y-3">
            <div>
              <label
                htmlFor="fetch-url"
                className="block text-sm font-medium text-slate-700"
              >
                Job URL
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  id="fetch-url"
                  type="url"
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="https://..."
                  className={inputClass + " mt-0"}
                />
                <button
                  type="submit"
                  disabled={scrapeMutation.isPending}
                  className="shrink-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  {scrapeMutation.isPending ? "Fetching…" : "Fetch details"}
                </button>
              </div>
            </div>
          </form>

          {scrapeMessage ? (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {scrapeMessage}
            </p>
          ) : null}

          {existingId ? (
            <p
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              You already saved this job.{" "}
              <Link
                to={`/applications/${existingId}`}
                className="font-medium underline"
                onClick={onClose}
              >
                Open existing application
              </Link>
            </p>
          ) : null}

          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <input type="hidden" {...register("job_url")} />
            <input type="hidden" {...register("scrape_status")} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                  Title
                </label>
                <input id="title" className={inputClass} {...register("title")} />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-700">
                  Company
                </label>
                <input id="company" className={inputClass} {...register("company")} />
              </div>
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-slate-700">
                  Location
                </label>
                <input id="location" className={inputClass} {...register("location")} />
              </div>
              <div>
                <label htmlFor="work_type" className="block text-sm font-medium text-slate-700">
                  Work type
                </label>
                <select id="work_type" className={inputClass} {...register("work_type")}>
                  {WORK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {WORK_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="employment_type"
                  className="block text-sm font-medium text-slate-700"
                >
                  Employment type
                </label>
                <input
                  id="employment_type"
                  className={inputClass}
                  {...register("employment_type")}
                />
              </div>
              <div>
                <label
                  htmlFor="salary_text"
                  className="block text-sm font-medium text-slate-700"
                >
                  Salary
                </label>
                <input
                  id="salary_text"
                  className={inputClass}
                  {...register("salary_text")}
                />
              </div>
              <div>
                <label
                  htmlFor="date_posted"
                  className="block text-sm font-medium text-slate-700"
                >
                  Date posted
                </label>
                <input
                  id="date_posted"
                  type="date"
                  className={inputClass}
                  {...register("date_posted")}
                />
              </div>
              <div>
                <label
                  htmlFor="applied_at"
                  className="block text-sm font-medium text-slate-700"
                >
                  Applied date
                </label>
                <input
                  id="applied_at"
                  type="date"
                  className={inputClass}
                  {...register("applied_at")}
                />
                {errors.applied_at ? (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.applied_at.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-slate-700"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={5}
                className={inputClass}
                {...register("description")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="resume_id" className="block text-sm font-medium text-slate-700">
                  Resume
                </label>
                <select id="resume_id" className={inputClass} {...register("resume_id")}>
                  <option value="">None</option>
                  {resumes.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.label}
                    </option>
                  ))}
                </select>
                <Link
                  to="/documents"
                  onClick={onClose}
                  className="mt-1 inline-block text-xs font-medium text-teal-700 hover:underline"
                >
                  Upload resumes
                </Link>
              </div>
              <div>
                <label
                  htmlFor="cover_letter_id"
                  className="block text-sm font-medium text-slate-700"
                >
                  Cover letter
                </label>
                <select
                  id="cover_letter_id"
                  className={inputClass}
                  {...register("cover_letter_id")}
                >
                  <option value="">None</option>
                  {coverLetters.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.label}
                    </option>
                  ))}
                </select>
                <Link
                  to="/documents"
                  onClick={onClose}
                  className="mt-1 inline-block text-xs font-medium text-teal-700 hover:underline"
                >
                  Upload cover letters
                </Link>
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea id="notes" rows={3} className={inputClass} {...register("notes")} />
            </div>

            {errors.job_url ? (
              <p className="text-sm text-red-600">{errors.job_url.message}</p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || createMutation.isPending || Boolean(existingId)}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {createMutation.isPending ? "Saving…" : "Save application"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
