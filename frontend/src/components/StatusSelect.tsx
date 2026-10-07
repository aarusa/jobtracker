import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "../lib/constants";

type StatusSelectProps = {
  value: ApplicationStatus;
  onChange: (status: ApplicationStatus) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

const statusSelectClass =
  "block h-9 min-w-[8.75rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm leading-normal text-slate-900 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function StatusSelect({
  value,
  onChange,
  disabled = false,
  id,
  className = "",
}: StatusSelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ApplicationStatus)}
      className={`${statusSelectClass} ${className}`.trim()}
    >
      {APPLICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
