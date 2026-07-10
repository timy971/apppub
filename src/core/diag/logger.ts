/**
 * Phase 3.7 — Diagnostic Engine (renderer).
 *
 * LoggerService centralisé :
 *  - Niveaux : trace, debug, info, success, warn, error, fatal.
 *  - Buffer mémoire (5000 entrées) pour la console live.
 *  - Publication vers abonnés (subscribe) — utilisé par l'écran /logs.
 *  - Forward automatique vers le Main via `appPublisher.diag.log()`
 *    (le Main écrit sur disque avec rotation quotidienne).
 *  - Traçage d'opérations : `startOp / endOp / failOp / wrap`.
 *  - Watchdog interne : signale toute opération non résolue > 2 s.
 *
 * API rétro-compatible : `diag()` et `diagOp()` restent exportés.
 */

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "success"
  | "warn"
  | "error"
  | "fatal";

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel | string;
  source: "renderer" | "main" | "preload";
  module?: string;
  message: string;
  ctx?: unknown;
  opId?: string;
  durationMs?: number;
  error?: string;
}

type Listener = (e: LogEntry) => void;

interface DiagBridge {
  log?: (
    e: Partial<LogEntry> & { level: string; message: string; ts?: string },
  ) => void;
  openLog?: () => Promise<string>;
  revealLog?: () => Promise<string>;
  getLogPath?: () => Promise<string>;
  getLogDir?: () => Promise<string>;
  tail?: (limit: number) => Promise<string[]>;
  getSysInfo?: () => Promise<Record<string, unknown>>;
  exportBundle?: (extra?: unknown) => Promise<string>;
  onNavigate?: (cb: (target: string) => void) => () => void;
}

function getBridge(): DiagBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { appPublisher?: { diag?: DiagBridge } };
  return w.appPublisher?.diag;
}

const MAX_BUFFER = 5000;

class LoggerImpl {
  private buffer: LogEntry[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;
  private pending = new Map<string, { name: string; started: number }>();

  private nextId(): string {
    return `${Date.now().toString(36)}-${(++this.seq).toString(36)}`;
  }

  private push(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    }
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        /* noop */
      }
    }
    // Console navigateur (utile en dev).
    try {
      const fn =
        entry.level === "error" || entry.level === "fatal"
          ? console.error
          : entry.level === "warn"
            ? console.warn
            : console.log;
      fn.call(
        console,
        `[diag ${entry.level}] ${entry.module ? `[${entry.module}] ` : ""}${entry.message}`,
        entry.ctx ?? "",
      );
    } catch {
      /* noop */
    }
    // Forward vers le Main (fichier + agrégation).
    const b = getBridge();
    if (b?.log) {
      try {
        b.log({
          ts: new Date(entry.ts).toISOString(),
          source: "renderer",
          level: entry.level,
          message: entry.module
            ? `[${entry.module}] ${entry.message}`
            : entry.message,
          ctx: entry.ctx,
          opId: entry.opId,
          durationMs: entry.durationMs,
          error: entry.error,
        });
      } catch {
        /* noop */
      }
    }
  }

  log(
    level: LogLevel | string,
    module: string | undefined,
    message: string,
    ctx?: unknown,
  ): void {
    this.push({
      id: this.nextId(),
      ts: Date.now(),
      level,
      source: "renderer",
      module,
      message,
      ctx,
    });
  }

  trace(mod: string, msg: string, ctx?: unknown) {
    this.log("trace", mod, msg, ctx);
  }
  debug(mod: string, msg: string, ctx?: unknown) {
    this.log("debug", mod, msg, ctx);
  }
  info(mod: string, msg: string, ctx?: unknown) {
    this.log("info", mod, msg, ctx);
  }
  success(mod: string, msg: string, ctx?: unknown) {
    this.log("success", mod, msg, ctx);
  }
  warn(mod: string, msg: string, ctx?: unknown) {
    this.log("warn", mod, msg, ctx);
  }
  error(mod: string, msg: string, ctx?: unknown) {
    this.log("error", mod, msg, ctx);
  }
  fatal(mod: string, msg: string, ctx?: unknown) {
    this.log("fatal", mod, msg, ctx);
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  snapshot(): LogEntry[] {
    return this.buffer.slice();
  }

  clear(): void {
    this.buffer = [];
    for (const l of this.listeners) {
      try {
        l({
          id: this.nextId(),
          ts: Date.now(),
          level: "info",
          source: "renderer",
          module: "logger",
          message: "buffer effacé",
        });
      } catch {
        /* noop */
      }
    }
  }

  startOp(name: string, ctx?: unknown): string {
    const opId = `r${++this.seq}`;
    this.pending.set(opId, { name, started: Date.now() });
    this.push({
      id: this.nextId(),
      ts: Date.now(),
      level: "op:start",
      source: "renderer",
      module: "op",
      message: name,
      opId,
      ctx,
    });
    return opId;
  }

  endOp(opId: string, ctx?: unknown): void {
    const op = this.pending.get(opId);
    const durationMs = op ? Date.now() - op.started : undefined;
    this.pending.delete(opId);
    this.push({
      id: this.nextId(),
      ts: Date.now(),
      level: "op:end",
      source: "renderer",
      module: "op",
      message: op?.name ?? opId,
      opId,
      durationMs,
      ctx,
    });
  }

  failOp(opId: string, error: unknown): void {
    const op = this.pending.get(opId);
    const durationMs = op ? Date.now() - op.started : undefined;
    this.pending.delete(opId);
    this.push({
      id: this.nextId(),
      ts: Date.now(),
      level: "op:fail",
      source: "renderer",
      module: "op",
      message: op?.name ?? opId,
      opId,
      durationMs,
      error: String((error as Error)?.message ?? error),
    });
  }

  async wrap<T>(name: string, run: () => Promise<T> | T): Promise<T> {
    const opId = this.startOp(name);
    try {
      const v = await Promise.resolve(run());
      this.endOp(opId);
      return v;
    } catch (e) {
      this.failOp(opId, e);
      throw e;
    }
  }

  /** Watchdog : à appeler une fois au démarrage renderer. */
  installWatchdog(): void {
    if (typeof window === "undefined") return;
    const iv = window.setInterval(() => {
      const now = Date.now();
      for (const [opId, { name, started }] of this.pending) {
        const age = now - started;
        if (age > 2000) {
          this.push({
            id: this.nextId(),
            ts: Date.now(),
            level: "watchdog",
            source: "renderer",
            module: "op",
            message: `op '${name}' bloquée depuis ${Math.round(age / 1000)}s`,
            opId,
          });
        }
      }
    }, 2000);
    window.addEventListener("beforeunload", () => window.clearInterval(iv));
  }
}

export const Logger = new LoggerImpl();

/* ---------- API rétro-compatible ---------- */

export function diag(level: string, message: string, ctx?: unknown): void {
  Logger.log(level as LogLevel, undefined, message, ctx);
}

export function diagOp<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  return Logger.wrap(name, run);
}

export function openDiagnosticLog(): Promise<string> | void {
  return getBridge()?.openLog?.();
}

export function diagnosticLogPath(): Promise<string> | undefined {
  return getBridge()?.getLogPath?.();
}

export function diagnosticLogDir(): Promise<string> | undefined {
  return getBridge()?.getLogDir?.();
}

export function tailDiagnosticLog(limit = 500): Promise<string[]> | undefined {
  return getBridge()?.tail?.(limit);
}

export function getSysInfo(): Promise<Record<string, unknown>> | undefined {
  return getBridge()?.getSysInfo?.();
}

export function exportDiagnosticBundle(
  extra?: unknown,
): Promise<string> | undefined {
  return getBridge()?.exportBundle?.(extra);
}

export function onDiagnosticNavigate(
  cb: (target: string) => void,
): (() => void) | undefined {
  return getBridge()?.onNavigate?.(cb);
}
