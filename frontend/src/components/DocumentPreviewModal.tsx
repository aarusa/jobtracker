import { useEffect, useId, useState } from "react";

import {
  fetchDocumentBlob,
  isPdfDocument,
  type Document,
} from "../api/documents";
import { ApiError } from "../api/client";

type DocumentPreviewModalProps = {
  document: Document | null;
  onClose: () => void;
  onDownload: (doc: Document) => void;
};

export function DocumentPreviewModal({
  document,
  onClose,
  onDownload,
}: DocumentPreviewModalProps) {
  const titleId = useId();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document) {
      setBlobUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    async function load() {
      if (!document || !isPdfDocument(document)) {
        setBlobUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const blob = await fetchDocumentBlob(document.id);
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        if (revoked) return;
        setError(
          err instanceof ApiError
            ? err.detail
            : "Could not load document preview.",
        );
      } finally {
        if (!revoked) setLoading(false);
      }
    }

    void load();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document]);

  useEffect(() => {
    if (!document) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [document, onClose]);

  if (!document) return null;

  const canPreviewPdf = isPdfDocument(document);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[min(90vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-lg font-semibold text-slate-900"
            >
              {document.label}
            </h2>
            <p className="truncate text-sm text-slate-500">
              {document.original_filename}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(document)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-100">
          {canPreviewPdf ? (
            loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-600">
                Loading preview…
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={() => onDownload(document)}
                  className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Download instead
                </button>
              </div>
            ) : blobUrl ? (
              <iframe
                title={`Preview of ${document.label}`}
                src={blobUrl}
                className="h-full w-full border-0 bg-white"
              />
            ) : null
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-md text-sm text-slate-600">
                In-browser preview is available for PDFs. This is a Word
                document — download it to open in your editor.
              </p>
              <button
                type="button"
                onClick={() => onDownload(document)}
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Download {document.original_filename}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
