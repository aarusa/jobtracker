import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteDocument,
  downloadDocument,
  listDocuments,
  renameDocument,
  uploadDocument,
  type DocumentKind,
  type UploadDocumentPayload,
} from "../api/documents";

export const documentsQueryKey = ["documents"] as const;

export function useDocuments(kind?: DocumentKind) {
  return useQuery({
    queryKey: [...documentsQueryKey, kind ?? "all"],
    queryFn: () => listDocuments(kind),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UploadDocumentPayload) => uploadDocument(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}

export function useRenameDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      renameDocument(id, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      downloadDocument(id, filename),
  });
}
