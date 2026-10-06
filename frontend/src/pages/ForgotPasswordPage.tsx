import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { forgotPassword } from "../api/auth";
import { ApiError } from "../api/client";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "../features/auth/schemas";
import { useAuth } from "../hooks/useAuth";

export function ForgotPasswordPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: forgotPassword,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
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

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null);
    setSuccessDetail(null);
    setDevResetUrl(null);
    try {
      const result = await mutation.mutateAsync(values);
      setSuccessDetail(result.detail);
      setDevResetUrl(result.dev_reset_url ?? null);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.detail);
      } else {
        setFormError("Could not start password reset. Please try again.");
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
          Forgot password
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your account email and we&apos;ll prepare a reset link.
        </p>

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

          {successDetail ? (
            <div
              role="status"
              className="space-y-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
            >
              <p>{successDetail}</p>
              {devResetUrl ? (
                <p>
                  Local testing link:{" "}
                  <Link
                    to={(() => {
                      try {
                        const url = new URL(devResetUrl);
                        return `${url.pathname}${url.search}`;
                      } catch {
                        return "/forgot-password";
                      }
                    })()}
                    className="font-medium underline"
                  >
                    Reset password
                  </Link>
                </p>
              ) : (
                <p className="text-teal-800/80">
                  Email delivery is not configured yet. Ask the site owner for a
                  reset, or enable the local reset link in development.
                </p>
              )}
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              {...register("email")}
            />
            {errors.email ? (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="h-10 w-full rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {mutation.isPending ? "Sending…" : "Continue"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          <Link to="/login" className="font-medium text-teal-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
