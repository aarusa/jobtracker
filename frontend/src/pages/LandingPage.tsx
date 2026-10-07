import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

const features = [
  {
    title: "Paste a job URL",
    body: "Fetch title, company, location, salary, and description in seconds — then edit anything before you save.",
  },
  {
    title: "Track every stage",
    body: "Move applications from Applied through Interview to Offer, with a clear history of each status change.",
  },
  {
    title: "Keep your documents close",
    body: "Upload resumes and cover letters once, label them, and attach the exact versions you used per role.",
  },
];

const focusLink =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const primaryTo = isAuthenticated ? "/applications" : "/register";
  const primaryLabel = isAuthenticated ? "Open app" : "Get started free";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,_#ccfbf1_0%,_#f8fafc_55%,_#f8fafc_100%)]" />

      <header className="relative z-10 border-b border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className={`rounded-sm text-lg font-semibold tracking-tight text-slate-900 ${focusLink}`}
          >
            Job Tracker
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
            {isLoading ? null : isAuthenticated ? (
              <Link
                to="/applications"
                className={`inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 ${focusLink}`}
              >
                Open app
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusLink}`}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className={`inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 ${focusLink}`}
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:pt-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-800">
              Job Tracker
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Your job search, organised in one calm place.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Paste a posting URL, capture the details that matter, and follow each
              application from first click to final offer — with the resume you
              actually sent.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={primaryTo}
                className={`inline-flex h-11 items-center rounded-lg bg-teal-700 px-5 text-sm font-medium text-white shadow-sm hover:bg-teal-800 ${focusLink}`}
              >
                {primaryLabel}
              </Link>
              {!isAuthenticated ? (
                <Link
                  to="/login"
                  className={`inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${focusLink}`}
                >
                  I already have an account
                </Link>
              ) : null}
            </div>
          </div>

          <div
            aria-hidden="true"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10 sm:p-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Applications
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  This week&apos;s pipeline
                </p>
              </div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
                3 active
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {[
                ["Northwind Analytics", "Platform Engineer", "Interviewing"],
                ["Harbor Labs", "Backend Developer", "Screening"],
                ["Cedar Systems", "Full-stack Engineer", "Applied"],
              ].map(([company, title, status]) => (
                <li
                  key={company}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{company}</p>
                      <p className="text-sm text-slate-600">{title}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      {status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Built for a focused job search
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Stop juggling spreadsheets, browser tabs, and email threads. Job Tracker
              keeps the essentials together so you always know what to follow up next.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-slate-200 p-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Job Tracker — personal application tracking.</p>
          <p>
            {isAuthenticated ? (
              <Link
                to="/applications"
                className={`font-medium text-teal-700 hover:underline ${focusLink} rounded-sm`}
              >
                Open app
              </Link>
            ) : (
              <Link
                to="/login"
                className={`font-medium text-teal-700 hover:underline ${focusLink} rounded-sm`}
              >
                Log in
              </Link>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
