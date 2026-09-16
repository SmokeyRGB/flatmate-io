import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext } from "@/lib/fm/functions";
import { RankingBoard } from "@/components/fm/RankingBoard";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/rangliste")({
  component: RankingPage,
});

function RankingPage() {
  const navigate = useNavigate();
  const getCtx = useServerFn(getMyContext);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getCtx });

  if (me?.isHouseholdAccount) {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          Das WG-Konto verwaltet die WG — Bewerbungen und Abstimmung bleiben bei den Bewohner:innen.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Rangliste</h1>
      <RankingBoard onGoToScreening={() => navigate({ to: "/casting" })} />
    </div>
  );
}
