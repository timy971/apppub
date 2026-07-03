import type { JournalEntry, JournalLevel } from "@/core/types";
import { storage, STORAGE_KEYS } from "@/core/storage";

const MAX_ENTRIES = 500;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const JournalService = {
  list(): JournalEntry[] {
    return storage.get<JournalEntry[]>(STORAGE_KEYS.journal, []);
  },

  log(level: JournalLevel, message: string, context?: Record<string, unknown>): void {
    const entry: JournalEntry = {
      id: uid(),
      level,
      message,
      context,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...this.list()].slice(0, MAX_ENTRIES);
    storage.set(STORAGE_KEYS.journal, next);
  },

  /** Phase 2 — enregistrement structuré d'une commande exécutée. */
  logCommand(input: {
    command: string;
    cwd?: string;
    durationMs: number;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    message?: string;
  }): void {
    const level: JournalLevel = input.exitCode === 0 ? "command" : "error";
    const tailFrom = [input.stdout, input.stderr].filter(Boolean).join("\n");
    const tail = tailFrom.split("\n").slice(-200).join("\n");
    const entry: JournalEntry = {
      id: uid(),
      level,
      message: input.message ?? input.command,
      command: input.command,
      cwd: input.cwd,
      durationMs: input.durationMs,
      exitCode: input.exitCode,
      tail,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...this.list()].slice(0, MAX_ENTRIES);
    storage.set(STORAGE_KEYS.journal, next);
  },

  /** Export texte complet pour transmission au support. */
  exportText(): string {
    const lines = this.list().map((e) => {
      const head = `[${e.createdAt}] [${e.level}] ${e.message}`;
      const meta = [
        e.command ? `cmd: ${e.command}` : null,
        e.cwd ? `cwd: ${e.cwd}` : null,
        e.durationMs != null ? `duration: ${e.durationMs}ms` : null,
        e.exitCode != null ? `exit: ${e.exitCode}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const tail = e.tail ? `\n${e.tail}` : "";
      return [head, meta, tail].filter(Boolean).join("\n");
    });
    return lines.join("\n\n");
  },

  clear(): void {
    storage.remove(STORAGE_KEYS.journal);
  },
};
