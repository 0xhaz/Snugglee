#!/usr/bin/env bash
#
# NOTE: written for bash 3.2, which is what macOS ships. Keep variable
# expansions braced — bash 3.2 swallows a following multibyte character (…, ✓)
# into the variable name, which under `set -u` aborts with a confusing
# "unbound variable" naming a variable that does not exist.
#
# Push local vendor keys into Secret Manager and redeploy Cloud Run with them.
#
#   ./scripts/push-secrets.sh
#
# Reads harness/.env (gitignored) and pipes each value straight to gcloud —
# nothing is printed, echoed, or written anywhere else. Safe to re-run: each
# call adds a new secret VERSION, and Cloud Run is pinned to :latest.
#
# techstacks.md §1: no API keys in the client, ever. These live in Secret
# Manager and are mounted into the Cloud Run service only.

set -euo pipefail

PROJECT="snugglee-prod"
SERVICE="snugglee-api"
REGION="asia-southeast1"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/harness/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found."
  echo "  Copy harness/.env.example to harness/.env and fill it in first."
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

push() {
  local name="$1" value="${2-}"
  if [[ -z "$value" ]]; then
    echo "  ✗ $name — empty in harness/.env, skipping"
    return 1
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --data-file=- --project="${PROJECT}" >/dev/null 2>&1
  echo "  ✓ $name"
}

echo "Pushing secrets to ${PROJECT}..."
ok=0
push GEMINI_API_KEY    "${GEMINI_API_KEY-}"    && ok=$((ok+1)) || true
push MINIMAX_API_KEY   "${MINIMAX_API_KEY-}"   && ok=$((ok+1)) || true
push MINIMAX_GROUP_ID  "${MINIMAX_GROUP_ID-}"  && ok=$((ok+1)) || true
push CARTESIA_API_KEY  "${CARTESIA_API_KEY-}"  && ok=$((ok+1)) || true

# RevenueCat's webhook secret is ours to invent — it is the shared value you
# paste into the RevenueCat dashboard's Authorization header (PAY-04).
if gcloud secrets versions list REVENUECAT_WEBHOOK_SECRET --project="${PROJECT}" \
     --filter="state:ENABLED" --format="value(name)" 2>/dev/null | grep -q .; then
  echo "  · REVENUECAT_WEBHOOK_SECRET — already set, leaving alone"
  ok=$((ok+1))
else
  RC_SECRET="$(openssl rand -hex 32)"
  printf '%s' "$RC_SECRET" | gcloud secrets versions add REVENUECAT_WEBHOOK_SECRET \
    --data-file=- --project="${PROJECT}" >/dev/null
  ok=$((ok+1))
  echo "  ✓ REVENUECAT_WEBHOOK_SECRET (generated)"
  echo
  echo "  ↓ paste this into RevenueCat → Integrations → Webhooks → Authorization"
  echo "    $RC_SECRET"
  echo
fi

if (( ok < 5 )); then
  echo
  echo "✗ Only $ok/5 set. Fill the gaps in harness/.env and re-run."
  exit 1
fi

echo
echo "Redeploying ${SERVICE} with secrets mounted..."
gcloud run services update "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT}" \
  --set-secrets="\
GEMINI_API_KEY=GEMINI_API_KEY:latest,\
MINIMAX_API_KEY=MINIMAX_API_KEY:latest,\
MINIMAX_GROUP_ID=MINIMAX_GROUP_ID:latest,\
CARTESIA_API_KEY=CARTESIA_API_KEY:latest,\
REVENUECAT_WEBHOOK_SECRET=REVENUECAT_WEBHOOK_SECRET:latest" \
  --quiet >/dev/null

URL="$(gcloud run services describe "${SERVICE}" --region="${REGION}" \
        --project="${PROJECT}" --format='value(status.url)')"

echo
echo "✓ deployed: $URL"
echo
echo "Verifying..."
curl -s "$URL/health"; echo
echo
echo "Now run the Day-0 path on a PHYSICAL device over cellular:"
echo "  cd mobile && npx expo start        # LAN QR, not --localhost"
echo "  turn Wi-Fi OFF on the phone, kill the app, then: name → tap a theme"
echo "  the player prints GATE-B on screen — target < 2000ms to first audio"
