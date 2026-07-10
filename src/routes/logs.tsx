import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eraser,
  FileText,
  FolderOpen,
  Pause,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Logger,
  type LogEntry,
  type LogLevel,
  exportDiagnosticBundle,
  openDiagnosticLog,
  diagnosticLogDir,
  getSysInfo,
} from "@/core/diag/logger";
import { analyze, type AnalysisFinding } from "@/core/diag/analyzer";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

const LEVEL_CLASS: Record<string, string> = {
  trace: "text-muted-foreground",
  debug: "text-muted-foreground",
  info: "text-foreground",
  success: "text-success",
  warn: "text-warning",
  error: "text-danger",
  fatal: "text-danger font-semibold",
  watchdog: "text-warning",
  "op:start": "text-primary",
  "op:end": "text-success",
  "op:fail": "text-danger",
};

const LEVELS: Array<LogLevel | "watchdog" | "op:start" | "op:end" | "op:fail"> = [
  "trace",
  "debug",
  "info",
  "success",
  "warn",
  "error",
  "fatal",
  "watchdog",
  "op:start",
  "op:end",
  "op:fail",
];

function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>(() => Logger.snapshot());
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    () => new Set(LEVELS),
  );
  const [logDir, setLogDir] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  useEffect(() => {
    if (paused) return;
    const off = Logger.subscribe((e) => {
      setEntries((prev) => {
        const next = prev.length > 5000 ? prev.slice(-4500) : prev.slice();
        next.push(e);
        return next;
      });
    });
    return off;
  }, [paused]);

  useEffect(() => {
    diagnosticLogDir()?.then(setLogDir);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (!selectedLevels.has(String(e.level))) return false;
      if (!needle) return true;
      const hay =
        `${e.message} ${e.module ?? ""} ${JSON.stringify(e.ctx ?? "")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [entries, q, selectedLevels]);

  useEffect(() => {
    if (!stickBottom.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function toggleLevel(l: string) {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  }

  async function exportBundle() {
    try {
      const sys = (await getSysInfo?.()) ?? {};
      const dest = await exportDiagnosticBundle?.({
        sys,
        entries: entries.slice(-500),
      });
      if (dest) toast.success(`Bundle exporté : ${dest}`);
      else toast.error("Export non disponible dans cet environnement");
    } catch (e) {
      toast.error(`Export impossible : ${(e as Error).message}`);
    }
  }

  async function openLog() {
    const p = await openDiagnosticLog();
    if (!p) toast.error("Fichier de log indisponible (mode web)");
  }

  const findings: AnalysisFinding[] = useMemo(() => analyze(entries), [entries]);

  return (
    <div>
      <PageHeader
        title="Console de diagnostic"
        subtitle="Journal en direct de toutes les opérations d'AppPublisher. Réservé au support technique."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? "Reprendre" : "Pause"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                Logger.clear();
                setEntries([]);
              }}
            >
              <Eraser className="h-4 w-4" />
              Vider
            </Button>
            <Button variant="outline" onClick={openLog}>
              <FileText className="h-4 w-4" />
              Ouvrir le fichier
            </Button>
            {logDir && (
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(logDir);
                    toast.success("Chemin du dossier copié");
                  } catch {
                    toast.error("Copie impossible");
                  }
                }}
              >
                <FolderOpen className="h-4 w-4" />
                Copier le dossier
              </Button>
            )}
            <Button onClick={exportBundle}>
              <Download className="h-4 w-4" />
              Exporter pour le support
            </Button>
          </div>
        }
      />

      {findings.length > 0 && (
        <Card className="mb-4 p-4 shadow-soft">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Analyse automatique
          </div>
          <ul className="space-y-1 text-sm">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={
                    f.severity === "error"
                      ? "text-danger"
                      : f.severity === "warning"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }
                >
                  ●
                </span>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-muted-foreground">{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-3 p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Filtrer (message, module, contexte…)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((l) => (
              <Badge
                key={l}
                variant={selectedLevels.has(l) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => toggleLevel(l)}
              >
                {l}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      <Card className="shadow-soft">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="max-h-[60vh] overflow-auto p-3 font-mono text-xs"
        >
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucun événement à afficher.
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((e) => (
                <li key={e.id} className="whitespace-pre-wrap">
                  <span className="text-muted-foreground">
                    {new Date(e.ts).toLocaleTimeString("fr-FR")}
                  </span>{" "}
                  <span className={LEVEL_CLASS[String(e.level)] ?? ""}>
                    [{String(e.level)}]
                  </span>{" "}
                  <span className="text-muted-foreground">
                    [{e.source}
                    {e.module ? `/${e.module}` : ""}]
                  </span>{" "}
                  <span>{e.message}</span>
                  {typeof e.durationMs === "number" && (
                    <span className="text-muted-foreground"> · {e.durationMs}ms</span>
                  )}
                  {e.error && <span className="text-danger"> · {e.error}</span>}
                  {e.ctx !== undefined && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {JSON.stringify(e.ctx)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
