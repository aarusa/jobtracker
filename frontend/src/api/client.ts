export type User = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export class ApiError extends Error {
  status: number;
  detail: string;
  existingApplicationId?: string;

  constructor(
    status: number,
    detail: string,
    existingApplicationId?: string,
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.existingApplicationId = existingApplicationId;
  }
}

type ErrorBody = {
  detail?: string | Array<{ msg?: string }>;
  existing_application_id?: string;
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!response.ok) {
    let detail = "Something went wrong";
    let existingApplicationId: string | undefined;
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as ErrorBody;
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        detail = body.detail[0].msg;
      }
      if (typeof body.existing_application_id === "string") {
        existingApplicationId = body.existing_application_id;
      }
    }
    throw new ApiError(response.status, detail, existingApplicationId);
  }

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    let detail = "Request failed";
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as ErrorBody;
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    }
    throw new ApiError(response.status, detail);
  }
  return response.blob();
}
