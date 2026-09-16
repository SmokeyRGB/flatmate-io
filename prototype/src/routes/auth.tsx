import { fmError } from "@/lib/fm/errors";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createHousehold, resolveLoginEmail } from "@/lib/fm/functions";
import { useServerFn } from "@tanstack/react-start";
import { JoinForm } from "@/components/fm/JoinForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) throw redirect({ to: "/zuhause" });
  },
  head: () => ({
    meta: [
      { title: "Anmelden oder WG gründen · flatmate.io" },
      { name: "description", content: "Melde dich an, gründe eine neue WG oder tritt mit deinem Einladungslink bei." },
      { property: "og:title", content: "Anmelden oder WG gründen · flatmate.io" },
      { property: "og:description", content: "Melde dich an, gründe eine neue WG oder tritt mit deinem Einladungslink bei." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-block rounded-2xl bg-primary px-4 py-1.5 font-display text-lg font-semibold text-primary-foreground">
            flatmate.io
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-foreground">Casting ohne Chat-Chaos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ein Ort für Bewerbungen, Stimmen und die Rangliste — statt WhatsApp-Gruppe und Doodle.
          </p>
        </div>

        <Card className="fm-card">
          <CardHeader>
            <CardTitle className="text-lg">Rein in die WG</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin">Anmelden</TabsTrigger>
                <TabsTrigger value="join">Einsteigen</TabsTrigger>
                <TabsTrigger value="new">WG gründen</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4">
                <SignInForm />
              </TabsContent>
              <TabsContent value="join" className="mt-4">
                <JoinWithCode />
              </TabsContent>
              <TabsContent value="new" className="mt-4">
                <NewHouseholdForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/60 p-4 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Demo-Zugang (Passwort: demo1234)</p>
          <p>
            Moderatorin: <span className="font-mono">lena@wg-demo.de</span> · Bewohner:{" "}
            <span className="font-mono">jonas@wg-demo.de</span>
          </p>
          <p>
            Ehemalige: <span className="font-mono">sophie@wg-demo.de</span> · WG-Konto:{" "}
            <span className="font-mono">wg-sonnenallee@wg-demo.de</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const resolve = useServerFn(resolveLoginEmail);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { email } = await resolve({ data: { identifier } });
      if (!email) throw new Error("kein Konto");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/zuhause" });
    } catch {
      toast.error("Anmelden fehlgeschlagen", { description: "Name bzw. E-Mail oder Passwort passt nicht." });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={signIn} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="identifier">E-Mail oder dein Name</Label>
        <Input
          id="identifier"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="lena@wg-demo.de"
          autoComplete="username"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="demo1234"
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Einen Moment …" : "Anmelden"}
      </Button>
    </form>
  );
}

function JoinWithCode() {
  const [code, setCode] = useState("");
  const [active, setActive] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">Einladungscode</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="z. B. ABCDE-FGHIJ"
        />
        <p className="text-xs text-muted-foreground">
          Den Code bekommst du direkt von deinen Mitbewohnenden — ohne Einladung geht es nicht.
        </p>
      </div>
      <Button variant="secondary" className="w-full" disabled={code.trim().length < 5} onClick={() => setActive(code.trim())}>
        Einladung prüfen
      </Button>
      {active && <JoinForm code={active} />}
    </div>
  );
}

function NewHouseholdForm() {
  const navigate = useNavigate();
  const create = useServerFn(createHousehold);
  const [householdName, setHouseholdName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEmailTaken(false);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          setEmailTaken(true);
          throw new Error("Mit dieser E-Mail gibt es schon ein Konto.");
        }
        throw new Error(error.message);
      }
      await create({ data: { householdName, displayName } });
      toast.success(`${householdName.trim()} ist angelegt. Wohnst du selbst mit? Dann leg dir noch ein Bewohner-Profil an.`);
      navigate({ to: "/zuhause" });
    } catch (err) {
      toast.error("WG gründen hat nicht geklappt", { description: fmError(err) });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs">
        <Info className="mt-0.5 size-4 shrink-0" />
        Deine E-Mail-Adresse ist für alle späteren WG-Verwalter:innen sichtbar — sie gehört zum WG-Konto, nicht nur zu
        dir.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="hh-name">Name der WG</Label>
        <Input
          id="hh-name"
          required
          minLength={2}
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          placeholder="z. B. WG Sonnenallee 12"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hh-display">Name des WG-Kontos</Label>
        <Input
          id="hh-display"
          required
          minLength={2}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="z. B. WG-Verwaltung"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hh-mail">E-Mail</Label>
        <Input id="hh-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {emailTaken && (
          <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            Mit dieser Adresse gibt es schon ein Konto. Wechsle oben auf „Anmelden" und melde dich damit an — oder nimm
            eine andere Adresse für die neue WG.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hh-pass">Passwort</Label>
        <Input
          id="hh-pass"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mindestens 8 Zeichen"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Einen Moment …" : "WG gründen"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Das WG-Konto verwaltet Zimmer und Mitglieder — es stimmt nicht ab und sieht keine Bewerbungen.
      </p>
    </form>
  );
}
