import { fmError } from "@/lib/fm/errors";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { joinHousehold, peekInvite } from "@/lib/fm/functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function syntheticEmail(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wg";
  return `${slug}-${Math.random().toString(36).slice(2, 8)}@wg.local`;
}

export function JoinForm({ code }: { code: string }) {
  const navigate = useNavigate();
  const join = useServerFn(joinHousehold);
  const peek = useServerFn(peekInvite);
  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", code],
    queryFn: () => peek({ data: { code } }),
    enabled: code.trim().length > 3,
  });

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [stay, setStay] = useState(true);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Einladung wird geprüft …</p>;
  if (!invite?.valid) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
        {invite?.reason ?? "Diese Einladung ist nicht gültig. Frag deine Mitbewohnenden nach einem neuen Link."}
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const mail = email.trim() || syntheticEmail(name);
      const { error } = await supabase.auth.signUp({ email: mail, password });
      if (error) throw new Error(error.message);
      if (!stay) {
        window.addEventListener("beforeunload", () => void supabase.auth.signOut(), { once: true });
      }
      await join({ data: { displayName: name, code } });
      toast.success(`Willkommen in der WG, ${name.trim()}!`);
      navigate({ to: "/zuhause" });
    } catch (err) {
      toast.error("Beitreten hat nicht geklappt", { description: fmError(err) });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-xl bg-secondary/60 p-3 text-sm">
        Du trittst <span className="font-medium">{invite.householdName}</span> bei.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="join-name">Dein Name *</Label>
        <Input
          id="join-name"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wie die WG dich ruft"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="join-pass">Passwort *</Label>
        <Input
          id="join-pass"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mindestens 8 Zeichen"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="join-mail">E-Mail (freiwillig)</Label>
        <Input
          id="join-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nur falls du dein Passwort zurücksetzen können willst"
          autoComplete="email"
        />
        <p className="text-xs text-muted-foreground">
          Ohne E-Mail geht das Anmelden über deinen Namen und dein Passwort — ein vergessenes Passwort lässt sich dann
          aber nicht zurücksetzen.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={stay} onCheckedChange={(c) => setStay(Boolean(c))} />
        Auf diesem Gerät angemeldet bleiben
      </label>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Einen Moment …" : "Beitreten & loslegen"}
      </Button>
    </form>
  );
}
