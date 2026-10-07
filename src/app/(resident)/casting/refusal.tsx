// The one-line refusal of the scoreboard and the candidate detail: a plain muted sentence.
export function Refusal({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
