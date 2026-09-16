/**
 * Übersetzt alles, was als Fehler ankommt (Error, Supabase-AuthError, Response-artige
 * Objekte, Strings), in einen deutschen Satz. Nie „[object Object]".
 */

const RULES: { match: RegExp; text: string }[] = [
  {
    match: /password is known to be weak|known to be weak|pwned|leaked password/i,
    text: "Dieses Passwort taucht in bekannten Datenlecks auf — nimm bitte ein anderes.",
  },
  { match: /password should be at least|password.*too short|at least 6 characters/i, text: "Das Passwort ist zu kurz — nimm mindestens 8 Zeichen." },
  { match: /user already registered|already been registered|email address is already/i, text: "Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an." },
  { match: /invalid login credentials/i, text: "Name bzw. E-Mail oder Passwort passt nicht." },
  { match: /unable to validate email|invalid email|email address.*invalid/i, text: "Diese E-Mail-Adresse sieht nicht richtig aus." },
  { match: /email not confirmed/i, text: "Diese E-Mail-Adresse ist noch nicht bestätigt." },
  { match: /rate limit|too many requests|over_email_send_rate/i, text: "Zu viele Versuche kurz hintereinander — warte einen Moment und probiere es nochmal." },
  { match: /row-level security|42501|permission denied/i, text: "Dafür fehlen die Rechte. Wenn das unerwartet ist, sag deiner Moderation Bescheid." },
  { match: /duplicate key|23505/i, text: "Diesen Eintrag gibt es schon." },
  { match: /failed to fetch|networkerror|load failed/i, text: "Keine Verbindung — prüfe dein Netz und versuch es nochmal." },
  { match: /unauthorized|401/i, text: "Deine Anmeldung ist abgelaufen. Melde dich bitte neu an." },
];

function rawMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "details", "hint", "statusText"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v;
      if (v && typeof v === "object") {
        const nested = rawMessage(v);
        if (nested) return nested;
      }
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Ein Satz, der einem Menschen etwas sagt. */
export function fmError(err: unknown, fallback = "Das hat leider nicht geklappt. Versuch es bitte nochmal."): string {
  const raw = rawMessage(err).replace(/^Error:\s*/, "").trim();
  if (!raw) return fallback;
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.text;
  }
  // Unsere eigenen Serverfehler sind schon deutsch und dürfen so durch.
  if (/[äöüß]|[A-ZÄÖÜ][a-zäöüß]+ /.test(raw) && raw.length < 300 && !raw.startsWith("{")) return raw;
  return fallback;
}
