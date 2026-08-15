import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Hammer,
  HeartPulse,
  Settings as SettingsIcon,
  Rocket,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./project-switcher";
import { AppInfo, formatBuildTimestamp } from "@/core/app-info";

const primary = [{ title: "Accueil", url: "/", icon: LayoutDashboard }];

const publication = [
  { title: "1. Votre application", url: "/projects", icon: FolderKanban },
  { title: "2. Vérifier l'application", url: "/diagnostic", icon: HeartPulse },
  { title: "3. Préparer la version", url: "/version", icon: GitBranch },
  { title: "4. Protéger l'application", url: "/signing", icon: ShieldCheck },
  { title: "5. Créer le fichier Android", url: "/build", icon: Hammer },
  { title: "6. Publier sur Google Play", url: "/publish", icon: Rocket },
];

const utils = [
  { title: "Aide et historique", url: "/journal", icon: LifeBuoy },
  { title: "Paramètres", url: "/settings", icon: SettingsIcon },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" className="mb-3 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            A
          </div>
          {!collapsed && (
            <div className="flex-1 leading-tight">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">AppPublisher</div>
                <kbd
                  className="pointer-events-none hidden select-none rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block"
                  title="Ouvrir la palette de commandes"
                >
                  ⌘K
                </kbd>
              </div>
              <div className="text-[11px] text-muted-foreground">Assistant de publication</div>
            </div>
          )}
        </Link>
        <ProjectSwitcher compact={collapsed} />
      </SidebarHeader>

      <SidebarContent>
        <Section label="Essentiel" items={primary} isActive={isActive} collapsed={collapsed} />
        <Section
          label="Publier pas à pas"
          items={publication}
          isActive={isActive}
          collapsed={collapsed}
        />
        <Section label="Besoin d'aide ?" items={utils} isActive={isActive} collapsed={collapsed} />
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t px-3 py-3 text-[11px] leading-tight text-muted-foreground">
          <div className="font-medium text-foreground/80">
            {AppInfo.name} v{AppInfo.version}
          </div>
          <div>par {AppInfo.author}</div>
          {formatBuildTimestamp() && (
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              {formatBuildTimestamp()}
            </div>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function Section({
  label,
  items,
  isActive,
  collapsed,
}: {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[];
  isActive: (p: string) => boolean;
  collapsed: boolean;
}) {
  return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link
                  to={item.url}
                  className="flex items-center gap-3"
                  aria-current={isActive(item.url) ? "page" : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
