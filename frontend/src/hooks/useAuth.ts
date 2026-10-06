import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMe, login, logout, register } from "../api/auth";
import type { LoginPayload, RegisterPayload } from "../api/auth";
import { ApiError } from "../api/client";

export const authQueryKey = ["auth", "me"] as const;

export function useAuth() {
  const query = useQuery({
    queryKey: authQueryKey,
    queryFn: getMe,
    retry: false,
    staleTime: 60_000,
  });

  const isUnauthorized =
    query.isError && query.error instanceof ApiError && query.error.status === 401;

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data) && !isUnauthorized,
    isError: query.isError && !isUnauthorized,
    error: isUnauthorized ? null : query.error,
    refetch: query.refetch,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (user) => {
      queryClient.setQueryData(authQueryKey, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
    onSuccess: (user) => {
      queryClient.setQueryData(authQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      queryClient.setQueryData(authQueryKey, null);
      queryClient.clear();
    },
  });
}
