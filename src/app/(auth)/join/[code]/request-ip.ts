// design.md Decision 3 (FR-2.28): the join route's rate-limit key is an HMAC of the client's
// address. Route-local: nothing outside this route needs to read a client address today.
//
// *** A FORWARDING HEADER IS NOT AN IDENTITY UNLESS A PROXY GUARANTEES IT ***
// The first version of this file read `x-forwarded-for` and took its LEFTMOST entry. That entry is
// supplied by the caller. An unauthenticated visitor could therefore send a different value on
// every request, land in a different bucket each time, and never meet the limit at all — not a
// partial weakening but a complete bypass of the one control C-2.12 says makes the shortened code
// (FR-2.26) defensible. Found in the second review of PR #17.
//
// So trust is now a DEPLOYMENT fact, stated explicitly, never inferred from the request:
//
//   - `JOIN_ATTEMPT_TRUSTED_IP_HEADER` unset (the default) → no header is believed, `null` is
//     returned, and every request funnels into joinAttemptSourceHash's single shared bucket. The
//     limit becomes global rather than per-source. That is the conservative failure: a flood can
//     make the join route refuse everyone for a window (a denial of service), but nobody can buy
//     themselves extra guesses, which is what FR-2.28 exists to prevent. It is also simply the
//     truth in local development, where every request genuinely arrives from one address.
//   - set → that header is read, and the LAST comma-separated entry is taken, because the closest
//     trusted proxy appends its view of the peer to the right. The leftmost entry is whatever the
//     client claimed. On a platform, name the header the platform itself overwrites (Vercel:
//     `x-vercel-forwarded-for`); behind your own proxy, name the one it sets and strips inbound.
//
// Setting this to `x-forwarded-for` with no proxy in front re-creates exactly the hole above. The
// name of the variable says "trusted" because somebody has to have made that true.
export function getClientIp(headersList: Headers): string | null {
  const trustedHeader = process.env.JOIN_ATTEMPT_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!trustedHeader) return null;

  const raw = headersList.get(trustedHeader);
  if (!raw) return null;

  // Single-valued headers (x-real-ip) split to one element, so this handles both shapes.
  const hops = raw
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1]! : null;
}
