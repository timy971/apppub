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
const MAX_CAPTURED_OUTPUT = 5_000_000;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitiveText(value, secrets = []) {
  if (typeof value !== "string" || value.length === 0) return value;
  let clean = value;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 4) continue;
    clean = clean.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED);
  }
  clean = clean.replace(/((?:bearer|authorization)\s+)([A-Za-z0-9._~+/=-]{8,})/gi, `$1${REDACTED}`);
  clean = clean.replace(
    /((?:ORG_GRADLE_PROJECT_[A-Z0-9_]*(?:PASS|TOKEN|SECRET)[A-Z0-9_]*|pass(?:word)?|secret|token|api[_-]?key)\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    `$1${REDACTED}`,
  );
  return clean;
}

function sanitizeDiagnosticValue(value, key = "", seen = new WeakSet(), depth = 0, secrets = []) {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const clean = redactSensitiveText(value, secrets);
    return clean.length > 500 ? `${clean.slice(0, 500)}…` : clean;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "object") return String(value);
  if (depth >= 8) return OMITTED;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, "", seen, depth + 1, secrets));
  }

  const clean = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    clean[childKey] = sanitizeDiagnosticValue(childValue, childKey, seen, depth + 1, secrets);
  }
  return clean;
}

class RedactedOutputCollector {
  constructor(secrets = [], maxChars = MAX_CAPTURED_OUTPUT) {
    this.secrets = secrets.filter((value) => typeof value === "string" && value.length >= 4);
    this.maxChars = maxChars;
    this.raw = { stdout: "", stderr: "" };
    this.pending = { stdout: "", stderr: "" };
  }

  append(stream, data) {
    const text = String(data ?? "");
    this.raw[stream] = (this.raw[stream] + text).slice(-this.maxChars);
    const combined = (this.pending[stream] + text).slice(-this.maxChars);
    const parts = combined.split(/\r?\n/);
    this.pending[stream] = parts.pop() ?? "";
    return parts.map((line) => redactSensitiveText(line, this.secrets));
  }

  flush(stream) {
    const line = this.pending[stream];
    this.pending[stream] = "";
    return line ? [redactSensitiveText(line, this.secrets)] : [];
  }

  result(stream) {
    return redactSensitiveText(this.raw[stream], this.secrets);
  }
}

function summarizeIpcArgs(channel, args) {
  const values = Array.isArray(args) ? args : [];

  if (channel === "secrets:set") {
    return [values[0], values[1], REDACTED];
  }

  if (channel === "exec:run") {
    const opts = values[0] && typeof values[0] === "object" ? { ...values[0] } : values[0];
    if (opts && typeof opts === "object" && "env" in opts) opts.env = REDACTED;
    if (opts && typeof opts === "object" && "signingSessionId" in opts) {
      opts.signingSessionId = REDACTED;
    }
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
  MAX_CAPTURED_OUTPUT,
  OMITTED,
  REDACTED,
  RedactedOutputCollector,
  redactSensitiveText,
  sanitizeDiagnosticValue,
  summarizeIpcArgs,
};
