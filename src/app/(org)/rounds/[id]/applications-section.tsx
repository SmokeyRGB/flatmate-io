import Link from "next/link";
import { groupApplicationsByState } from "@/modules/casting/application-groups";
import type { ApplicationState } from "@/modules/casting/transitions";
import type { Strings } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";

// The „Bewerbungen" section of the round page (screen O4, F3 change 3, design D2). Server-
// renderable and props only, so it can be render-tested: the page decides which of the three
// viewer cases applies and does the reading.
//
// Facts are shown as TEXT only: React escapes them and there is no dangerouslySetInnerHTML
// (PRD §6.5). The state is shown as a word, never by colour alone (rahmenwerk.md §12), and there is
// no colour per state and no icon: the human asked for the page to stay calm.

export interface ApplicationListRow {
  id: string;
  applicantName: string;
  state: ApplicationState;
  collectedFrom: "data_subject" | "third_party";
  age: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOther: string | null;
}

// What the section shows. The page picks one; the section never reads anything itself.
export type ApplicationsView =
  // A session without a resident profile: the §8.6 sentence, no list and no number.
  | { view: "household_account" }
  // A holder: the grouped list, or the empty state.
  | { view: "list"; rows: readonly ApplicationListRow[] }
  // The list read failed for a reason that is not a refusal.
  | { view: "load_error" };

export type ApplicationsSectionProps = {
  // language-switch: a plain prop, not a hook. This is a sync server-tree component that tests
  // render directly, and the page already holds the request's table.
  strings: Strings;
  roundId: string;
  // The way to capture: an open round and create_application (the page's existing check).
  canCapture: boolean;
} & ApplicationsView;

// One muted line: the age, then the stored contacts, in a fixed order. Empty when nothing is stored.
function summaryOf(row: ApplicationListRow, t: Strings["applications"]["list"]): string {
  const parts: string[] = [];
  if (row.age !== null) parts.push(t.age(row.age));
  for (const contact of [row.contactEmail, row.contactPhone, row.contactOther]) {
    if (contact) parts.push(contact);
  }
  return parts.join(t.summarySeparator);
}

export function ApplicationsSection(props: ApplicationsSectionProps) {
  const s = props.strings;
  const t = s.applications.list;
  const captureHref = `/rounds/${props.roundId}/applications/new`;
  const captureLink = (primary: boolean) => (
    <Link href={captureHref} className={primary ? "btn btn-primary" : "btn btn-secondary"}>
      {s.rounds.detail.captureApplication}
      <LinkPendingHint />
    </Link>
  );

  if (props.view === "household_account") {
    return (
      <section aria-labelledby="applications-heading" className="space-y-3">
        <h2 id="applications-heading" className="font-serif text-lg font-medium">
          {t.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{s.applications.states.householdAccount}</p>
      </section>
    );
  }

  if (props.view === "load_error") {
    return (
      <section aria-labelledby="applications-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="applications-heading" className="font-serif text-lg font-medium">
            {t.heading}
          </h2>
          {props.canCapture && captureLink(false)}
        </div>
        <p role="alert" className="text-sm">
          {t.loadError}
        </p>
      </section>
    );
  }

  if (props.rows.length === 0) {
    return (
      <section aria-labelledby="applications-heading" className="space-y-3">
        <h2 id="applications-heading" className="font-serif text-lg font-medium">
          {t.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{t.empty}</p>
        {props.canCapture && captureLink(true)}
      </section>
    );
  }

  const groups = groupApplicationsByState(props.rows);
  return (
    <section aria-labelledby="applications-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="applications-heading" className="font-serif text-lg font-medium">
          {t.heading}
        </h2>
        {props.canCapture && captureLink(false)}
      </div>
      {groups.map((group) => (
        <div key={group.state} className="space-y-2">
          <h3 className="text-sm font-medium">{t.groupLabel(s.status.application[group.state], group.count)}</h3>
          <ul className="space-y-2">
            {group.rows.map((row) => {
              const summary = summaryOf(row, t);
              return (
                <li key={row.id}>
                  <Link href={`/rounds/${props.roundId}/applications/${row.id}`} className="card block py-3 transition hover:shadow-none">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.applicantName}</span>
                      <span className="badge">{s.status.application[row.state]}</span>
                      {row.collectedFrom === "third_party" && (
                        <span className="text-xs text-muted-foreground">
                          {s.applications.detail.viaSomeoneElse}
                        </span>
                      )}
                    </span>
                    {summary !== "" && (
                      <span className="mt-1 block text-sm text-muted-foreground">{summary}</span>
                    )}
                    <LinkPendingHint />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
