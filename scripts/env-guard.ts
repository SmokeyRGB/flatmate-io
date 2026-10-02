// Tripwire for the test suite and the demo seed. The service-role key is a JWT
// whose payload is decoded, not verified: no signing secret is available here, so
// this is not an authentication check. It only refuses to point those tools at a
// Supabase project that is not on the allowlist.
//
// Never log the key, any URL, or a password. Errors name the variable and, when a
// project ref could be extracted, that ref.

import { Buffer } from "node:buffer";

export const DEFAULT_ALLOWED_SUPABASE_REFS = ["jrhkhjeybtkqpkggssif"] as const;

const URL_VARIABLES = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const SERVICE_KEY_VARIABLE = "SUPABASE_SERVICE_ROLE_KEY";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type EnvGuardProblem = {
  variable: string;
  reason: string;
  foundRef?: string;
};

export type EnvGuardResult = { ok: true } | { ok: false; problems: EnvGuardProblem[] };

type UrlClass =
  | { kind: "local" }
  | { kind: "ref"; ref: string }
  | { kind: "invalid" }
  | { kind: "no-ref" };

type JwtClass = { kind: "ref"; ref: string } | { kind: "no-ref" } | { kind: "not-jwt" };

function readValue(
  raw: string | undefined,
): { ok: true; value: string } | { ok: false; reason: "is unset" | "is empty" } {
  if (raw === undefined) return { ok: false, reason: "is unset" };
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "is empty" };
  return { ok: true, value };
}

function allowedRefs(
  env: Record<string, string | undefined>,
  options?: { allowedRefs?: readonly string[] },
): string[] {
  if (options?.allowedRefs !== undefined) return [...options.allowedRefs];
  const raw = env.ALLOWED_SUPABASE_REFS;
  if (raw === undefined || raw.trim() === "") return [...DEFAULT_ALLOWED_SUPABASE_REFS];
  const listed = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (listed.length === 0) return [...DEFAULT_ALLOWED_SUPABASE_REFS];
  return listed;
}

function classifyUrl(raw: string): UrlClass {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "invalid" };
  }
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return { kind: "local" };
  if (host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com")) {
    const username = decodeURIComponent(url.username);
    const dot = username.indexOf(".");
    const ref = dot >= 0 ? username.slice(dot + 1) : "";
    if (ref === "") return { kind: "no-ref" };
    return { kind: "ref", ref };
  }
  const direct = /^db\.([^.]+)\.supabase\.co$/.exec(host);
  if (direct) return { kind: "ref", ref: direct[1] };
  const api = /^([^.]+)\.supabase\.co$/.exec(host);
  if (api) return { kind: "ref", ref: api[1] };
  return { kind: "no-ref" };
}

function classifyJwt(raw: string): JwtClass {
  const parts = raw.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return { kind: "not-jwt" };
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { kind: "not-jwt" };
    }
    const ref = (payload as { ref?: unknown }).ref;
    if (typeof ref !== "string" || ref === "") return { kind: "no-ref" };
    return { kind: "ref", ref };
  } catch {
    return { kind: "not-jwt" };
  }
}

function keyProblem(jwt: JwtClass, allowed: readonly string[]): EnvGuardProblem | undefined {
  if (jwt.kind === "not-jwt") return { variable: SERVICE_KEY_VARIABLE, reason: "is not a JWT" };
  if (jwt.kind === "no-ref") {
    return { variable: SERVICE_KEY_VARIABLE, reason: "JWT has no project ref" };
  }
  if (!allowed.includes(jwt.ref)) {
    return {
      variable: SERVICE_KEY_VARIABLE,
      reason: "JWT project ref is not allowlisted",
      foundRef: jwt.ref,
    };
  }
  return undefined;
}

export function checkSupabaseEnv(
  env: Record<string, string | undefined>,
  options?: { allowedRefs?: readonly string[] },
): EnvGuardResult {
  const allowed = allowedRefs(env, options);
  const problems: EnvGuardProblem[] = [];
  const classified = new Map<(typeof URL_VARIABLES)[number], UrlClass>();

  for (const name of URL_VARIABLES) {
    const read = readValue(env[name]);
    if (!read.ok) {
      problems.push({ variable: name, reason: read.reason });
      continue;
    }
    const urlClass = classifyUrl(read.value);
    classified.set(name, urlClass);
    if (urlClass.kind === "invalid") {
      problems.push({ variable: name, reason: "is not a valid URL" });
    } else if (urlClass.kind === "no-ref") {
      problems.push({ variable: name, reason: "has no extractable project ref" });
    }
  }

  const key = readValue(env[SERVICE_KEY_VARIABLE]);
  if (!key.ok) problems.push({ variable: SERVICE_KEY_VARIABLE, reason: key.reason });

  const setUrls = URL_VARIABLES.flatMap((name) => {
    const urlClass = classified.get(name);
    return urlClass === undefined ? [] : [{ name, urlClass }];
  });
  const allSetLocal =
    setUrls.length > 0 && setUrls.every((entry) => entry.urlClass.kind === "local");
  const anyLocal = setUrls.some((entry) => entry.urlClass.kind === "local");
  const anyHosted = setUrls.some((entry) => entry.urlClass.kind === "ref");

  if (anyLocal && anyHosted) {
    for (const { name, urlClass } of setUrls) {
      if (urlClass.kind === "local") {
        problems.push({
          variable: name,
          reason: "is loopback while another Supabase URL is hosted",
        });
      } else if (urlClass.kind === "ref") {
        problems.push({
          variable: name,
          reason: "is hosted while another Supabase URL is loopback",
          foundRef: urlClass.ref,
        });
        if (!allowed.includes(urlClass.ref)) {
          problems.push({
            variable: name,
            reason: "is not an allowlisted project ref",
            foundRef: urlClass.ref,
          });
        }
      }
    }
  } else if (!allSetLocal) {
    for (const { name, urlClass } of setUrls) {
      if (urlClass.kind === "ref" && !allowed.includes(urlClass.ref)) {
        problems.push({
          variable: name,
          reason: "is not an allowlisted project ref",
          foundRef: urlClass.ref,
        });
      }
    }
  }

  if (key.ok) {
    const jwt = classifyJwt(key.value);
    if (allSetLocal && !anyHosted) {
      if (jwt.kind === "ref" && !allowed.includes(jwt.ref)) {
        problems.push({
          variable: SERVICE_KEY_VARIABLE,
          reason: "JWT project ref is not allowlisted",
          foundRef: jwt.ref,
        });
      }
    } else {
      const problem = keyProblem(jwt, allowed);
      if (problem) problems.push(problem);
    }
  }

  if (problems.length === 0) return { ok: true };
  return { ok: false, problems };
}

export function assertSafeSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
  context: "tests" | "seed",
): void {
  const result = checkSupabaseEnv(env);
  if (result.ok) return;
  const lead = context === "seed" ? "Refusing to seed." : "Refusing to run the test suite.";
  const lines = result.problems.map((problem) => {
    const found = problem.foundRef === undefined ? "" : ` (found ${problem.foundRef})`;
    return `  ${problem.variable}: ${problem.reason}${found}`;
  });
  throw new Error(
    `${lead} Point .env.local at flatmate-io-dev, see .env.example.\n${lines.join("\n")}`,
  );
}
