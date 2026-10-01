// Leaf module. tests/setup.ts imports it while loading, which is before that file's body runs
// dotenv. Do not import the database client or anything that reads DATABASE_URL at load.
import { randomUUID } from "node:crypto";

// tests/setup.ts sets JOIN_ATTEMPT_TRUSTED_IP_HEADER to this name for the whole suite, so a join
// test that builds request Headers and puts a per-run value here never falls into
// joinAttemptSourceHash(null)'s single shared bucket.
export const JOIN_TEST_CLIENT_IP_HEADER = "x-flatmate-test-client-ip";

export function joinTestClientIp(): string {
  return `test-${randomUUID()}`;
}

export function joinTestHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set(JOIN_TEST_CLIENT_IP_HEADER, joinTestClientIp());
  return headers;
}
