import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDeck } from "@/lib/fm/functions";
import { ScreeningPass } from "@/components/fm/ScreeningPass";
import { RankingBoard } from "@/components/fm/RankingBoard";
import { FmError, FmLoading } from "@/components/fm/States";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/casting")({
  head: () => ({
    meta: [
      { title: "Casting · flatmate.io" },
      { name: "description", content: "Bewerbungen Karte für Karte sehen und abstimmen — danach die Rangliste." },
      { property: "og:title", content: "Casting · flatmate.io" },
      { property: "og:description", content: "Bewerbungen Karte für Karte sehen und abstimmen — danach die Rangliste." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CastingPage,
});

/**
 * U-2: „Casting" ist ein Tab, kein Umschalter. Solange in Runde 1 Stimmen fehlen,
 * öffnet er den Durchlauf; ist alles abgestimmt, steht hier die Rangliste.
 */
function CastingPage() {
  const navigate = useNavigate();
  const fetchDeck = useServerFn(getDeck);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["deck"], queryFn: fetchDeck });

  if (isLoading) return <FmLoading rows={2} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  if (data.me.isHouseholdAccount) {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          Das WG-Konto verwaltet die WG — Bewerbungen und Abstimmung bleiben bei den Bewohner:innen.
        </CardContent>
      </Card>
    );
  }

  const open = data.deck.filter((d) => d.myVote === null).length;
  const isScreening = data.round?.status === "open" && open > 0;

  if (isScreening) {
    return (
      <div className="space-y-5">
        <h1 className="hidden text-2xl font-semibold md:block">Sehen</h1>
        <ScreeningPass onGoToRanking={() => navigate({ to: "/rangliste" })} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="hidden text-2xl font-semibold md:block">Rangliste</h1>
      <RankingBoard onGoToScreening={() => navigate({ to: "/casting" })} />
    </div>
  );
}
