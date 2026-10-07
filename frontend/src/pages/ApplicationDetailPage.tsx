import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatusBadge } from "../components/StatusBadge";
import { StatusSelect } from "../components/StatusSelect";
import {
  applicationFormSchema,
  type ApplicationFormValues,
} from "../features/applications/schemas";
import {
  useApplication,
  useDeleteApplication,
  useUpdateApplication,
} from "../hooks/useApplications";
import { useDocuments } from "../hooks/useDocuments";
import {
  STATUS_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPES,
  formatDisplayDate,
  type ApplicationStatus,
  type ScrapeStatus,
  type WorkType,
} from "../lib/constants";
import {
  alertErrorClass,
  alertSuccessClass,
  btnDangerClass,
  btnPrimaryClass,
  btnSecondaryClass,
  dateInputClass,
  fieldClass,
  fieldGridClass,
  focusRing,
  hintClass,
  inputClass,
  labelClass,
  sectionClass,
  sectionSubtitleClass,
  sectionTitleClass,
  selectClass,
  textareaClass,
} from "../lib/formStyles";
import { formatTagsInput, parseTagsInput } from "../lib/tags";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useApplication(id);
  const { data: documents = [] } = useDocuments();
  const updateMutation = useUpdateApplication();
  const deleteMutation = useDeleteApplication();

  const [formError, setFormError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, isDirty },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
  });

  useEffect(() => {
    if (!data) return;
    reset({
      job_url: data.job_url,
      title: data.title ?? "",
      company: data.company ?? "",
      location: data.location ?? "",
      work_type: data.work_type,
      employment_type: data.employment_type ?? "",
      salary_text: data.salary_text ?? "",
      description: data.description ?? "",
      date_posted: data.date_posted ?? "",
      applied_at: data.applied_at,
      resume_id: data.resume?.id ?? "",
      cover_letter_id: data.cover_letter?.id ?? "",
      scrape_status: data.scrape_status ?? "manual",
      notes: data.notes ?? "",
      tags: formatTagsInput(data.tags),
      status: data.status,
      status_note: "",
    });
    setStatusNote("");
    setFormError(null);
    setSaveMessage(null);
  }, [data, reset]);

  const resumes = documents.filter((doc) => doc.kind === "resume");
  const coverLetters = documents.filter((doc) => doc.kind === "cover_letter");
  const currentStatus = (watch("status") || data?.status || "applied") as ApplicationStatus;

  async function onSubmit(values: ApplicationFormValues) {
    if (!id) return;
    setFormError(null);
    setSaveMessage(null);
    try {
      const payload = {
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
        scrape_status: (values.scrape_status || null) as ScrapeStatus | null,
        notes: emptyToNull(values.notes),
        tags: parseTagsInput(values.tags),
        status: values.status as ApplicationStatus,
        status_note: statusNote.trim() || null,
      };
      await updateMutation.mutateAsync({ id, payload });
      setSaveMessage("Saved");
      setStatusNote("");
    } catch (err) {
      if (err instanceof ApiError && err.existingApplicationId) {
        setFormError(`${err.detail} Open the existing application instead.`);
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.detail
          : "Could not save changes. Please try again.",
      );
    }
  }

  async function confirmDelete() {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      navigate("/applications", { replace: true });
    } catch (err) {
      setPendingDelete(false);
      setFormError(
        err instanceof ApiError
          ? err.detail
          : "Could not delete application.",
      );
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading application…</p>;
  }

  if (isError || !data) {
    return (
      <div className={alertErrorClass}>
        <p>
          {error instanceof ApiError
            ? error.detail
            : "Application not found."}
        </p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            className={`font-medium underline ${focusRing} rounded-sm`}
          >
            Try again
          </button>
          <Link
            to="/applications"
            className={`font-medium underline ${focusRing} rounded-sm`}
          >
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/applications"
            className={`text-sm font-medium text-teal-700 hover:underline ${focusRing} rounded-sm`}
          >
            ← Applications
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {data.company || "Untitled company"}
          </h1>
          <p className="mt-1 text-slate-600">{data.title || "Untitled role"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {data.source_domain ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {data.source_domain}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={data.job_url}
            target="_blank"
            rel="noreferrer"
            className={btnSecondaryClass}
          >
            Open job posting
          </a>
          <button
            type="button"
            onClick={() => setPendingDelete(true)}
            className={btnDangerClass}
          >
            Delete
          </button>
        </div>
      </div>

      {formError ? (
        <p role="alert" className={alertErrorClass}>
          {formError}
        </p>
      ) : null}
      {saveMessage ? (
        <p role="status" className={alertSuccessClass}>
          {saveMessage}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Role details</h2>
          <p className={sectionSubtitleClass}>
            Keep scraped fields accurate as the role evolves.
          </p>
          <div className={`mt-4 ${fieldGridClass}`}>
            <div className={`${fieldClass} sm:col-span-2`}>
              <label htmlFor="job_url" className={labelClass}>
                Job URL
              </label>
              <input id="job_url" className={inputClass} {...register("job_url")} />
            </div>
            <div className={fieldClass}>
              <label htmlFor="title" className={labelClass}>
                Title
              </label>
              <input id="title" className={inputClass} {...register("title")} />
            </div>
            <div className={fieldClass}>
              <label htmlFor="company" className={labelClass}>
                Company
              </label>
              <input id="company" className={inputClass} {...register("company")} />
            </div>
            <div className={fieldClass}>
              <label htmlFor="location" className={labelClass}>
                Location
              </label>
              <input id="location" className={inputClass} {...register("location")} />
            </div>
            <div className={fieldClass}>
              <label htmlFor="work_type" className={labelClass}>
                Work type
              </label>
              <select
                id="work_type"
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
              <label htmlFor="employment_type" className={labelClass}>
                Employment type
              </label>
              <input
                id="employment_type"
                className={inputClass}
                {...register("employment_type")}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="salary_text" className={labelClass}>
                Salary
              </label>
              <input
                id="salary_text"
                className={inputClass}
                {...register("salary_text")}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="date_posted" className={labelClass}>
                Date posted
              </label>
              <input
                id="date_posted"
                type="date"
                className={dateInputClass}
                {...register("date_posted")}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="applied_at" className={labelClass}>
                Applied date
              </label>
              <input
                id="applied_at"
                type="date"
                className={dateInputClass}
                {...register("applied_at")}
              />
            </div>
          </div>

          <div className={`mt-4 ${fieldClass}`}>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              rows={6}
              className={textareaClass}
              {...register("description")}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Documents & notes</h2>
          <p className={sectionSubtitleClass}>
            Track which materials you sent and any personal notes.
          </p>
          <div className={`mt-4 ${fieldGridClass}`}>
            <div className={fieldClass}>
              <label htmlFor="resume_id" className={labelClass}>
                Resume
              </label>
              <select
                id="resume_id"
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
            </div>
            <div className={fieldClass}>
              <label htmlFor="cover_letter_id" className={labelClass}>
                Cover letter
              </label>
              <select
                id="cover_letter_id"
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
            </div>
          </div>
          <div className={`mt-4 ${fieldClass}`}>
            <label htmlFor="tags" className={labelClass}>
              Tags
            </label>
            <input
              id="tags"
              className={inputClass}
              placeholder="e.g. IT Role, Hospitality, Admin"
              {...register("tags")}
            />
            <p className={hintClass}>
              Comma-separated labels to group roles (max 10).
            </p>
          </div>
          <div className={`mt-4 ${fieldClass}`}>
            <label htmlFor="notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              className={textareaClass}
              {...register("notes")}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Status</h2>
          <p className={sectionSubtitleClass}>
            Updating status records a history entry; add an optional note.
          </p>
          <div className={`mt-4 ${fieldGridClass}`}>
            <div className={fieldClass}>
              <label htmlFor="status" className={labelClass}>
                Current status
              </label>
              <StatusSelect
                id="status"
                value={currentStatus}
                onChange={(status) =>
                  setValue("status", status, { shouldDirty: true })
                }
                className="w-full"
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="status_note" className={labelClass}>
                Status note{" "}
                <span className="font-normal text-slate-500">
                  (when status changes)
                </span>
              </label>
              <input
                id="status_note"
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                className={inputClass}
                placeholder="Optional note for this status change"
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {isDirty ? (
            <span className="text-xs text-slate-500 sm:mr-auto">
              Unsaved changes
            </span>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || updateMutation.isPending}
            className={btnPrimaryClass}
          >
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Status history</h2>
        <p className={sectionSubtitleClass}>
          Every status change is kept here for reference.
        </p>
        {(data.status_history?.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No history yet.</p>
        ) : (
          <ol className="mt-5 space-y-0 border-l border-slate-200">
            {data.status_history!.map((item, index) => (
              <li
                key={`${item.changed_at}-${index}`}
                className="relative pb-5 pl-5 last:pb-0"
              >
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-600 shadow-sm" />
                <p className="text-sm font-medium text-slate-900">
                  {item.from_status
                    ? `${STATUS_LABELS[item.from_status]} → ${STATUS_LABELS[item.to_status]}`
                    : STATUS_LABELS[item.to_status]}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDisplayDate(item.changed_at)}
                </p>
                {item.note ? (
                  <p className="mt-1.5 text-sm text-slate-600">{item.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete}
        title="Delete application?"
        message={`Delete ${data.company || "this application"}? This cannot be undone.`}
        busy={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) setPendingDelete(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
