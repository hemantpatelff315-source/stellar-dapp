#!/usr/bin/env bash
#
# seed.sh — create a couple of demo campaigns against a deployed Factory.
#
# Usage: ./scripts/seed.sh <source-account> [network]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-}"
NETWORK="${2:-testnet}"
DEPLOY_JSON="$ROOT_DIR/deployments/$NETWORK.json"

if [[ -z "$SOURCE" || ! -f "$DEPLOY_JSON" ]]; then
  echo "Usage: ./scripts/seed.sh <source-account> [network] (after deploy.sh)" >&2
  exit 1
fi

FACTORY_ID="$(node -e "console.log(require('$DEPLOY_JSON').contracts.factory)")"
CREATOR="$(stellar keys address "$SOURCE")"

create() {
  stellar contract invoke --id "$FACTORY_ID" --source "$SOURCE" --network "$NETWORK" -- \
    create_campaign --creator "$CREATOR" \
    --title "$1" --description "$2" --goal "$3" --duration_secs "$4"
}

echo "▶ Seeding demo campaigns via Factory $FACTORY_ID…"
create "Clean Water Initiative" "Bring clean water to 5 villages." 1000000000 604800
create "Open Source Grants" "Fund maintainers of critical libraries." 5000000000 1209600
echo "✅ Seed complete."
