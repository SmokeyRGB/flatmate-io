import type { ScreeningCard } from "@/modules/deliberation/repository";
import { de } from "@/ui/strings";

const t = de.screening;

// Screen C1's card content (name, age, message, attributes), shared by the screening deck and the
// candidate detail (the second use, candidate-detail design D8). No contact detail exists on this
// type, so none can be rendered. Server-safe: no hooks, no client state.
export function CardBody({ card }: { card: ScreeningCard }) {
  return (
    <>
      <h2 className="font-serif text-xl font-semibold">
        {card.applicantName}
        {card.age !== null && <span className="font-sans text-base font-normal text-muted-foreground">, {t.ageYears(card.age)}</span>}
      </h2>
      {card.messageRaw && <p className="mt-3 whitespace-pre-wrap text-sm">{card.messageRaw}</p>}
      {card.attributes && card.attributes.length > 0 && (
        <dl className="mt-4 space-y-1 text-sm">
          {card.attributes.map((a, i) => (
            <div key={i} className="flex gap-2">
              <dt className="font-medium">{a.label}:</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
