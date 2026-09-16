import { useState } from "react";
import { toast } from "sonner";
import { invitationText } from "@/lib/fm/texts";
import { CopyBox } from "@/components/fm/Confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send } from "lucide-react";

export type InviteCandidate = { id: string; applicant_name: string; contact: string | null };

export function InviteDispatchDialog({
  applications,
  initialId,
  triggerLabel = "Einladung verschicken",
  triggerSize,
}: {
  applications: InviteCandidate[];
  initialId?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialId ?? applications[0]?.id ?? null);
  const person = applications.find((a) => a.id === selected) ?? applications.find((a) => a.id === initialId) ?? applications[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={triggerSize}>
          <Send className="mr-1 size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Einladung verschicken</DialogTitle>
          <DialogDescription>
            Die App verschickt nichts. Kopiere den Text und schick ihn auf dem Weg, den ihr mit der Person vereinbart
            habt.
          </DialogDescription>
        </DialogHeader>

        {applications.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {applications.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant={a.id === person?.id ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setSelected(a.id)}
              >
                {a.applicant_name}
              </Button>
            ))}
          </div>
        )}

        {person && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <p className="font-medium">{person.applicant_name}</p>
              {person.contact ? (
                <p className="text-xs text-muted-foreground">Erreichbar über: {person.contact}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Keine Kontaktadresse hinterlegt — frag die Person, die die Bewerbung erfasst hat.
                </p>
              )}
              {person.contact && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 px-2.5 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(person.contact!);
                    toast.success("Kontakt kopiert.");
                  }}
                >
                  Kontakt kopieren
                </Button>
              )}
            </div>
            <CopyBox text={invitationText(person.applicant_name)} label="Einladungstext kopieren" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
