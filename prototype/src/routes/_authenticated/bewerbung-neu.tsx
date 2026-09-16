import { fmError } from "@/lib/fm/errors";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getOrganisation, createApplication } from "@/lib/fm/functions";
import { INFO_SOURCE_LABELS, type InfoSource } from "@/lib/fm/types";
import { thirdPartyNoticeText } from "@/lib/fm/texts";
import { CopyBox } from "@/components/fm/Confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/bewerbung-neu")({
  component: NewApplicationPage,
});

function NewApplicationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOrg = useServerFn(getOrganisation);
  const create = useServerFn(createApplication);
  const { data: org } = useQuery({ queryKey: ["organisation"], queryFn: fetchOrg });

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<InfoSource>("applicant");
  const [busy, setBusy] = useState(false);

  if (org && !org.round) {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          Es gibt keine offene Runde, in die eine Bewerbung gehören könnte. Eröffne zuerst eine Runde.
        </CardContent>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org?.round) return;
    setBusy(true);
    try {
      await create({
        data: {
          roundId: org.round.id,
          applicantName: name,
          age: age ? Number(age) : null,
          contact: contact || null,
          message: message || null,
          source,
        },
      });
      toast.success("Bewerbung erfasst — sie ist sofort in der Runde.");
      await queryClient.invalidateQueries();
      // O-organisation Regel 1: direkt zum Ergebnis — Rundenliste aufgeklappt.
      navigate({ to: "/organisation", search: { runde: "offen" } });
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bewerbung von Hand erfassen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Für alle, die sich nicht übers Portal melden: Aushang, Anruf, Brief — alles kann hier eingetippt werden.
        </p>
      </div>

      <Card className="fm-card">
        <CardHeader>
          <CardTitle>Neue Bewerbung</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="app-name">Name *</Label>
              <Input id="app-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wer bewirbt sich?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="app-age">Alter</Label>
                <Input id="app-age" type="number" min={16} max={99} value={age} onChange={(e) => setAge(e.target.value)} placeholder="z. B. 27" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="app-contact">Kontakt</Label>
                <Input id="app-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telefon, E-Mail, …" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-message">Nachricht / Notiz</Label>
              <Textarea id="app-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Was hat die Person geschrieben oder am Telefon gesagt?" />
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <Label>Woher stammen die Angaben? *</Label>
              <RadioGroup value={source} onValueChange={(v) => setSource(v as InfoSource)} className="gap-2">
                {(["applicant", "third_party"] as InfoSource[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={s} id={`src-${s}`} />
                    {INFO_SOURCE_LABELS[s]}
                  </label>
                ))}
              </RadioGroup>
            </div>

            {source === "third_party" && (
              <div className="space-y-3 rounded-xl border border-dashed border-border bg-secondary/40 p-3">
                <p className="text-sm">
                  Weil die Angaben nicht von der Person selbst kommen, muss sie innerhalb eines Monats davon erfahren.
                  Hier ist ein fertiger Text dafür:
                </p>
                <CopyBox text={thirdPartyNoticeText(name || "…")} />
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "Speichern …" : "Erfassen"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate({ to: "/organisation" })}>
                Abbrechen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
