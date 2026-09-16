import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmError } from "@/lib/fm/errors";
import { getAccount, getMyContext, updatePassword, addEmail, createResidentProfileForOwner } from "@/lib/fm/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FmError, FmLoading } from "@/components/fm/States";
import { CopyBox } from "@/components/fm/Confirm";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen · flatmate.io" },
      { name: "description", content: "Passwort ändern, E-Mail nachtragen und abmelden." },
      { property: "og:title", content: "Einstellungen · flatmate.io" },
      { property: "og:description", content: "Passwort ändern, E-Mail nachtragen und abmelden." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getAccount);
  const fetchCtx = useServerFn(getMyContext);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["account"], queryFn: fetchAccount });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchCtx });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) return <FmLoading rows={3} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.displayName}</p>
      </div>

      <EmailSection hasRealEmail={data.hasRealEmail} email={data.email} onDone={() => refetch()} />
      <PasswordSection />
      {me?.isHouseholdAccount && <ResidentProfileSection />}

      <Card className="fm-card">
        <CardContent className="py-5">
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-1 size-4" /> Abmelden
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmailSection({ hasRealEmail, email, onDone }: { hasRealEmail: boolean; email: string | null; onDone: () => void }) {
  const save = useServerFn(addEmail);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { email: value } });
      toast.success("E-Mail hinterlegt — du kommst jetzt auch ohne Hilfe wieder rein.");
      setValue("");
      onDone();
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="fm-card">
      <CardHeader>
        <CardTitle className="text-base">E-Mail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasRealEmail ? (
          <p className="text-sm text-muted-foreground">
            Hinterlegt: <span className="font-mono">{email}</span>. Damit kommst du auch dann wieder rein, wenn du dein
            Passwort vergisst.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Du kannst eine E-Mail nachtragen, damit du wieder reinkommst, falls du dein Passwort vergisst. Ohne E-Mail
              funktioniert alles genauso — dann muss die Moderation dir im Notfall ein neues Passwort geben.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-mail">Deine E-Mail-Adresse</Label>
                <Input
                  id="new-mail"
                  type="email"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Einen Moment …" : "E-Mail hinterlegen"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const save = useServerFn(updatePassword);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { password: value } });
      toast.success("Neues Passwort gespeichert.");
      setValue("");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="fm-card">
      <CardHeader>
        <CardTitle className="text-base">Passwort</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-pass">Neues Passwort</Label>
            <Input
              id="new-pass"
              type="password"
              required
              minLength={8}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="mindestens 8 Zeichen"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Einen Moment …" : "Passwort ändern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** ADR-013: Das WG-Konto wohnt nicht. Wer mitwohnt, braucht ein eigenes Bewohner-Profil. */
function ResidentProfileSection() {
  const create = useServerFn(createResidentProfileForOwner);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await create({ data: { displayName: name, password } });
      setLoginEmail(res.loginEmail);
      toast.success("Bewohner-Profil angelegt.");
      setName("");
      setPassword("");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="fm-card">
      <CardHeader>
        <CardTitle className="text-base">Eigenes Bewohner-Profil</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Das WG-Konto verwaltet, es wohnt nicht. Wenn du selbst mitwohnst und abstimmen willst, legst du dir hier ein
          Bewohner-Profil an und meldest dich dafür getrennt an.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="res-name">Dein Name in der WG</Label>
            <Input id="res-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="res-pass">Passwort für dieses Profil</Label>
            <Input
              id="res-pass"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mindestens 8 Zeichen"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Einen Moment …" : "Bewohner-Profil anlegen"}
          </Button>
        </form>
        {loginEmail && (
          <div className="space-y-2">
            <p className="text-sm">
              Fertig. Melde dich dafür mit deinem Namen und dem eben gewählten Passwort an — oder mit dieser
              Anmeldeadresse:
            </p>
            <CopyBox text={loginEmail} rows={1} note={null} label="Anmeldeadresse kopieren" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
