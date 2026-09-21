"use server";

import { redirect } from "next/navigation";
import { assertHasPermission, PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { createAndOpenRound, RoundOpenPreconditionError } from "@/modules/casting/repository";
import { de } from "@/ui/strings";

export interface CreateRoundFormState {
  error: string | null;
}

// FR-1.12/EC-1.1-EC-1.3: creates a draft round with the selected rooms, then opens it
// immediately — O2's "Open" action. Refusals surface inline instead of a generic error.
export async function createAndOpenRoundAction(
  _prevState: CreateRoundFormState,
  formData: FormData,
): Promise<CreateRoundFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");

  const title = String(formData.get("title") ?? "").trim() || "New round";
  const roomIds = formData.getAll("roomIds").map(String).filter(Boolean);

  const actor = { accountId: current.context.accountId, profileId: current.context.profileId };

  // rounds-new-permission-check-outside-try: the close_round check used to sit above this try
  // block, so a signed-in user without it hit an unhandled server-action error instead of the
  // inline state.error every other refusal on this form uses. It's folded in here alongside the
  // existing RoundOpenPreconditionError mapping — no change to who holds close_round.
  //
  // rounds-new-orphan-draft-atomicity: create + open now run in one transaction (repository
  // layer) — a precondition failure below rolls back the draft insert too, instead of leaving an
  // orphan draft round behind for every failed submission.
  try {
    await assertHasPermission(current.context, current.context.accountId, "close_round");
    await createAndOpenRound(current.context, title, roomIds, actor);
  } catch (err) {
    if (err instanceof RoundOpenPreconditionError) {
      switch (err.code) {
        case "no_rooms_selected":
          return { error: de.rounds.errors.noRoomsSelected };
        case "rooms_unavailable":
          return { error: de.rounds.errors.roomsUnavailable };
        case "no_eligible_residents":
          return { error: de.rounds.errors.noEligibleResidents };
        case "not_in_draft":
          // Carries a raw round id in its `message` — never shown, only logged (spec.md "No
          // model term reaches a resident untranslated").
          console.error(err);
          return { error: de.rounds.errors.genericPreconditionFailure };
        default: {
          const _exhaustive: never = err.code;
          return _exhaustive;
        }
      }
    }
    if (err instanceof PermissionDeniedError) {
      // Left uncoded (tasks.md 2.3) — every call site resolves to the same "not allowed" outcome
      // for the user; mapped by class to one generic key instead of the raw `Missing permission:
      // …` message, which would otherwise leak a permission slug (a model term).
      return { error: de.rounds.errors.permissionDenied };
    }
    throw err;
  }

  redirect("/dashboard");
}
