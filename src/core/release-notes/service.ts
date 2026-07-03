import type { PublishRecord } from "@/core/types";
import { HistoryService } from "@/core/history/service";

/**
 * ReleaseNotesService — met en forme les notes de version.
 * Le format cible est Google Play (500 caractères max, texte simple).
 */

const MAX_LEN = 500;

export const ReleaseNotesService = {
  /** Met en forme la saisie libre en puces courtes et lisibles. */
  format(raw: string): string {
    if (!raw.trim()) return "";
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      // Retire les puces existantes pour normaliser.
      .map((l) => l.replace(/^[-•*]\s*/, ""));
    const grouped = groupHeuristically(lines);
    let out = grouped.join("\n");
    if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN - 1) + "…";
    return out;
  },

  /** Historique des notes pour un projet. */
  historyFor(projectId: string): { createdAt: string; version: string; notes: string }[] {
    return HistoryService.list()
      .filter(
        (h: PublishRecord) =>
          h.projectId === projectId && h.notes && h.notes.trim().length > 0,
      )
      .map((h) => ({ createdAt: h.createdAt, version: h.version, notes: h.notes as string }));
  },
};

function groupHeuristically(lines: string[]): string[] {
  const news: string[] = [];
  const fixes: string[] = [];
  for (const l of lines) {
    if (/^(fix|corrig|correction|bug|problème|résolu)/i.test(l)) fixes.push(l);
    else news.push(l);
  }
  const out: string[] = [];
  if (news.length) {
    out.push("Nouveautés");
    for (const n of news) out.push(`• ${cap(n)}`);
  }
  if (fixes.length) {
    if (out.length) out.push("");
    out.push("Améliorations");
    for (const f of fixes) out.push(`• ${cap(f)}`);
  }
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
