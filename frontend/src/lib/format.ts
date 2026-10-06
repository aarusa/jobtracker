/** Display helpers for user-facing strings. */

/** Title-case a name for display (e.g. "jane doe" → "Jane Doe"). */
export function toDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
