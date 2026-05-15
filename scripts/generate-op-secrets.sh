#!/usr/bin/env bash
set -euo pipefail

# Load .env if present
[ -f .env ] && export $(grep -v '^#' .env | xargs) || true

# Export service account token if available (preferred on headless Linux)
if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  export OP_SERVICE_ACCOUNT_TOKEN
fi

if [ -z "${OP_MF_ITEM_ID:-}" ] || [ -z "${OP_VAULT:-}" ]; then
  echo "⚠️  OP_MF_ITEM_ID or OP_VAULT not set. Skipping."
  exit 0
fi

# Try to retrieve item from 1Password CLI
if op item get "$OP_MF_ITEM_ID" --reveal --vault "$OP_VAULT" --format json > /tmp/op-secrets-tmp.json 2>&1; then
  python3 -c '
import sys, json

d = json.load(sys.stdin)
fields = {}
for f in d.get("fields", []):
    label = f.get("label")
    if label and "value" in f:
        fields[label] = f["value"]

# Use item title (e.g. "MF_Main") as key, not UUID
key = d.get("title") or d.get("id")
items = {"items": {key: fields}}
print(json.dumps(items, indent=2))
' < /tmp/op-secrets-tmp.json > op-secrets.json

  rm -f /tmp/op-secrets-tmp.json
  echo "✅ Generated op-secrets.json"
else
  echo "⚠️  1Password CLI failed to retrieve item. Run \`op signin\` to re-authenticate."
  rm -f /tmp/op-secrets-tmp.json
  exit 1
fi
