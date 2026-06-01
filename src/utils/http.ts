/**
 * Parses an HTTP `Retry-After` header value (seconds or HTTP-date) into
 * milliseconds. Returns 0 for missing / unparsable values.
 *
 * @param value The raw header value.
 * @param maxMs Optional upper bound to clamp the returned delay.
 */
export function parseRetryAfterMs(value: string | null, maxMs = Number.POSITIVE_INFINITY): number {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, maxMs);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), maxMs);
  }

  return 0;
}
