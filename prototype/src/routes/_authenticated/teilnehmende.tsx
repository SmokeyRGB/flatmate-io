import { fmError } from "@/lib/fm/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getParticipants } from "@/lib/fm/functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teilnehmende")({
  component: ParticipantsPage,
});

function ParticipantsPage() {
  const fetch = useServerFn(getParticipants);
  const { data, isLoading } = useQuery({ queryKey: ["participants"], queryFn: fetch });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/zuhause">
          <ArrowLeft className="size-4" /> Zurück
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Wer ist dabei</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nur die Namen — wer schon abgestimmt hat, bleibt bewusst geheim.
        </p>
      </div>
      {isLoading && <p className="text-muted-foreground">Einen Moment …</p>}
      <Card className="fm-card">
        <CardContent className="divide-y divide-border p-0">
          {(data ?? []).map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-medium">{p.name}</span>
              {p.status === "moved_out" ? (
                <Badge variant="secondary">ausgezogen</Badge>
              ) : p.isVoter ? (
                <Badge variant="outline">stimmt mit ab</Badge>
              ) : (
                <Badge variant="outline">stimmt nicht ab</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
