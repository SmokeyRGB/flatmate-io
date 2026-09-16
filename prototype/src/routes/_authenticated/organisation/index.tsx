import { fmError } from "@/lib/fm/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getOrganisation,
  setRoundStatus,
  createRound,
  changeApplicationState,
  deleteApplication,
  getModerators,
} from "@/lib/fm/functions";
import { FORWARD, SIDE, BACKWARD, STATE_LABELS, STATE_ORDER, type AppState } from "@/lib/fm/types";
import { invitationText } from "@/lib/fm/texts";
import { InviteDispatchDialog } from "@/components/fm/InviteDispatch";
import { Confirm, CopyBox } from "@/components/fm/Confirm";
import { FmError, FmLoading } from "@/components/fm/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowRight, ChevronDown, DoorClosed, Lock, PlayCircle, Plus, Send, Settings, Trash2, Users2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organisation/")({
  validateSearch: (search: Record<string, unknown>): { runde?: "offen" } =>
    search["runde"] === "offen" ? { runde: "offen" } : {},
  component: OrganisationPage,
});

function OrganisationPage() {
  const search = Route.useSearch();
  const fetchOrg = useServerFn(getOrganisation);
  const fetchModerators = useServerFn(getModerators);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["organisation"], queryFn: fetchOrg });
  const { data: moderators } = useQuery({ queryKey: ["moderators"], queryFn: fetchModerators });

  if (isLoading) return <FmLoading rows={3} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const canOrganise = data.me.isModerator || data.me.isHouseholdAccount;

  if (!canOrganise) {
    const names = moderators?.names ?? [];
    return (
      <Card className="fm-card">
        <CardContent className="space-y-2 py-8 text-center text-muted-foreground">
          <p>Organisation machen die Moderator:innen.</p>
          <p className="text-sm">
            {names.length > 0
              ? `Frag ${names.join(" oder ")} — sie können dich zur Moderation dazunehmen.`
              : "Diese WG hat gerade keine Moderation. Das WG-Konto kann jemanden dazu ernennen."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.me.householdName}</p>
      </div>

      <TaskList data={data} />

      {!data.me.isHouseholdAccount && (
        <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Diese Casting-Runde</h2>
            <p className="text-xs text-muted-foreground">
              Alles, was nur für {data.round ? `„${data.round.title}"` : "die aktuelle Runde"} gilt — und mit ihr endet.
            </p>
          </div>
          <Collapsible defaultOpen={search.runde === "offen"}>
            <CollapsibleTrigger asChild>
              <Button variant="secondary" className="w-full justify-between">
                Runde und alle Bewerbungen <ChevronDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-4">
              <RoundCard data={data} />
              <PipelineSection applications={data.applications} />
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Die WG</h2>
          <p className="text-xs text-muted-foreground">
            Bleibt über alle Runden hinweg bestehen: wer hier wohnt, welche Zimmer es gibt, wie abgestimmt wird.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="secondary" className="justify-between bg-background">
            <Link to="/organisation/mitglieder">
              Mitglieder <Users2 className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary" className="justify-between bg-background">
            <Link to="/organisation/zimmer">
              Zimmer <DoorClosed className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary" className="justify-between bg-background">
            <Link to="/organisation/regeln">
              Regeln <Settings className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

type OrgData = Awaited<ReturnType<typeof getOrganisation>>;

/* ---------- Aufgabenliste ---------- */

type Task = { title: string; reason: string; to?: "/organisation/zimmer" | "/bewerbung-neu" | "/organisation/mitglieder" | "/rangliste"; node?: React.ReactNode };

function TaskList({ data }: { data: OrgData }) {
  const tasks: Task[] = [];

  if (data.me.isHouseholdAccount) {
    tasks.push({
      title: "Mitglieder pflegen",
      reason: "Das WG-Konto verwaltet Menschen und Zimmer — Bewerbungen bleiben bei den Bewohner:innen.",
      to: "/organisation/mitglieder",
    });
    if (data.rooms.length === 0) {
      tasks.push({ title: "Erstes Zimmer anlegen", reason: "Ohne Zimmer lässt sich keine Runde eröffnen.", to: "/organisation/zimmer" });
    }
  } else if (data.rooms.length === 0) {
    tasks.push({ title: "Erstes Zimmer anlegen", reason: "Ohne Zimmer lässt sich keine Runde eröffnen.", to: "/organisation/zimmer" });
  } else if (!data.round || data.round.status !== "open") {
    tasks.push({
      title: "Runde eröffnen",
      reason: "Ohne offene Runde kann niemand Bewerbungen erfassen oder abstimmen.",
      node: <NewRoundDialog data={data} />,
    });
  } else if (data.applications.length === 0) {
    tasks.push({
      title: "Erste Bewerbung erfassen",
      reason: "Die Runde läuft, aber es gibt noch nichts zu sehen.",
      to: "/bewerbung-neu",
    });
  } else {
    const screenedApps = data.applications.filter((a) => a.state === "screened");
    const screened = screenedApps.length;
    tasks.push(
      screened > 0
        ? {
            title: `${screened} ${screened === 1 ? "Bewerbung ist" : "Bewerbungen sind"} durchgesehen`,
            reason: "Die WG hat abgestimmt — in der Rangliste siehst du, wen du einladen solltest.",
            to: "/rangliste",
          }
        : {
            title: "Weitere Bewerbungen erfassen",
            reason: "Es wird noch abgestimmt — mehr Auswahl hilft der Runde.",
            to: "/bewerbung-neu",
          },
    );
    tasks.push({ title: "Neue Bewerbung erfassen", reason: "Aushang, Anruf oder Brief — alles per Hand erfassbar.", to: "/bewerbung-neu" });
  }


  const [primary, ...rest] = tasks;

  return (
    <div className="space-y-3">
      {primary && (
        <Card className="fm-card border-primary/40">
          <CardContent className="space-y-3 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Als Nächstes</p>
            <p className="text-lg font-semibold">{primary.title}</p>
            <p className="text-sm text-muted-foreground">{primary.reason}</p>
            {primary.node ??
              (primary.to && (
                <Button asChild>
                  <Link to={primary.to}>
                    Los geht's <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      )}
      {rest.slice(0, 3).map((task) => (
        <Card key={task.title} className="fm-card">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground">{task.reason}</p>
            </div>
            {task.node ??
              (task.to && (
                <Button asChild size="sm" variant="secondary">
                  <Link to={task.to}>Öffnen</Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Runde ---------- */

function RoundCard({ data }: { data: OrgData }) {
  const queryClient = useQueryClient();
  const setStatus = useServerFn(setRoundStatus);
  const [confirm, setConfirm] = useState<"open" | "closed" | null>(null);

  async function changeStatus(status: "open" | "closed") {
    if (!data.round) return;
    try {
      await setStatus({ data: { roundId: data.round.id, status } });
      await queryClient.invalidateQueries();
      toast.success(status === "closed" ? "Runde geschlossen." : "Runde wieder geöffnet.");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setConfirm(null);
    }
  }

  return (
    <Card className="fm-card">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Runde</CardTitle>
        <NewRoundDialog data={data} />
      </CardHeader>
      <CardContent className="space-y-3">
        {data.round ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{data.round.title}</p>
              <Badge variant="secondary">
                {data.round.status === "open" ? "offen" : data.round.status === "closed" ? "geschlossen" : "Entwurf"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Zimmer: {data.round.rooms.map((r) => r.name).join(", ") || "keine zugeordnet"}
            </p>
            {data.round.status === "open" ? (
              <Button variant="outline" size="sm" onClick={() => setConfirm("closed")}>
                <Lock className="mr-1 size-4" /> Voting schließen
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirm("open")}>
                <PlayCircle className="mr-1 size-4" /> Runde öffnen
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Keine aktuelle Runde. Eröffne eine, um Bewerbungen zu sammeln und abzustimmen.
          </p>
        )}
      </CardContent>

      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "closed" ? "Voting wirklich schließen?" : "Runde wieder öffnen?"}
        description={
          confirm === "closed"
            ? `„${data.round?.title}" nimmt danach keine Stimmen mehr an. Du kannst die Runde jederzeit wieder öffnen.`
            : `„${data.round?.title}" nimmt danach wieder Stimmen an.`
        }
        confirmLabel={confirm === "closed" ? "Ja, schließen" : "Ja, öffnen"}
        onConfirm={() => confirm && changeStatus(confirm)}
      />
    </Card>
  );
}

function NewRoundDialog({ data }: { data: OrgData }) {
  const queryClient = useQueryClient();
  const createRoundFn = useServerFn(createRound);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [hideResults, setHideResults] = useState(data.settings.hide_results_until_voted);
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  const rooms = data.rooms;
  const hasOpen = data.rounds.some((r) => r.status === "open");

  const missing: string[] = [];
  if (title.trim().length < 3) missing.push("Gib der Runde einen Titel (mindestens 3 Zeichen).");
  if (roomIds.length === 0) missing.push("Wähle mindestens ein Zimmer.");

  async function submit() {
    setBusy(true);
    try {
      await createRoundFn({
        data: { title, roomIds, hideResults, quorumShare: data.settings.quorum_share, deadline: deadline || undefined },
      });
      toast.success("Runde eröffnet — die WG kann abstimmen.");
      setOpen(false);
      setTitle("");
      setRoomIds([]);
      setDeadline("");
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (data.me.isHouseholdAccount) return null;

  if (hasOpen) {
    const openRound = data.rounds.find((r) => r.status === "open");
    return (
      <div className="text-right">
        <Button size="sm" disabled>
          <Plus className="mr-1 size-4" /> Neue Runde
        </Button>
        {/* Rahmenwerk §6: der Grund steht sichtbar da — kein Tooltip, der am Handy nie erscheint. */}
        <p className="mt-1 text-xs text-muted-foreground">
          Geht gerade nicht: „{openRound?.title ?? "Die aktuelle Runde"}" läuft noch. Schließe sie unten unter „Runde",
          dann kannst du eine neue eröffnen.
        </p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" /> Neue Runde
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Runde eröffnen</DialogTitle>
          <DialogDescription>
            Einstellungen werden beim Öffnen eingefroren — die Werte gelten dann für die ganze Runde.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="round-title">Titel</Label>
            <Input id="round-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Casting Winter 2026" />
          </div>
          <div className="space-y-2">
            <Label>Zimmer in dieser Runde</Label>
            {rooms.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine Zimmer angelegt —{" "}
                <Link to="/organisation/zimmer" className="underline">
                  hier anlegen
                </Link>
                .
              </p>
            )}
            {rooms.map((room) => (
              <label key={room.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={roomIds.includes(room.id)}
                  onCheckedChange={(checked) =>
                    setRoomIds(checked ? [...roomIds, room.id] : roomIds.filter((id) => id !== room.id))
                  }
                />
                {room.name}
                {room.available_from && (
                  <span className="text-xs text-muted-foreground">
                    frei ab {new Date(room.available_from).toLocaleDateString("de-DE")}
                  </span>
                )}
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span className="text-sm">
              Ergebnisse verdeckt halten
              <span className="block text-xs text-muted-foreground">Jede:r sieht Ergebnisse erst nach der eigenen Stimme.</span>
            </span>
            <Switch checked={hideResults} onCheckedChange={setHideResults} />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="round-deadline">Frist (freiwillig)</Label>
            <Input id="round-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Nur eine Orientierung — nach dem Datum bleibt alles offen und nichts wird gesperrt.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Genug Stimmen heißt: {Math.round(data.settings.quorum_share * 100)} % der Stimmberechtigten haben
            abgestimmt. Wer mitstimmt, wird beim Eröffnen festgehalten.
          </p>
          {missing.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              {missing.map((m) => (
                <li key={m}>Fehlt noch: {m}</li>
              ))}
            </ul>
          )}
          <Button className="w-full" disabled={busy || missing.length > 0} onClick={submit}>
            {busy ? "Einen Moment …" : "Eröffnen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Bewerbungen ---------- */

function PipelineSection({ applications }: { applications: OrgData["applications"] }) {
  return (
    <Card className="fm-card">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Bewerbungen</CardTitle>
        <Button asChild size="sm" variant="secondary">
          <Link to="/bewerbung-neu">
            <Plus className="mr-1 size-4" /> Von Hand erfassen
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {applications.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Bewerbungen in dieser Runde.</p>
        )}
        {STATE_ORDER.map((state) => {
          const group = applications.filter((a) => a.state === state);
          if (group.length === 0) return null;
          return (
            <div key={state}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {STATE_LABELS[state]} ({group.length})
              </h3>
              <div className="space-y-2">
                {group.map((app) => (
                  <PipelineCard key={app.id} app={app} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PipelineCard({ app }: { app: OrgData["applications"][number] }) {
  const queryClient = useQueryClient();
  const changeState = useServerFn(changeApplicationState);
  const removeApp = useServerFn(deleteApplication);
  const [target, setTarget] = useState<AppState | null>(null);
  const [note, setNote] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const options: AppState[] = [
    ...(FORWARD[app.state] ?? []),
    ...(SIDE[app.state] ?? []),
    ...(BACKWARD[app.state] ?? []),
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  async function apply(to: AppState) {
    try {
      await changeState({ data: { applicationId: app.id, to, note: note || undefined } });
      await queryClient.invalidateQueries();
      toast.success(`${app.applicant_name}: jetzt „${STATE_LABELS[to]}".`);
      setNote("");
      setTarget(null);
      if (to === "invited") setTimeout(() => setInviteOpen(true), 180);
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    }
  }

  async function remove() {
    try {
      await removeApp({ data: { applicationId: app.id } });
      await queryClient.invalidateQueries();
      toast.success(`Bewerbung von ${app.applicant_name} gelöscht.`);
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {app.applicant_name}
          {app.age !== null && <span className="ml-1 text-xs text-muted-foreground">({app.age})</span>}
        </p>
        {app.contact && <p className="truncate text-xs text-muted-foreground">{app.contact}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={
              (FORWARD[app.state] ?? []).includes(to)
                ? "default"
                : (BACKWARD[app.state] ?? []).includes(to)
                  ? "outline"
                  : "ghost"
            }
            className="h-7 px-2.5 text-xs"
            onClick={() => setTarget(to)}
          >
            {(BACKWARD[app.state] ?? []).includes(to) ? "↩ " : ""}
            {to === "invited" ? "Einladen" : STATE_LABELS[to]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-1 size-3.5" /> Löschen
        </Button>
      </div>

      <Confirm
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `${app.applicant_name} nach „${STATE_LABELS[target]}"?` : "Status ändern"}
        description="Der Wechsel wird mit Zeit, Person und Notiz protokolliert — auch Rückschritte."
        confirmLabel="Ja, ändern"
        onConfirm={() => target && apply(target)}
      >
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Warum? (optional, landet im Protokoll)"
          rows={3}
        />
      </Confirm>

      <Confirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Bewerbung von ${app.applicant_name} löschen?`}
        description="Die Bewerbung und alle Stimmen dazu verschwinden endgültig. Das lässt sich nicht rückgängig machen."
        confirmLabel="Endgültig löschen"
        destructive
        onConfirm={remove}
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eingeladen — Nachricht zum Kopieren</DialogTitle>
            <DialogDescription>
              So erreichst du {app.applicant_name} auf jedem Weg — inklusive Datenschutzhinweis.
            </DialogDescription>
          </DialogHeader>
          <CopyBox text={invitationText(app.applicant_name)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
