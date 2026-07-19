import type { CopilotRule } from "../types";

const OLD_BACKUP_DAYS = 7;

export const backupRule: CopilotRule = {
  id: "backup",
  evaluate(ctx) {
    const { project, backups } = ctx;
    if (!project) return null;
    const own = backups.filter((b) => b.projectId === project.id);
    if (own.length === 0) {
      return {
        id: "backup.none",
        kind: "information",
        priority: 700,
        headline: "Aucune sauvegarde n'a encore été créée",
        description:
          "AppPublisher créera automatiquement une sauvegarde avant chaque opération sensible.",
      };
    }
    const last = own[0];
    const days = (Date.now() - new Date(last.createdAt).getTime()) / 86400000;
    if (days > OLD_BACKUP_DAYS) {
      return {
        id: "backup.old",
        kind: "warning",
        priority: 750,
        headline: "Votre dernière sauvegarde date de plus d'une semaine",
        description: "Envisagez d'en créer une nouvelle avant votre prochaine release.",
      };
    }
    return {
      id: "backup.fresh",
      kind: "success",
      priority: 970,
      headline: "Sauvegarde récente disponible",
    };
  },
};
