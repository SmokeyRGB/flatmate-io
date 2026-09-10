#!/usr/bin/env bash
# done-check.sh — is plan-sprint-v0.1 finished?
#
# check-refs.sh asks "is the tree consistent?". This asks "is the work done?".
# Six conditions that must all hold before this branch merges into main.
#
# Written before the work, so it fails today and passes at the end. Each check
# says what it is for, so a failure explains itself.
#
# Usage:  bash tools/done-check.sh [--verbose]

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

pass=0; failn=0
ok()   { pass=$((pass+1));  printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { failn=$((failn+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }
info() { [ "$VERBOSE" = 1 ] && printf '        %s\n' "$1"; return 0; }

# Resolve a chain document whether or not the restructure has happened yet.
f() {
  for c in "docs/$1" "$1"; do [ -f "$c" ] && { printf '%s' "$c"; return 0; }; done
  printf '%s' "$1"; return 1
}
SRD=$(f 02-SRD.md);          PRD=$(f 03-PRD.md)
DOM=$(f 04-Domaenenmodell.md); ADR=$(f 05-ADRs.md)
CMP=$(f 06-Compliance-Anhang.md); SCR=$(f 07-Screen-Inventar.md)
GRD=$(f GUARDRAILS.md);      RVL=$(f review-log.md)
COV=$(f COVERAGE.md)
ROADMAP=$(ls docs/backlog/roadmap.md "Exercise 10/Feature-Themes-and-Roadmap.md" 2>/dev/null | head -1)
MVPRM=$(ls docs/backlog/README.md "Exercise 10/MVP Backlog Features/README.md" 2>/dev/null | head -1)

echo "plan-sprint-v0.1 completeness gate"
echo

# ---------------------------------------------------------------------------
# 1 — Every open point is accounted for in the register.
#     Why: open-point status existed in four hand-maintained copies and drifted
#     in all four. The register is the single home; a source document may carry
#     the question but not an unaccounted-for status.
# ---------------------------------------------------------------------------
echo "1. open points are all in the register"
if [ ! -f "$RVL" ]; then
  bad "review-log.md not found" "expected $RVL"
elif ! grep -q 'Offene-Punkte-Register' "$RVL"; then
  bad "no §Offene-Punkte-Register in $RVL" "Phase 1a has not run yet"
else
  missing=""
  for src in "$SRD" "$PRD" "$DOM" "$SCR" "$GRD" "$CMP"; do
    [ -f "$src" ] || continue
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      grep -qE "\b$id\b" "$RVL" || missing="$missing $id($(basename "$src"))"
    # What counts as an OPEN row.
    #
    # The documents express closure in three different, all legitimate ways, and
    # the check has to honour each rather than force one convention onto them:
    #   ~~O-5~~            struck through          (02-SRD, 03-PRD, 04 §10.3)
    #   | AW-1 | … | ✅ |  a status column          (07-Screen-Inventar §13)
    #   "Geklärt" / "entschieden" in the row       (04 §10.1 and §10.2 are
    #                                               headed as decided lists)
    # They also disagree on bolding: 02-SRD writes "| **O-07** |",
    # 04-Domaenenmodell writes "| O-1 |". Match both.
    #
    # So: a row is open only if its ID is unstruck AND the row carries no
    # closure marker.
    done < <(grep -E '^\| \*{0,2}(O-[0-9A-F]+|P-O-[0-9]+|AW-[0-9]+)\*{0,2} \|' "$src" 2>/dev/null |
               grep -vE '✅|Geklärt|geklärt|entschieden|Entschieden|geschlossen' |
               grep -oE '^\| \*{0,2}(O-[0-9A-F]+|P-O-[0-9]+|AW-[0-9]+)' |
               grep -oE '(O-[0-9A-F]+|P-O-[0-9]+|AW-[0-9]+)' | tr -d '\r' | sort -u)
  done
  if [ -n "$missing" ]; then
    bad "open ids not present in the register:" "$(echo "$missing" | tr ' ' '\n' | grep . | head -20 | tr '\n' ' ')"
  else
    ok "every undecorated open row appears in the register"
  fi
fi

# ---------------------------------------------------------------------------
# 2 — The release cut has exactly one home.
#     Why: PRD §7.1 was a second copy of SRD §5.4's scope and drifted on
#     S-39, S-44 and S-33. The roadmap was a third copy and drifted further.
# ---------------------------------------------------------------------------
echo "2. the release cut has one home"
if [ -f "$PRD" ] && sed -n '/^### 7.1/,/^### 7.2/p' "$PRD" | grep -qi '| *Inhalt *|'; then
  bad "$PRD §7.1 still has an 'Inhalt' column" "that column is the drift surface — drop it, keep 'Vorführbar als'"
else
  ok "$PRD §7.1 carries no scope column"
fi
# The chain documents are German; the Exercise 10 artifacts are English by the
# recorded ADR-012 exception. Accept the governing declaration in either language.
if [ -n "$ROADMAP" ] && grep -qE 'Bei Abweichung gilt §5\.4|§5\.4 governs' "$ROADMAP"; then
  ok "roadmap declares §5.4 as governing"
else
  bad "roadmap does not declare §5.4 as governing" "add the sentence 03-PRD.md §7 already carries"
fi
for s in S-39 S-44; do
  # Only the table's data rows count. Prose explaining that these two were once
  # listed here wrongly is the record of the fix, not the defect.
  if [ -f "$PRD" ] && sed -n '/^### 7.1/,/^### 7.2/p' "$PRD" | grep '^|' | grep -q "$s"; then
    bad "$s still appears in a $PRD §7.1 table row" "§5.4 places it in v0.2"
  fi
done

# ---------------------------------------------------------------------------
# 3 — Every PRD §4/§6 subsection carries exactly one release-band marker.
#     Why: 46 subsections, no band annotation anywhere, so the cut had to be
#     re-derived by subject matter on every read. That is what produced the
#     three §7.1 errors.
# ---------------------------------------------------------------------------
echo "3. PRD §4/§6 subsections carry a band marker"
if [ -f "$PRD" ]; then
  body=$(sed -n '/^## 4\./,/^## 5\./p;/^## 6\./,/^## 7\./p' "$PRD" | tr -d '\r')
  heads=$(printf '%s\n' "$body" | grep -cE '^#{3,4} ')
  bands=$(printf '%s\n' "$body" | grep -cE '^> \*\*Band:\*\*')
  info "headings=$heads bandmarkers=$bands"
  if [ "$heads" -eq 0 ]; then
    bad "could not read PRD §4/§6" ""
  elif [ "$bands" -eq "$heads" ]; then
    ok "all $heads subsections carry a band marker"
  else
    bad "$bands of $heads subsections carry a band marker" "Phase 2g adds the missing $((heads-bands))"
  fi
  # A container heading has no content of its own, so it carries "gemischt" and
  # points at its subsections instead of naming a band. That is a valid marker.
  badtok=$(printf '%s\n' "$body" | grep -E '^> \*\*Band:\*\*' |
             grep -vE '`(v0\.1|v0\.2|v1\.1|v2)`|gemischt' | head -3)
  [ -n "$badtok" ] && bad "band marker with an invalid token" "$badtok"
fi

# ---------------------------------------------------------------------------
# 4 — The seven v0.1-load-bearing ADRs are confirmed, with the cost recorded.
#     Why: all twelve read "Vorschlag — anfechtbar". Shipping contestable
#     records into implementation means a later objection invalidates code,
#     not a paragraph.
# ---------------------------------------------------------------------------
echo "4. the seven load-bearing ADRs are confirmed"
LOAD="001 002 004 006 008 010 012"
if [ -d docs/adr ]; then
  for n in $LOAD; do
    file=$(ls docs/adr/0$n-*.md 2>/dev/null | head -1)
    if [ -z "$file" ]; then bad "ADR-$n has no record file"; continue; fi
    if ! grep -q 'Bestätigt — verbindlich für v0.1' "$file"; then
      bad "ADR-$n is not confirmed" "$file"
    elif ! grep -q 'Was ein späterer Widerspruch kostet' "$file"; then
      bad "ADR-$n confirmed without the cost line" "$file"
    else ok "ADR-$n confirmed with cost recorded"; fi
  done
elif [ -f "$ADR" ]; then
  # grep -c exits 1 on zero matches; `|| echo 0` would then append a second "0"
  c=$(grep -c 'Bestätigt — verbindlich für v0.1' "$ADR" 2>/dev/null); c=${c:-0}
  [ "$c" -ge 7 ] && ok "7+ confirmations present in the collector" \
                 || bad "$c of 7 ADRs confirmed" "Phase 1f adds the Bestätigungsvermerk"
fi

# ---------------------------------------------------------------------------
# 5 — GUARDRAILS: the new G-N class exists and the prose-only count is down.
#     Why: five rules had no enforcement mechanism at all. Four are mechanisable;
#     only G-A4 genuinely is not.
# ---------------------------------------------------------------------------
echo "5. GUARDRAILS integrity class exists"
if [ -f "$GRD" ]; then
  gn=0; for r in G-N1 G-N2 G-N3 G-N4 G-N5 G-N6; do grep -q "$r" "$GRD" && gn=$((gn+1)); done
  [ "$gn" -eq 6 ] && ok "G-N1…G-N6 are written as rules" \
                  || bad "$gn of 6 G-N rules present" "Phase 4 writes the rest"
  for tbd in ':788' ':1233'; do :; done
  if grep -qE 'noch (offen|zu entscheiden)|TBD|festzulegen' "$GRD"; then
    info "$GRD still contains a TBD-style phrase — check G-H2 and the tool choice"
  fi
fi

# ---------------------------------------------------------------------------
# 6 — Coverage: every v0.1 scope line is owned by a requirement packet.
#     Why: S-05 was in the v0.1 cut and owned by nothing; S-15/S-36/S-37/S-27
#     appeared only as citations, never as a testable requirement.
# ---------------------------------------------------------------------------
echo "6. every v0.1 scope line is owned"
V01="S-01 S-02 S-03 S-04 S-05 S-06 S-07 S-08 S-09 S-10 S-12 S-13 S-14 S-15 S-16 \
     S-27 S-31 S-33 S-35 S-36 S-37 S-38 S-48 S-49 S-50"
if [ ! -f "$COV" ]; then
  bad "COVERAGE.md not found" "Phase 2d writes it"
else
  if grep -qiE '\|\s*gap\s*\|' "$COV"; then
    bad "COVERAGE.md still has a row marked 'gap'" "$(grep -inE '\|\s*gap\s*\|' "$COV" | head -3 | tr '\n' ' ')"
  else ok "no row in COVERAGE.md is marked 'gap'"; fi
  un=""
  for s in $V01; do grep -qE "\b$s\b" "$COV" || un="$un $s"; done
  [ -n "$un" ] && bad "v0.1 scope lines absent from COVERAGE.md:" "$un" \
               || ok "all 25 v0.1 scope lines appear in COVERAGE.md"
  for s in $V01; do
    row=$(grep -E "\|\s*\*{0,2}$s\*{0,2}\s*\|" "$COV" 2>/dev/null | head -1)
    [ -n "$row" ] || continue
    printf '%s' "$row" | grep -qE '(FR-|AC-)[0-9]' || bad "$s has no FR-/AC- id in COVERAGE.md" ""
  done

  # Cross-check: every FR-/AC- id named in COVERAGE.md must actually exist in the
  # packet its own number points at (FR-1.25 -> F1). The scope-line-to-requirement
  # link cannot be derived from the requirements themselves, because the packets'
  # convention is that only Constraints carry a Source: line. So the mapping lives
  # here — and this check makes a drift between it and the packet fail the build
  # instead of going unnoticed.
  miss=""
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    n=${id#*-}; n=${n%%.*}
    pkt=$(ls "docs/backlog/requirements/F$n-requirements.md" \
             "Exercise 10/AI-Ready Requirements/F$n-requirements.md" 2>/dev/null | head -1)
    if [ -z "$pkt" ]; then miss="$miss $id(no-F$n)"; continue; fi
    grep -qF "$id" "$pkt" || miss="$miss $id(not-in-F$n)"
  done < <(grep -oE '\b(FR|AC)-[0-5]\.[0-9]+' "$COV" | tr -d '\r' | sort -u)
  [ -n "$miss" ] && bad "COVERAGE.md names ids that are not in their packet:" \
                        "$(echo "$miss" | tr ' ' '\n' | grep . | head -12 | tr '\n' ' ')" \
                 || ok "every FR-/AC- id in COVERAGE.md exists in its packet"
fi

# S-39 belongs to the paste parser (v0.2), not the form. It was listed in v0.1 in
# two places; assert it stays out of every v0.1 list.
for src in "$MVPRM" "$PRD"; do
  [ -n "$src" ] && [ -f "$src" ] || continue
  if grep -E '^\|' "$src" | grep -E 'S-08 \(form|Formularhälfte' | grep -q 'S-39'; then
    bad "S-39 still listed beside the form half of S-08 in $src" "it is v0.2, with the parser"
  fi
done
# the specific closures this sprint promised
F1=$(ls docs/backlog/requirements/F1-requirements.md "Exercise 10/AI-Ready Requirements/F1-requirements.md" 2>/dev/null | head -1)
F0=$(ls docs/backlog/requirements/F0-requirements.md "Exercise 10/AI-Ready Requirements/F0-requirements.md" 2>/dev/null | head -1)
[ -n "$F1" ] && { grep -q 'S-05' "$F1" && ok "S-05 is claimed by the F1 packet" \
                                       || bad "S-05 not claimed by the F1 packet" "$F1"; }
if [ -n "$F0" ]; then
  for s in S-15 S-27 S-36 S-37; do
    grep -q "$s" "$F0" || bad "$s not covered by the F0 packet" "$F0"
  done
  ok "F0 packet exists"
else
  bad "F0-requirements.md does not exist" "Phase 2c writes it"
fi

echo
echo "── $pass passed, $failn failed"
[ "$failn" -eq 0 ] || echo "   plan-sprint-v0.1 is NOT ready to merge"
exit $(( failn > 0 ))
