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
        status: values.status as ApplicationStatus,
        status_note: statusNote.trim() || null,
      };
      await updateMutation.mutateAsync({ id, payload });
      setSaveMessage("Saved");
      setStatusNote("");
    } catch (err) {
      if (err instanceof ApiError && err.existingApplicationId) {
        setFormError(
          `${err.detail} Open the existing application instead.`,
        );
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
      navigate("/", { replace: true });
    } catch (err) {
      setPendingDelete(false);
      setFormError(
        err instanceof ApiError
          ? err.detail
          : "Could not delete application.",
      );
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading application…</p>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <p>
          {error instanceof ApiError
            ? error.detail
            : "Application not found."}
        </p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-medium underline"
          >
            Try again
          </button>
          <Link to="/" className="font-medium underline">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/" className="text-sm font-medium text-teal-700 hover:underline">
            ← Applications
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {data.company || "Untitled company"}
          </h1>
          <p className="mt-1 text-slate-600">{data.title || "Untitled role"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {data.source_domain ? (
              <span className="text-xs text-slate-500">{data.source_domain}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={data.job_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open job posting
          </a>
          <button
            type="button"
            onClick={() => setPendingDelete(true)}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {formError}
        </p>
      ) : null}
      {saveMessage ? (
        <p
          role="status"
          className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          {saveMessage}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 space-y-6"
        noValidate
      >
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="job_url" className="block text-sm font-medium text-slate-700">
                Job URL
              </label>
              <input id="job_url" className={inputClass} {...register("job_url")} />
            </div>
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
              <label htmlFor="salary_text" className="block text-sm font-medium text-slate-700">
                Salary
              </label>
              <input id="salary_text" className={inputClass} {...register("salary_text")} />
            </div>
            <div>
              <label htmlFor="date_posted" className="block text-sm font-medium text-slate-700">
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
              <label htmlFor="applied_at" className="block text-sm font-medium text-slate-700">
                Applied date
              </label>
              <input
                id="applied_at"
                type="date"
                className={inputClass}
                {...register("applied_at")}
              />
            </div>
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
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="description" className="block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="description"
              rows={6}
              className={inputClass}
              {...register("description")}
            />
          </div>

          <div className="mt-4">
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea id="notes" rows={3} className={inputClass} {...register("notes")} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-slate-700">
                Current status
              </label>
              <div className="mt-1">
                <StatusSelect
                  id="status"
                  value={currentStatus}
                  onChange={(status) =>
                    setValue("status", status, { shouldDirty: true })
                  }
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="status_note"
                className="block text-sm font-medium text-slate-700"
              >
                Status note{" "}
                <span className="font-normal text-slate-500">
                  (saved when status changes)
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

        <div className="flex items-center justify-end gap-3">
          {isDirty ? (
            <span className="text-xs text-slate-500">Unsaved changes</span>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || updateMutation.isPending}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Status history</h2>
        {(data.status_history?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No history yet.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {data.status_history!.map((item, index) => (
              <li key={`${item.changed_at}-${index}`} className="relative pl-4">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-teal-600" />
                <p className="text-sm font-medium text-slate-900">
                  {item.from_status
                    ? `${STATUS_LABELS[item.from_status]} → ${STATUS_LABELS[item.to_status]}`
                    : STATUS_LABELS[item.to_status]}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDisplayDate(item.changed_at)}
                </p>
                {item.note ? (
                  <p className="mt-1 text-sm text-slate-600">{item.note}</p>
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
