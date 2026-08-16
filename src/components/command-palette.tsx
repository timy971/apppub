import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Hammer,
  HeartPulse,
  Settings as SettingsIcon,
  Rocket,
  LifeBuoy,
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

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primary: NavItem[] = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "1. Votre application", url: "/projects", icon: FolderKanban },
];

const publication: NavItem[] = [
  { title: "2. Vérifier", url: "/diagnostic", icon: HeartPulse },
  { title: "3. Préparer la version", url: "/version", icon: GitBranch },
  { title: "4. Protéger", url: "/signing", icon: KeyRound },
  { title: "5. Créer le fichier", url: "/build", icon: Hammer },
  { title: "6. Publier", url: "/publish", icon: Rocket },
];

const utils: NavItem[] = [
  { title: "Activité et aide", url: "/journal", icon: LifeBuoy },
  { title: "Paramètres", url: "/settings", icon: SettingsIcon },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projects = useProjects();

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

  const goProject = (id: string) => {
    setOpen(false);
    void navigate({ to: "/projects/$id", params: { id } });
  };

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
        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projets">
              {projects.map((p) => (
                <CommandItem key={p.id} value={`Projet ${p.name}`} onSelect={() => goProject(p.id)}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Ouvrir {p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
