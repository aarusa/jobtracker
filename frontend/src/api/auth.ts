import { apiFetch, type User } from "./client";

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  remember_me?: boolean;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ForgotPasswordResponse = {
  detail: string;
  dev_reset_url?: string | null;
};

export type ResetPasswordPayload = {
  token: string;
  password: string;
};

export type UpdateProfilePayload = {
  name?: string;
  current_password?: string;
  new_password?: string;
};

export type DeleteAccountPayload = {
  password: string;
};

export function register(payload: RegisterPayload): Promise<User> {
  return apiFetch<User>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginPayload): Promise<User> {
  return apiFetch<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function forgotPassword(
  payload: ForgotPasswordPayload,
): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  return apiFetch<void>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/api/auth/me");
}

export function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  return apiFetch<User>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAccount(payload: DeleteAccountPayload): Promise<void> {
  // POST avoids DELETE-with-body proxy issues in the Vite dev server.
  return apiFetch<void>("/api/auth/delete-account", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
