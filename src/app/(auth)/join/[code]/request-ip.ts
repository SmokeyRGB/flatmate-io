// design.md Decision 3 (FR-2.28): the join route's rate-limit key is an HMAC of the CLIENT IP,
// taken from x-forwarded-for (first entry — the client is the leftmost hop) or x-real-ip.
// Route-local: nothing outside this route needs to read a client IP today.
export function getClientIp(headersList: Headers): string | null {
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headersList.get("x-real-ip");
}
