import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import type { Application } from "../api/applications";
import { AddApplicationModal } from "../features/applications/AddApplicationModal";
import {
  useApplicationStats,
  useApplications,
  useUpdateApplication,
} from "../hooks/useApplications";
import {
  APPLICATION_STATUSES,
  SORT_OPTIONS,
  STATUS_LABELS,
  WORK_TYPE_LABELS,
  formatDisplayDate,
  type ApplicationStatus,
} from "../lib/constants";
import { StatusSelect } from "../components/StatusSelect";
import { controlBaseClass, focusRing } from "../lib/formStyles";

export function ApplicationsPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus[]>([]);
  const [sort, setSort] = useState("-applied_at");
  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      q: search || undefined,
      status: statusFilter.length ? statusFilter : undefined,
      sort,
      limit: 50,
      offset: 0,
    }),
    [search, statusFilter, sort],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useApplications(listParams);
  const statsQuery = useApplicationStats();
  const updateMutation = useUpdateApplication();

  async function handleStatusChange(
    application: Application,
    status: ApplicationStatus,
  ) {
    if (status === application.status) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        id: application.id,
        payload: { status },
      });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.detail
          : "Could not update status. Please try again.",
      );
    }
  }

  function toggleStatus(status: ApplicationStatus) {
    setStatusFilter((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  const items = data?.items ?? [];
  const stats = statsQuery.data;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Applications
          </h1>
          <p className="mt-1 text-slate-600">
            Track every role from applied through to offer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          Add application
        </button>
      </div>

      <section className="mt-6">
        {statsQuery.isLoading ? (
          <p className="text-sm text-slate-600">Loading summary…</p>
        ) : statsQuery.isError ? (
          <p className="text-sm text-red-700">Could not load status summary.</p>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {APPLICATION_STATUSES.map((status) => (
              <div
                key={status}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {STATUS_LABELS[status]}
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {stats[status]}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q.trim());
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Company or title"
              className={`mt-1.5 ${controlBaseClass}`}
            />
          </div>
          <div className="w-full sm:w-64">
            <label htmlFor="sort" className="block text-sm font-medium text-slate-700">
              Sort
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className={`mt-1.5 ${controlBaseClass}`}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className={`mt-1.5 inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${focusRing}`}
          >
            Search
          </button>
        </form>

        <div>
          <p className="text-sm font-medium text-slate-700" id="status-filter-label">
            Filter by status
          </p>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-labelledby="status-filter-label"
          >
            {APPLICATION_STATUSES.map((status) => {
              const active = statusFilter.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatus(status)}
                  className={
                    active
                      ? "rounded-md bg-teal-700 px-2.5 py-1 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      : "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  }
                >
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
            {statusFilter.length > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFilter([])}
                className="text-xs font-medium text-slate-500 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {actionError ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {data ? `${data.total} application${data.total === 1 ? "" : "s"}` : null}
          </p>
          {isFetching && !isLoading ? (
            <span className="text-xs text-slate-500">Refreshing…</span>
          ) : null}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading applications…</p>
        ) : null}

        {isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p>
              {error instanceof ApiError
                ? error.detail
                : "Could not load applications."}
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

        {!isLoading && !isError && items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            {search || statusFilter.length > 0 ? (
              <>
                <p className="text-sm text-slate-600">
                  No applications match your search or filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setSearch("");
                    setStatusFilter([]);
                  }}
                  className="mt-3 text-sm font-medium text-teal-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  No applications yet. Add one from a job URL to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-3 text-sm font-medium text-teal-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                >
                  Add application
                </button>
              </>
            )}
          </div>
        ) : null}

        {!isLoading && !isError && items.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Company / Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Applied</th>
                    <th className="px-4 py-3">Work type</th>
                    <th className="px-4 py-3">Employment</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <Link
                          to={`/applications/${app.id}`}
                          className="font-medium text-teal-800 hover:underline"
                        >
                          {app.company || "Unknown company"}
                        </Link>
                        <p className="text-slate-600">{app.title || "Untitled role"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`status-desktop-${app.id}`}>
                          Status for {app.company || app.title || "application"}
                        </label>
                        <StatusSelect
                          id={`status-desktop-${app.id}`}
                          value={app.status}
                          disabled={updateMutation.isPending}
                          onChange={(status) => void handleStatusChange(app, status)}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDisplayDate(app.applied_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {WORK_TYPE_LABELS[app.work_type] ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {app.employment_type?.trim() || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {app.source_domain ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/applications/${app.id}`}
                          className="whitespace-nowrap text-sm font-medium text-teal-700 hover:underline"
                        >
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {items.map((app) => (
                <li
                  key={app.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <Link
                    to={`/applications/${app.id}`}
                    className="font-medium text-teal-800 hover:underline"
                  >
                    {app.company || "Unknown company"}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {app.title || "Untitled role"}
                  </p>
                  <div className="mt-3">
                    <label className="sr-only" htmlFor={`status-${app.id}`}>
                      Status
                    </label>
                    <StatusSelect
                      id={`status-${app.id}`}
                      value={app.status}
                      disabled={updateMutation.isPending}
                      onChange={(status) => void handleStatusChange(app, status)}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <dt className="font-medium text-slate-500">Applied</dt>
                      <dd>{formatDisplayDate(app.applied_at)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Source</dt>
                      <dd>{app.source_domain ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Work type</dt>
                      <dd>{WORK_TYPE_LABELS[app.work_type] ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Employment</dt>
                      <dd>{app.employment_type?.trim() || "—"}</dd>
                    </div>
                  </dl>
                  <Link
                    to={`/applications/${app.id}`}
                    className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline"
                  >
                    View details
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <AddApplicationModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
