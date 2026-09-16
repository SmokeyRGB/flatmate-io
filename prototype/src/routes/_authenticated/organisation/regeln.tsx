import { fmError } from "@/lib/fm/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getOrganisation, updateRules } from "@/lib/fm/functions";
import { VOTE_LABELS, VOTE_ORDER } from "@/lib/fm/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organisation/regeln")({
  component: RulesPage,
});

function RulesPage() {
  const fetchOrg = useServerFn(getOrganisation);
  const save = useServerFn(updateRules);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["organisation"], queryFn: fetchOrg });

  const [draft, setDraft] = useState<null | {
    hideResults: boolean;
    quorumPercent: number;
    favorite: number;
    weights: Record<string, number>;
  }>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) return <p className="text-muted-foreground">Wird geladen …</p>;

  const openRound = data.rounds.find((r) => r.status === "open");
  const s = data.settings;
  const form =
    draft ??
    {
      hideResults: s.hide_results_until_voted,
      quorumPercent: Math.round(s.quorum_share * 100),
      favorite: s.favorite_budget_factor,
      weights: { ...s.scale_weights } as Record<string, number>,
    };

  function update(patch: Partial<typeof form>) {
    setDraft({ ...form, ...patch });
  }

  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          hideResults: form.hideResults,
          quorumShare: form.quorumPercent / 100,
          favoriteBudgetFactor: form.favorite,
          weights: {
            no: form.weights['no'] ?? 0,
            rather_not: form.weights['rather_not'] ?? 1,
            good: form.weights['good'] ?? 3,
            definitely: form.weights['definitely'] ?? 5,
          },
        },
      });
      await queryClient.invalidateQueries();
      setDraft(null);
      toast.success("Regeln gespeichert — sie gelten ab der nächsten Runde.");
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/organisation">
          <ArrowLeft className="size-4" /> Organisation
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Abstimmungsregeln</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Diese Werte werden beim Eröffnen einer Runde eingefroren und gelten dann für die ganze Runde.
        </p>
      </div>

      {openRound && (
        <Card className="fm-card border-destructive/40">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              Solange „{openRound.title}" offen ist, bleiben die Regeln unverändert — sonst würden sich Spielregeln
              mitten im Spiel ändern. Schließe die Runde, um hier etwas zu ändern.
            </p>
          </CardContent>
        </Card>
      )}

      <fieldset disabled={Boolean(openRound)} className="space-y-4 disabled:opacity-60">
        <Card className="fm-card">
          <CardHeader>
            <CardTitle className="text-base">Werte der vier Stufen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {VOTE_ORDER.map((v) => (
              <div key={v} className="space-y-1.5">
                <Label htmlFor={`w-${v}`}>{VOTE_LABELS[v]}</Label>
                <Input
                  id={`w-${v}`}
                  type="number"
                  min={0}
                  max={10}
                  value={form.weights[v] ?? 0}
                  onChange={(e) => update({ weights: { ...form.weights, [v]: Number(e.target.value) } })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="fm-card">
          <CardContent className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="quorum">Wie viele müssen abstimmen? (Prozent der Stimmberechtigten)</Label>
              <Input
                id="quorum"
                type="number"
                min={10}
                max={100}
                value={form.quorumPercent}
                onChange={(e) => update({ quorumPercent: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Unter dieser Zahl an Stimmen steht eine Bewerbung unter „Wartet noch auf Stimmen".
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fav">Favoriten-Budget (Faktor auf offene Zimmer)</Label>
              <Input
                id="fav"
                type="number"
                step="0.1"
                min={1}
                max={3}
                value={form.favorite}
                onChange={(e) => update({ favorite: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Beispiel: 2 offene Zimmer × {form.favorite} = {Math.ceil(2 * form.favorite)} Favoriten pro Person.
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="text-sm">
                Ergebnisse verdeckt halten
                <span className="block text-xs text-muted-foreground">
                  Jede:r sieht Ergebnisse erst nach der eigenen Stimme.
                </span>
              </span>
              <Switch checked={form.hideResults} onCheckedChange={(c) => update({ hideResults: c })} />
            </label>
          </CardContent>
        </Card>

        <Button className="w-full" disabled={busy || draft === null} onClick={submit}>
          {busy ? "Speichern …" : "Regeln speichern"}
        </Button>
      </fieldset>
    </div>
  );
}
