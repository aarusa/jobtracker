import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../api/client";
import {
  deleteAccountSchema,
  profileSchema,
  type DeleteAccountFormValues,
  type ProfileFormValues,
} from "../features/auth/schemas";
import {
  authQueryKey,
  useAuth,
  useDeleteAccount,
  useUpdateProfile,
} from "../hooks/useAuth";
import { toDisplayName } from "../lib/format";
import {
  alertErrorClass,
  alertSuccessClass,
  btnDangerClass,
  btnPrimaryClass,
  fieldClass,
  fieldErrorClass,
  focusRing,
  inputClass,
  labelClass,
  sectionClass,
  sectionSubtitleClass,
  sectionTitleClass,
} from "../lib/formStyles";

export function ProfilePage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateProfile();
  const deleteMutation = useDeleteAccount();
  const deleteTitleId = useId();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const deleteForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "" },
  });
  const { setFocus: setDeleteFocus } = deleteForm;

  useEffect(() => {
    if (!user) return;
    reset({
      name: user.name,
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  }, [user, reset]);

  async function onSave(values: ProfileFormValues) {
    if (!user) return;
    setFormError(null);
    setSaveMessage(null);

    const payload: {
      name?: string;
      current_password?: string;
      new_password?: string;
    } = {};

    const nextName = values.name.trim();
    if (nextName !== user.name) {
      payload.name = nextName;
    }
    if (values.new_password?.trim()) {
      payload.current_password = values.current_password;
      payload.new_password = values.new_password;
    }

    if (!payload.name && !payload.new_password) {
      setFormError("Change your name or password before saving.");
      return;
    }

    try {
      await updateMutation.mutateAsync(payload);
      if (payload.new_password) {
        queryClient.setQueryData(authQueryKey, null);
        queryClient.clear();
        navigate("/login", {
          replace: true,
          state: { notice: "Password updated. Please log in again." },
        });
        return;
      }
      setSaveMessage("Profile updated.");
      reset({
        name: payload.name ? toDisplayName(payload.name) : nextName,
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.detail
          : "Could not update profile. Please try again.",
      );
    }
  }

  async function onDelete(values: DeleteAccountFormValues) {
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ password: values.password });
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? error.detail
          : "Could not delete account. Please try again.",
      );
    }
  }

  useEffect(() => {
    if (!deleteOpen) return;
    requestAnimationFrame(() => setDeleteFocus("password"));
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleteMutation.isPending) {
        setDeleteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleteMutation.isPending, setDeleteFocus]);

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading profile…</p>;
  }

  if (!user) {
    return (
      <div className={alertErrorClass}>
        <p>Could not load your profile.</p>
        <Link to="/applications" className="mt-2 inline-block font-medium underline">
          Back to applications
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Profile
        </h1>
        <p className="mt-1 text-slate-600">
          Update your name or password. Your email cannot be changed.
        </p>
      </div>

      {formError ? (
        <p role="alert" className={alertErrorClass}>
          {formError}
        </p>
      ) : null}
      {deleteError && !deleteOpen ? (
        <p role="alert" className={alertErrorClass}>
          {deleteError}
        </p>
      ) : null}
      {saveMessage ? (
        <p role="status" className={alertSuccessClass}>
          {saveMessage}
        </p>
      ) : null}

      <form onSubmit={handleSubmit(onSave)} className="space-y-5" noValidate>
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Account details</h2>
          <p className={sectionSubtitleClass}>
            Signed in as {toDisplayName(user.name)}.
          </p>

          <div className={`mt-4 ${fieldClass}`}>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              readOnly
              disabled
              className={inputClass}
            />
            <p className="text-xs text-slate-500">Email address cannot be changed.</p>
          </div>

          <div className={`mt-4 ${fieldClass}`}>
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input id="name" className={inputClass} {...register("name")} />
            {errors.name ? (
              <p className={fieldErrorClass}>{errors.name.message}</p>
            ) : null}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Change password</h2>
          <p className={sectionSubtitleClass}>
            Leave blank to keep your current password.
          </p>

          <div className={`mt-4 grid gap-4 sm:grid-cols-2`}>
            <div className={`${fieldClass} sm:col-span-2`}>
              <label htmlFor="current_password" className={labelClass}>
                Current password
              </label>
              <input
                id="current_password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                {...register("current_password")}
              />
              {errors.current_password ? (
                <p className={fieldErrorClass}>{errors.current_password.message}</p>
              ) : null}
            </div>
            <div className={fieldClass}>
              <label htmlFor="new_password" className={labelClass}>
                New password
              </label>
              <input
                id="new_password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                {...register("new_password")}
              />
              {errors.new_password ? (
                <p className={fieldErrorClass}>{errors.new_password.message}</p>
              ) : null}
            </div>
            <div className={fieldClass}>
              <label htmlFor="confirm_password" className={labelClass}>
                Confirm new password
              </label>
              <input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                {...register("confirm_password")}
              />
              {errors.confirm_password ? (
                <p className={fieldErrorClass}>{errors.confirm_password.message}</p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {isDirty ? (
            <span className="text-xs text-slate-500 sm:mr-auto">Unsaved changes</span>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || updateMutation.isPending}
            className={btnPrimaryClass}
          >
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className={`${sectionClass} border-red-200`}>
        <h2 className={sectionTitleClass}>Delete account</h2>
        <p className={sectionSubtitleClass}>
          Permanently delete your account, applications, and uploaded documents.
          This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            deleteForm.reset({ password: "" });
            setDeleteOpen(true);
          }}
          className={`${btnDangerClass} mt-4`}
        >
          Delete my account
        </button>
      </section>

      <p className="text-sm text-slate-600">
        <Link to="/applications" className="font-medium text-teal-700 hover:underline">
          ← Back to applications
        </Link>
      </p>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="presentation"
          onClick={() => {
            if (!deleteMutation.isPending) setDeleteOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={deleteTitleId} className="text-lg font-semibold text-slate-900">
              Delete account?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter your password to confirm. All applications and documents will
              be removed.
            </p>
            {deleteError ? (
              <p role="alert" className={`mt-3 ${alertErrorClass}`}>
                {deleteError}
              </p>
            ) : null}
            <form
              className="mt-4 space-y-4"
              onSubmit={deleteForm.handleSubmit(onDelete)}
              noValidate
            >
              <div className={fieldClass}>
                <label htmlFor="delete_password" className={labelClass}>
                  Password
                </label>
                <input
                  id="delete_password"
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                  {...deleteForm.register("password")}
                />
                {deleteForm.formState.errors.password ? (
                  <p className={fieldErrorClass}>
                    {deleteForm.formState.errors.password.message}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => setDeleteOpen(false)}
                  className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${focusRing}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteMutation.isPending}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
