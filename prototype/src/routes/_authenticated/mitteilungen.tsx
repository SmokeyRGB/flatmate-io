import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getNotifications, markNotificationsSeen } from "@/lib/fm/functions";
import { FmError, FmLoading } from "@/components/fm/States";
import { Card, CardContent } from "@/components/ui/card";
import { STATE_LABELS } from "@/lib/fm/types";

export const Route = createFileRoute("/_authenticated/mitteilungen")({
  head: () => ({
    meta: [
      { title: "Mitteilungen · flatmate.io" },
      { name: "description", content: "Was in deiner WG seit deinem letzten Besuch passiert ist." },
      { property: "og:title", content: "Mitteilungen · flatmate.io" },
      { property: "og:description", content: "Was in deiner WG seit deinem letzten Besuch passiert ist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function formatWhen(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  if (mins < 24 * 60) return `vor ${Math.floor(mins / 60)} Std.`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function NotificationsPage() {
  const [showAll, setShowAll] = useState(false);
  const fetchItems = useServerFn(getNotifications);
  const markSeen = useServerFn(markNotificationsSeen);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["notifications"], queryFn: fetchItems });

  // Beim Öffnen gilt alles als gesehen — der Punkt im Kopf verschwindet.
  useEffect(() => {
    if (!data) return;
    if (data.unread === 0) return;
    void markSeen({ data: undefined }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    });
  }, [data, markSeen, queryClient]);

  if (isLoading) return <FmLoading rows={4} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;

  const all = data?.items ?? [];
  // Standardmäßig nur Neues plus ein kurzer Anlauf — Älteres auf Wunsch.
  const defaultCount = Math.max(all.filter((i) => i.unread).length, 3);
  const items = showAll ? all : all.slice(0, defaultCount);
  const hiddenCount = all.length - items.length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Mitteilungen</h1>
      {all.length === 0 ? (
        <Card className="fm-card">
          <CardContent className="py-10 text-center text-muted-foreground">
            Noch ist nichts passiert — hier steht später, was sich in eurer Runde tut.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={
                "fm-card flex gap-3 px-4 py-3 " + (item.unread ? "border-primary/40 bg-secondary/40" : "")
              }
            >
              <span
                aria-hidden
                className={"mt-2 size-2 shrink-0 rounded-full " + (item.unread ? "bg-primary" : "bg-transparent")}
              />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">
                    {item.names.length > 2
                      ? `${item.names.slice(0, 2).join(", ")} und ${item.names.length - 2} weitere`
                      : item.names.join(" und ")}
                  </span>{" "}
                  {item.from_state
                    ? `${item.names.length > 1 ? "wechselten" : "wechselte"} von „${STATE_LABELS[item.from_state]}" zu „${STATE_LABELS[item.to_state]}"`
                    : `${item.names.length > 1 ? "wurden" : "wurde"} erfasst — „${STATE_LABELS[item.to_state]}"`}
                  {item.is_backward ? " (zurückgenommen)" : ""}
                </p>
                {item.note && <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatWhen(item.created_at)}
                  {item.actor_name ? ` · ${item.actor_name}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <Button variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
          Früheres anzeigen ({hiddenCount})
        </Button>
      )}
    </div>
  );
}
