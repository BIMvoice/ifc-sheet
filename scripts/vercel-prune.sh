#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Delete old Vercel deployments of this project, keeping the live production
# deployment and the KEEP newest ready ones (default 5).
#
# Vercel keeps every deployment, and each one of this app is about 110 MB, so
# the free plan's 10 GB of deployment storage fills after roughly 90 of them.
# Deployments still building are never touched. If the live deployment cannot
# be read, nothing is deleted.
#
# Needs VERCEL_TOKEN, VERCEL_ORG_ID (the team id) and VERCEL_PROJECT_ID.
# VERCEL_API overrides the API base (for a local test). DRY_RUN=1 lists what
# would be deleted without deleting it.

set -euo pipefail

api="${VERCEL_API:-https://api.vercel.com}"
keep_count="${KEEP:-5}"
auth="Authorization: Bearer ${VERCEL_TOKEN:?VERCEL_TOKEN is not set}"
team="${VERCEL_ORG_ID:?VERCEL_ORG_ID is not set}"
project="${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is not set}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

live="$(curl -fsS -H "$auth" "$api/v9/projects/$project?teamId=$team" | jq -r '.targets.production.id // ""')"
if [ -z "$live" ]; then
  echo "Could not read the live production deployment; nothing deleted." | tee -a "$summary"
  exit 1
fi

list="$(mktemp)"
until=""
while :; do
  page="$(curl -fsS -H "$auth" "$api/v6/deployments?projectId=$project&teamId=$team&limit=100${until:+&until=$until}")"
  jq -r '.deployments[] | [.uid, (.created | tostring), (.state // .readyState // "")] | @tsv' <<<"$page" >>"$list"
  until="$(jq -r '.pagination.next // empty' <<<"$page")"
  [ -n "$until" ] || break
done

sorted="$(mktemp)"
sort -t $'\t' -k2,2nr "$list" >"$sorted"
total="$(wc -l <"$sorted" | tr -d ' ')"
keep="$(awk -F '\t' -v k="$keep_count" '$3 == "READY" && n < k { print $1; n++ }' "$sorted")"

deleted=0
while IFS=$'\t' read -r uid _created state; do
  [ "$uid" = "$live" ] && continue
  grep -qxF "$uid" <<<"$keep" && continue
  case "$state" in BUILDING | QUEUED | INITIALIZING) continue ;; esac
  if [ "${DRY_RUN:-}" = 1 ]; then
    echo "would delete $uid ($state)"
  else
    curl -fsS -X DELETE -H "$auth" "$api/v13/deployments/$uid?teamId=$team" >/dev/null
  fi
  deleted=$((deleted + 1))
done <"$sorted"

echo "Deleted $deleted of $total deployments; kept the live one ($live) and the $keep_count newest ready ones." | tee -a "$summary"
