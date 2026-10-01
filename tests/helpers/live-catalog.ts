// Strict when the environment says the database was built from the repository alone:
// scripts/ci/bootstrap-local-db.sh exports DATA_INVENTORY_LIVE_STRICT=1 for CI's `verify` job, so
// the enforcing job doesn't depend on which hostname its DATABASE_URL happens to use. A loopback
// host (a developer's own local stack) is strict too. Any other host — a local run against hosted
// flatmate-io-dev, the pre-push hook, CI's `verify-hosted` — only warns. A strict failure on the
// shared database would block every other branch's pre-push from the moment one branch's
// migration landed there (design.md D5, data-inventory-live.test.ts).
export function isStrictCatalogCheck(): boolean {
  if (process.env.DATA_INVENTORY_LIVE_STRICT === "1") return true;
  const url = new URL(process.env.DATABASE_URL!);
  // WHATWG URL keeps the brackets on an IPv6 hostname: `postgres://…@[::1]:5432` → "[::1]".
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}
