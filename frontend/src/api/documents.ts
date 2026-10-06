import { apiBlob, apiDownload, apiFetch } from "./client";

export type DocumentKind = "resume" | "cover_letter";

export type Document = {
  id: string;
  kind: DocumentKind;
  label: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  used_by_count: number;
};

export type UploadDocumentPayload = {
  file: File;
  kind: DocumentKind;
  label?: string;
};

export function listDocuments(kind?: DocumentKind): Promise<Document[]> {
  const params = kind ? `?kind=${kind}` : "";
  return apiFetch<Document[]>(`/api/documents${params}`);
}

export function uploadDocument(
  payload: UploadDocumentPayload,
): Promise<Document> {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("kind", payload.kind);
  if (payload.label?.trim()) {
    form.append("label", payload.label.trim());
  }
  return apiFetch<Document>("/api/documents", {
    method: "POST",
    body: form,
  });
}

export function renameDocument(id: string, label: string): Promise<Document> {
  return apiFetch<Document>(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/api/documents/${id}`, { method: "DELETE" });
}

export function downloadDocument(id: string, filename: string): Promise<void> {
  return apiDownload(`/api/documents/${id}/download`, filename);
}

export function fetchDocumentBlob(id: string): Promise<Blob> {
  return apiBlob(`/api/documents/${id}/view`);
}

export function isPdfDocument(
  doc: Pick<Document, "mime_type" | "original_filename">,
): boolean {
  return (
    doc.mime_type === "application/pdf" ||
    doc.original_filename.toLowerCase().endsWith(".pdf")
  );
}
