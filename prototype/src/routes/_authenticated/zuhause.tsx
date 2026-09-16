import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getHome } from "@/lib/fm/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FmError, FmLoading } from "@/components/fm/States";
import { ArrowRight, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zuhause")({
  head: () => ({
    meta: [
      { title: "Was ist dran? · flatmate.io" },
      { name: "description", content: "Deine offenen Aufgaben in der WG-Casting-Runde auf einen Blick." },
      { property: "og:title", content: "Was ist dran? · flatmate.io" },
      { property: "og:description", content: "Deine offenen Aufgaben in der WG-Casting-Runde auf einen Blick." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

type Home = Awaited<ReturnType<typeof getHome>>;
type Task = { key: string; title: string; reason: string; to: "/casting" | "/rangliste" | "/teilnehmende"; cta: string };

function HomePage() {
  const fetchHome = useServerFn(getHome);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["home"], queryFn: fetchHome });

  if (isLoading) return <FmLoading rows={3} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const { me } = data;

  if (!me.profile) {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">Dein Profil ist noch nicht verbunden.</p>
        </CardContent>
      </Card>
    );
  }

  if (me.isHouseholdAccount) {
    return <HouseholdAccountHome name={me.profile.display_name} householdName={me.householdName} />;
  }

  const tasks = buildTasks(data);
  const [primary, ...rest] = tasks;

  // B1: der Moment „alles abgestimmt" wird kurz gefeiert — auch wenn noch eine
  // Ranglisten-Aufgabe danach steht.
  const justFinished =
    data.round !== null && data.round.status === "open" && data.waitingForMe === 0 && data.myVoted > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Moin {me.profile.display_name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted-foreground">{me.householdName}</p>
      </div>

      {justFinished && (
        <Card className="fm-card border-primary/40 bg-primary/10">
          <CardContent className="py-5">
            <p className="font-display text-lg font-semibold text-primary">Stark gemacht!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Du hast alle Bewerbungen dieser Runde bewertet — deine Stimmen sind drin.
            </p>
          </CardContent>
        </Card>
      )}

      {primary ? (
        <>
          <Card className="fm-card overflow-hidden border-primary/40">
            <div className="bg-primary px-5 py-2.5 text-primary-foreground">
              <p className="text-xs uppercase tracking-wide opacity-80">Als Nächstes</p>
            </div>
            <CardContent className="space-y-3 pt-5">
              <p className="text-lg font-semibold">{primary.title}</p>
              <p className="text-sm text-muted-foreground">{primary.reason}</p>
              <Button asChild>
                <Link to={primary.to}>
                  {primary.cta} <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {rest.slice(0, 3).map((task) => (
            <Card key={task.key} className="fm-card">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.reason}</p>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link to={task.to}>{task.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          {rest.length > 3 && <MoreTasks tasks={rest.slice(3)} />}
        </>
      ) : (
        <RoundStanding data={data} />
      )}

      {data.round && (
        <Button asChild variant="ghost" className="w-full justify-between text-muted-foreground">
          <Link to="/teilnehmende">
            {data.votersVoted} von {data.votersCount} haben abgestimmt — wer ist dabei?
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}

      {me.isModerator && (
        <Card className="fm-card border-accent/50 bg-secondary/30">
          <CardContent className="space-y-2 py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Moderation</p>
            <p className="font-semibold">
              {data.moderationTasks > 0
                ? `${data.moderationTasks} ${data.moderationTasks === 1 ? "Sache wartet" : "Dinge warten"} auf dich`
                : "Alles erledigt"}
            </p>
            <p className="text-sm text-muted-foreground">
              {data.moderationTasks > 0
                ? "Du hältst die Runde am Laufen — Zimmer, Regeln und der Stand der Runde liegen bei dir."
                : "Nichts Offenes — du kannst Zimmer, Regeln und Mitglieder trotzdem jederzeit anpassen."}
            </p>
            <Button asChild variant={data.moderationTasks > 0 ? "default" : "secondary"}>
              <Link to="/organisation">
                Zur Organisation <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Aufgabenmodell §2 — im Prototyp-Umfang gibt es die Stimme zur Einladung (T-5). */
function buildTasks(data: Home): Task[] {
  const tasks: Task[] = [];
  if (!data.round) return tasks;

  if (data.round.status === "open" && data.waitingForMe > 0) {
    // FR-4.1: gleiche Menge wie das Deck — sonst weichen Zahl und Kartenanzahl voneinander ab.
    const title =
      data.waitingForMe < data.openCount
        ? `${data.waitingForMe} von ${data.openCount} Bewerbungen warten auf deine Stimme`
        : `${data.openCount} ${data.openCount === 1 ? "Bewerbung wartet" : "Bewerbungen warten"} auf deine Stimme`;
    tasks.push({
      key: "vote",
      title,
      reason:
        data.round.phase_deadline_at !== null
          ? `Die Runde „${data.round.title}" hat eine Frist — ohne deine Stimme fehlt sie am Ende.`
          : `In der Runde „${data.round.title}" wird gerade abgestimmt.`,
      to: "/casting",
      cta: "Jetzt sehen",
    });
  }

  // Erst wenn nichts mehr auf deine Stimme wartet, ist die Rangliste eine eigene Aufgabe.
  const ready = data.waitingForMe === 0 && (data.stateCounts.screened ?? 0) > 0;
  if (ready) {
    tasks.push({
      key: "ranking",
      title: `${data.stateCounts.screened} ${data.stateCounts.screened === 1 ? "Bewerbung hat" : "Bewerbungen haben"} genug Stimmen`,
      reason: "Die WG hat entschieden — schau dir an, wie die Rangliste aussieht.",
      to: "/rangliste",
      cta: "Zur Rangliste",
    });
  }

  return tasks;
}

function MoreTasks({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          und {tasks.length} weitere <ChevronDown className="size-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        {tasks.map((task) => (
          <Card key={task.key} className="fm-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.reason}</p>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link to={task.to}>{task.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Leerzustand: der Rundenstand füllt die Fläche — nie eine leere Seite. */
function RoundStanding({ data }: { data: Home }) {
  if (!data.round) {
    return (
      <Card className="fm-card">
        <CardContent className="py-8 text-center">
          <p className="font-medium">Aktuell läuft keine Casting-Runde.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Die Moderation eröffnet die nächste Runde — dann erscheint sie hier.
          </p>
        </CardContent>
      </Card>
    );
  }

  // B1: genau dieser Moment — alles abgestimmt — wird kurz gefeiert.
  const justFinished = data.round.status === "open" && data.waitingForMe === 0 && data.myVoted > 0;

  return (
    <Card className="fm-card overflow-hidden">
      <div className="bg-secondary px-5 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Stand der Runde</p>
        <p className="font-display text-lg font-semibold">{data.round.title}</p>
      </div>
      <CardContent className="space-y-3 pt-5">
        {justFinished && (
          <div className="rounded-xl bg-primary/10 px-4 py-3">
            <p className="font-display text-lg font-semibold text-primary">Stark gemacht!</p>
            <p className="text-sm text-muted-foreground">
              Du hast alle Bewerbungen dieser Runde bewertet — deine Stimmen sind drin.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {data.round.rooms.map((r) => (
            <span key={r.id} className="rounded-full bg-secondary px-2.5 py-1">
              {r.name}
              {r.available_from
                ? ` · frei ab ${new Date(r.available_from).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`
                : ""}
            </span>
          ))}
          <span className="rounded-full bg-secondary px-2.5 py-1">
            {data.votesNeeded} von {data.votersCount} Stimmen reichen
          </span>
        </div>
        <p className="font-medium">
          {data.round.status === "open"
            ? "Nichts wartet mehr auf dich — alles gesehen."
            : "Die Runde ist gerade nicht offen zum Abstimmen."}
        </p>
        {data.myVoted > 0 && (
          <p className="text-xs text-muted-foreground">
            Du hast in dieser Runde {data.myVoted} abgestimmt — änderbar, solange die Runde offen ist.
          </p>
        )}
        <Button asChild variant="secondary">
          <Link to="/rangliste">
            Zur Rangliste <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}


function HouseholdAccountHome({ name, householdName }: { name: string; householdName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Hallo {name}</h1>
        <p className="mt-1 text-muted-foreground">{householdName}</p>
      </div>
      <Card className="fm-card">
        <CardHeader>
          <CardTitle>Das WG-Konto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Das WG-Konto verwaltet Wohnung und Mitglieder — sieht aber bewusst keine Bewerbungen und stimmt nicht ab. So
            bleibt die Entscheidung bei den Menschen, die zusammenwohnen.
          </p>
          <p>
            Wohnst du selbst mit? Dann brauchst du zusätzlich ein Bewohner-Profil mit eigenem Login — das legst du unter
            Einstellungen an.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/organisation">
                Zur Organisation <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/einstellungen">Einstellungen</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
