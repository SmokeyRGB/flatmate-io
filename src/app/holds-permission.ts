import "server-only";
import type { SessionContext } from "@/db/session-context";
import { assertHasPermission, PermissionDeniedError } from "@/modules/identity/repository";
import type { PermissionName } from "@/modules/identity/schema";

// A refusal is an answer here (false), never an error; anything else is rethrown. For a page that
// shows a control only to a holder of a stored permission: the repository functions behind the
// control refuse again on their own.
export async function holdsPermission(context: SessionContext, permission: PermissionName): Promise<boolean> {
  try {
    await assertHasPermission(context, context.accountId, permission);
    return true;
  } catch (err) {
    if (err instanceof PermissionDeniedError) return false;
    throw err;
  }
}
