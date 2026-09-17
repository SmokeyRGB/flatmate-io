import { redirect } from "next/navigation";
import { getHousehold, getResidentList } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { reactivateMemberAction, rotateJoinCodeAction, setMovedOutAction } from "./actions";
import { RemoveMemberForm } from "./remove-member-form";

// Screen O16. FR-1.25–FR-1.29 (revised 2026-09-17, U-30): full parity for administration AND a
// moderator; leads with the join-code action when administration is the only member.
export default async function MembersPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const { members, canAct, leadWithJoinCode } = await getResidentList(
    current.context,
    current.context.accountId,
  );

  if (leadWithJoinCode) {
    const household = await getHousehold(current.context);
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-semibold text-[#190F09]">Members</h1>
        <p className="text-sm text-[#6B4F3B]">
          No one has joined yet — share your join code to invite the first resident.
        </p>
        <p className="rounded-xl border border-[#D9C7B8] bg-[#FBF3EA] p-4 font-mono text-sm">
          {household?.joinCode}
        </p>
        <form action={rotateJoinCodeAction}>
          <button type="submit" className="rounded-full bg-[#B6522D] px-4 py-2 text-sm text-[#FBF3EA]">
            Rotate join code
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-[#190F09]">Members</h1>

      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl border border-[#D9C7B8] bg-[#FBF3EA] p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#190F09]">{m.displayName}</span>
              <span className="text-sm text-[#6B4F3B]">{m.status}</span>
            </div>

            {canAct && m.accountId && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {m.status !== "moved_out" ? (
                  <>
                    <form action={setMovedOutAction}>
                      <input type="hidden" name="accountId" value={m.accountId} />
                      <button type="submit" className="text-sm text-[#B6522D] underline">
                        Set moved out
                      </button>
                    </form>
                    <RemoveMemberForm accountId={m.accountId} displayName={m.displayName} />
                  </>
                ) : (
                  <form action={reactivateMemberAction}>
                    <input type="hidden" name="accountId" value={m.accountId} />
                    <button type="submit" className="text-sm text-[#B6522D] underline">
                      Reactivate
                    </button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canAct && (
        <form action={rotateJoinCodeAction}>
          <button type="submit" className="text-sm text-[#B6522D] underline">
            Rotate join code
          </button>
        </form>
      )}
    </div>
  );
}
