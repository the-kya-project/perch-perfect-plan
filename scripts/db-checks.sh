#!/usr/bin/env bash
# Runs each supabase/checks/*_checks.sql block against the local database that
# `supabase db start` brought up, and fails unless every one reports
# "... CHECKS: n passed, 0 failed". The blocks always raise to roll back, so
# the result is read from the error message, not the exit code.
#
# multi_owner_access_checks.sql is a list of manual queries, not a block, so it
# is skipped.
set -uo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
status=0

for f in supabase/checks/*_checks.sql; do
  [ "$(basename "$f")" = "multi_owner_access_checks.sql" ] && continue
  out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f "$f" 2>&1)"
  result="$(printf '%s\n' "$out" | grep -oE '[A-Z ]+CHECKS: [0-9]+ passed, [0-9]+ failed.*' | head -1)"
  if [ -z "$result" ]; then
    echo "::error file=$f::no result line; output was:"
    printf '%s\n' "$out"
    status=1
  elif printf '%s' "$result" | grep -qE ' 0 failed$'; then
    echo "ok   $f — $result"
  else
    echo "::error file=$f::$result"
    status=1
  fi
done

exit $status
