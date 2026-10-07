import type { Locale } from "./locales";

// language-switch D2: which of `de`/`en` an Accept-Language header ranks higher. Matches by
// primary subtag (`en-GB` counts as `en`), reads q-values (default 1), and answers `de` when
// neither language appears or the header is absent or malformed. Pure, so it is testable without
// a request.
export function preferredLocale(header: string | null): Locale {
  if (!header) return "de";
  let best: Locale = "de";
  let bestQ = 0;
  for (const part of header.split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const primary = tag.trim().toLowerCase().split("-")[0];
    if (primary !== "de" && primary !== "en") continue;
    let q = 1;
    for (const param of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param);
      if (m) q = Number(m[1]);
    }
    if (!Number.isFinite(q) || q <= 0) continue;
    // A strictly higher q wins; on a tie the earlier entry stays.
    if (q > bestQ) {
      best = primary;
      bestQ = q;
    }
  }
  return best;
}
