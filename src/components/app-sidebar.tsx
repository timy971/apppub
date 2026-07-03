import { Link, useRouterState } from "@tanstack/react-router";
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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
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

const primary = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "Projets", url: "/projects", icon: FolderKanban },
];

const publication = [
  { title: "Modifier la version", url: "/version", icon: GitBranch },
  { title: "Construire Android", url: "/build", icon: Hammer },
  { title: "Préparer la publication", url: "/publish", icon: Rocket },
];

const utils = [
  { title: "Vérifier le projet", url: "/diagnostic", icon: HeartPulse },
  { title: "Historique", url: "/history", icon: History },
  { title: "Paramètres", url: "/settings", icon: SettingsIcon },
];

const support = [{ title: "Support", url: "/journal", icon: LifeBuoy }];

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
            <div className="leading-tight">
              <div className="text-sm font-semibold">AppPublisher</div>
              <div className="text-[11px] text-muted-foreground">Copilote de publication</div>
            </div>
          )}
        </Link>
        <ProjectSwitcher compact={collapsed} />
      </SidebarHeader>

      <SidebarContent>
        <Section label="Général" items={primary} isActive={isActive} collapsed={collapsed} />
        <Section label="Publication" items={publication} isActive={isActive} collapsed={collapsed} />
        <Section label="Outils" items={utils} isActive={isActive} collapsed={collapsed} />
        <Section label="Assistance" items={support} isActive={isActive} collapsed={collapsed} />
      </SidebarContent>
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
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <Link to={item.url} className="flex items-center gap-3">
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
