import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "../lib/constants";

type StatusBadgeProps = {
  status: ApplicationStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
