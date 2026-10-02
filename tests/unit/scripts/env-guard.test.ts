import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  assertSafeSupabaseEnv,
  checkSupabaseEnv,
  DEFAULT_ALLOWED_SUPABASE_REFS,
} from "../../../scripts/env-guard";

const DEV_REF = "jrhkhjeybtkqpkggssif";
const DENIED_REF = "notaproductionrefaa";
const UNKNOWN_REF = "aaaaaaaaaaaaaaaaaaaa";
const OTHER_REF = "bbbbbbbbbbbbbbbbbbbb";
const FIXTURE_PASSWORD = "fixture-password-do-not-leak";

type Env = Record<string, string | undefined>;

function fakeJwt(payload: Record<string, unknown>): {
  token: string;
  segments: [string, string, string];
} {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = Buffer.from("not-a-signature").toString("base64url");
  return { token: `${header}.${body}.${signature}`, segments: [header, body, signature] };
}

function poolerUrl(ref: string, password = FIXTURE_PASSWORD): string {
  return `postgres://app_runtime.${ref}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
}

function apiUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}

function directUrl(ref: string, password = FIXTURE_PASSWORD): string {
  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
}

function hosted(overrides: Env = {}): Env {
  return {
    DATABASE_URL: poolerUrl(DEV_REF),
    NEXT_PUBLIC_SUPABASE_URL: apiUrl(DEV_REF),
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: DEV_REF, role: "service_role" }).token,
    ...overrides,
  };
}

function loopback(overrides: Env = {}, host = "127.0.0.1"): Env {
  const dbHost = host;
  const api = host === "[::1]" ? "http://[::1]:54321" : `http://${host}:54321`;
  return {
    DATABASE_URL: `postgresql://app_runtime.pooler-dev:${FIXTURE_PASSWORD}@${dbHost}:54329/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: api,
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ iss: "supabase-demo", role: "service_role" }).token,
    ...overrides,
  };
}

function expectOk(env: Env): void {
  expect(checkSupabaseEnv(env)).toEqual({ ok: true });
  expect(() => assertSafeSupabaseEnv(env, "tests")).not.toThrow();
  expect(() => assertSafeSupabaseEnv(env, "seed")).not.toThrow();
}

function refusalMessage(env: Env): string {
  try {
    assertSafeSupabaseEnv(env, "tests");
  } catch (err) {
    return err instanceof Error ? err.message : "";
  }
  return "";
}

function expectRefusal(env: Env, variables: string[]): void {
  const result = checkSupabaseEnv(env);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  for (const variable of variables) {
    expect(result.problems.some((problem) => problem.variable === variable)).toBe(true);
  }
  const message = refusalMessage(env);
  expect(message).toContain("Point .env.local at flatmate-io-dev, see .env.example");
  for (const variable of variables) expect(message).toContain(variable);
  expect(message).not.toContain(FIXTURE_PASSWORD);
}

describe("Supabase environment guard", () => {
  it("case 1 accepts the dev ref in the pooler URL, the API URL, and the service-role JWT", () => {
    expectOk(hosted());
  });

  it("case 2 refuses a non-allowlisted ref in DATABASE_URL only", () => {
    const env = hosted({ DATABASE_URL: poolerUrl(DENIED_REF) });
    expectRefusal(env, ["DATABASE_URL"]);
    const result = checkSupabaseEnv(env);
    expect(result).toEqual({
      ok: false,
      problems: [
        {
          variable: "DATABASE_URL",
          reason: "is not an allowlisted project ref",
          foundRef: DENIED_REF,
        },
      ],
    });
  });

  it("case 2 refuses a non-allowlisted ref in NEXT_PUBLIC_SUPABASE_URL only", () => {
    const env = hosted({ NEXT_PUBLIC_SUPABASE_URL: apiUrl(DENIED_REF) });
    expectRefusal(env, ["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(checkSupabaseEnv(env)).toEqual({
      ok: false,
      problems: [
        {
          variable: "NEXT_PUBLIC_SUPABASE_URL",
          reason: "is not an allowlisted project ref",
          foundRef: DENIED_REF,
        },
      ],
    });
  });

  it("case 2 refuses a non-allowlisted ref when it appears only in the service-role JWT", () => {
    const env = hosted({
      SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: DENIED_REF, role: "service_role" }).token,
    });
    expectRefusal(env, ["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(checkSupabaseEnv(env)).toEqual({
      ok: false,
      problems: [
        {
          variable: "SUPABASE_SERVICE_ROLE_KEY",
          reason: "JWT project ref is not allowlisted",
          foundRef: DENIED_REF,
        },
      ],
    });
  });

  it("case 3 refuses an unknown ref in any one variable", () => {
    const cases: Array<[string, Env]> = [
      ["DATABASE_URL", hosted({ DATABASE_URL: poolerUrl(UNKNOWN_REF) })],
      ["NEXT_PUBLIC_SUPABASE_URL", hosted({ NEXT_PUBLIC_SUPABASE_URL: apiUrl(UNKNOWN_REF) })],
      [
        "SUPABASE_SERVICE_ROLE_KEY",
        hosted({
          SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: UNKNOWN_REF, role: "service_role" }).token,
        }),
      ],
    ];
    for (const [variable, env] of cases) {
      expectRefusal(env, [variable]);
      const result = checkSupabaseEnv(env);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problems.some((problem) => problem.foundRef === UNKNOWN_REF)).toBe(true);
      }
    }
  });

  it("case 4 refuses each required variable when it is unset", () => {
    for (const variable of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const env = hosted({ [variable]: undefined });
      expectRefusal(env, [variable]);
      expect(checkSupabaseEnv(env)).toEqual({
        ok: false,
        problems: [{ variable, reason: "is unset" }],
      });
    }
  });

  it("case 4 refuses each required variable when it is an empty string", () => {
    for (const variable of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const env = hosted({ [variable]: "" });
      expectRefusal(env, [variable]);
      expect(checkSupabaseEnv(env)).toEqual({
        ok: false,
        problems: [{ variable, reason: "is empty" }],
      });
    }
  });

  it("case 5 accepts the direct-host form for an allowlisted ref", () => {
    expectOk(hosted({ DATABASE_URL: directUrl(DEV_REF) }));
  });

  it("case 5 refuses the direct-host form for an unknown ref", () => {
    const env = hosted({ DATABASE_URL: directUrl(UNKNOWN_REF) });
    expectRefusal(env, ["DATABASE_URL"]);
    expect(checkSupabaseEnv(env)).toEqual({
      ok: false,
      problems: [
        {
          variable: "DATABASE_URL",
          reason: "is not an allowlisted project ref",
          foundRef: UNKNOWN_REF,
        },
      ],
    });
  });

  it("case 5 refuses a hosted URL with no extractable ref and an unparseable URL", () => {
    const noRef = hosted({
      DATABASE_URL: `postgres://u:${FIXTURE_PASSWORD}@somehost.example:5432/db`,
    });
    expectRefusal(noRef, ["DATABASE_URL"]);
    expect(checkSupabaseEnv(noRef)).toEqual({
      ok: false,
      problems: [{ variable: "DATABASE_URL", reason: "has no extractable project ref" }],
    });

    const unparseable = hosted({ DATABASE_URL: `not a url ${FIXTURE_PASSWORD}` });
    expectRefusal(unparseable, ["DATABASE_URL"]);
    expect(checkSupabaseEnv(unparseable)).toEqual({
      ok: false,
      problems: [{ variable: "DATABASE_URL", reason: "is not a valid URL" }],
    });
  });

  it("case 6 accepts CI's local stack on 127.0.0.1, localhost, and [::1]", () => {
    expectOk(loopback());
    expectOk(loopback({}, "localhost"));
    expectOk(loopback({}, "[::1]"));
  });

  it("case 7 refuses spoofed loopback hosts, a mixed local/hosted pair, and a loopback JWT with a foreign ref", () => {
    const spoofs = [
      "localhost.evil.test",
      "127.0.0.1.nip.io",
      "evil.test",
    ];
    for (const host of spoofs) {
      const dbUser = host === "evil.test" ? "127.0.0.1" : "app_runtime.pooler-dev";
      expectRefusal(
        {
          DATABASE_URL: `postgresql://${dbUser}:${FIXTURE_PASSWORD}@${host}:54329/postgres`,
          NEXT_PUBLIC_SUPABASE_URL: `http://${host === "evil.test" ? "127.0.0.1@" : ""}${host}:54321`,
          SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ iss: "supabase-demo", role: "service_role" }).token,
        },
        ["DATABASE_URL"],
      );
    }

    expectRefusal(
      hosted({
        DATABASE_URL: `postgresql://app_runtime.pooler-dev:${FIXTURE_PASSWORD}@127.0.0.1:54329/postgres`,
      }),
      ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    );

    for (const foreign of [DENIED_REF, UNKNOWN_REF]) {
      expectRefusal(
        loopback({
          SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: foreign, role: "service_role" }).token,
        }),
        ["SUPABASE_SERVICE_ROLE_KEY"],
      );
    }
  });

  it("the default allowlist is exactly the dev ref", () => {
    expect([...DEFAULT_ALLOWED_SUPABASE_REFS]).toEqual([DEV_REF]);
  });

  it("case 8 lets ALLOWED_SUPABASE_REFS add a ref, and an empty value keeps the dev default", () => {
    const other = hosted({
      ALLOWED_SUPABASE_REFS: ` ${DEV_REF} , ${OTHER_REF} `,
      DATABASE_URL: poolerUrl(OTHER_REF),
      NEXT_PUBLIC_SUPABASE_URL: apiUrl(OTHER_REF),
      SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: OTHER_REF, role: "service_role" }).token,
    });
    expectOk(other);

    expectOk(hosted({ ALLOWED_SUPABASE_REFS: "" }));
    expectRefusal(hosted({ ALLOWED_SUPABASE_REFS: "", DATABASE_URL: poolerUrl(OTHER_REF) }), [
      "DATABASE_URL",
    ]);

    expect(
      checkSupabaseEnv(
        {
          DATABASE_URL: poolerUrl(OTHER_REF),
          NEXT_PUBLIC_SUPABASE_URL: apiUrl(OTHER_REF),
          SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: OTHER_REF, role: "service_role" }).token,
        },
        { allowedRefs: [OTHER_REF] },
      ),
    ).toEqual({ ok: true });
  });

  it("case 9 refuses a non-JWT or malformed service key on a hosted URL and ignores malformed keys on loopback", () => {
    const opaque = "sb_secret_fixture_do_not_leak";
    const hostedOpaque = hosted({ SUPABASE_SERVICE_ROLE_KEY: opaque });
    expectRefusal(hostedOpaque, ["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(checkSupabaseEnv(hostedOpaque)).toEqual({
      ok: false,
      problems: [{ variable: "SUPABASE_SERVICE_ROLE_KEY", reason: "is not a JWT" }],
    });
    expect(refusalMessage(hostedOpaque)).not.toContain(opaque);

    const twoSegments = fakeJwt({ ref: DEV_REF }).segments.slice(0, 2).join(".");
    expect(checkSupabaseEnv(hosted({ SUPABASE_SERVICE_ROLE_KEY: twoSegments }))).toEqual({
      ok: false,
      problems: [{ variable: "SUPABASE_SERVICE_ROLE_KEY", reason: "is not a JWT" }],
    });

    const badPayload = [
      Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
      Buffer.from("not-json").toString("base64url"),
      Buffer.from("x").toString("base64url"),
    ].join(".");
    expect(checkSupabaseEnv(hosted({ SUPABASE_SERVICE_ROLE_KEY: badPayload }))).toEqual({
      ok: false,
      problems: [{ variable: "SUPABASE_SERVICE_ROLE_KEY", reason: "is not a JWT" }],
    });

    const noRef = fakeJwt({ role: "service_role" }).token;
    expect(checkSupabaseEnv(hosted({ SUPABASE_SERVICE_ROLE_KEY: noRef }))).toEqual({
      ok: false,
      problems: [{ variable: "SUPABASE_SERVICE_ROLE_KEY", reason: "JWT has no project ref" }],
    });

    expectOk(loopback({ SUPABASE_SERVICE_ROLE_KEY: opaque }));
    expectOk(loopback({ SUPABASE_SERVICE_ROLE_KEY: twoSegments }));
    expectOk(loopback({ SUPABASE_SERVICE_ROLE_KEY: badPayload }));
  });

  it("case 10 keeps the password and every JWT segment out of the error text", () => {
    const jwt = fakeJwt({ ref: DENIED_REF, role: "service_role" });
    const env = hosted({
      DATABASE_URL: poolerUrl(DENIED_REF),
      SUPABASE_SERVICE_ROLE_KEY: jwt.token,
    });
    expectRefusal(env, ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const message = refusalMessage(env);
    expect(message).not.toContain(FIXTURE_PASSWORD);
    for (const segment of jwt.segments) {
      expect(message).not.toContain(segment);
    }
    expect(message).not.toContain(jwt.token);
  });
});
