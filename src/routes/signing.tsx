import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  KeyRound,
  Plus,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Folder as FolderIcon,
  AlertTriangle,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { bridge, isElectron } from "@/core/bridge";
import {
  ProfilesStore,
  KeystoreImporter,
  KeystoreCreator,
  SigningValidator,
  isExpired,
  isExpiringSoon,
  type SigningProfile,
  type SecretsSupportInfo,
} from "@/features/android-signing";
import { StepPurpose } from "@/components/step-purpose";
import { JourneyContinuation } from "@/components/journey-continuation";
import { ExpertDetails, ExpertRow } from "@/components/expert-details";
import { useActiveProject, AppStore } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { patchAndroidConfig } from "@/core/projects/android-config";

export const Route = createFileRoute("/signing")({
  component: SigningPage,
  head: () => ({
    meta: [
      { title: "Protéger l'application · AppPublisher" },
      {
        name: "description",
        content:
          "Gérez vos clés de signature Android en toute sécurité : import, création, validation et mots de passe protégés par le trousseau système.",
      },
      { property: "og:title", content: "Signatures Android · AppPublisher" },
      {
        property: "og:description",
        content:
          "Import, création et validation de vos keystores Android, avec mots de passe protégés par le trousseau système.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function useProfiles() {
  const [profiles, setProfiles] = useState<SigningProfile[]>(() => ProfilesStore.list());
  const reload = useCallback(() => setProfiles(ProfilesStore.list()), []);
  return { profiles, reload };
}

function SigningPage() {
  const { profiles, reload } = useProfiles();
  const activeProject = useActiveProject();
  const [support, setSupport] = useState<SecretsSupportInfo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SigningProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    bridge()
      .secrets.supported()
      .then((s) => alive && setSupport(s))
      .catch(() => alive && setSupport({ platform: "web", available: false }));
    return () => {
      alive = false;
    };
  }, []);

  const validate = async (p: SigningProfile) => {
    setBusy(p.id);
    try {
      const res = await SigningValidator.validate(p.id);
      reload();
      (res.ok ? toast.success : toast.error)(res.title, { description: res.message });
    } catch (error) {
      toast.error("Vérification impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: SigningProfile) => {
    const removed = await bridge()
      .secrets.remove(p.id)
      .catch(() => false);
    if (!removed) {
      toast.info("Suppression annulée");
      setToDelete(null);
      return;
    }
    ProfilesStore.remove(p.id);
    reload();
    toast.success("Signature supprimée", {
      description: `Le profil « ${p.name} » a été retiré. Le fichier keystore, lui, n'a pas été supprimé du disque.`,
    });
    setToDelete(null);
  };

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );

  const associatedProfileId = activeProject?.publishing?.android?.signingProfileId;
  const associatedProfile = associatedProfileId
    ? sorted.find((profile) => profile.id === associatedProfileId)
    : undefined;

  const finishProfile = (profileId?: string) => {
    reload();
    if (!activeProject || !profileId) return;
    ProjectsService.update(
      activeProject.id,
      patchAndroidConfig(activeProject, { signingProfileId: profileId }),
      { touched: ["android.signingProfileId"] },
    );
    AppStore.refreshProjects();
    toast.success("Signature associée à l'application", {
      description: `« ${activeProject.name} » utilisera automatiquement cette signature.`,
    });
  };

  const associate = (profileId: string) => finishProfile(profileId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Protéger l'application"
        subtitle="Cette identité numérique prouve à Google Play que les prochaines versions viennent bien de vous. AppPublisher la conserve en sécurité."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={!isElectron()}
            >
              <Upload className="mr-2 h-4 w-4" /> J'ai déjà une signature
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!isElectron()}>
              <Plus className="mr-2 h-4 w-4" /> Créer ma signature
            </Button>
          </div>
        }
      />

      <StepPurpose
        automatic="créer ou vérifier l'identité numérique de votre application et protéger ses mots de passe."
        yourAction="créer une signature si c'est la première publication, sinon choisir celle qui existe déjà."
        result="Google Play peut vérifier que chaque nouvelle version vient bien de vous."
      />

      {!isElectron() && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Cet écran est actif dans l'application de bureau AppPublisher. Dans l'aperçu Lovable, la
          lecture de fichiers de signature n'est pas possible.
        </Card>
      )}

      {support && !support.available && isElectron() && (
        <Card className="flex items-start gap-3 border-amber-300/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <div className="font-medium">Trousseau système indisponible</div>
            <div className="text-muted-foreground">
              {support.reason ?? "Cette plateforme n'est pas encore prise en charge."}
            </div>
            <div className="mt-1 text-muted-foreground">
              Vous pouvez encore importer un keystore, mais le mot de passe sera demandé à chaque
              build.
            </div>
          </div>
        </Card>
      )}

      {sorted.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-base font-medium">Aucune signature enregistrée</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Une signature Android est indispensable pour publier. Si c'est votre première
            publication, choisissez « Créer ma signature ». AppPublisher se charge du fichier
            technique et protège son mot de passe.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={!isElectron()}
            >
              <Upload className="mr-2 h-4 w-4" /> J'en ai déjà une
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!isElectron()}>
              <Plus className="mr-2 h-4 w-4" /> Créer ma signature
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              busy={busy === p.id}
              onValidate={() => validate(p)}
              onReveal={() =>
                bridge()
                  .shell.revealItem(p.keystorePath)
                  .catch((error) =>
                    toast.error("Impossible d'afficher le keystore", {
                      description: error instanceof Error ? error.message : String(error),
                    }),
                  )
              }
              onDelete={() => setToDelete(p)}
              selected={p.id === associatedProfileId}
              applicationName={activeProject?.name}
              onSelect={() => associate(p.id)}
            />
          ))}
        </div>
      )}

      {activeProject && associatedProfile && (
        <JourneyContinuation
          fallbackTo="/build"
          fallbackLabel="Créer le fichier Android"
          title="Signature prête"
          description={`« ${associatedProfile.name} » protège maintenant « ${activeProject.name} ». Vous pouvez reprendre le parcours.`}
        />
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={finishProfile} />
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={finishProfile}
        defaultName={activeProject?.name}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette signature ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le profil « {toDelete?.name} » sera retiré d'AppPublisher et le mot de passe effacé du
              trousseau. <b>Le fichier keystore restera sur votre disque.</b> Sans ce fichier,
              aucune future mise à jour de votre application ne sera plus possible sur le Play
              Store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove(toDelete)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function ProfileRow({
  profile,
  busy,
  onValidate,
  onReveal,
  onDelete,
  selected,
  applicationName,
  onSelect,
}: {
  profile: SigningProfile;
  busy: boolean;
  onValidate: () => void;
  onReveal: () => void;
  onDelete: () => void;
  selected: boolean;
  applicationName?: string;
  onSelect: () => void;
}) {
  const cert = profile.certificate;
  const expired = isExpired(cert);
  const soon = !expired && isExpiringSoon(cert, 90);
  const secure = profile.secureStorage === "system-keychain";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{profile.name}</h3>
            {secure ? (
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Trousseau système
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-3 w-3" /> Mot de passe non stocké
              </Badge>
            )}
            {expired && <Badge variant="destructive">Certificat expiré</Badge>}
            {soon && !expired && (
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                Expire bientôt
              </Badge>
            )}
            {selected && applicationName && (
              <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                <ShieldCheck className="h-3 w-3" /> Utilisée par {applicationName}
              </Badge>
            )}
          </div>
          {cert && (
            <div className="mt-2 text-xs text-muted-foreground">
              Valide jusqu'au {new Date(cert.validUntil).toLocaleDateString("fr-FR")}
            </div>
          )}
          <ExpertDetails title="Détails techniques">
            <ExpertRow label="Fichier" value={profile.keystorePath} />
            <ExpertRow label="Alias" value={profile.alias} />
            <ExpertRow label="Format" value={profile.storeType} />
            <ExpertRow label="Certificat" value={cert?.subject} />
            <ExpertRow label="SHA-256" value={cert?.sha256} />
          </ExpertDetails>
          {profile.lastUsedAt && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Dernière utilisation : {new Date(profile.lastUsedAt).toLocaleString("fr-FR")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {applicationName && !selected && (
            <Button size="sm" onClick={onSelect}>
              Utiliser pour {applicationName}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onValidate} disabled={busy}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Vérifier
          </Button>
          <Button variant="outline" size="sm" onClick={onReveal}>
            <FolderIcon className="mr-2 h-4 w-4" /> Voir le fichier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
            aria-label="Supprimer la signature"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (profileId?: string) => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [storepass, setStorepass] = useState("");
  const [detectedAliases, setDetectedAliases] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setPath("");
      setAlias("");
      setStorepass("");
      setDetectedAliases([]);
      setBusy(false);
    }
  }, [open]);

  const choose = async () => {
    try {
      const p = await bridge().signing.chooseKeystore();
      if (p) {
        setPath(p);
        setAlias("");
        setDetectedAliases([]);
        if (!name) {
          const base =
            p
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.(jks|keystore)$/i, "") ?? "";
          setName(base);
        }
      }
    } catch (error) {
      toast.error("Sélection impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      let selectedAlias = alias;
      if (detectedAliases.length === 0) {
        const detection = await KeystoreImporter.detectAliases({
          keystorePath: path,
          storepass,
        });
        if (!detection.ok) {
          setStorepass("");
          toast.error(detection.title, { description: detection.message });
          return;
        }

        setDetectedAliases(detection.aliases);
        if (detection.aliases.length > 1) {
          toast.success(detection.title, { description: detection.message });
          return;
        }
        selectedAlias = detection.aliases[0];
        setAlias(selectedAlias);
      }

      if (!selectedAlias) return;
      const res = await KeystoreImporter.import({
        name,
        keystorePath: path,
        alias: selectedAlias,
        storepass,
      });
      // Purge sécurité — état local du mot de passe.
      setStorepass("");
      if (res.ok) {
        toast.success(res.title, { description: res.message });
        onDone(res.profile?.id);
        onOpenChange(false);
      } else {
        toast.error(res.title, { description: res.message });
      }
    } catch (error) {
      setStorepass("");
      toast.error("Importation impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Utiliser une signature existante</DialogTitle>
          <DialogDescription>
            Choisissez le fichier utilisé pour vos publications précédentes. AppPublisher le vérifie
            et protège son mot de passe dans le trousseau système.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="signature-import-name">Nom d'affichage</Label>
            <Input
              id="signature-import-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : CranioScan Release"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-import-path">Fichier de signature</Label>
            <div className="flex gap-2">
              <Input
                id="signature-import-path"
                value={path}
                readOnly
                placeholder="Aucun fichier sélectionné"
              />
              <Button type="button" variant="outline" onClick={choose}>
                Choisir…
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-import-alias">Clé de signature</Label>
            {detectedAliases.length === 0 ? (
              <p
                id="signature-import-alias"
                className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
              >
                L'alias sera détecté après la saisie du mot de passe.
              </p>
            ) : detectedAliases.length === 1 ? (
              <Input
                id="signature-import-alias"
                value={detectedAliases[0]}
                readOnly
                aria-label="Alias détecté"
              />
            ) : (
              <Select value={alias} onValueChange={setAlias}>
                <SelectTrigger id="signature-import-alias">
                  <SelectValue placeholder="Choisir la clé de cette application" />
                </SelectTrigger>
                <SelectContent>
                  {detectedAliases.map((detectedAlias) => (
                    <SelectItem key={detectedAlias} value={detectedAlias}>
                      {detectedAlias}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-import-password">Mot de passe de la signature</Label>
            <Input
              id="signature-import-password"
              type="password"
              value={storepass}
              onChange={(e) => {
                setStorepass(e.target.value);
                setAlias("");
                setDetectedAliases([]);
              }}
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={
              busy || !name || !path || !storepass || (detectedAliases.length > 1 && !alias)
            }
          >
            {busy
              ? detectedAliases.length === 0
                ? "Détection…"
                : "Importation…"
              : detectedAliases.length === 0
                ? "Détecter et importer"
                : "Importer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

function CreateDialog({
  open,
  onOpenChange,
  onDone,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (profileId?: string) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [folder, setFolder] = useState("");
  const [storepass, setStorepass] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName((current) => current || defaultName || "");
      return;
    }
    if (!open) {
      setName(defaultName ?? "");
      setFolder("");
      setStorepass("");
      setPasswordConfirm("");
      setBusy(false);
    }
  }, [defaultName, open]);

  const chooseFolder = async () => {
    try {
      const f = await bridge().signing.chooseOutputFolder();
      if (f) setFolder(f);
    } catch (error) {
      toast.error("Sélection impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const fileBase =
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "application";
      const res = await KeystoreCreator.create({
        name,
        outputFolder: folder,
        fileName: `${fileBase}-signature.jks`,
        alias: "upload",
        storepass,
        keypass: storepass,
        identity: { commonName: name, organization: name, city: "", country: "FR" },
        validityDays: 10_000,
      });
      if (res.ok) {
        toast.success(res.title, { description: res.message, duration: 12_000 });
        onDone(res.profile?.id);
        onOpenChange(false);
      } else {
        toast.error(res.title, { description: res.message });
      }
    } catch (error) {
      toast.error("Création impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
      setStorepass("");
      setPasswordConfirm("");
    }
  };

  const valid = name.trim() && folder && storepass.length >= 6 && storepass === passwordConfirm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Créer une nouvelle signature Android</DialogTitle>
          <DialogDescription>
            AppPublisher crée automatiquement le fichier technique.{" "}
            <b>Conservez-en une sauvegarde</b> : sans lui, aucune future mise à jour ne sera
            possible sur Google Play.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="signature-name">Nom de l'application</Label>
            <Input
              id="signature-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : CranioScan"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-output-folder">Dossier de sauvegarde</Label>
            <div className="flex gap-2">
              <Input
                id="signature-output-folder"
                value={folder}
                readOnly
                placeholder="Aucun dossier sélectionné"
              />
              <Button type="button" variant="outline" onClick={chooseFolder}>
                Choisir…
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Choisissez un dossier que vous sauvegardez régulièrement. AppPublisher créera et
              nommera le fichier automatiquement.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-password">Mot de passe</Label>
            <Input
              id="signature-password"
              type="password"
              value={storepass}
              onChange={(e) => setStorepass(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Au moins 6 caractères. Il sera protégé par le trousseau de votre Mac.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature-password-confirm">Confirmer le mot de passe</Label>
            <Input
              id="signature-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {passwordConfirm && passwordConfirm !== storepass && (
              <p role="alert" className="text-xs text-danger">
                Les mots de passe sont différents.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? "Création…" : "Créer la signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
