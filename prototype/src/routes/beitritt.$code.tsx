import { createFileRoute } from "@tanstack/react-router";
import { JoinForm } from "@/components/fm/JoinForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/beitritt/$code")({
  head: () => ({
    meta: [
      { title: "Einer WG beitreten · flatmate.io" },
      { name: "description", content: "Mit deinem Einladungslink der WG beitreten und beim Casting mitstimmen." },
      { property: "og:title", content: "Einer WG beitreten · flatmate.io" },
      { property: "og:description", content: "Mit deinem Einladungslink der WG beitreten und beim Casting mitstimmen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-block rounded-2xl bg-primary px-4 py-1.5 font-display text-lg font-semibold text-primary-foreground">
            flatmate.io
          </div>
          <h1 className="mt-6 text-3xl font-semibold">Du bist eingeladen</h1>
        </div>
        <Card className="fm-card">
          <CardHeader>
            <CardTitle className="text-lg">Zwei Felder, dann bist du drin</CardTitle>
          </CardHeader>
          <CardContent>
            <JoinForm code={code} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
