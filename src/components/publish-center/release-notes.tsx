import { useMemo } from "react";
import { Copy, FileText, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReleaseNotesService } from "@/core/release-notes/service";
import type { Project } from "@/core/types";
import { toast } from "sonner";
import { formatDate } from "./shared";

const MAX_LEN = 500;

const TEMPLATES: { label: string; body: string }[] = [
  { label: "Corrections de bugs", body: "Correction de plusieurs anomalies signalées." },
  {
    label: "Amélioration des performances",
    body: "Amélioration des performances générales de l'application.",
  },
  {
    label: "Nouvelle fonctionnalité",
    body: "Nouvelle fonctionnalité disponible.",
  },
  { label: "Maintenance", body: "Mise à jour de maintenance." },
];

interface Props {
  project: Project;
  draft: string;
  onDraftChange: (v: string) => void;
}

export function ReleaseNotesCard({ project, draft, onDraftChange }: Props) {
  const formatted = useMemo(() => ReleaseNotesService.format(draft), [draft]);
  const history = useMemo(() => ReleaseNotesService.historyFor(project.id), [project.id]);
  const remaining = MAX_LEN - formatted.length;

  const insertTemplate = (body: string) => {
    const next = draft.trim().length ? draft.trim() + "\n" + body : body;
    onDraftChange(next.slice(0, MAX_LEN));
  };

  const reuse = (notes: string) => {
    onDraftChange(notes);
    toast.success("Notes précédentes réutilisées.");
  };

  const copy = async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success("Notes copiées");
    } catch {
      toast.error("Impossible de copier automatiquement");
    }
  };

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Notes de version</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Décrivez brièvement les nouveautés — 500 caractères maximum pour Google Play.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {formatted.length}/{MAX_LEN}
          {remaining < 50 && remaining >= 0 && (
            <span className="ml-1 text-warning">· {remaining} restants</span>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <Button
            key={t.label}
            variant="outline"
            size="sm"
            onClick={() => insertTemplate(t.body)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
      </div>

      <Textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value.slice(0, MAX_LEN * 2))}
        rows={5}
        placeholder="Exemples :&#10;• Correction d'un bug sur l'affichage des mesures&#10;• Nouveau tableau de suivi"
      />

      {formatted && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Aperçu — prêt pour Google Play
            </div>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
              Copier
            </Button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {formatted}
          </pre>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Historique des notes
          </div>
          <ul className="space-y-2">
            {history.slice(0, 3).map((n, i) => (
              <li
                key={i}
                className="rounded-lg border bg-background p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    v{n.version} · {formatDate(n.createdAt)}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => reuse(n.notes)}>
                    Réutiliser
                  </Button>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{n.notes}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
