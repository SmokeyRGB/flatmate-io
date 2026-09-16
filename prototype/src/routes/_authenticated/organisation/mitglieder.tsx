import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getOrganisation,
  updateMember,
  deleteMember,
  createInvite,
  updateInvite,
  resetDemoHousehold,
} from "@/lib/fm/functions";
import { fmError } from "@/lib/fm/errors";
import { Confirm } from "@/components/fm/Confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Copy, DoorOpen, RotateCcw, ShieldCheck, Trash2, TriangleAlert, UserMinus, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organisation/mitglieder")({
  component: MembersPage,
});

function dateDE(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("de-DE") : null;
}

function MembersPage() {
  const fetchOrg = useServerFn(getOrganisation);
  const { data, isLoading } = useQuery({ queryKey: ["organisation"], queryFn: fetchOrg });

  if (isLoading || !data) return <p className="text-muted-foreground">Wird geladen …</p>;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/organisation">
          <ArrowLeft className="size-4" /> Organisation
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Mitglieder</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.me.householdName}</p>
      </div>

      <InviteSection invites={data.invites} />

      <div className="space-y-2">
        {data.members.map((m) => (
          <MemberCard key={m.id} member={m} />
        ))}
      </div>

      {data.me.householdName === "WG Sonnenallee 12" && <ResetCard />}
    </div>
  );
}

type OrgData = Awaited<ReturnType<typeof getOrganisation>>;

function MemberCard({ member }: { member: OrgData["members"][number] }) {
  const queryClient = useQueryClient();
  const update = useServerFn(updateMember);
  const remove = useServerFn(deleteMember);
  const [confirm, setConfirm] = useState<"mark_moved_out" | "reactivate" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState(member.contact ?? "");

  const isMod = member.roles.includes("moderator");
  const isHousehold = member.roles.includes("household_account");
  const isFormer = member.status === "moved_out";

  async function act(action: "grant_moderator" | "revoke_moderator" | "mark_moved_out" | "reactivate" | "set_contact") {
    try {
      await update({ data: { profileId: member.id, action, contact } });
      await queryClient.invalidateQueries();
      toast.success("Gespeichert.");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setConfirm(null);
      setContactOpen(false);
    }
  }

  async function purge() {
    try {
      await remove({ data: { profileId: member.id } });
      await queryClient.invalidateQueries();
      toast.success(`${member.display_name} wurde endgültig entfernt.`);
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setDeleteOpen(false);
      setDeleteInput("");
    }
  }

  return (
    <Card className="fm-card">
      <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="min-w-0">
          <div className="font-medium">
            {member.display_name}
            {isFormer && (
              <Badge variant="secondary" className="ml-2">
                <DoorOpen className="mr-1 size-3" /> ausgezogen
              </Badge>
            )}
            {isMod && (
              <Badge className="ml-2 bg-primary text-primary-foreground">
                <ShieldCheck className="mr-1 size-3" /> Moderation
              </Badge>
            )}
            {isHousehold && (
              <Badge variant="outline" className="ml-2">
                WG-Konto
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isHousehold
              ? "Verwaltet die WG — stimmt nicht ab und sieht keine Bewerbungen."
              : isFormer
                ? "Stimmen bleiben gespeichert, zählen aber nicht mehr mit."
                : "Stimmberechtigt"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dateDE(member.moved_in_on) ? `Dabei seit ${dateDE(member.moved_in_on)}` : "Einzugsdatum unbekannt"}
            {isFormer && dateDE(member.moved_out_on) ? ` · ausgezogen am ${dateDE(member.moved_out_on)}` : ""}
            {" · "}
            {member.contact ? member.contact : "kein Kontakt hinterlegt"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setContactOpen(true)}>
            Kontakt
          </Button>
          {!isHousehold && !isFormer && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => act(isMod ? "revoke_moderator" : "grant_moderator")}
              >
                {isMod ? "Moderation entziehen" : "Moderation geben"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs text-destructive"
                onClick={() => setConfirm("mark_moved_out")}
              >
                <UserMinus className="mr-1 size-3.5" /> Ausgezogen
              </Button>
            </>
          )}
          {isFormer && (
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setConfirm("reactivate")}>
              <UserPlus className="mr-1 size-3.5" /> Wieder eingezogen
            </Button>
          )}
          {!isHousehold && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-xs text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1 size-3.5" /> Entfernen
            </Button>
          )}
        </div>
      </CardContent>

      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === "reactivate"
            ? `${member.display_name} wieder aufnehmen?`
            : `${member.display_name} als ausgezogen markieren?`
        }
        description={
          confirm === "reactivate"
            ? "Die Person stimmt wieder mit und zählt wieder mit."
            : "Die Person kann weiter mitlesen, ihre Stimmen bleiben gespeichert, zählen aber nicht mehr mit."
        }
        confirmLabel="Ja, machen"
        onConfirm={() => confirm && act(confirm)}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDeleteInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{member.display_name} endgültig entfernen?</DialogTitle>
            <DialogDescription>
              Der Zugang wird sofort gelöscht. Alle Stimmen und Eintragungen dieser Person verfallen, und ihr Name
              verschwindet aus dem Protokoll. Das lässt sich nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            Nutze das, wenn jemand über den Einladungslink hereingekommen ist, der nicht hierhergehört. Für Auszüge ist
            „Ausgezogen" der richtige Weg — dort bleiben die Stimmen erhalten.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`del-${member.id}`}>
              Tippe zur Bestätigung den Namen: <span className="font-medium">{member.display_name}</span>
            </Label>
            <Input
              id={`del-${member.id}`}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={member.display_name}
            />
          </div>
          <Button
            variant="destructive"
            disabled={deleteInput.trim().toLowerCase() !== member.display_name.trim().toLowerCase()}
            onClick={purge}
          >
            Endgültig entfernen
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kontakt von {member.display_name}</DialogTitle>
            <DialogDescription>Telefon, E-Mail oder was in der WG üblich ist.</DialogDescription>
          </DialogHeader>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="z. B. 0170 1234567" />
          <Button onClick={() => act("set_contact")}>Speichern</Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function inviteLink(code: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/beitritt/${code}`;
}

function InviteSection({ invites }: { invites: OrgData["invites"] }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createInvite);
  const change = useServerFn(updateInvite);
  // Standard: ein Link, eine Person. Mehr nur bewusst.
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try {
      await create({ data: { days, maxUses } });
      await queryClient.invalidateQueries();
      toast.success("Neuer Einladungslink erstellt.");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "extend" | "revoke") {
    try {
      await change({ data: { id, action, days: 7 } });
      await queryClient.invalidateQueries();
      toast.success(action === "extend" ? "Um 7 Tage verlängert." : "Link zurückgezogen.");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    }
  }

  return (
    <Card className="fm-card">
      <CardHeader>
        <CardTitle className="text-base">Einladungslink</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          Teile diesen Link nur direkt mit deinen Mitbewohnenden — niemals öffentlich. Wer ihn hat, kann mitstimmen.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-days">Gültig für (Tage)</Label>
            <Input id="inv-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-uses">Höchstens nutzbar</Label>
            <Input id="inv-uses" type="number" min={1} max={50} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">
              Standard: ein Link für eine Person. Erhöhe das nur, wenn mehrere denselben Link nutzen sollen.
            </p>
          </div>
        </div>
        <Button onClick={make} disabled={busy}>
          {busy ? "Einen Moment …" : "Neuen Link erzeugen"}
        </Button>

        <div className="space-y-2">
          {invites.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch kein Einladungslink — ohne Link kommt niemand Neues rein.</p>
          )}
          {invites.map((inv) => {
            const expired = new Date(inv.expires_at) <= new Date();
            const usedUp = inv.used_count >= inv.max_uses;
            return (
              <div key={inv.id} className="space-y-2 rounded-xl border border-border px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{inv.label ?? "Einladungslink"}</p>
                    <p className="text-xs text-muted-foreground">
                      gültig bis {new Date(inv.expires_at).toLocaleDateString("de-DE")} · {inv.used_count} von{" "}
                      {inv.max_uses} genutzt
                      {expired ? " · abgelaufen" : usedUp ? " · aufgebraucht" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => act(inv.id, "extend")}>
                      +7 Tage
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs text-destructive"
                      onClick={() => act(inv.id, "revoke")}
                    >
                      Zurückziehen
                    </Button>
                  </div>
                </div>

                {inv.code ? (
                  <div className="space-y-2 rounded-lg bg-secondary/50 p-2.5">
                    <p className="font-mono text-sm tracking-wide">{inv.code}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">{inviteLink(inv.code)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink(inv.code!));
                          toast.success("Link kopiert.");
                        }}
                      >
                        <Copy className="mr-1 size-3.5" /> Link kopieren
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(inv.code!);
                          toast.success("Code kopiert.");
                        }}
                      >
                        Nur den Code kopieren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {expired
                      ? "Abgelaufen — verlängere ihn um 7 Tage, dann ist der Code wieder da."
                      : usedUp
                        ? "Aufgebraucht — erhöhe das Limit oder erzeuge einen neuen Link."
                        : "Dieser Link stammt aus einer älteren Version und lässt sich nicht mehr anzeigen. Erzeuge bitte einen neuen."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResetCard() {
  const queryClient = useQueryClient();
  const reset = useServerFn(resetDemoHousehold);
  const [open, setOpen] = useState(false);

  async function run() {
    try {
      await reset({});
      await queryClient.invalidateQueries();
      toast.success("Demo-WG ist wieder im Ausgangszustand.");
    } catch (err) {
      toast.error("Zurücksetzen hat nicht geklappt", { description: fmError(err) });
    } finally {
      setOpen(false);
    }
  }

  return (
    <Card className="fm-card border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Demo-WG zurücksetzen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Nur zum Ausprobieren: setzt diese Demo-WG auf ihren Ausgangszustand zurück — mit sechs Beispielbewerbungen und
          den ursprünglichen Mitgliedern.
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <RotateCcw className="mr-1 size-4" /> Zurücksetzen
        </Button>
      </CardContent>
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title="Demo-WG wirklich zurücksetzen?"
        description="Alle Bewerbungen, Stimmen, Runden, Einladungslinks und später hinzugekommenen Mitglieder dieser Demo-WG werden gelöscht und durch die Beispieldaten ersetzt. Das lässt sich nicht rückgängig machen."
        confirmLabel="Ja, zurücksetzen"
        destructive
        onConfirm={run}
      />
    </Card>
  );
}
