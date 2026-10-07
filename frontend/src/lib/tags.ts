/** Parse and format application tags (comma-separated in forms). */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

export function parseTagsInput(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(",")) {
    let cleaned = part.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    if (cleaned.length > MAX_TAG_LENGTH) {
      cleaned = cleaned.slice(0, MAX_TAG_LENGTH).trimEnd();
    }
    const key = cleaned.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

export function formatTagsInput(tags: string[] | undefined | null): string {
  return (tags ?? []).join(", ");
}
