#!/usr/bin/env bash
# check-refs.sh — reference and boundary check for Ideas/Flatmate.io
#
# Exits non-zero if any rule fails. Run it from anywhere; it locates the
# project root itself. Designed to run in Git Bash on Windows, so every
# read strips CR and every path is quoted (the tree has folders with spaces).
#
# Why this exists: review-log.md:9-14 records the same class of defect three
# times and concludes that a rule without a mechanism does not hold. These are
# the mechanisms. See tools/README.md for what each rule protects.
#
# Usage:  bash tools/check-refs.sh [--quiet] [--only N]
#         bash tools/check-refs.sh --scope docs      # for the handover dry run

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

QUIET=0
ONLY=""
SCOPE_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) QUIET=1 ;;
    --only)  ONLY="${2:-}"; shift ;;
    --scope) SCOPE_OVERRIDE="${2:-}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Scope. Post-restructure this is docs/ plus the non-archive siblings.
# Pre-restructure docs/ does not exist yet, so fall back to the flat tree.
# archive/ and docs/_logs/ are deliberately excluded from rule 2: their stale
# paths were accurate the day they were written, and rewriting a historical
# record to satisfy a linter falsifies it.
# ---------------------------------------------------------------------------
if [ -n "$SCOPE_OVERRIDE" ]; then
  SCOPE=("$SCOPE_OVERRIDE")
elif [ -d docs ]; then
  SCOPE=(docs)
  [ -d coursework ] && SCOPE+=(coursework)
  [ -d research ]   && SCOPE+=(research)
  [ -d process ]    && SCOPE+=(process)
else
  # Flat pre-restructure tree. "." already covers every subdirectory, so listing
  # them again would scan each file twice and double every finding.
  SCOPE=(.)
fi

# Generic filenames that appear in prose as a *kind* of document rather than as
# a reference to a particular file ("this document is `requirements.md` only").
# Rule 2 must not treat these as dangling references.
GENERIC_NAMES='^(requirements|design|tasks|README|CLAUDE|KNOWN-LIMITATIONS|data-inventory)\.md$'

FROZEN_RE='(04-Domaenenmodell|05-ADRs|07-Screen-Inventar|04-Screen-Inventar)\.md'

fail=0
declare -A COUNT
note() { COUNT[$1]=$(( ${COUNT[$1]:-0} + 1 )); fail=1; [ "$QUIET" = 1 ] || echo "  $2"; }
run()  { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
head_() { [ "$QUIET" = 1 ] || echo "── rule $1: $2"; }

# collect every markdown file in scope, once
mdfiles=()
while IFS= read -r -d '' f; do mdfiles+=("$f"); done < <(
  find "${SCOPE[@]}" -maxdepth 6 \
       \( -name '.git' -o -name '.claude' -o -name 'node_modules' \) -prune -o \
       -name '*.md' -type f -print0 2>/dev/null
)

# ---------------------------------------------------------------------------
# Rule 1 — every markdown link resolves.
# Anchors (#…) and :LINE suffixes are stripped; %20 is decoded.
# ---------------------------------------------------------------------------
if run 1; then
head_ 1 "markdown links resolve"
for src in "${mdfiles[@]}"; do
  dir=$(dirname "$src")
  while IFS= read -r raw; do
    tgt=${raw%%)*}
    case "$tgt" in http*|mailto:*|'#'*|'') continue ;; esac
    tgt=${tgt%%#*}                       # drop anchor
    tgt=$(printf '%s' "$tgt" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
    tgt=${tgt//%20/ }
    [ -n "$tgt" ] || continue
    [ -e "$dir/$tgt" ] || note r1 "BROKEN LINK    $src -> $raw"
  done < <(grep -oE '\]\([^)]+\.(md|html|png|jpe?g|mp4|ya?ml|sh|json)[^)]*\)' "$src" 2>/dev/null |
             sed -E 's/^\]\(//' | tr -d '\r')
done
fi

# ---------------------------------------------------------------------------
# Rule 2 — every backticked *.md filename exists somewhere in the project.
# Resolved by basename, which is what makes the repo's bare-filename house
# style safe across moves. Historical records are exempt.
# ---------------------------------------------------------------------------
if run 2; then
head_ 2 "backticked *.md names exist"
declare -A seen
for src in "${mdfiles[@]}"; do
  case "$src" in */_logs/*|archive/*|./archive/*|*/.old/*) continue ;; esac
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    printf '%s' "$n" | grep -qE "$GENERIC_NAMES" && continue
    key="$n"
    if [ -z "${seen[$key]+x}" ]; then
      if find . -name "$n" -not -path './.git/*' -print -quit | grep -q .; then
        seen[$key]=ok
      else
        seen[$key]=bad
      fi
    fi
    [ "${seen[$key]}" = ok ] || note r2 "DANGLING NAME  \`$n\` cited in $src — no such file"
  done < <(grep -oE '`[A-Za-z0-9._ -]+\.md`' "$src" 2>/dev/null | tr -d '`\r')
done
fi

# ---------------------------------------------------------------------------
# Rule 3 — :LINE references only into the three frozen collectors.
# A line number into a live file is a liability; into a frozen file it is
# stable forever. Use §/anchor for live files.
# ---------------------------------------------------------------------------
if run 3; then
head_ 3 ":LINE refs only into frozen collectors"
for src in "${mdfiles[@]}"; do
  case "$src" in */_logs/*|archive/*|./archive/*|*/.old/*) continue ;; esac
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    printf '%s' "$h" | grep -qE "$FROZEN_RE:[0-9]+" && continue
    note r3 "LINE REF       $src -> $h (use § or #anchor)"
  done < <(grep -oE '`?[A-Za-z0-9._-]+\.md:[0-9]+' "$src" 2>/dev/null | tr -d '`\r')
done
fi

# ---------------------------------------------------------------------------
# Rule 4 — the frozen collectors have not changed.
# ---------------------------------------------------------------------------
if run 4; then
head_ 4 "frozen collectors unchanged"
if [ -f tools/frozen.sha256 ]; then
  # Hash the CONTENT, not the bytes on disk: strip CR before hashing.
  #
  # `sha256sum -c` would compare raw bytes, and these files are `*.md text` in
  # .gitattributes — so git stores LF and checks out CRLF on Windows, LF on
  # Linux. A byte hash therefore only ever matches on the platform that
  # generated it, and rule 4 would be permanently red in CI. Since the point is
  # to detect an *edit*, normalising line endings first is both correct and
  # portable.
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    want=${line%% *}
    path=${line##* }
    path=${path#\*}                       # sha256sum writes "hash *path"
    if [ ! -f "$path" ]; then
      note r4 "FROZEN MISSING  $path"
      continue
    fi
    have=$(tr -d '\r' < "$path" | sha256sum | cut -d' ' -f1)
    [ "$want" = "$have" ] || note r4 "FROZEN CHANGED  $path"
  done < <(tr -d '\r' < tools/frozen.sha256)
else
  [ "$QUIET" = 1 ] || echo "  (skipped: tools/frozen.sha256 does not exist yet)"
fi
fi

# ---------------------------------------------------------------------------
# Rule 5 — every cited ADR-NNN resolves to exactly one record file.
# ---------------------------------------------------------------------------
if run 5; then
head_ 5 "each cited ADR-NNN has one record file"
if [ -d docs/adr ]; then
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    c=$(ls docs/adr/$(printf '%04d' "$((10#$n))")-*.md 2>/dev/null | wc -l)
    [ "$c" -eq 1 ] || note r5 "ADR-$n resolves to $c record file(s) in docs/adr/"
  done < <(grep -rhoE 'ADR-[0-9]{3}' --include='*.md' docs 2>/dev/null |
             sed 's/ADR-//' | tr -d '\r' | sort -u)
else
  [ "$QUIET" = 1 ] || echo "  (skipped: docs/adr/ does not exist yet)"
fi
fi

# ---------------------------------------------------------------------------
# Rule 6 — every cited U-n / S-nn is defined where the ID register says.
# ---------------------------------------------------------------------------
if run 6; then
head_ 6 "U- and S- ids are defined"
uhome=$(ls 08-UX-Entscheidungen.md docs/08-UX-Entscheidungen.md 2>/dev/null | head -1)
shome=$(ls 02-SRD.md docs/02-SRD.md 2>/dev/null | head -1)
if [ -n "$uhome" ]; then
  while IFS= read -r u; do
    [ -n "$u" ] || continue
    grep -qE "\*\*$u\*\*" "$uhome" || note r6 "$u cited but not defined in $uhome"
  done < <(grep -rhoE '\bU-[0-9]{1,2}\b' --include='*.md' "${SCOPE[@]}" 2>/dev/null |
             tr -d '\r' | sort -u)
fi
if [ -n "$shome" ]; then
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    grep -qE "\*\*$s\*\*" "$shome" || note r6 "$s cited but not defined in $shome"
  done < <(grep -rhoE '\bS-[0-9]{2}\b' --include='*.md' "${SCOPE[@]}" 2>/dev/null |
             tr -d '\r' | sort -u)
fi
fi

# ---------------------------------------------------------------------------
# Rule 7 — HANDOVER GATE: nothing inside docs/ may reach outside docs/.
# This is the rule that proves the folder is copy-ready.
# ---------------------------------------------------------------------------
if run 7; then
head_ 7 "handover boundary is closed"
if [ -d docs ]; then
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    note r7 "ESCAPES BOUNDARY  $h"
  done < <( { grep -rn 'Ideas/Flatmate\.io/' --include='*.md' docs 2>/dev/null
              grep -rnE '\]\(\.\./\.\./' --include='*.md' docs 2>/dev/null
              grep -rn '~/\.claude/' --include='*.md' docs 2>/dev/null
            } | grep -v '/_logs/' | tr -d '\r' )
else
  [ "$QUIET" = 1 ] || echo "  (skipped: docs/ does not exist yet)"
fi
fi

# ---------------------------------------------------------------------------
echo
echo "── summary"
for r in r1 r2 r3 r4 r5 r6 r7; do
  printf '   %-3s %s\n' "$r" "${COUNT[$r]:-0}"
done
total=0; for r in r1 r2 r3 r4 r5 r6 r7; do total=$(( total + ${COUNT[$r]:-0} )); done
echo "   TOTAL findings: $total"
exit $fail
