import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth, useLogout } from "../hooks/useAuth";
import { toDisplayName } from "../lib/format";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "rounded-md px-2 py-1 font-medium text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
    : "rounded-md px-2 py-1 text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

export function AppLayout() {
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
            <Link
              to="/"
              className="shrink-0 text-base font-semibold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              Job Tracker
            </Link>
            <nav
              aria-label="Main"
              className="flex items-center gap-1 text-sm sm:gap-2"
            >
              <NavLink to="/applications" className={navLinkClass}>
                Applications
              </NavLink>
              <NavLink to="/documents" className={navLinkClass}>
                Documents
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user?.name ? (
              <Link
                to="/profile"
                className="max-w-[10rem] truncate text-sm font-medium text-slate-700 hover:text-teal-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:max-w-none"
              >
                {toDisplayName(user.name)}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                logoutMutation.mutate(undefined, {
                  onSuccess: () => navigate("/login", { replace: true }),
                });
              }}
              disabled={logoutMutation.isPending}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-60"
            >
              {logoutMutation.isPending ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
