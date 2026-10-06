import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth, useLogout } from "../hooks/useAuth";

export function AppLayout() {
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-base font-semibold tracking-tight">
              Job Tracker
            </Link>
            <nav className="hidden items-center gap-4 text-sm sm:flex">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive
                    ? "font-medium text-teal-700"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Applications
              </NavLink>
              <NavLink
                to="/documents"
                className={({ isActive }) =>
                  isActive
                    ? "font-medium text-teal-700"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                Documents
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.name}
            </span>
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
