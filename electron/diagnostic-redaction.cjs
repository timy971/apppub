/* eslint-disable */

/**
 * Centralise la suppression des données sensibles avant journalisation.
 *
 * Cette couche est volontairement indépendante d'Electron afin d'être
 * testable avec le runner Node natif. Elle ne doit jamais retourner une
 * référence vers l'objet d'origine : le résultat est uniquement destiné
 * aux logs de diagnostic.
 */

const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED]";
const SENSITIVE_KEY =
  /pass(?:word)?|secret|token|authorization|cookie|credential|private[_-]?key|api[_-]?key/i;

function sanitizeDiagnosticValue(value, key = "", seen = new WeakSet(), depth = 0) {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "object") return String(value);
  if (depth >= 8) return OMITTED;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, "", seen, depth + 1));
  }

  const clean = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    clean[childKey] = sanitizeDiagnosticValue(childValue, childKey, seen, depth + 1);
  }
  return clean;
}

function summarizeIpcArgs(channel, args) {
  const values = Array.isArray(args) ? args : [];

  if (channel === "secrets:set") {
    return [values[0], values[1], REDACTED];
  }

  if (channel === "exec:run") {
    const opts = values[0] && typeof values[0] === "object" ? { ...values[0] } : values[0];
    if (opts && typeof opts === "object" && "env" in opts) opts.env = REDACTED;
    return sanitizeDiagnosticValue([opts, values[1]]);
  }

  if (channel === "fs:writeText") {
    const content = values[1];
    return [
      sanitizeDiagnosticValue(values[0]),
      typeof content === "string" ? { omitted: true, length: content.length } : OMITTED,
    ];
  }

  if (channel === "fs:writeJson") {
    return [sanitizeDiagnosticValue(values[0]), OMITTED];
  }

  return sanitizeDiagnosticValue(values);
}

module.exports = {
  OMITTED,
  REDACTED,
  sanitizeDiagnosticValue,
  summarizeIpcArgs,
};
