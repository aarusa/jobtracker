import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "../lib/constants";
import { selectClass } from "../lib/formStyles";

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
      className={`${selectClass} ${className}`.trim()}
    >
      {APPLICATION_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
