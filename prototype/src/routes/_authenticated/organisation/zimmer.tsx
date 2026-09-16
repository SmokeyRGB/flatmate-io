import { fmError } from "@/lib/fm/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getOrganisation, saveRoom } from "@/lib/fm/functions";
import type { Room } from "@/lib/fm/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organisation/zimmer")({
  component: RoomsPage,
});

const STATUS_LABELS: Record<string, string> = {
  open: "frei",
  promised: "zugesagt",
  occupied: "belegt",
};

function RoomsPage() {
  const fetchOrg = useServerFn(getOrganisation);
  const { data, isLoading } = useQuery({ queryKey: ["organisation"], queryFn: fetchOrg });
  const [editing, setEditing] = useState<Room | "new" | null>(null);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/organisation">
          <ArrowLeft className="size-4" /> Organisation
        </Link>
      </Button>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Zimmer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alle Zimmer der WG — auch die gerade belegten.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1 size-4" /> Neues Zimmer
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Wird geladen …</p>}

      <div className="space-y-2">
        {(data?.rooms ?? []).map((room) => (
          <Card key={room.id} className="fm-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{room.name}</p>
                <p className="text-xs text-muted-foreground">
                  {room.size_sqm ? `${room.size_sqm} m²` : "Größe unbekannt"}
                  {room.available_from ? ` · frei ab ${new Date(room.available_from).toLocaleDateString("de-DE")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={room.status === "open" ? "default" : "secondary"}>{STATUS_LABELS[room.status]}</Badge>
                <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                  Bearbeiten
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {data && data.rooms.length === 0 && (
          <Card className="fm-card">
            <CardContent className="py-8 text-center text-muted-foreground">
              Noch keine Zimmer. Lege eins an, damit eine Runde eröffnet werden kann.
            </CardContent>
          </Card>
        )}
      </div>

      <RoomDialog room={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RoomDialog({ room, onClose }: { room: Room | "new" | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRoom);
  const existing = room && room !== "new" ? room : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [size, setSize] = useState(existing?.size_sqm ? String(existing.size_sqm) : "");
  const [from, setFrom] = useState(existing?.available_from ?? "");
  const [status, setStatus] = useState<string>(existing?.status ?? "open");
  const [busy, setBusy] = useState(false);

  // Felder beim Öffnen eines anderen Zimmers neu setzen
  const [key, setKey] = useState<string | null>(null);
  const currentKey = existing?.id ?? (room === "new" ? "new" : null);
  if (currentKey !== key) {
    setKey(currentKey);
    setName(existing?.name ?? "");
    setSize(existing?.size_sqm ? String(existing.size_sqm) : "");
    setFrom(existing?.available_from ?? "");
    setStatus(existing?.status ?? "open");
  }

  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          id: existing?.id,
          name,
          sizeSqm: size ? Number(size) : null,
          availableFrom: from || null,
          status: status as "open" | "promised" | "occupied",
        },
      });
      await queryClient.invalidateQueries();
      toast.success(existing ? "Zimmer aktualisiert." : "Zimmer angelegt.");
      onClose();
    } catch (err) {
      toast.error("Das hat nicht geklappt", { description: fmError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={room !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Zimmer bearbeiten" : "Neues Zimmer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="room-name">Name</Label>
            <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Zimmer 4, hinten links" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="room-size">Größe (m²)</Label>
              <Input id="room-size" type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-from">Frei ab</Label>
              <Input id="room-from" type="date" value={from ?? ""} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">frei</SelectItem>
                <SelectItem value="promised">zugesagt</SelectItem>
                <SelectItem value="occupied">belegt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={busy || name.trim().length < 1} onClick={submit}>
            {busy ? "Speichern …" : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
