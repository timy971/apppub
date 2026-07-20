import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeBadge } from "@/components/mode-badge";
import { Toaster } from "@/components/ui/sonner";
import { SetupAssistantProvider } from "@/components/setup-assistant/setup-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rien n'a été cassé. Vous pouvez réessayer ou revenir au tableau de bord.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Tableau de bord
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AppPublisher — Publiez vos applications simplement" },
      {
        name: "description",
        content:
          "Assistant de publication d'applications Android. Guidé, en français, sans jargon.",
      },
      { property: "og:title", content: "AppPublisher — Publiez vos applications simplement" },
      {
        property: "og:description",
        content:
          "Publiez vos applications Android sans retenir une seule commande.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AppPublisher — Publiez vos applications simplement" },
      { name: "description", content: "AppRelease Assistant simplifies Android app publishing for non-technical users, automating complex steps." },
      { property: "og:description", content: "AppRelease Assistant simplifies Android app publishing for non-technical users, automating complex steps." },
      { name: "twitter:description", content: "AppRelease Assistant simplifies Android app publishing for non-technical users, automating complex steps." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a23dd8cb-b21c-4a0c-aa2e-9c39d8f75961/id-preview-d5a40ca3--b53dabf7-8bb0-47a8-beb8-676f291e5d87.lovable.app-1782951819256.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a23dd8cb-b21c-4a0c-aa2e-9c39d8f75961/id-preview-d5a40ca3--b53dabf7-8bb0-47a8-beb8-676f291e5d87.lovable.app-1782951819256.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Phase 3 — au démarrage sous Electron, on ré-enregistre les racines des
  // projets connus afin que le confinement fs:* autorise leur lecture.
  useEffect(() => {
    void (async () => {
      const { bridge } = await import("@/core/bridge");
      const { ProjectsService } = await import("@/core/projects/service");
      const roots = ProjectsService.list().map((p) => p.localPath);
      if (roots.length) await bridge().projects.registerRoots(roots);
    })();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SetupAssistantProvider>
          <AppShell />
        </SetupAssistantProvider>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Le wizard occupe tout l'écran, sans chrome.
  if (pathname.startsWith("/setup")) {
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">
                Publiez sans retenir une seule commande.
              </span>
            </div>
            <ModeBadge />
          </header>
          <main className="flex-1">
            <div className="mx-auto w-full max-w-5xl px-8 py-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
