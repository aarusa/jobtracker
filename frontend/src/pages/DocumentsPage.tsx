import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { Document, DocumentKind } from "../api/documents";
import { ApiError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import {
  useDeleteDocument,
  useDocuments,
  useDownloadDocument,
  useRenameDocument,
  useUploadDocument,
} from "../hooks/useDocuments";
import {
  ACCEPTED_DOCUMENT_TYPES,
  formatBytes,
  formatDate,
  isAllowedDocumentFile,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from "../lib/documents";

type Tab = DocumentKind;

export function DocumentsPage() {
  const [tab, setTab] = useState<Tab>("resume");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDocuments();

  const uploadMutation = useUploadDocument();
  const renameMutation = useRenameDocument();
  const deleteMutation = useDeleteDocument();
  const downloadMutation = useDownloadDocument();

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);

  const documents = useMemo(() => {
    const items = data ?? [];
    return items.filter((doc) => doc.kind === tab);
  }, [data, tab]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);

    if (!file) {
      setUploadError("Choose a PDF or DOCX file to upload.");
      return;
    }
    if (!isAllowedDocumentFile(file)) {
      setUploadError("Only PDF and DOCX files are allowed.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        file,
        kind: tab,
        label: label.trim() || undefined,
      });
      setFile(null);
      setLabel("");
      (event.target as HTMLFormElement).reset();
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.detail
          : "Could not upload the document. Please try again.",
      );
    }
  }

  async function handleRename(documentId: string) {
    setActionError(null);
    const next = editLabel.trim();
    if (!next) {
      setActionError("Label cannot be empty.");
      return;
    }
    try {
      await renameMutation.mutateAsync({ id: documentId, label: next });
      setEditingId(null);
      setEditLabel("");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Could not rename document.",
      );
    }
  }

  async function handleDownload(doc: Document) {
    setActionError(null);
    try {
      await downloadMutation.mutateAsync({
        id: doc.id,
        filename: doc.original_filename,
      });
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Could not download document.",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Could not delete document.",
      );
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Documents
          </h1>
          <p className="mt-1 text-slate-600">
            Upload resumes and cover letters, then attach them to applications.
          </p>
        </div>
      </div>

      <div className="mt-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6" aria-label="Document kinds">
          {(
            [
              ["resume", "Resumes"],
              ["cover_letter", "Cover letters"],
            ] as const
          ).map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                setUploadError(null);
                setActionError(null);
                setEditingId(null);
              }}
              className={
                tab === value
                  ? "border-b-2 border-teal-700 pb-2 text-sm font-medium text-teal-800"
                  : "border-b-2 border-transparent pb-2 text-sm font-medium text-slate-500 hover:text-slate-800"
              }
            >
              {labelText}
            </button>
          ))}
        </nav>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Upload {tab === "resume" ? "resume" : "cover letter"}
        </h2>
        <form onSubmit={handleUpload} className="mt-4 space-y-4" noValidate>
          {uploadError ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {uploadError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="document-file"
                className="block text-sm font-medium text-slate-700"
              >
                File (PDF or DOCX, max {MAX_UPLOAD_MB} MB)
              </label>
              <input
                id="document-file"
                type="file"
                accept={ACCEPTED_DOCUMENT_TYPES}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setUploadError(null);
                }}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
            <div>
              <label
                htmlFor="document-label"
                className="block text-sm font-medium text-slate-700"
              >
                Label <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="document-label"
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={
                  tab === "resume" ? "Backend resume v3" : "Generic cover letter"
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={uploadMutation.isPending}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
          >
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </button>
        </form>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Your {tab === "resume" ? "resumes" : "cover letters"}
          </h2>
          {isFetching && !isLoading ? (
            <span className="text-xs text-slate-500">Refreshing…</span>
          ) : null}
        </div>

        {actionError ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-6 text-sm text-slate-600">Loading documents…</p>
        ) : null}

        {isError ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p>
              {error instanceof ApiError
                ? error.detail
                : "Could not load documents."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 font-medium underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!isLoading && !isError && documents.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
            No {tab === "resume" ? "resumes" : "cover letters"} yet. Upload one
            above to get started.
          </p>
        ) : null}

        {!isLoading && !isError && documents.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  {editingId === doc.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="sr-only" htmlFor={`rename-${doc.id}`}>
                        New label
                      </label>
                      <input
                        id={`rename-${doc.id}`}
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRename(doc.id)}
                          disabled={renameMutation.isPending}
                          className="rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditLabel("");
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPreviewDocument(doc)}
                      className="truncate text-left font-medium text-teal-800 hover:underline"
                    >
                      {doc.label}
                    </button>
                  )}
                  <p className="mt-1 text-sm text-slate-600">
                    {doc.original_filename} · {formatBytes(doc.size_bytes)} ·{" "}
                    {formatDate(doc.created_at)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Used by {doc.used_by_count}{" "}
                    {doc.used_by_count === 1 ? "application" : "applications"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewDocument(doc)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(doc.id);
                      setEditLabel(doc.label);
                      setActionError(null);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload(doc)}
                    disabled={downloadMutation.isPending}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(doc)}
                    className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document?"
        message={
          pendingDelete && pendingDelete.used_by_count > 0
            ? `"${pendingDelete.label}" is used by ${pendingDelete.used_by_count} application${pendingDelete.used_by_count === 1 ? "" : "s"}. Deleting it will remove that link from those applications.`
            : pendingDelete
              ? `Delete "${pendingDelete.label}"? This cannot be undone.`
              : ""
        }
        busy={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />

      <DocumentPreviewModal
        document={previewDocument}
        onClose={() => setPreviewDocument(null)}
        onDownload={(doc) => void handleDownload(doc)}
      />
    </div>
  );
}
