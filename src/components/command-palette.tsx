import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Hammer,
  HeartPulse,
  History,
  Settings as SettingsIcon,
  Rocket,
  LifeBuoy,
  Terminal,
  KeyRound,
  FolderOpen,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useProjects } from "@/core/store/app-store";
import { useIsExpert } from "@/core/store/use-mode";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primary: NavItem[] = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "Projets", url: "/projects", icon: FolderKanban },
];

const publication: NavItem[] = [
  { title: "Modifier la version", url: "/version", icon: GitBranch },
  { title: "Construire Android", url: "/build", icon: Hammer },
  { title: "Préparer la publication", url: "/publish", icon: Rocket },
];

const utils: NavItem[] = [
  { title: "Santé du projet", url: "/diagnostic", icon: HeartPulse },
  { title: "Signatures Android", url: "/signing", icon: KeyRound },
  { title: "Journal", url: "/history", icon: History },
  { title: "Paramètres", url: "/settings", icon: SettingsIcon },
];

const supportBase: NavItem[] = [
  { title: "Support", url: "/journal", icon: LifeBuoy },
];

const expertOnly: NavItem[] = [
  { title: "Console", url: "/logs", icon: Terminal },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projects = useProjects();
  const isExpert = useIsExpert();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (url: string) => {
    setOpen(false);
    void navigate({ to: url });
  };

  const support = isExpert ? [...supportBase, ...expertOnly] : supportBase;

  const renderGroup = (heading: string, items: NavItem[]) => (
    <CommandGroup heading={heading}>
      {items.map((item) => (
        <CommandItem
          key={item.url}
          value={`${heading} ${item.title}`}
          onSelect={() => go(item.url)}
        >
          <item.icon className="mr-2 h-4 w-4" />
          <span>{item.title}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Rechercher une page ou un projet…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        {renderGroup("Général", primary)}
        <CommandSeparator />
        {renderGroup("Publication", publication)}
        <CommandSeparator />
        {renderGroup("Outils", utils)}
        <CommandSeparator />
        {renderGroup("Assistance", support)}
        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projets">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`Projet ${p.displayName ?? p.technicalName ?? p.id}`}
                  onSelect={() => go(`/projects/${p.id}`)}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Ouvrir {p.displayName ?? p.technicalName ?? p.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
