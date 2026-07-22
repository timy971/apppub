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

export const Route = createFileRoute("/signing")({
  component: SigningPage,
  head: () => ({
    meta: [
      { title: "Signatures Android · AppPublisher" },
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
    const res = await SigningValidator.validate(p.id);
    setBusy(null);
    reload();
    (res.ok ? toast.success : toast.error)(res.title, { description: res.message });
  };

  const remove = async (p: SigningProfile) => {
    await bridge().secrets.remove(p.id).catch(() => {});
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signatures Android"
        subtitle="Vos clés de signature au même endroit. Mots de passe protégés par le trousseau système."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!isElectron()}>
              <Upload className="mr-2 h-4 w-4" /> Importer un keystore
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!isElectron()}>
              <Plus className="mr-2 h-4 w-4" /> Créer une signature
            </Button>
          </div>
        }
      />


      {!isElectron() && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Cet écran est actif dans l'application de bureau AppPublisher. Dans l'aperçu Lovable,
          la lecture de fichiers de signature n'est pas possible.
        </Card>
      )}

      {support && !support.available && isElectron() && (
        <Card className="flex items-start gap-3 border-amber-300/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <div className="font-medium">Trousseau système indisponible</div>
            <div className="text-muted-foreground">{support.reason ?? "Cette plateforme n'est pas encore prise en charge."}</div>
            <div className="mt-1 text-muted-foreground">
              Vous pouvez encore importer un keystore, mais le mot de passe sera demandé à chaque build.
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
            Une signature Android est indispensable pour publier votre application. Importez un
            keystore existant ou créez-en un nouveau — AppPublisher se charge du reste.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!isElectron()}>
              <Upload className="mr-2 h-4 w-4" /> Importer
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!isElectron()}>
              <Plus className="mr-2 h-4 w-4" /> Créer une signature
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
              onReveal={() => bridge().shell.revealItem(p.keystorePath).catch(() => {})}
              onDelete={() => setToDelete(p)}
            />
          ))}
        </div>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={reload} />
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onDone={reload} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette signature ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le profil « {toDelete?.name} » sera retiré d'AppPublisher et le mot de passe effacé du
              trousseau. <b>Le fichier keystore restera sur votre disque.</b> Sans ce fichier, aucune
              future mise à jour de votre application ne sera plus possible sur le Play Store.
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
}: {
  profile: SigningProfile;
  busy: boolean;
  onValidate: () => void;
  onReveal: () => void;
  onDelete: () => void;
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
            <Badge variant="outline">alias : {profile.alias}</Badge>
            <Badge variant="outline">{profile.storeType}</Badge>
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
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{profile.keystorePath}</div>
          {cert && (
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="text-foreground/70">Sujet : </span>
                <span className="font-mono">{cert.subject}</span>
              </div>
              <div>
                <span className="text-foreground/70">Valide jusqu'au : </span>
                <span>{cert.validUntil.slice(0, 10)}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-foreground/70">SHA-256 : </span>
                <span className="font-mono break-all">{cert.sha256}</span>
              </div>
            </dl>
          )}
          {profile.lastUsedAt && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Dernière utilisation : {new Date(profile.lastUsedAt).toLocaleString("fr-FR")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onValidate} disabled={busy}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Vérifier
          </Button>
          <Button variant="outline" size="sm" onClick={onReveal}>
            <FolderIcon className="mr-2 h-4 w-4" /> Voir le fichier
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
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
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [storepass, setStorepass] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setPath("");
      setAlias("");
      setStorepass("");
      setBusy(false);
    }
  }, [open]);

  const choose = async () => {
    const p = await bridge().signing.chooseKeystore();
    if (p) {
      setPath(p);
      if (!name) {
        const base = p.split(/[\\/]/).pop()?.replace(/\.(jks|keystore)$/i, "") ?? "";
        setName(base);
      }
    }
  };

  const submit = async () => {
    setBusy(true);
    const res = await KeystoreImporter.import({ name, keystorePath: path, alias, storepass });
    setBusy(false);
    // Purge sécurité — état local du mot de passe.
    setStorepass("");
    if (res.ok) {
      toast.success(res.title, { description: res.message });
      onDone();
      onOpenChange(false);
    } else {
      toast.error(res.title, { description: res.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer un keystore existant</DialogTitle>
          <DialogDescription>
            AppPublisher lit votre keystore avec keytool et enregistre le mot de passe dans le
            trousseau système. Aucun mot de passe ne quitte votre ordinateur.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nom d'affichage</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : CranioScan Release" />
          </div>
          <div className="grid gap-1.5">
            <Label>Fichier keystore</Label>
            <div className="flex gap-2">
              <Input value={path} readOnly placeholder="Aucun fichier sélectionné" />
              <Button type="button" variant="outline" onClick={choose}>Choisir…</Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Alias</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ex : upload" autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mot de passe du keystore</Label>
            <Input type="password" value={storepass} onChange={(e) => setStorepass(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy || !name || !path || !alias || !storepass}>
            {busy ? "Vérification…" : "Importer"}
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [fileName, setFileName] = useState("release.jks");
  const [alias, setAlias] = useState("upload");
  const [storepass, setStorepass] = useState("");
  const [keypass, setKeypass] = useState("");
  const [cn, setCn] = useState("");
  const [org, setOrg] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("FR");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName(""); setFolder(""); setFileName("release.jks"); setAlias("upload");
      setStorepass(""); setKeypass(""); setCn(""); setOrg(""); setCity(""); setCountry("FR");
      setBusy(false);
    }
  }, [open]);

  const chooseFolder = async () => {
    const f = await bridge().signing.chooseOutputFolder();
    if (f) setFolder(f);
  };

  const submit = async () => {
    setBusy(true);
    const res = await KeystoreCreator.create({
      name,
      outputFolder: folder,
      fileName,
      alias,
      storepass,
      keypass,
      identity: { commonName: cn, organization: org, city, country },
      validityDays: 10_000,
    });
    setBusy(false);
    setStorepass("");
    setKeypass("");
    if (res.ok) {
      toast.success(res.title, { description: res.message, duration: 12_000 });
      onDone();
      onOpenChange(false);
    } else {
      toast.error(res.title, { description: res.message });
    }
  };

  const valid =
    name && folder && fileName && alias &&
    storepass.length >= 6 && keypass.length >= 6 &&
    cn && org && country.length === 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Créer une nouvelle signature Android</DialogTitle>
          <DialogDescription>
            AppPublisher génère un keystore avec keytool. <b>Sauvegardez le fichier</b> après création :
            sans lui, aucune future mise à jour de votre application ne sera plus possible sur le Play Store.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Nom d'affichage</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : CranioScan Release" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Dossier de destination</Label>
            <div className="flex gap-2">
              <Input value={folder} readOnly placeholder="Aucun dossier sélectionné" />
              <Button type="button" variant="outline" onClick={chooseFolder}>Choisir…</Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Nom du fichier</Label>
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="release.jks" />
          </div>
          <div className="grid gap-1.5">
            <Label>Alias</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mot de passe du keystore</Label>
            <Input type="password" value={storepass} onChange={(e) => setStorepass(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mot de passe de la clé</Label>
            <Input type="password" value={keypass} onChange={(e) => setKeypass(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Nom / Nom de l'application (CN)</Label>
            <Input value={cn} onChange={(e) => setCn(e.target.value)} placeholder="Ex : CranioScan" />
          </div>
          <div className="grid gap-1.5">
            <Label>Organisation (O)</Label>
            <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Ex : TCC" />
          </div>
          <div className="grid gap-1.5">
            <Label>Ville (L)</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex : Paris" />
          </div>
          <div className="grid gap-1.5">
            <Label>Pays (2 lettres)</Label>
            <Input value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? "Création…" : "Créer la signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
