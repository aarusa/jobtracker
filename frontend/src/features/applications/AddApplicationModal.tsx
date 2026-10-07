import { useEffect, useId, useRef, useState } from "react";
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
import {
  alertErrorClass,
  alertWarnClass,
  btnNeutralClass,
  btnPrimaryClass,
  btnSecondaryClass,
  fieldClass,
  fieldErrorClass,
  dateInputClass,
  fieldGridClass,
  focusRing,
  hintClass,
  inputClass,
  labelClass,
  linkQuietClass,
  sectionClass,
  sectionSubtitleClass,
  sectionTitleClass,
  selectClass,
  textareaClass,
} from "../../lib/formStyles";
import { parseTagsInput } from "../../lib/tags";

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
  tags: "",
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function AddApplicationModal({ open, onClose }: AddApplicationModalProps) {
  const titleId = useId();
  const navigate = useNavigate();
  const urlInputRef = useRef<HTMLInputElement>(null);
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
    requestAnimationFrame(() => urlInputRef.current?.focus());
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
    setValue(
      "scrape_status",
      result.scrape_status === "failed" ? "manual" : result.scrape_status,
    );
    setScrapeMessage(
      result.message ||
        (result.scrape_status === "failed"
          ? "Could not fetch details automatically. Fill in the fields below and save."
          : null),
    );
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
        tags: parseTagsInput(values.tags),
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 px-3 py-6 backdrop-blur-[2px] sm:px-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-2 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-900/15"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              Add application
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Paste a job URL to fetch details, then review and save.
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnSecondaryClass}>
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Fetch from URL</h3>
            <p className={sectionSubtitleClass}>
              We’ll try to prefill title, company, location, and more.
            </p>
            <form onSubmit={handleFetchDetails} className="mt-4">
              <div className={fieldClass}>
                <label htmlFor="fetch-url" className={labelClass}>
                  Job URL
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    ref={urlInputRef}
                    id="fetch-url"
                    type="url"
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    placeholder="https://..."
                    className={`${inputClass} sm:flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={scrapeMutation.isPending}
                    className={`${btnNeutralClass} sm:shrink-0`}
                  >
                    {scrapeMutation.isPending ? "Fetching…" : "Fetch details"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          {scrapeMessage ? (
            <p role="status" className={alertWarnClass}>
              {scrapeMessage}
            </p>
          ) : null}

          {existingId ? (
            <p role="alert" className={alertWarnClass}>
              You already saved this job.{" "}
              <Link
                to={`/applications/${existingId}`}
                className={`font-medium underline ${focusRing} rounded-sm`}
                onClick={onClose}
              >
                Open existing application
              </Link>
            </p>
          ) : null}

          {formError ? (
            <p role="alert" className={alertErrorClass}>
              {formError}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            noValidate
          >
            <input type="hidden" {...register("job_url")} />
            <input type="hidden" {...register("scrape_status")} />

            <section className={sectionClass}>
              <h3 className={sectionTitleClass}>Role details</h3>
              <p className={sectionSubtitleClass}>
                Edit anything the scraper missed before saving.
              </p>
              <div className={`mt-4 ${fieldGridClass}`}>
                <div className={fieldClass}>
                  <label htmlFor="add-title" className={labelClass}>
                    Title
                  </label>
                  <input
                    id="add-title"
                    className={inputClass}
                    {...register("title")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-company" className={labelClass}>
                    Company
                  </label>
                  <input
                    id="add-company"
                    className={inputClass}
                    {...register("company")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-location" className={labelClass}>
                    Location
                  </label>
                  <input
                    id="add-location"
                    className={inputClass}
                    {...register("location")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-work_type" className={labelClass}>
                    Work type
                  </label>
                  <select
                    id="add-work_type"
                    className={selectClass}
                    {...register("work_type")}
                  >
                    {WORK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {WORK_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-employment_type" className={labelClass}>
                    Employment type
                  </label>
                  <input
                    id="add-employment_type"
                    className={inputClass}
                    {...register("employment_type")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-salary_text" className={labelClass}>
                    Salary
                  </label>
                  <input
                    id="add-salary_text"
                    className={inputClass}
                    {...register("salary_text")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-date_posted" className={labelClass}>
                    Date posted
                  </label>
                  <input
                    id="add-date_posted"
                    type="date"
                    className={dateInputClass}
                    {...register("date_posted")}
                  />
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-applied_at" className={labelClass}>
                    Applied date
                  </label>
                  <input
                    id="add-applied_at"
                    type="date"
                    className={dateInputClass}
                    {...register("applied_at")}
                  />
                  {errors.applied_at ? (
                    <p className={fieldErrorClass}>{errors.applied_at.message}</p>
                  ) : null}
                </div>
              </div>

              <div className={`mt-4 ${fieldClass}`}>
                <label htmlFor="add-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="add-description"
                  rows={5}
                  className={textareaClass}
                  {...register("description")}
                />
              </div>
            </section>

            <section className={sectionClass}>
              <h3 className={sectionTitleClass}>Documents & notes</h3>
              <p className={sectionSubtitleClass}>
                Link the resume and cover letter you used for this role.
              </p>
              <div className={`mt-4 ${fieldGridClass}`}>
                <div className={fieldClass}>
                  <label htmlFor="add-resume_id" className={labelClass}>
                    Resume
                  </label>
                  <select
                    id="add-resume_id"
                    className={selectClass}
                    {...register("resume_id")}
                  >
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
                    className={linkQuietClass}
                  >
                    Upload resumes
                  </Link>
                </div>
                <div className={fieldClass}>
                  <label htmlFor="add-cover_letter_id" className={labelClass}>
                    Cover letter
                  </label>
                  <select
                    id="add-cover_letter_id"
                    className={selectClass}
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
                    className={linkQuietClass}
                  >
                    Upload cover letters
                  </Link>
                </div>
              </div>

              <div className={`mt-4 ${fieldClass}`}>
                <label htmlFor="add-tags" className={labelClass}>
                  Tags
                </label>
                <input
                  id="add-tags"
                  className={inputClass}
                  placeholder="e.g. IT Role, Hospitality, Admin"
                  {...register("tags")}
                />
                <p className={hintClass}>
                  Comma-separated labels to group roles (max 10).
                </p>
              </div>

              <div className={`mt-4 ${fieldClass}`}>
                <label htmlFor="add-notes" className={labelClass}>
                  Notes
                </label>
                <textarea
                  id="add-notes"
                  rows={3}
                  className={textareaClass}
                  {...register("notes")}
                />
              </div>
            </section>

            {errors.job_url ? (
              <p className={fieldErrorClass}>{errors.job_url.message}</p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className={btnSecondaryClass}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting || createMutation.isPending || Boolean(existingId)
                }
                className={btnPrimaryClass}
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
