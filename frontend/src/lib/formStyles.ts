/** Shared form control classes — keep Add + Detail UIs aligned. */

export const labelClass =
  "block text-sm font-medium text-slate-700";

export const hintClass =
  "text-xs text-slate-500";

export const fieldErrorClass =
  "text-sm text-red-600";

export const fieldClass =
  "flex flex-col gap-1.5";

export const controlBaseClass =
  "block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm leading-normal text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const inputClass = controlBaseClass;

/** Date inputs: keep text vertically centered and enlarge the calendar control. */
export const dateInputClass =
  `${controlBaseClass} date-input min-h-10 py-0`;

export const selectClass = controlBaseClass;

export const textareaClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

export const btnPrimaryClass =
  `inline-flex h-10 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const btnSecondaryClass =
  `inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const btnDangerClass =
  `inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700`;

export const btnNeutralClass =
  `inline-flex h-10 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const sectionClass =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

export const sectionTitleClass =
  "text-sm font-semibold tracking-tight text-slate-900";

export const sectionSubtitleClass =
  "mt-1 text-sm text-slate-500";

export const fieldGridClass =
  "grid gap-4 sm:grid-cols-2";

export const alertErrorClass =
  "rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700";

export const alertWarnClass =
  "rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900";

export const alertSuccessClass =
  "rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm text-teal-900";

export const linkQuietClass =
  `inline-flex w-fit text-xs font-medium text-teal-700 hover:underline ${focusRing} rounded-sm`;
