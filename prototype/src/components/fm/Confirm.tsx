import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Ja, machen",
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CopyBox({
  text,
  rows = 9,
  note = "Die App verschickt nichts — du kopierst den Text und schickst ihn auf deinem Weg.",
  label = "Text kopieren",
}: {
  text: string;
  rows?: number;
  note?: string | null;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <textarea
        readOnly
        rows={rows}
        value={text}
        className="w-full rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed"
      />
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text)}
        className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {label}
      </button>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
