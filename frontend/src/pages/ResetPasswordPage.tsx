import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { resetPassword } from "../api/auth";
import { ApiError } from "../api/client";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "../features/auth/schemas";
import { useAuth } from "../hooks/useAuth";

export function ResetPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: resetPassword,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/applications" replace />;
  }

  async function onSubmit(values: ResetPasswordFormValues) {
    setFormError(null);
    if (!token) {
      setFormError("This reset link is missing a token. Request a new one.");
      return;
    }
    try {
      await mutation.mutateAsync({ token, password: values.password });
      navigate("/login", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.detail);
      } else {
        setFormError("Could not reset password. Please try again.");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="text-sm font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          Job Application Tracker
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a password with at least 8 characters.
        </p>

        {!token ? (
          <p
            role="alert"
            className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            This page needs a valid reset token.{" "}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
            .
          </p>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-8 space-y-5"
            noValidate
          >
            {formError ? (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </p>
            ) : null}

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                {...register("password")}
              />
              {errors.password ? (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="confirm_password"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                {...register("confirm_password")}
              />
              {errors.confirm_password ? (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirm_password.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="h-10 w-full rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
