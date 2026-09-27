#!/usr/bin/env bash
# Builds the CI runner's disposable database and exports the environment the suite reads.
# Runs only inside the `verify` job in .github/workflows/ci.yml, against the local Supabase stack
# `supabase start` just brought up (openspec/changes/ci-local-database, design.md D4). It only
# ever targets 127.0.0.1, refuses any other host, and reads no repository secret.
#
# Order: guard, roles, chain, roles again, assert, probe pooler, probe PostgREST, export.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

POSTGRES_PIN="$(cat "$REPO_ROOT/supabase/pins/postgres-version")"
GOTRUE_PIN="$(cat "$REPO_ROOT/supabase/pins/gotrue-version")"

# The CLI names its containers supabase_<service>_<project_id>. Read project_id from the one
# place that defines it, so renaming the project can't silently break the image assertions.
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$REPO_ROOT/supabase/config.toml")"
if [ -z "$PROJECT_ID" ]; then
  echo "bootstrap-local-db: no project_id found in supabase/config.toml." >&2
  exit 1
fi

echo "== bootstrap-local-db: reading supabase status =="

# 1. Parse `supabase status -o json`. Never grep/cut the `-o env` form: it quotes every value
#    (`KEY="VALUE"`) and supabase writes a "Stopped services: [...]" line to stderr whenever
#    services were excluded from `supabase start -x ...` (design.md Context). stderr goes to a
#    file, not into the JSON, and is shown if the command fails. The CLI is already on PATH: the
#    workflow installs the pinned version with `supabase/setup-cli@v3` before this script runs.
STATUS_ERR="$(mktemp)"
if ! STATUS_JSON="$(supabase status -o json 2>"$STATUS_ERR")"; then
  echo "bootstrap-local-db: 'supabase status -o json' failed:" >&2
  cat "$STATUS_ERR" >&2
  exit 1
fi

# One parse for every value the script needs, hostnames included, as KEY=value lines. Values
# are URLs and JWTs, which contain no newline; `read`'s last variable keeps any '=' in them.
while IFS='=' read -r key value; do
  case "$key" in
    DB_URL) DB_URL="$value" ;;
    API_URL) API_URL="$value" ;;
    ANON_KEY) ANON_KEY="$value" ;;
    SERVICE_ROLE_KEY) SERVICE_ROLE_KEY="$value" ;;
    DB_HOST) DB_HOST="$value" ;;
    API_HOST) API_HOST="$value" ;;
  esac
done < <(node -e '
  const s = JSON.parse(process.argv[1]);
  const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
  for (const k of ["DB_URL", "API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) console.log(`${k}=${s[k] || ""}`);
  console.log(`DB_HOST=${host(s.DB_URL)}`);
  console.log(`API_HOST=${host(s.API_URL)}`);
' "$STATUS_JSON")

if [ -z "${DB_URL:-}" ] || [ -z "${API_URL:-}" ]; then
  echo "bootstrap-local-db: supabase status did not report DB_URL/API_URL — cannot continue." >&2
  exit 1
fi

# 2. Host guard (spec: "No run of the suite reaches production"). Every host this script will
#    ever touch must be the runner's own loopback address.
for host in "$DB_HOST" "$API_HOST"; do
  case "$host" in
    127.0.0.1|localhost) ;;
    *)
      echo "bootstrap-local-db: refusing non-local host '$host' — this script only ever targets 127.0.0.1/localhost." >&2
      exit 1
      ;;
  esac
done

echo "== bootstrap-local-db: guard passed (DB_URL host=$DB_HOST, API_URL host=$API_HOST) =="

# 3. Roles, then a throwaway password for this run only.
echo "== bootstrap-local-db: bootstrap-roles.sql (pass 1) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/db/bootstrap-roles.sql"

APP_RUNTIME_PASSWORD="$(openssl rand -hex 24)"
echo "::add-mask::$APP_RUNTIME_PASSWORD"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "ALTER ROLE app_runtime WITH PASSWORD '$APP_RUNTIME_PASSWORD';"

# 4. The migration chain, in _journal.json order. One psql invocation per file, each its own
#    transaction — the same unit the human applies by hand — so a failing file leaves nothing
#    half-applied and the run stops naming that file.
echo "== bootstrap-local-db: applying drizzle/ chain =="
TAGS="$(node -e '
  const j = require(process.argv[1]);
  for (const e of j.entries) process.stdout.write(e.tag + "\n");
' "$REPO_ROOT/drizzle/meta/_journal.json")"

while IFS= read -r tag; do
  [ -z "$tag" ] && continue
  MIGRATION_FILE="$REPO_ROOT/drizzle/$tag.sql"
  echo "-- applying $tag.sql"
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$MIGRATION_FILE"; then
    echo "bootstrap-local-db: migration $tag.sql failed to apply — stopping before any test runs." >&2
    exit 1
  fi
done <<< "$TAGS"

# 5. Roles again, as bootstrap-roles.sql's own header asks, so the grants cover every table the
#    chain just created.
echo "== bootstrap-local-db: bootstrap-roles.sql (pass 2) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/db/bootstrap-roles.sql"

# 6. Assert the running images match the committed pins (design.md D2). Compares the image TAG,
#    not `select version()` — "17.6" would also match the CLI's own default ".171".
echo "== bootstrap-local-db: asserting pinned versions =="

PG_IMAGE="$(docker inspect "supabase_db_$PROJECT_ID" --format '{{.Config.Image}}')"
if [[ "$PG_IMAGE" != *":$POSTGRES_PIN" ]]; then
  echo "bootstrap-local-db: Postgres image '$PG_IMAGE' does not end in ':$POSTGRES_PIN' (supabase/pins/postgres-version)." >&2
  exit 1
fi

AUTH_IMAGE="$(docker inspect "supabase_auth_$PROJECT_ID" --format '{{.Config.Image}}')"
if [[ "$AUTH_IMAGE" != *":$GOTRUE_PIN" ]]; then
  echo "bootstrap-local-db: Auth image '$AUTH_IMAGE' does not end in ':$GOTRUE_PIN' (supabase/pins/gotrue-version)." >&2
  exit 1
fi

HEALTH_VERSION="$(curl -fsS "$API_URL/auth/v1/health" | node -e '
  let d = "";
  process.stdin.on("data", c => d += c);
  process.stdin.on("end", () => process.stdout.write(JSON.parse(d).version || ""));
')"
if [ "$HEALTH_VERSION" != "$GOTRUE_PIN" ]; then
  echo "bootstrap-local-db: /auth/v1/health reports version '$HEALTH_VERSION', expected '$GOTRUE_PIN'." >&2
  exit 1
fi

echo "-- Postgres image: $PG_IMAGE"
echo "-- Auth image: $AUTH_IMAGE"
echo "-- Auth health version: $HEALTH_VERSION"

# 7. Probe the pooler path. Postgres has no role literally named `app_runtime.pooler-dev`, so a
#    successful login under that name (Supavisor's tenant-suffixed username) proves the
#    connection went through the transaction-mode pooler, not directly to Postgres (decision 4).
#    It also proves RLS will apply: app_runtime must show rolbypassrls = f.
echo "== bootstrap-local-db: probing the pooler path =="
POOLER_URL="postgresql://app_runtime.pooler-dev:${APP_RUNTIME_PASSWORD}@127.0.0.1:54329/postgres"
# The substitution sits inside `if !`, so a psql failure (the likeliest one: Supavisor refusing
# the login) reaches the diagnostic below instead of ending the script under set -e/pipefail.
POOLER_HINT="Supavisor may be refusing app_runtime.pooler-dev. Do not fall back to the direct port (decision 4, D4 Risks) — stop and report to the human."
if ! POOLER_RESULT="$(psql "$POOLER_URL" -tAc "select current_user, (select rolbypassrls from pg_roles where rolname = current_user)" | tr -d '[:space:]')"; then
  echo "bootstrap-local-db: pooler probe could not connect through 127.0.0.1:54329." >&2
  echo "bootstrap-local-db: $POOLER_HINT" >&2
  exit 1
fi

if [ "$POOLER_RESULT" != "app_runtime|f" ]; then
  echo "bootstrap-local-db: pooler probe returned '$POOLER_RESULT', expected 'app_runtime|f'." >&2
  echo "bootstrap-local-db: $POOLER_HINT" >&2
  exit 1
fi
echo "-- pooler probe: $POOLER_RESULT"

# 8. Probe PostgREST. The service-role cleanup delete in join-rate-limit.test.ts's afterEach
#    ignores its error, so a cold schema cache would otherwise pass every test silently while
#    being broken.
echo "== bootstrap-local-db: probing PostgREST =="
POSTGREST_STATUS="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$API_URL/rest/v1/join_attempt?select=id&limit=1")"

if [ "$POSTGREST_STATUS" != "200" ]; then
  echo "bootstrap-local-db: PostgREST probe returned HTTP $POSTGREST_STATUS, expected 200." >&2
  exit 1
fi
echo "-- PostgREST probe: $POSTGREST_STATUS"

# 9. Export the environment the suite reads. Only the app_runtime password and the session secret
#    are generated per run; the API keys are the CLI's fixed public local-only defaults (design.md
#    Context) and need no masking, but the generated values do.
SESSION_TOKEN_HASH_SECRET="$(openssl rand -hex 32)"
echo "::add-mask::$SESSION_TOKEN_HASH_SECRET"

{
  echo "DATABASE_URL=$POOLER_URL"
  echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "SESSION_TOKEN_HASH_SECRET=$SESSION_TOKEN_HASH_SECRET"
} >> "$GITHUB_ENV"

echo "== bootstrap-local-db: done =="
