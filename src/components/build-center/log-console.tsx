import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  Maximize2,
  Minimize2,
  Terminal,
} from "lucide-react";
import type { LogLine } from "@/core/operations/types";
import type { ExperienceMode } from "@/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  logs: LogLine[];
  mode: ExperienceMode;
}

const HEIGHTS = [240, 360, 560] as const;
const DISPLAY_CAP = 800;

/**
 * LogConsole — panneau logs style GitHub Actions / VS Code.
 * - Repliable · redimensionnable (S/M/L) · auto-scroll · recherche · copie.
 * - Respecte le mode utilisateur : Découverte filtre les logs bruts,
 *   Assistant garde les messages utiles, Expert affiche tout.
 * - Rendu plafonné aux 800 dernières lignes pour rester fluide face à
 *   un stream Gradle.
 */
export function LogConsole({ logs, mode }: Props) {
  const [open, setOpen] = useState(mode === "expert");
  const [heightIdx, setHeightIdx] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = logs;
    if (mode === "discovery") {
      base = logs.filter((l) => l.level === "error" || l.level === "warn");
    } else if (mode === "assistant") {
      base = logs.filter((l) => l.level !== "stdout" || /error|warn|fail/i.test(l.message));
    }
    if (q) base = base.filter((l) => l.message.toLowerCase().includes(q));
    return base;
  }, [logs, mode, query]);

  const visible = useMemo(
    () => (filtered.length > DISPLAY_CAP ? filtered.slice(-DISPLAY_CAP) : filtered),
    [filtered],
  );

  useEffect(() => {
    if (!open || !autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, open, autoScroll]);

  function copy() {
    const text = filtered.map((l) => l.message).join("\n");
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Logs copiés dans le presse-papiers."),
      () => toast.error("Impossible de copier les logs."),
    );
  }

  function toggleHeight() {
    setHeightIdx((i) => (i + 1) % HEIGHTS.length);
  }

  const height = HEIGHTS[heightIdx];

  return (
    <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          <Terminal className="h-4 w-4" />
          Console
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {filtered.length} ligne{filtered.length > 1 ? "s" : ""}
            {filtered.length !== logs.length ? ` · ${logs.length} au total` : ""}
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {open && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="h-8 w-48 pl-7 text-xs"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant={autoScroll ? "secondary" : "outline"}
                onClick={() => setAutoScroll((v) => !v)}
                className="h-8"
              >
                Auto-scroll
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={copy} className="h-8 w-8">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={toggleHeight}
                className="h-8 w-8"
                title="Redimensionner"
              >
                {heightIdx === HEIGHTS.length - 1 ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div
          ref={scrollRef}
          className="overflow-auto bg-[hsl(220_15%_10%)] font-mono text-xs text-slate-100"
          style={{ height }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
            if (!atBottom && autoScroll) setAutoScroll(false);
          }}
        >
          {visible.length === 0 ? (
            <div className="p-4 text-slate-400">Aucun message pour l'instant.</div>
          ) : (
            <ul className="py-2">
              {visible.map((l) => (
                <li
                  key={l.id}
                  className={cn(
                    "px-3 py-0.5 whitespace-pre-wrap break-all leading-relaxed",
                    l.level === "error" && "text-red-300",
                    l.level === "warn" && "text-amber-300",
                    l.level === "stderr" && "text-orange-300",
                    l.level === "command" && "text-cyan-300",
                    l.level === "info" && "text-slate-300",
                  )}
                >
                  {l.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
