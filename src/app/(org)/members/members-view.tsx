import { ArrowLeft, DoorOpen, ShieldCheck, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { joinCodeState, removedJoinerCautionApplies } from "@/modules/identity/join-code-state";
import {
  buildJoinUrl,
  type listJoinCodeIssuances,
  type ResidentListResult,
} from "@/modules/identity/repository";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { SubmitButton } from "@/ui/submit-button";
import {
  createResidentProfileAction,
  extendJoinCodeAction,
  issueJoinCodeAction,
  issueJoinCodeForProfileAction,
  issuePasswordResetLinkAction,
  reactivateMemberAction,
  setMemberRoleAction,
  setMovedOutAction,
} from "./actions";
import { DeleteJoinCodeForm } from "./delete-join-code-form";
import { DeletePreparedProfileForm } from "./delete-prepared-profile-form";
import { JoinCodeCopyButtons } from "./join-code-copy-buttons";
import { RemoveMemberForm } from "./remove-member-form";

const t = de.members;

type JoinCodeIssuanceRow = Awaited<ReturnType<typeof listJoinCodeIssuances>>[number];

function formatGermanDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" });
}

// design.md Decision 6 / spec.md "The moderating person governs the links": a link's state is
// derived (domain/identity.md §2.1 forbids a status column), and the surface is allowed to name
// the reason it's dead — the REDEMPTION path is what must never do that (FR-2.8).
//
// design.md Decision 9 (revised 2026-09-23): rebuilt on top of join-code-state.ts's joinCodeState,
// which now also drives the live/dead split below and the removed-joiner caution — same texts,
// same order (deleted, expired, used up, else live) as before the revision.
//
// Copilot review fix: `now` is the caller's, never this function's own `new Date()` — the page
// computes exactly one `now` up front and threads it through every helper on this page, so a
// link's live/dead split, its status label, and the removed-joiner caution can never disagree
// about what moment "now" was, even if this render straddles an expiry or usage boundary.
function joinCodeStatusLabel(issuance: JoinCodeIssuanceRow, now: Date): string {
  switch (joinCodeState(issuance, now)) {
    case "deleted":
      return t.joinCode.deletedOn(formatGermanDate(issuance.deletedAt as Date));
    case "expired":
      return t.joinCode.expiredOn(formatGermanDate(issuance.expiresAt));
    case "used_up":
      return t.joinCode.usedUp;
    case "live":
      return t.joinCode.validUntil(formatGermanDate(issuance.expiresAt));
  }
}

// One card for one issuance, shared by the live list and the collapsed dead-links section below
// (design.md Decision 9 revised: "dead-link rendering inside is unchanged" — same label, controls,
// caution and joiner names either way).
function renderJoinCodeCard(
  issuance: JoinCodeIssuanceRow,
  host: string | null,
  now: Date,
  profileNameById: Map<string, string>,
  callerIsHouseholdAccount: boolean,
) {
  const isDeleted = issuance.deletedAt !== null;
  const url = buildJoinUrl(host, issuance.code);
  // founding-link-moderator D4: the founder's own link, only while it can still be used. Once it
  // is spent, expired or deleted it is listed like any other.
  const isLiveFoundingLink = issuance.isFoundingLink && joinCodeState(issuance, now) === "live";
  // identity/password-reset (O-16, design.md Decision 8): a reset row names the profile it was
  // issued for, "Passwort-Link für <Name>", instead of the ordinary "who joined through this link"
  // line below — a reset link never creates or claims a profile (spec), so that line would always
  // read "noch niemand beigetreten" for it, which is not the fact this card should state.
  const isReset = issuance.purpose === "password_reset";
  const resetTargetName = isReset && issuance.residentProfileId
    ? profileNameById.get(issuance.residentProfileId)
    : undefined;
  // review fix (PR #23 finding): profileNameById comes from getResidentList, which hides a
  // removed profile's name entirely (PR #18 decision) — a reset link whose target was later
  // removed would otherwise lose its label completely. Falls back to a neutral label rather than
  // showing the removed person's name some other way, which would contradict #18.
  const resetLabel = isReset
    ? resetTargetName
      ? t.joinCode.resetLinkForName(resetTargetName)
      : t.joinCode.resetLinkForRemovedPerson
    : undefined;
  return (
    <li key={issuance.id} className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{joinCodeStatusLabel(issuance, now)}</span>
        <span className="text-muted-foreground">{t.joinCode.usageCount(issuance.uses, issuance.maxUses)}</span>
      </div>

      {resetLabel && <p className="text-sm font-medium">{resetLabel}</p>}

      {!isDeleted && (
        <div className="flex flex-wrap items-center gap-3">
          <form action={extendJoinCodeAction}>
            <input type="hidden" name="issuanceId" value={issuance.id} />
            <SubmitButton className="btn-link">{t.joinCode.extend}</SubmitButton>
          </form>
          <DeleteJoinCodeForm issuanceId={issuance.id} code={issuance.code} />
        </div>
      )}

      {/* design.md Decision 9 (revised 2026-09-23): the caution is for a LIVE link only — the
          first version (hasRemovedJoiner && !deletedAt) also flagged a used-up or expired link,
          which the 8.3 walkthrough caught. Names no one (C-2.5, proposal Assumption 2). */}
      {removedJoinerCautionApplies(issuance, now) && (
        <div className="callout callout-caution">
          <TriangleAlert className="size-4" />
          <p>{t.joinCode.removedJoinerCaution}</p>
        </div>
      )}

      {isLiveFoundingLink && (
        <>
          <p className="text-sm font-medium">
            {callerIsHouseholdAccount ? t.joinCode.foundingLinkLabel : t.joinCode.foundingLinkLabelNeutral}
          </p>
          {/* A caution, not a helper line: where ordinary links are listed beside it, this must
              visibly outweigh the section's generic warning, which is false for this link. */}
          <div className="callout callout-caution">
            <TriangleAlert className="size-4" />
            <p>
              {callerIsHouseholdAccount ? t.joinCode.foundingLinkHint : t.joinCode.foundingLinkHintNeutral}
            </p>
          </div>
        </>
      )}

      <p className="font-mono text-sm font-semibold">{issuance.code}</p>
      {isLiveFoundingLink ? (
        // A plain <a>, not next/link: following it records a rate-limit attempt and resolves the
        // code, which a prefetch must not do (founding-link-moderator D4).
        <p className="text-xs break-all">
          <a href={buildJoinUrl(null, issuance.code)} className="btn-link">
            {url}
          </a>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground break-all">{url}</p>
      )}
      <JoinCodeCopyButtons code={issuance.code} url={url} />

      {/* AC-2.26: every link names who joined through it — live, used-up, or deleted
          alike — and a link nobody used names nobody rather than rendering nothing. A reset link
          never creates or claims a profile (spec), so it never gets this line at all. */}
      {!isReset && (
        <p className="text-xs text-muted-foreground">
          {issuance.joinedResidentNames.length > 0
            ? t.joinCode.joinedNames(issuance.joinedResidentNames)
            : t.joinCode.joinedNoneYet}
        </p>
      )}
    </li>
  );
}

// Screen O16's body, rendered from what getResidentList returned: the page itself (page.tsx)
// only loads it and renders the access message. A pure component, so the members screen can be
// rendered for any flag set without a session (members-page-capabilities.test.ts).
//
// FR-1.25–FR-1.29 (revised 2026-09-17, U-30; permission-based since F3 change 2b): every control
// is decided by ONE flag of the caller's stored permissions (design D6) — the profile form by
// canCreateProfile, the role toggle by canAppointModerator, move-out/reactivate/remove by
// canManageMembers, the join-link section and the per-profile invitation by canManageJoinCodes,
// the reset-link controls by canIssueResetLink. No control reads the caller's role; only the
// badge and the toggle's direction read the LISTED member's role, which describes that member.
// With no resident yet it leads with the add-resident form, then the join-link section (O16).
export function MembersView({
  residentList,
  joinCodeIssuances,
  host,
  now,
  callerIsHouseholdAccount,
}: {
  residentList: ResidentListResult;
  joinCodeIssuances: JoinCodeIssuanceRow[];
  host: string | null;
  now: Date;
  // founding-link-moderator R3: the founding row's copy addresses the founder; a moderator sees
  // caller-neutral copy instead.
  callerIsHouseholdAccount: boolean;
}) {
  const {
    members,
    canManageMembers,
    canManageJoinCodes,
    canCreateProfile,
    canAppointModerator,
    canIssueResetLink,
    leadWithJoinCode,
  } = residentList;

  // join-by-link design.md Decision 13 / task 12.8: group bound issuances by the profile they
  // name, most-recent first (listJoinCodeIssuances already orders desc by createdAt) — a prepared
  // profile's own row renders its most recent bound issuance beside the "issue an invitation"
  // action, so the link is reachable without hunting through the general list below.
  const boundIssuancesByProfile = new Map<string, JoinCodeIssuanceRow>();
  // identity/password-reset (O-16, design.md Decision 8): the most recent reset-purpose issuance
  // per profile, so the row that just issued one can reveal it (the same "reachable without
  // hunting through the general list" reasoning as boundIssuancesByProfile above).
  const resetIssuancesByProfile = new Map<string, JoinCodeIssuanceRow>();
  for (const issuance of joinCodeIssuances) {
    if (!issuance.residentProfileId) continue;
    if (issuance.purpose === "password_reset") {
      // Only a LIVE reset link is revealed on the row: a deleted, expired or spent one must never
      // be offered as copyable (it stays listed, labelled, in the collapsed dead-links section).
      // The first live one wins, so a dead newer row cannot hide an older live one.
      if (joinCodeState(issuance, now) === "live" && !resetIssuancesByProfile.has(issuance.residentProfileId)) {
        resetIssuancesByProfile.set(issuance.residentProfileId, issuance);
      }
      continue;
    }
    if (!boundIssuancesByProfile.has(issuance.residentProfileId)) {
      boundIssuancesByProfile.set(issuance.residentProfileId, issuance);
    }
  }
  const profileNameById = new Map(members.map((m) => [m.id, m.displayName]));

  // design.md Decision 9 (revised 2026-09-23): live links first as today, dead ones (expired,
  // used up or deleted) collapsed below — order within each part stays created_at DESC, since
  // joinCodeIssuances already comes back in that order and filtering preserves it (FR-2.29).
  const liveIssuances = joinCodeIssuances.filter((issuance) => joinCodeState(issuance, now) === "live");
  const deadIssuances = joinCodeIssuances.filter((issuance) => joinCodeState(issuance, now) !== "live");
  // founding-link-moderator D4: the generic warning ("Wer ihn hat, kann mitstimmen") is false for
  // the founding link, so it is hidden while the founding link is the only live link (a fresh
  // household). Once ordinary links are listed too it stays, and the founding row's own hint
  // overrides it for that row.
  const onlyFoundingLinksLive = liveIssuances.length > 0 && liveIssuances.every((i) => i.isFoundingLink);

  const createResidentForm = canCreateProfile ? (
    <div className="card space-y-2">
      <form action={createResidentProfileAction} className="flex gap-2">
        <input name="displayName" placeholder={t.addResidentPlaceholder} className="field-input flex-1" />
        <SubmitButton className="btn btn-primary shrink-0">{t.addResidentSubmit}</SubmitButton>
      </form>
      <p className="field-helper">{t.addResidentHelperInviteNote}</p>
    </div>
  ) : null;

  const backLink = (
    <Link href="/organization" className="back-link">
      <ArrowLeft className="size-4" /> {de.nav.organisation}
      <LinkPendingHint />
    </Link>
  );

  // design.md Decision 6: three parts, in this order — warning, create form, list of links.
  // task 3.8/EC-2.13: a household whose links are all dead still gets this whole section (create
  // form first, dead links still listed below) — never an empty state.
  const joinCodeSection = canManageJoinCodes ? (
    <div className="space-y-4">
      <p className="eyebrow">{t.joinCode.heading}</p>

      {/* FR-2.2/S-49: the warning sits beside the links, visible without interaction. C-2.5: this
          is social visibility, never security — no padlock, no "sicher", no "geschützt" anywhere
          in this section (task 3.9). */}
      {!onlyFoundingLinksLive && (
        <div className="callout callout-caution">
          <TriangleAlert className="size-4" />
          <p>{t.joinCode.warning}</p>
        </div>
      )}

      {/* The create form parameterises the NEXT link, not an existing one (Decision 6) — issuing
          never rewrites an already-issued link's limits. */}
      <form action={issueJoinCodeAction} className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1">
            <label htmlFor="validDays" className="field-label">
              {t.joinCode.create.validDaysLabel}
            </label>
            <input
              id="validDays"
              name="validDays"
              type="number"
              min={1}
              defaultValue={7}
              className="field-input"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="maxUses" className="field-label">
              {t.joinCode.create.maxUsesLabel}
            </label>
            <input
              id="maxUses"
              name="maxUses"
              type="number"
              min={0}
              defaultValue={1}
              className="field-input"
            />
            <p className="field-helper">{t.joinCode.create.maxUsesHelper}</p>
          </div>
        </div>
        <SubmitButton className="btn btn-primary">{t.joinCode.create.submit}</SubmitButton>
      </form>

      {joinCodeIssuances.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.joinCode.empty}</p>
      ) : (
        <>
          <ul className="space-y-3">{liveIssuances.map((issuance) => renderJoinCodeCard(issuance, host, now, profileNameById, callerIsHouseholdAccount))}</ul>

          {/* design.md Decision 9 (revised 2026-09-23, human decision from the 8.3 walkthrough):
              dead links (expired, used up or deleted) are still listed — "Ein toter Link
              verschwindet nicht" — but collapsed by default so a household with many dead links
              is not cluttered with them. Native <details>, no client JS, no `open` attribute.
              Rendered only when at least one dead link exists (spec.md "Dead links are
              collapsed"). */}
          {deadIssuances.length > 0 && (
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t.joinCode.deadLinksSummary(deadIssuances.length)}
              </summary>
              <ul className="space-y-3 pt-3">{deadIssuances.map((issuance) => renderJoinCodeCard(issuance, host, now, profileNameById, callerIsHouseholdAccount))}</ul>
            </details>
          )}
        </>
      )}
    </div>
  ) : null;

  if (leadWithJoinCode) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {backLink}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{t.noOneJoinedYet}</p>
        {/* A link bound to a prepared profile needs that profile first, so the form leads (O16). */}
        {createResidentForm}
        {joinCodeSection}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {backLink}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      {createResidentForm}

      <ul className="space-y-3">
        {members.map((m) => {
          // join-by-link design.md Decision 13: only a `prepared` profile (no account, never
          // claimed) can be bound to a link at all — an active/moved_out profile keeps whatever
          // issuance history it has, but issuing a NEW one for it makes no sense (issueJoinCodeTx
          // would refuse it anyway, ResidentProfileNotEligibleForBindingError).
          const boundIssuance = !m.accountId ? boundIssuancesByProfile.get(m.id) : undefined;
          // review fix: bound once per row instead of `resetIssuancesByProfile.get(m.id)` re-run
          // five times below (once in the condition, four times with `!`).
          const resetIssuance = m.accountId ? resetIssuancesByProfile.get(m.id) : undefined;
          return (
          <li key={m.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.displayName}</span>
                {/* role-state-read: describes the listed member (the badge), not the caller's rights */}
                {m.role === "moderator" && (
                  <span className="badge badge-role">
                    <ShieldCheck className="size-3" /> {t.moderationBadge}
                  </span>
                )}
                {m.status === "moved_out" && (
                  <span className="badge">
                    <DoorOpen className="size-3" /> {de.status.movedOut}
                  </span>
                )}
              </div>
              {/* U-27 Decision 1: a moved-out member can now be removed too (moved_out -> removed
                  is a declared transition) — explicit statuses, not `!== "removed"`, since a
                  removed row never reaches this page at all (getResidentList excludes it). */}
              {canManageMembers && m.accountId && (m.status === "active" || m.status === "moved_out") && (
                <RemoveMemberForm accountId={m.accountId} displayName={m.displayName} />
              )}
            </div>

            {(canManageMembers || canAppointModerator || canIssueResetLink) && m.accountId && (
              <div className="mt-3">
                {m.status !== "moved_out" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* EC-1.7 (amended 2026-10-01): the household account or a moderator may
                        appoint (or unappoint) a moderator (canAppointModerator) — a reversible
                        toggle, so it's a neutral secondary button, not a destructive-weight link.
                        The toggle's direction reads the LISTED member's role. */}
                    {/* role-state-read: which way the toggle goes describes the listed member, not the caller */}
                    {canAppointModerator && m.role === "member" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="moderator" />
                        <SubmitButton className="btn btn-secondary">{t.makeModerator}</SubmitButton>
                      </form>
                    )}
                    {/* role-state-read: which way the toggle goes describes the listed member, not the caller */}
                    {canAppointModerator && m.role === "moderator" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="member" />
                        <SubmitButton className="btn btn-secondary">{t.makeMember}</SubmitButton>
                      </form>
                    )}
                    {/* "Moved out" is reversible (via Reactivate) and gets the same neutral
                        secondary weight as the role toggle above; red is reserved for the one
                        irreversible action (Entfernen, the card-corner trash icon). */}
                    {canManageMembers && (
                      <form action={setMovedOutAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <SubmitButton className="btn btn-secondary" icon={<UserMinus className="size-4" />}>
                          {t.markMovedOut}
                        </SubmitButton>
                      </form>
                    )}
                    {/* identity/password-reset (O-16, proposal Assumption 5): only a caller holding
                        `issue_password_reset_link` (the household account) — issuePasswordResetLink
                        itself refuses everyone else, so the button is not even offered
                        (canIssueResetLink). Only while the gap it closes still exists: active,
                        live, and no email yet. */}
                    {canIssueResetLink && m.status === "active" && m.hasEmail && (
                      <p className="field-helper">{t.joinCode.resetLinkNotNeeded}</p>
                    )}
                    {canIssueResetLink && m.status === "active" && !m.hasEmail && (
                      <form action={issuePasswordResetLinkAction}>
                        <input type="hidden" name="residentProfileId" value={m.id} />
                        <SubmitButton className="btn btn-secondary">{t.joinCode.issueResetLink}</SubmitButton>
                      </form>
                    )}
                  </div>
                ) : canManageMembers ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reactivateMemberAction}>
                      <input type="hidden" name="accountId" value={m.accountId} />
                      <SubmitButton className="btn btn-secondary" icon={<UserPlus className="size-4" />}>
                        {de.common.reactivate}
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </div>
            )}

            {/* identity/password-reset (O-16, design.md Decision 8): reveals the most recently
                issued reset link for this profile, with the E-03/K-18 caution (spec: "The screen
                that issues it SHALL state that whoever holds the link can set this person's
                password") — never presented as a security measure. */}
            {canIssueResetLink && m.status === "active" && !m.hasEmail && resetIssuance && (
              <div className="mt-3 space-y-2">
                <p className="field-helper">{t.joinCode.resetLinkIssuedHeading}</p>
                <p className="text-xs text-muted-foreground">
                  {joinCodeStatusLabel(resetIssuance, now)}
                </p>
                <p className="font-mono text-sm font-semibold">{resetIssuance.code}</p>
                <JoinCodeCopyButtons
                  code={resetIssuance.code}
                  url={buildJoinUrl(host, resetIssuance.code)}
                />
                <div className="callout callout-caution">
                  <TriangleAlert className="size-4" />
                  <p>{t.joinCode.resetLinkIssuedCaution}</p>
                </div>
              </div>
            )}

            {/* A prepared profile has no account, so nothing is revoked: the household account or a
                moderator (manage_members) may delete it from the household record. */}
            {canManageMembers && !m.accountId && m.status === "prepared" && (
              <div className="mt-3">
                <DeletePreparedProfileForm residentProfileId={m.id} displayName={m.displayName} />
              </div>
            )}

            {/* join-by-link design.md Decision 13 / task 12.8: the one place a bound invitation
                is issued — without this the feature is unreachable outside tests. Gated like every
                other join-code control (canManageJoinCodes). */}
            {canManageJoinCodes && !m.accountId && m.status === "prepared" && (
              <div className="mt-3 space-y-2">
                <form action={issueJoinCodeForProfileAction}>
                  <input type="hidden" name="residentProfileId" value={m.id} />
                  <SubmitButton className="btn btn-secondary">{t.joinCode.issueForProfile}</SubmitButton>
                </form>
                {boundIssuance && (
                  <div className="space-y-1">
                    <p className="field-helper">{t.joinCode.issuedForProfileHeading}</p>
                    <p className="text-xs text-muted-foreground">{joinCodeStatusLabel(boundIssuance, now)}</p>
                    <p className="font-mono text-sm font-semibold">{boundIssuance.code}</p>
                    <JoinCodeCopyButtons
                      code={boundIssuance.code}
                      url={buildJoinUrl(host, boundIssuance.code)}
                    />
                  </div>
                )}
              </div>
            )}
          </li>
          );
        })}
      </ul>

      {canManageJoinCodes && <div className="border-t border-border pt-4">{joinCodeSection}</div>}
    </div>
  );
}
