/**
 * Normalize an Infoflow target ID.
 * Supports prefixes: user:xxx, group:xxx, dm:xxx
 */
export function normalizeInfoflowTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("group:")) {
    return trimmed.slice("group:".length).trim() || null;
  }
  if (lowered.startsWith("user:")) {
    return trimmed.slice("user:".length).trim() || null;
  }
  if (lowered.startsWith("dm:")) {
    return trimmed.slice("dm:".length).trim() || null;
  }
  if (lowered.startsWith("infoflow:")) {
    return trimmed.slice("infoflow:".length).trim() || null;
  }

  return trimmed;
}

/**
 * Check if a string looks like an Infoflow ID.
 */
export function looksLikeInfoflowId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (/^(group|user|dm|infoflow):/i.test(trimmed)) return true;
  // Numeric IDs (group IDs are typically numeric)
  if (/^\d+$/.test(trimmed)) return true;
  // Username-like strings
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed)) return true;

  return false;
}
