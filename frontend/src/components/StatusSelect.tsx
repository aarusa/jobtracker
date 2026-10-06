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
      className={`rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60 ${className}`}
    >
      {APPLICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
