const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /pass(?:word)?|secret|token|authorization|cookie|credential|private[_-]?key|api[_-]?key/i;

export function redactSensitiveText(value: string): string {
  return value
    .replace(/((?:bearer|authorization)\s+)([A-Za-z0-9._~+/=-]{8,})/gi, `$1${REDACTED}`)
    .replace(
      /((?:ORG_GRADLE_PROJECT_[A-Z0-9_]*(?:PASS|TOKEN|SECRET)[A-Z0-9_]*|pass(?:word)?|secret|token|api[_-]?key)\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      `$1${REDACTED}`,
    );
}

export function sanitizeForLog(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value !== "object") return String(value);
  if (depth >= 10) return "[OMITTED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, "", seen, depth + 1));
  }
  const clean: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(value)) {
    clean[childKey] = sanitizeForLog(child, childKey, seen, depth + 1);
  }
  return clean;
}

export { REDACTED };
