export function formatDuration(ms?: number): string {
  if (!ms || ms < 0 || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${r.toString().padStart(2, "0")} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

export function formatRelativeDelta(currentMs: number, previousMs: number): {
  label: string;
  tone: "faster" | "slower" | "equal";
} {
  const diff = currentMs - previousMs;
  const pct = previousMs > 0 ? Math.round((diff / previousMs) * 100) : 0;
  if (Math.abs(pct) < 3) return { label: "identique au précédent", tone: "equal" };
  if (diff < 0) return { label: `${Math.abs(pct)} % plus rapide`, tone: "faster" };
  return { label: `${pct} % plus lent`, tone: "slower" };
}

/** Simple checksum (djb2) — évite d'importer une lib crypto lourde. */
export function shortChecksum(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
